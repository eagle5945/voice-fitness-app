import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HermesTranscriber } from './stt_gateway.mjs';

const MAX_JSON_BYTES = 3 * 1024 * 1024;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MIME_TYPES = new Set(['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mpeg', 'audio/x-m4a']);

function json(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request, limit = MAX_JSON_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON.'), { statusCode: 400 }); }
}

function validAudioPayload(body) {
  if (typeof body?.dataUrl !== 'string' || typeof body?.mimeType !== 'string') return null;
  const match = /^data:([^,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(body.dataUrl);
  if (!match) return null;
  const embeddedMime = match[1].split(';', 1)[0].trim().toLowerCase();
  const mimeType = body.mimeType.split(';', 1)[0].trim().toLowerCase();
  if (!MIME_TYPES.has(mimeType) || embeddedMime !== mimeType) return null;
  const encoded = match[2];
  const decodedSize = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (decodedSize < 1 || decodedSize > MAX_AUDIO_BYTES) return null;
  return { mimeType, dataUrl: `data:${mimeType};base64,${encoded}` };
}

function newRateLimiter({ limit, windowMs }) {
  const buckets = new Map();
  return key => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || now - current.start >= windowMs) {
      buckets.set(key, { start: now, count: 1 });
      return true;
    }
    current.count++;
    return current.count <= limit;
  };
}

export function createSttServer({ env = process.env, transcriber } = {}) {
  const publicOrigin = env.STT_PUBLIC_ORIGIN;
  if (typeof publicOrigin !== 'string' || !/^https:\/\//.test(publicOrigin)) throw new Error('STT_PUBLIC_ORIGIN must be the public HTTPS origin.');

  const hermes = transcriber ?? new HermesTranscriber({
    baseUrl: env.HERMES_URL ?? 'http://hermes:9119',
    username: env.HERMES_USERNAME,
    password: env.HERMES_PASSWORD,
  });
  const allowTranscription = newRateLimiter({ limit: 15, windowMs: 60 * 1000 });
  let inFlight = 0;

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const origin = request.headers.origin;
    const clientIp = request.headers['x-real-ip'] || request.socket.remoteAddress || 'unknown';

    if (url.pathname === '/healthz' && request.method === 'GET') {
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' });
      return response.end('ok');
    }

    if (url.pathname === '/api/stt/status' && request.method === 'GET') {
      return json(response, 200, { available: true });
    }

    if (url.pathname === '/api/stt/transcribe' && request.method === 'POST') {
      if (origin !== publicOrigin) return json(response, 403, { code: 'origin_not_allowed' });
      if (!allowTranscription(clientIp)) return json(response, 429, { code: 'rate_limited' });
      if (inFlight >= 2) return json(response, 429, { code: 'stt_busy' });
      let body;
      try { body = await readJson(request); }
      catch (error) { return json(response, error.statusCode ?? 400, { code: 'invalid_request' }); }
      const audio = validAudioPayload(body);
      if (!audio) return json(response, 415, { code: 'unsupported_audio' });
      const requestId = typeof body.requestId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(body.requestId)
        ? body.requestId
        : '';
      if (!requestId) return json(response, 400, { code: 'invalid_request_id' });

      inFlight++;
      const startedAt = Date.now();
      try {
        const result = await hermes.transcribe(audio);
        return json(response, 200, { requestId, text: result.transcript, elapsedMs: Date.now() - startedAt });
      } catch {
        return json(response, 502, { code: 'transcription_failed', message: '음성 전사에 실패했습니다. 다시 시도하거나 직접 입력하세요.' });
      } finally {
        inFlight--;
      }
    }

    return json(response, 404, { code: 'not_found' });
  });
}

export function listenSttServer(server, { host = '0.0.0.0', port = 8080 } = {}) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let secrets = {};
  if (process.env.STT_SECRETS_FILE) {
    secrets = JSON.parse(readFileSync(process.env.STT_SECRETS_FILE, 'utf8'));
  }
  const server = createSttServer({ env: { ...process.env, ...secrets } });
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.STT_BIND_HOST ?? '0.0.0.0';
  await listenSttServer(server, { host, port });
  process.stdout.write(`STT proxy listening on ${host}:${port}\n`);
}
