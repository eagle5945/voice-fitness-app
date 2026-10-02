import { createServer } from 'node:http';
import { readFile, writeFile, rename, unlink, readdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBackup } from './domain.mjs';
import { MAX_BODY, ID_PATTERN, sha256, summarize, backupId, tokenMatches, isShrink, idsToPrune } from './backup-core.mjs';

const PREFIX = '/api/backup/';
const INDEX = 'index.json';

class HttpError extends Error {
  constructor(status, body = null) { super(String(status)); this.status = status; this.body = body; }
}

// Written to a temp file, flushed, then renamed, so a crash never leaves a half-written backup.
async function writeAtomic(path, text) {
  const temp = `${path}.tmp`;
  const handle = await open(temp, 'w', 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, path);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, { error: '백업이 5MB를 넘습니다.' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Rebuilt from the backup files when missing or unreadable, so index.json is only a cache.
async function loadIndex(dir) {
  try {
    const entries = JSON.parse(await readFile(join(dir, INDEX), 'utf8'));
    // Ids from the cache are used in file paths (read and delete), so only well-formed ones are kept.
    if (Array.isArray(entries)) return entries.filter(entry => ID_PATTERN.test(entry?.id));
  } catch { /* rebuilt below */ }
  const names = (await readdir(dir)).filter(name => ID_PATTERN.test(name.replace(/\.json$/, '')) && name.endsWith('.json')).sort().reverse();
  const entries = [];
  for (const name of names) {
    try {
      const text = await readFile(join(dir, name), 'utf8');
      const id = name.slice(0, -5);
      const savedAt = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}Z`;
      entries.push({ id, savedAt, hash: sha256(text), size: Buffer.byteLength(text), ...summarize(validateBackup(JSON.parse(text))) });
    } catch { /* an unreadable file is left alone and not listed */ }
  }
  return entries;
}

export function createBackupHandler({ dir, token, keep = 60, now = () => new Date(), log = () => {} }) {
  let queue = Promise.resolve();
  // Writes run one at a time so two quick uploads never race on index.json.
  const serial = task => { const run = queue.then(task, task); queue = run.catch(() => {}); return run; };

  async function save(text, confirmShrink) {
    let data;
    try { data = validateBackup(JSON.parse(text)); }
    catch (error) { throw new HttpError(422, { error: error instanceof SyntaxError ? 'JSON 형식이 아닙니다.' : error.message }); }
    const stored = JSON.stringify(data);
    const hash = sha256(stored);
    const counts = summarize(data);
    return serial(async () => {
      const entries = await loadIndex(dir);
      const latest = entries[0];
      if (latest?.hash === hash) return { status: 200, body: { unchanged: true, id: latest.id, savedAt: latest.savedAt } };
      if (!confirmShrink && isShrink(latest, counts)) {
        return { status: 409, body: { reason: 'shrink', previous: { id: latest.id, savedAt: latest.savedAt, routines: latest.routines, sessions: latest.sessions, sets: latest.sets }, incoming: counts } };
      }
      const date = now();
      let id = backupId(date, hash);
      if (entries.some(entry => entry.id === id)) id = backupId(new Date(date.getTime() + 1000), hash);
      await writeAtomic(join(dir, `${id}.json`), stored);
      const entry = { id, savedAt: date.toISOString(), hash, size: Buffer.byteLength(stored), ...counts };
      const next = [entry, ...entries];
      const pruned = new Set(idsToPrune(next, keep));
      for (const old of pruned) await unlink(join(dir, `${old}.json`)).catch(() => {});
      await writeAtomic(join(dir, INDEX), JSON.stringify(next.filter(item => !pruned.has(item.id))));
      return { status: 201, body: { id, savedAt: entry.savedAt, ...counts } };
    });
  }

  async function route(request) {
    const path = new URL(request.url, 'http://local').pathname;
    if (!path.startsWith(PREFIX)) throw new HttpError(404);
    if (!tokenMatches(request.headers.authorization, token)) throw new HttpError(401);
    const rest = path.slice(PREFIX.length);
    if (rest === '') {
      if (request.method === 'PUT') return save(await readBody(request), request.headers['x-backup-confirm'] === 'shrink');
      if (request.method === 'GET') {
        const entries = await loadIndex(dir);
        return { status: 200, body: entries.map(({ hash, ...entry }) => entry) };
      }
      throw new HttpError(405);
    }
    if (request.method !== 'GET') throw new HttpError(405);
    const entries = await loadIndex(dir);
    const id = rest === 'latest' ? entries[0]?.id : rest;
    if (!id || !ID_PATTERN.test(id) || !entries.some(entry => entry.id === id)) throw new HttpError(404, { error: '백업을 찾지 못했습니다.' });
    return { status: 200, text: await readFile(join(dir, `${id}.json`), 'utf8') };
  }

  return async (request, response) => {
    let result;
    try { result = await route(request); }
    catch (error) {
      result = error instanceof HttpError ? { status: error.status, body: error.body } : { status: 500, body: { error: '백업 서버 오류' } };
      if (!(error instanceof HttpError)) log(`error ${error?.code ?? error?.name ?? 'unknown'}`);
    }
    const text = result.text ?? (result.body == null ? '' : JSON.stringify(result.body));
    response.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) });
    response.end(text);
    // Method, status and size only: never the token, the body or the client address.
    log(`${request.method} ${result.status} ${Buffer.byteLength(text)}`);
    if (result.status === 413) request.destroy();
  };
}

async function main() {
  const dir = process.env.BACKUP_DIR ?? '/data';
  const port = Number(process.env.BACKUP_PORT ?? 18086);
  // 0.0.0.0 only inside its own container network; the host publishes the port on 127.0.0.1.
  const host = process.env.BACKUP_HOST ?? '127.0.0.1';
  const keep = Number(process.env.BACKUP_KEEP ?? 60);
  const token = (await readFile(process.env.BACKUP_TOKEN_FILE ?? '/run/secrets/backup-token', 'utf8')).trim();
  if (token.length < 32) throw new Error('backup token must be at least 32 characters');
  const log = line => console.log(`${new Date().toISOString()} ${line}`);
  createServer(createBackupHandler({ dir, token, keep, log })).listen(port, host, () => log(`listening ${host}:${port}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(error.message); process.exit(1); });
