import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, shouldSend, sendBackup, listBackups, fetchBackup, errorText, ENDPOINT } from './nas-backup.mjs';

const reply = (status, body) => async () => new Response(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body), { status });

test('sha256Hex matches the standard digest', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('shouldSend waits for the workout to end and skips unchanged data', () => {
  assert.equal(shouldSend({ reason: 'change', hash: 'b', lastHash: 'a', activeSessionId: null }), true);
  assert.equal(shouldSend({ reason: 'change', hash: 'a', lastHash: 'a', activeSessionId: null }), false);
  assert.equal(shouldSend({ reason: 'change', hash: 'b', lastHash: 'a', activeSessionId: 's1' }), false);
  assert.equal(shouldSend({ reason: 'manual', hash: 'a', lastHash: 'a', activeSessionId: 's1' }), true);
  assert.equal(shouldSend({ reason: 'manual', hash: 'b', lastHash: 'a', activeSessionId: null, online: false }), false);
});

test('sendBackup sends the token and the shrink confirmation', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ id: 'x', sets: 3 }), { status: 201 }); };
  const result = await sendBackup('{"a":1}', 'tok', { confirmShrink: true, fetchImpl });
  assert.equal(result.status, 'saved');
  assert.equal(seen.url, ENDPOINT);
  assert.equal(seen.init.method, 'PUT');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(seen.init.headers['X-Backup-Confirm'], 'shrink');
  assert.equal(seen.init.body, '{"a":1}');
  const plain = await sendBackup('{}', 'tok', { fetchImpl });
  assert.equal(plain.status, 'saved');
  assert.equal('X-Backup-Confirm' in seen.init.headers, false);
});

test('responses map to clear states', async () => {
  assert.equal((await sendBackup('{}', 't', { fetchImpl: reply(200, { unchanged: true }) })).status, 'unchanged');
  assert.equal((await sendBackup('{}', 't', { fetchImpl: reply(401) })).status, 'unauthorized');
  assert.equal((await sendBackup('{}', 't', { fetchImpl: reply(404, '<html>') })).status, 'missing');
  assert.equal((await sendBackup('{}', 't', { fetchImpl: reply(502, '<html>') })).status, 'missing');
  assert.equal((await fetchBackup('t', 'x', { fetchImpl: reply(404, { error: '없음' }) })).status, 'notfound');
  const shrink = await sendBackup('{}', 't', { fetchImpl: reply(409, { reason: 'shrink', previous: { sets: 9 }, incoming: { sets: 0 } }) });
  assert.equal(shrink.status, 'shrink');
  assert.equal(shrink.body.previous.sets, 9);
  assert.equal((await sendBackup('{}', 't', { fetchImpl: async () => { throw new TypeError('offline'); } })).status, 'offline');
  assert.equal((await listBackups('t', { fetchImpl: reply(200, [{ id: 'a' }]) })).body[0].id, 'a');
  assert.equal((await sendBackup('{}', 't', { fetchImpl: reply(500, { error: 'x' }) })).status, 'error');
});

test('fetchBackup encodes the id', async () => {
  let url;
  await fetchBackup('t', 'a/b', { fetchImpl: async u => { url = u; return new Response('{}', { status: 200 }); } });
  assert.equal(url, `${ENDPOINT}a%2Fb`);
});

test('errorText explains each failure', () => {
  assert.equal(errorText({ status: 'unauthorized' }), '토큰이 맞지 않습니다.');
  assert.equal(errorText({ status: 'offline' }), 'NAS에 연결할 수 없습니다.');
  assert.equal(errorText({ status: 'missing' }), 'NAS 백업 서버가 꺼져 있습니다.');
  assert.equal(errorText({ status: 'invalid', body: { error: '형식 오류' } }), '형식 오류');
  assert.equal(errorText({ status: 'error', code: 500 }), 'NAS 백업에 실패했습니다(500).');
});
