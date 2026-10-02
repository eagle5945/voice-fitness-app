import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUtterance, parseAlternatives } from './parser.mjs';
import { emptyData, startSession, setExercise, addSet, updateSet, cancelSet, restoreSet, finishSession, deleteSetRecord, deleteSession, clearSessionHistory, validateBackup, routineDraftFromSession, saveRoutine, setExercisePart, swapExercise, swapRoutineExercise } from './domain.mjs';

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

test('deleting one set keeps the workout and its other sets', () => {
  let data = emptyData();
  data = startSession(data, 'session-1', '2026-09-25T00:00:00.000Z');
  data = setExercise(data, 'session-1', { id: 'exercise-1', name: '벤치프레스', kind: 'barbell', weight: 70, target: 10 });
  for (const [id, reps] of [['set-1', 8], ['set-2', 9]]) data = addSet(data, 'session-1', 'exercise-1', { id, reps, weight: 70, source: 'manual', inputId: `input-${id}`, at: '2026-09-25T00:01:00.000Z' });
  data = deleteSetRecord(data, 'set-1');
  assert.deepEqual(data.sessions[0].exercises[0].sets.map(set => set.id), ['set-2']);
  assert.throws(() => deleteSetRecord(data, 'missing'));
});

test('deleting a workout also clears its active pointers', () => {
  let data = emptyData();
  data = startSession(data, 'session-1', '2026-09-25T00:00:00.000Z');
  data = setExercise(data, 'session-1', { id: 'exercise-1', name: '벤치프레스', kind: 'barbell', weight: 70, target: 10 });
  data = deleteSession(data, 'session-1');
  assert.equal(data.sessions.length, 0);
  assert.equal(data.activeSessionId, null);
  assert.equal(data.activeExerciseId, null);
  assert.throws(() => deleteSession(data, 'missing'));
});

test('clearing workout history preserves routines but clears active workout state', () => {
  const data = { ...emptyData(), routines: [{ id: 'routine-1', title: '가슴', exercises: [] }], selectedRoutineId: 'routine-1', sessions: [{ id: 'session-1', startedAt: '2026-09-25T00:00:00.000Z', endedAt: null, exercises: [] }], activeSessionId: 'session-1', activeExerciseId: 'exercise-1' };
  const cleared = clearSessionHistory(data);
  assert.equal(cleared.sessions.length, 0);
  assert.equal(cleared.activeSessionId, null);
  assert.equal(cleared.activeExerciseId, null);
  assert.deepEqual(cleared.routines, data.routines);
  assert.equal(cleared.selectedRoutineId, data.selectedRoutineId);
});

test('a workout becomes a routine draft from its last valid sets', () => {
  const set = (id, weight, reps, extra = {}) => ({ id, inputId: `in-${id}`, weight, reps, source: 'manual', at: '2026-09-30T10:00:00.000Z', updatedAt: null, canceledAt: null, ...extra });
  const session = { id: 's', startedAt: '2026-09-30T10:00:00.000Z', endedAt: null, exercises: [
    { id: 'a', name: '벤치프레스', kind: 'barbell', weight: 70, target: 10, sets: [set(1, 70, 10), set(2, 72.5, 9), set(3, 80, 3, { canceledAt: '2026-09-30T10:05:00.000Z' })] },
    { id: 'b', name: '풀업', kind: 'machine', weight: 0, target: 8, sets: [set(4, 0, 8, { canceledAt: '2026-09-30T10:06:00.000Z' })] },
    { id: 'c', name: '레그프레스', kind: 'machine', weight: 100, target: 15, sets: [set(5, 110, 15)] },
  ] };
  const draft = routineDraftFromSession(session, '가슴 · 9월 30일 기록으로 만든 아주 긴 루틴 이름이 사십 자를 넘으면 잘림');
  assert.equal(draft.title.length, 40);
  assert.deepEqual(draft.exercises, [
    { name: '벤치프레스', kind: 'barbell', weight: 72.5, target: 10, plannedSets: 2 },
    { name: '레그프레스', kind: 'machine', weight: 110, target: 15, plannedSets: 1 },
  ]);
  // The draft must be savable once the dialog assigns ids.
  const saved = saveRoutine(emptyData(), { id: 'r', title: draft.title, exercises: draft.exercises.map((item, index) => ({ ...item, id: `r${index}` })) });
  assert.equal(saved.routines[0].exercises.length, 2);
  assert.equal(routineDraftFromSession({ exercises: [session.exercises[1]] }, '빈 기록'), null);
});

test('exercise parts store only explicit choices and survive history clearing', () => {
  let data = setExercisePart(emptyData(), ' 데드리프트 ', '하체');
  assert.deepEqual(data.exerciseParts, { 데드리프트: '하체' });
  data = clearSessionHistory(data);
  assert.deepEqual(data.exerciseParts, { 데드리프트: '하체' });
  data = setExercisePart(data, '데드리프트', null);
  assert.deepEqual(data.exerciseParts, {});
  assert.throws(() => setExercisePart(data, '스쿼트', '종아리'), /부위/);
  assert.throws(() => setExercisePart(data, '', '하체'), /부위/);
});

test('backups validate exercise parts and default them for older files', () => {
  const old = { version: 1, routines: [], sessions: [] };
  assert.deepEqual(validateBackup(old).exerciseParts, {});
  assert.deepEqual(validateBackup({ ...old, exerciseParts: { 스쿼트: '하체' } }).exerciseParts, { 스쿼트: '하체' });
  for (const bad of [[], 'x', { 스쿼트: '다리' }, { ' 스쿼트': '하체' }, { '': '하체' }, { ['가'.repeat(61)]: '하체' }]) {
    assert.throws(() => validateBackup({ ...old, exerciseParts: bad }), /부위/);
  }
  assert.deepEqual(validateBackup({ ...old, exerciseParts: null }).exerciseParts, {});
});

test('backups reject non-text session labels and oversized exercise names', () => {
  const session = (extra = {}, name = '스쿼트') => ({ version: 1, routines: [], sessions: [{ id: 's', startedAt: '2026-10-01T00:00:00Z', exercises: [{ id: 'e', name, kind: 'barbell', weight: 60, target: 5, sets: [] }], ...extra }] });
  assert.equal(validateBackup(session({ routineName: '하체', routineId: 'r1' })).sessions[0].routineName, '하체');
  assert.equal(validateBackup(session({ routineName: null })).sessions.length, 1);
  for (const bad of [{ routineName: { html: '<b>' } }, { routineId: 5 }, { routineName: 'x'.repeat(101) }]) assert.throws(() => validateBackup(session(bad)), /운동일지/);
  assert.throws(() => validateBackup(session({}, 'x'.repeat(201))), /운동 항목/);
});

test('swapping before any set renames the exercise in place', () => {
  let data = startSession(emptyData(), 's', '2026-10-02T09:00:00Z');
  data = setExercise(data, 's', { id: 'e1', name: '바벨 스쿼트', kind: 'barbell', weight: 100, target: 5, plannedSets: 4 });
  data = swapExercise(data, 's', 'e1', { id: 'e2', name: '핵 스쿼트', kind: 'machine', weight: 60 });
  assert.deepEqual(data.sessions[0].exercises.map(e => [e.id, e.name, e.kind, e.weight, e.target, e.plannedSets]), [['e1', '핵 스쿼트', 'machine', 60, 5, 4]]);
  assert.equal(data.activeExerciseId, 'e1');
});

test('swapping after some sets keeps them and adds the substitute right after for the rest', () => {
  let data = startSession(emptyData(), 's', '2026-10-02T09:00:00Z');
  data = setExercise(data, 's', { id: 'e1', name: '바벨 스쿼트', kind: 'barbell', weight: 100, target: 5, plannedSets: 4 });
  data = setExercise(data, 's', { id: 'e3', name: '레그 컬', kind: 'machine', weight: 30, target: 12, plannedSets: 3 });
  data = addSet(data, 's', 'e1', { id: 'x1', inputId: 'i1', weight: 100, reps: 5, source: 'manual', at: '2026-10-02T09:05:00Z' });
  data = swapExercise(data, 's', 'e1', { id: 'e2', name: '핵 스쿼트', kind: 'machine', weight: 60 });
  const session = data.sessions[0];
  assert.deepEqual(session.exercises.map(e => [e.id, e.name, e.plannedSets, e.sets.length]), [['e1', '바벨 스쿼트', 1, 1], ['e2', '핵 스쿼트', 3, 0], ['e3', '레그 컬', 3, 0]]);
  assert.equal(data.activeExerciseId, 'e2');
  assert.doesNotThrow(() => validateBackup(data));
});

test('the routine can take the substitute in place of the original', () => {
  let data = saveRoutine(emptyData(), { id: 'r1', title: '하체', exercises: [{ id: 'a', name: '바벨 스쿼트', kind: 'barbell', weight: 100, target: 5, plannedSets: 4 }, { id: 'b', name: '레그 컬', kind: 'machine', weight: 30, target: 12, plannedSets: 3 }] });
  data = saveRoutine(data, { id: 'r2', title: '상체', exercises: [{ id: 'c', name: '벤치프레스', kind: 'barbell', weight: 80, target: 5, plannedSets: 4 }] });
  const swapped = swapRoutineExercise(data, 'r1', { name: '바벨 스쿼트', kind: 'barbell' }, { name: '핵 스쿼트', kind: 'machine', weight: 60 });
  assert.deepEqual(swapped.routines[0].exercises.map(e => [e.name, e.kind, e.weight, e.target, e.plannedSets]), [['핵 스쿼트', 'machine', 60, 5, 4], ['레그 컬', 'machine', 30, 12, 3]]);
  assert.equal(swapped.selectedRoutineId, 'r2');
  assert.equal(swapRoutineExercise(data, 'r1', { name: '없는 운동', kind: 'barbell' }, { name: 'x', kind: 'machine', weight: 1 }), null);
});
