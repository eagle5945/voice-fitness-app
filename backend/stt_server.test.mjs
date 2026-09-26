import test from 'node:test';
import assert from 'node:assert/strict';
import { createSttServer, listenSttServer } from './stt_server.mjs';

const origin = 'https://voice.example:8443';
const audioPayload = {
  requestId: 'req-1',
  dataUrl: 'data:audio/mp4;base64,Y2xpcA==',
  mimeType: 'audio/mp4',
};

async function withServer(t, { transcriber, publicOrigin = origin } = {}) {
  const server = createSttServer({
    env: { STT_PUBLIC_ORIGIN: publicOrigin },
    transcriber: transcriber ?? { async transcribe() { return { transcript: '8회' }; } },
  });
  await listenSttServer(server, { host: '127.0.0.1', port: 0 });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

test('loopback binding keeps the STT API off public host interfaces', async t => {
  const server = createSttServer({
    env: { STT_PUBLIC_ORIGIN: origin },
    transcriber: { async transcribe() { return { transcript: '8회' }; } },
  });
  await listenSttServer(server, { host: '127.0.0.1', port: 0 });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  assert.equal(server.address().address, '127.0.0.1');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/healthz`);
  assert.equal(response.status, 200);
});

test('service status is available without device registration', async t => {
  const base = await withServer(t);
  const response = await fetch(`${base}/api/stt/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: true });
  assert.equal(response.headers.get('set-cookie'), null);
});

test('same-origin transcription works without device registration secrets or cookies', async t => {
  let received;
  const base = await withServer(t, { transcriber: { async transcribe(input) { received = input; return { transcript: '8회' }; } } });
  const response = await fetch(`${base}/api/stt/transcribe`, {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: origin },
    body: JSON.stringify(audioPayload),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, '8회');
  assert.deepEqual(received, { dataUrl: audioPayload.dataUrl, mimeType: 'audio/mp4' });
});

test('rejects cross-origin speech API requests', async t => {
  let received = false;
  const base = await withServer(t, { transcriber: { async transcribe() { received = true; return { transcript: '8회' }; } } });
  const response = await fetch(`${base}/api/stt/transcribe`, {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify(audioPayload),
  });
  assert.equal(response.status, 403);
  assert.equal(received, false);
});

test('accepts iPhone MP4 data URLs with codec parameters and normalizes MIME metadata', async t => {
  let received;
  const base = await withServer(t, { transcriber: { async transcribe(input) { received = input; return { transcript: '8회' }; } } });
  const response = await fetch(`${base}/api/stt/transcribe`, {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: origin },
    body: JSON.stringify({
      requestId: 'req-codec',
      dataUrl: 'data:audio/mp4;codecs=mp4a.40.2;base64,Y2xpcA==',
      mimeType: 'audio/mp4;codecs=mp4a.40.2',
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { dataUrl: 'data:audio/mp4;base64,Y2xpcA==', mimeType: 'audio/mp4' });
});

test('rejects unsupported formats before calling Hermes', async t => {
  let received = false;
  const base = await withServer(t, { transcriber: { async transcribe() { received = true; return { transcript: '8회' }; } } });
  const response = await fetch(`${base}/api/stt/transcribe`, {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: origin },
    body: JSON.stringify({ ...audioPayload, dataUrl: 'data:text/plain;base64,bm90LWF1ZGlv', mimeType: 'text/plain' }),
  });
  assert.equal(response.status, 415);
  assert.equal(received, false);
});

test('limits unauthenticated requests per client during public testing', async t => {
  let received = 0;
  const base = await withServer(t, { transcriber: { async transcribe() { received++; return { transcript: '8회' }; } } });
  const statuses = [];
  for (let index = 0; index < 16; index++) {
    const response = await fetch(`${base}/api/stt/transcribe`, {
      method: 'POST', headers: { 'content-type': 'application/json', Origin: origin },
      body: JSON.stringify({ ...audioPayload, requestId: `req-${index}` }),
    });
    statuses.push(response.status);
  }
  assert.equal(statuses.filter(status => status === 200).length, 15);
  assert.equal(statuses.at(-1), 429);
  assert.equal(received, 15);
});
