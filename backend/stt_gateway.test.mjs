import test from 'node:test';
import assert from 'node:assert/strict';
import { HermesTranscriber } from './stt_gateway.mjs';

test('Hermes transcriber logs in server-side and forwards only the audio request', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/password-login')) {
      return new Response(JSON.stringify({ ok: true, next: '/' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'hermes_session=private-session; Path=/; HttpOnly' },
      });
    }
    return new Response(JSON.stringify({ ok: true, transcript: '여덟 개', provider: 'local' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const transcriber = new HermesTranscriber({
    baseUrl: 'http://hermes:9119', username: 'workout-proxy', password: 'secret', fetchImpl,
  });
  const result = await transcriber.transcribe({ dataUrl: 'data:audio/mp4;base64,AA==', mimeType: 'audio/mp4' });

  assert.deepEqual(result, { transcript: '여덟 개' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://hermes:9119/auth/password-login');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    provider: 'basic', username: 'workout-proxy', password: 'secret', next: '',
  });
  assert.equal(calls[1].url, 'http://hermes:9119/api/audio/transcribe');
  assert.equal(calls[1].options.headers.cookie, 'hermes_session=private-session');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    data_url: 'data:audio/mp4;base64,AA==', mime_type: 'audio/mp4',
  });
  assert.equal(JSON.stringify(result).includes('private-session'), false);
});

test('expired Hermes session is refreshed once before retrying transcription', async () => {
  let logins = 0;
  let transcriptions = 0;
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/auth/password-login')) {
      logins++;
      return new Response('{}', {
        status: 200,
        headers: { 'set-cookie': `hermes_session=session-${logins}; Path=/; HttpOnly` },
      });
    }
    transcriptions++;
    if (transcriptions === 1) return new Response('{"detail":"Unauthorized"}', { status: 401 });
    assert.equal(options.headers.cookie, 'hermes_session=session-2');
    return new Response('{"ok":true,"transcript":"8개"}', { status: 200 });
  };
  const transcriber = new HermesTranscriber({
    baseUrl: 'http://hermes:9119', username: 'proxy', password: 'secret', fetchImpl,
  });

  assert.deepEqual(await transcriber.transcribe({ dataUrl: 'data:audio/webm;base64,AA==', mimeType: 'audio/webm' }), { transcript: '8개' });
  assert.equal(logins, 2);
  assert.equal(transcriptions, 2);
});

test('failed Hermes login does not send audio to the transcription route', async () => {
  const calls = [];
  const transcriber = new HermesTranscriber({
    baseUrl: 'http://hermes:9119', username: 'proxy', password: 'wrong',
    fetchImpl: async url => {
      calls.push(String(url));
      return new Response('{"detail":"Unauthorized"}', { status: 401 });
    },
  });

  await assert.rejects(() => transcriber.transcribe({ dataUrl: 'data:audio/webm;base64,AA==', mimeType: 'audio/webm' }), /Hermes login failed/);
  assert.deepEqual(calls, ['http://hermes:9119/auth/password-login']);
});
