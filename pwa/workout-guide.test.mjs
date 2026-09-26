import test from 'node:test';
import assert from 'node:assert/strict';
import { workoutGuide } from './workout-guide.mjs';
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
