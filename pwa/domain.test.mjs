import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUtterance, parseAlternatives } from './parser.mjs';
import { emptyData, startSession, setExercise, addSet, updateSet, cancelSet, restoreSet, finishSession, validateBackup } from './domain.mjs';

test('Korean voice input uses actual reps and current weight', () => {
  assert.deepEqual(parseUtterance('8개', 70), { status: 'ok', reps: 8, weight: 70 });
  assert.deepEqual(parseUtterance('여덟 번', 70), { status: 'ok', reps: 8, weight: 70 });
  assert.deepEqual(parseUtterance('75킬로 9회', 70), { status: 'ok', reps: 9, weight: 75 });
  assert.deepEqual(parseUtterance('이번엔 8개밖에 못 했어', 70), { status: 'ok', reps: 8, weight: 70 });
});

test('voice input never substitutes a goal or guesses an unrelated number', () => {
  assert.equal(parseUtterance('다음은 75로', 70).status, 'invalid');
  assert.equal(parseUtterance('끝', 70).status, 'invalid');
  assert.equal(parseUtterance('75킬로', 70).status, 'invalid');
  assert.equal(parseUtterance('8개 18회', 70).status, 'ambiguous');
  assert.deepEqual(parseAlternatives(['8개', '18개'], 70), { status: 'ambiguous', choices: [{ reps: 8, weight: 70 }, { reps: 18, weight: 70 }] });
});

test('a set is stored once per input id and remains on its exercise', () => {
  let data = emptyData();
  data = startSession(data, 'session-1', '2026-09-25T00:00:00.000Z');
  data = setExercise(data, 'session-1', { id: 'exercise-1', name: '벤치프레스', kind: 'barbell', weight: 70, target: 10 });
  data = addSet(data, 'session-1', 'exercise-1', { id: 'set-1', reps: 8, weight: 70, source: 'voice', inputId: 'input-1', at: '2026-09-25T00:01:00.000Z' });
  data = addSet(data, 'session-1', 'exercise-1', { id: 'set-2', reps: 8, weight: 70, source: 'voice', inputId: 'input-1', at: '2026-09-25T00:01:01.000Z' });
  assert.equal(data.sessions[0].exercises[0].sets.length, 1);
  data = updateSet(data, 'set-1', { reps: 9, weight: 70 });
  assert.equal(data.sessions[0].exercises[0].sets[0].reps, 9);
  data = cancelSet(data, 'set-1', '2026-09-25T00:02:00.000Z');
  assert.equal(data.sessions[0].exercises[0].sets[0].canceledAt, '2026-09-25T00:02:00.000Z');
  data = restoreSet(data, 'set-1');
  assert.equal(data.sessions[0].exercises[0].sets[0].canceledAt, null);
  data = finishSession(data, 'session-1', '2026-09-25T00:30:00.000Z');
  assert.equal(data.sessions[0].endedAt, '2026-09-25T00:30:00.000Z');
});

test('backup rejects malformed data and accepts a valid round trip', () => {
  assert.equal(validateBackup({ version: 1, sessions: [] }).version, 1);
  assert.throws(() => validateBackup({ version: 1, sessions: [{ id: 'bad' }] }));
  assert.throws(() => validateBackup({ version: 2, sessions: [] }));
  assert.throws(() => validateBackup({ version: 1, sessions: [{ id: 's', startedAt: 'not-a-date', endedAt: null, exercises: [] }] }));
});
