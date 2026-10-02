import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackupHandler } from './server.mjs';
import { backupId, idsToPrune, isShrink, summarize, tokenMatches } from './backup-core.mjs';

const TOKEN = 'a'.repeat(64);
const auth = { Authorization: `Bearer ${TOKEN}` };

function backup(setCount, routineCount = 1) {
  const sets = Array.from({ length: setCount }, (_, i) => ({ id: `s${i}`, inputId: `i${i}`, weight: 60, reps: 10, at: '2026-10-01T10:00:00.000Z', source: 'manual' }));
  return {
    version: 1, activeSessionId: null, activeExerciseId: null, lastBackupAt: null, selectedRoutineId: null,
    routines: Array.from({ length: routineCount }, (_, i) => ({ id: `r${i}`, title: `루틴${i}`, exercises: [{ id: `re${i}`, name: '스쿼트', kind: 'barbell', weight: 60, target: 10, plannedSets: 3 }] })),
    sessions: setCount ? [{ id: 'x1', startedAt: '2026-10-01T09:50:00.000Z', endedAt: '2026-10-01T11:00:00.000Z', exercises: [{ id: 'e1', name: '스쿼트', kind: 'barbell', weight: 60, target: 10, sets }] }] : [],
  };
}

async function withServer(options, run) {
  const dir = await mkdtemp(join(tmpdir(), 'vf-backup-'));
  let tick = Date.parse('2026-10-02T05:00:00.000Z');
  const server = createServer(createBackupHandler({ dir, token: TOKEN, now: () => new Date(tick += 60_000), ...options }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/backup/`;
  try { await run({ base, dir }); }
  finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
}

const put = (base, body, headers = {}) => fetch(base, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('tokenMatches accepts only the exact bearer token', () => {
  assert.equal(tokenMatches(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(tokenMatches(`Bearer ${TOKEN}x`, TOKEN), false);
  assert.equal(tokenMatches(TOKEN, TOKEN), false);
  assert.equal(tokenMatches(undefined, TOKEN), false);
  assert.equal(tokenMatches(`Bearer ${TOKEN}`, ''), false);
});

test('summarize ignores canceled sets and empty sessions', () => {
  const data = backup(3);
  data.sessions[0].exercises[0].sets[0].canceledAt = '2026-10-01T10:01:00.000Z';
  assert.deepEqual(summarize(data), { routines: 1, sessions: 1, sets: 2 });
});

test('isShrink blocks an empty or halved backup but allows normal edits', () => {
  const previous = { routines: 2, sessions: 5, sets: 40 };
  assert.equal(isShrink(previous, { routines: 0, sessions: 0, sets: 0 }), true);
  assert.equal(isShrink(previous, { routines: 2, sessions: 2, sets: 19 }), true);
  assert.equal(isShrink(previous, { routines: 2, sessions: 4, sets: 20 }), false);
  assert.equal(isShrink(previous, { routines: 1, sessions: 5, sets: 40 }), false);
  assert.equal(isShrink(null, { routines: 0, sessions: 0, sets: 0 }), false);
});

test('idsToPrune keeps the newest entries and the largest backup', () => {
  const entries = [{ id: 'd', sets: 5 }, { id: 'c', sets: 5 }, { id: 'b', sets: 90 }, { id: 'a', sets: 1 }];
  assert.deepEqual(idsToPrune(entries, 2), ['a']);
  assert.deepEqual(idsToPrune(entries, 4), []);
});

test('backupId sorts in time order', () => {
  assert.equal(backupId(new Date('2026-10-02T05:06:07.890Z'), 'abcdef0123456789'), '20261002T050607Z-abcdef012345');
});

test('requests without the token get an empty 401', async () => {
  await withServer({}, async ({ base }) => {
    for (const response of [await fetch(base), await fetch(`${base}latest`), await fetch(base, { method: 'PUT', body: '{}' }), await fetch(base, { headers: { Authorization: 'Bearer wrong' } })]) {
      assert.equal(response.status, 401);
      assert.equal(await response.text(), '');
    }
  });
});

test('saves, lists, skips unchanged data and restores the latest backup', async () => {
  await withServer({}, async ({ base, dir }) => {
    const first = await put(base, backup(4));
    assert.equal(first.status, 201);
    const saved = await first.json();
    assert.deepEqual([saved.routines, saved.sessions, saved.sets], [1, 1, 4]);
    const again = await put(base, backup(4));
    assert.equal(again.status, 200);
    assert.equal((await again.json()).unchanged, true);
    assert.equal((await put(base, backup(5))).status, 201);
    const list = await (await fetch(base, { headers: auth })).json();
    assert.deepEqual(list.map(item => item.sets), [5, 4]);
    assert.equal('hash' in list[0], false);
    const latest = await (await fetch(`${base}latest`, { headers: auth })).json();
    assert.equal(latest.sessions[0].exercises[0].sets.length, 5);
    const older = await fetch(`${base}${list[1].id}`, { headers: auth });
    assert.equal((await older.json()).sessions[0].exercises[0].sets.length, 4);
    assert.equal((await readdir(dir)).filter(name => name.endsWith('.tmp')).length, 0);
  });
});

test('rejects invalid backups and oversized bodies', async () => {
  await withServer({}, async ({ base }) => {
    const notJson = await put(base, 'nope');
    assert.equal(notJson.status, 422);
    const wrong = await put(base, { version: 2, sessions: [] });
    assert.equal(wrong.status, 422);
    assert.match((await wrong.json()).error, /지원하지 않는/);
    const huge = await put(base, 'x'.repeat(5_000_001)).catch(error => ({ status: 'reset', error }));
    assert.ok(huge.status === 413 || huge.status === 'reset');
  });
});

test('a shrinking backup needs explicit confirmation', async () => {
  await withServer({}, async ({ base }) => {
    await put(base, backup(10));
    const blocked = await put(base, backup(0, 0));
    assert.equal(blocked.status, 409);
    const body = await blocked.json();
    assert.equal(body.reason, 'shrink');
    assert.equal(body.previous.sets, 10);
    assert.equal(body.incoming.sets, 0);
    assert.equal((await put(base, backup(0, 0), { 'X-Backup-Confirm': 'shrink' })).status, 201);
  });
});

test('keeps only the newest backups plus the largest one', async () => {
  await withServer({ keep: 2 }, async ({ base, dir }) => {
    await put(base, backup(20));
    for (const count of [12, 13, 14]) await put(base, backup(count));
    const list = await (await fetch(base, { headers: auth })).json();
    assert.deepEqual(list.map(item => item.sets), [14, 13, 20]);
    assert.equal((await readdir(dir)).filter(name => name !== 'index.json').length, 3);
  });
});

test('ids outside the pattern are not served', async () => {
  await withServer({}, async ({ base }) => {
    assert.equal((await fetch(`${base}..%2Findex`, { headers: auth })).status, 404);
    assert.equal((await fetch(`${base}latest`, { headers: auth })).status, 404);
    assert.equal((await fetch(base, { method: 'DELETE', headers: auth })).status, 405);
  });
});

test('rebuilds a missing index from the backup files', async () => {
  await withServer({}, async ({ base, dir }) => {
    await put(base, backup(3));
    await writeFile(join(dir, 'index.json'), 'broken');
    const list = await (await fetch(base, { headers: auth })).json();
    assert.equal(list.length, 1);
    assert.equal(list[0].sets, 3);
  });
});
