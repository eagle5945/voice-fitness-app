import test from 'node:test';
import assert from 'node:assert/strict';
import { findPreviousExercise, suggestProgression } from './progression.mjs';

let serial = 0;
const set = (weight, reps, extra = {}) => ({ id: `s${++serial}`, inputId: `i${serial}`, weight, reps, source: 'manual', at: '2026-09-30T10:00:00.000Z', updatedAt: null, canceledAt: null, ...extra });
const exercise = (sets, extra = {}) => ({ id: `e${++serial}`, name: '벤치프레스', kind: 'barbell', weight: 70, target: 12, plannedSets: 4, sets, ...extra });
const today = (extra = {}) => exercise([], extra);

test('suggests the next barbell weight when every planned set reached the target', () => {
  const previous = exercise([set(70, 12), set(70, 12), set(70, 13), set(70, 12)]);
  assert.deepEqual(suggestProgression(previous, today()), { weight: 72.5, base: 70, step: 2.5, sets: 4, reps: 12 });
});

test('dumbbell and machine use their own weight steps', () => {
  const dumbbell = exercise([set(14, 12), set(14, 12)], { kind: 'dumbbell', weight: 14, plannedSets: 2 });
  const machine = exercise([set(40, 12), set(40, 12)], { kind: 'machine', weight: 40, plannedSets: 2 });
  assert.equal(suggestProgression(dumbbell, today({ kind: 'dumbbell', weight: 14 })).weight, 15);
  assert.equal(suggestProgression(machine, today({ kind: 'machine', weight: 40 })).weight, 45);
});

test('a missed or missing planned set gives no suggestion', () => {
  assert.equal(suggestProgression(exercise([set(70, 12), set(70, 12), set(70, 11), set(70, 12)]), today()), null);
  assert.equal(suggestProgression(exercise([set(70, 12), set(70, 12), set(70, 12)]), today()), null);
});

test('canceled sets do not count toward the plan', () => {
  const previous = exercise([set(70, 12), set(70, 12), set(70, 12), set(70, 12, { canceledAt: '2026-09-30T10:05:00.000Z' })]);
  assert.equal(suggestProgression(previous, today()), null);
});

test('the base is the weight actually lifted for the required sets, ignoring warm-ups', () => {
  const warmups = exercise([set(40, 15), set(50, 12), set(70, 12), set(70, 12), set(70, 12), set(70, 12)]);
  assert.equal(suggestProgression(warmups, today()).base, 70);
  const heavierThanSetting = exercise([set(75, 12), set(75, 12), set(75, 12), set(75, 12)]);
  assert.equal(suggestProgression(heavierThanSetting, today()).weight, 77.5);
});

test('free workouts without a plan require every recorded set to reach the target', () => {
  const free = { plannedSets: undefined };
  assert.equal(suggestProgression(exercise([set(70, 12), set(70, 12), set(70, 12)], free), today(free)).sets, 3);
  assert.equal(suggestProgression(exercise([set(70, 12), set(70, 12), set(70, 9)], free), today(free)), null);
});

test('no suggestion once today already matches it, has started, or aims for more reps', () => {
  const previous = exercise([set(70, 12), set(70, 12), set(70, 12), set(70, 12)]);
  assert.equal(suggestProgression(previous, today({ weight: 72.5 })), null);
  assert.equal(suggestProgression(previous, exercise([set(70, 12)])), null);
  assert.equal(suggestProgression(previous, today({ target: 15 })), null);
  assert.ok(suggestProgression(previous, today({ target: 10 })));
});

test('suggestions never exceed the 2000kg input limit', () => {
  const previous = exercise([set(1999, 12)], { weight: 1999, plannedSets: 1 });
  assert.equal(suggestProgression(previous, today({ weight: 1999, plannedSets: 1 })), null);
});

test('previous exercise is the latest earlier match with the same name and equipment', () => {
  const current = exercise([]);
  const sessions = [
    { id: 'now', exercises: [current] },
    { id: 'empty', exercises: [exercise([set(60, 12, { canceledAt: '2026-09-29T10:00:00.000Z' })])] },
    { id: 'other-kind', exercises: [exercise([set(30, 12)], { kind: 'dumbbell' })] },
    { id: 'latest', exercises: [exercise([set(72.5, 12)], { id: 'wanted' })] },
    { id: 'older', exercises: [exercise([set(65, 12)])] },
  ];
  assert.equal(findPreviousExercise(sessions, current, 'now').id, 'wanted');
  assert.equal(findPreviousExercise(sessions, { name: '스쿼트', kind: 'barbell' }, 'now'), null);
});
