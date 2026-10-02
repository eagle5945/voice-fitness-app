import test from 'node:test';
import assert from 'node:assert/strict';
import { workoutGuide, routineLastDone, nextRoutine, daysAgo } from './workout-guide.mjs';
const item = (id, plannedSets, count) => ({ id, plannedSets, sets: Array.from({ length: count }, () => ({ canceledAt: null })) });
test('finishing the last exercise still points to an earlier unfinished exercise', () => {
  const guide = workoutGuide({ exercises: [item('a', 3, 1), item('b', 2, 2)] }, 'b');
  assert.equal(guide.allComplete, false);
  assert.equal(guide.next.id, 'a');
  assert.equal(guide.completedSets, 3);
  assert.equal(guide.totalSets, 5);
});
test('extra sets never overfill the plan and canceled sets do not count', () => {
  const a = item('a', 2, 3);
  const b = item('b', 1, 1);
  b.sets[0].canceledAt = '2026-09-26';
  const guide = workoutGuide({ exercises: [a, b] }, 'a');
  assert.equal(guide.completedSets, 2);
  assert.equal(guide.next.id, 'b');
  assert.equal(guide.allComplete, false);
});
test('complete plans and free workouts give distinct completion states', () => {
  assert.equal(workoutGuide({ exercises: [item('a', 2, 2)] }, 'a').allComplete, true);
  const free = workoutGuide({ exercises: [item('a', undefined, 2)] }, 'a');
  assert.equal(free.allComplete, false);
  assert.equal(free.totalSets, 0);
  assert.equal(free.recordedSets, 2);
});

const routines = [{ id: 'a', title: '하체' }, { id: 'b', title: '상체' }, { id: 'c', title: '등' }];
const done = (id, routineId, startedAt, canceled = false) => ({ id, routineId, startedAt, exercises: [{ sets: [{ weight: 50, reps: 10, canceledAt: canceled ? startedAt : null }] }] });

test('routineLastDone keeps the newest session with a valid set per routine', () => {
  const sessions = [done('3', 'a', '2026-10-01T09:00:00Z', true), done('2', 'a', '2026-09-28T09:00:00Z'), done('1', 'a', '2026-09-20T09:00:00Z'), done('x', 'gone', '2026-10-01T09:00:00Z'), { id: 'free', startedAt: '2026-10-01T09:00:00Z', exercises: [] }];
  const last = routineLastDone(routines, sessions);
  assert.equal(last.get('a'), '2026-09-28T09:00:00Z');
  assert.equal(last.get('b'), null);
  assert.equal(last.has('gone'), false);
});

test('nextRoutine picks a routine never done, then the one done longest ago', () => {
  assert.equal(nextRoutine(routines, [done('1', 'a', '2026-09-28T09:00:00Z')]).routine.id, 'b');
  const all = [done('3', 'b', '2026-10-01T09:00:00Z'), done('2', 'c', '2026-09-30T09:00:00Z'), done('1', 'a', '2026-09-29T09:00:00Z')];
  assert.deepEqual(nextRoutine(routines, all), { routine: routines[0], lastAt: '2026-09-29T09:00:00Z' });
});

test('nextRoutine stays quiet without a choice or any routine history', () => {
  assert.equal(nextRoutine([routines[0]], [done('1', 'a', '2026-09-28T09:00:00Z')]), null);
  assert.equal(nextRoutine(routines, []), null);
  assert.equal(nextRoutine(routines, [done('1', 'a', '2026-09-28T09:00:00Z', true)]), null);
});

test('daysAgo counts calendar days in the given time zone', () => {
  const now = Date.parse('2026-10-02T01:00:00Z'); // 10:00 on 10-02 in Seoul
  assert.equal(daysAgo('2026-10-01T20:00:00Z', now, 'Asia/Seoul'), 0); // 05:00 the same Seoul day
  assert.equal(daysAgo('2026-10-01T14:00:00Z', now, 'Asia/Seoul'), 1); // 23:00 the day before
  assert.equal(daysAgo('2026-09-27T01:00:00Z', now, 'Asia/Seoul'), 5);
});
