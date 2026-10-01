import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateOneRepMax, findRecord, oneRepMaxTrends, sparklinePoints } from './records.mjs';

let serial = 0;
const set = (weight, reps, extra = {}) => ({ id: `s${++serial}`, inputId: `i${serial}`, weight, reps, source: 'manual', at: '2026-09-30T10:00:00.000Z', updatedAt: null, canceledAt: null, ...extra });
const exercise = (sets, extra = {}) => ({ id: `e${++serial}`, name: '벤치프레스', kind: 'barbell', weight: 70, target: 12, sets, ...extra });
const session = (id, exercises) => ({ id, startedAt: '2026-09-30T10:00:00.000Z', endedAt: null, exercises });

test('estimates one-rep max with Epley and rounds to 0.1kg', () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
  assert.equal(estimateOneRepMax(72.5, 12), 101.5);
  assert.equal(estimateOneRepMax(70, 13), 100.3);
  assert.equal(estimateOneRepMax(70, 0), null);
  assert.equal(estimateOneRepMax(0, 12), null);
});

test('a new set beating every earlier valid set is a record', () => {
  const today = exercise([]);
  const sessions = [session('now', [today]), session('past', [exercise([set(70, 12), set(70, 13)])])];
  assert.deepEqual(findRecord(sessions, today, 'now', { weight: 72.5, reps: 12 }), { value: 101.5, previous: 100.3 });
});

test('the first session of a lift never celebrates', () => {
  const today = exercise([set(70, 12)]);
  const sessions = [session('now', [today]), session('past', [exercise([set(40, 12)], { name: '스쿼트' })])];
  assert.equal(findRecord(sessions, today, 'now', { weight: 80, reps: 12 }), null);
});

test('beating only an earlier set of today is not a record when an older best is higher', () => {
  const today = exercise([set(60, 10)]);
  const sessions = [session('now', [today]), session('past', [exercise([set(80, 10)])])];
  assert.equal(findRecord(sessions, today, 'now', { weight: 70, reps: 10 }), null);
});

test('a later set must beat today\'s earlier record too', () => {
  const today = exercise([set(75, 12)]);
  const sessions = [session('now', [today]), session('past', [exercise([set(70, 12)])])];
  assert.equal(findRecord(sessions, today, 'now', { weight: 72.5, reps: 12 }), null);
  assert.deepEqual(findRecord(sessions, today, 'now', { weight: 77.5, reps: 12 }), { value: 108.5, previous: 105 });
});

test('equal values, canceled sets, other equipment and weight-0 history are ignored', () => {
  const today = exercise([]);
  const canceled = set(90, 12, { canceledAt: '2026-09-30T10:05:00.000Z' });
  const sessions = [
    session('now', [today]),
    session('past', [exercise([set(70, 12), canceled]), exercise([set(100, 12)], { kind: 'machine' })]),
  ];
  assert.equal(findRecord(sessions, today, 'now', { weight: 70, reps: 12 }), null);
  assert.deepEqual(findRecord(sessions, today, 'now', { weight: 72.5, reps: 12 }), { value: 101.5, previous: 98 });
  const bodyweight = [session('now', [today]), session('past', [exercise([set(0, 12)])])];
  assert.equal(findRecord(bodyweight, today, 'now', { weight: 10, reps: 12 }), null);
});

test('trends keep each session\'s best set, oldest first, with best taken before trimming', () => {
  const sessions = [
    session('s4', [exercise([set(60, 10)], { name: '스쿼트' })]),
    session('s3', [exercise([set(70, 10)]), exercise([set(0, 15)], { name: '풀업' })]),
    session('s2', [exercise([set(65, 10), set(68, 10)])]),
    session('s1', [exercise([set(90, 10)])]),
  ];
  const trends = oneRepMaxTrends(sessions, 2);
  assert.deepEqual(trends.map(item => item.name), ['스쿼트', '벤치프레스']);
  const bench = trends[1];
  assert.deepEqual(bench.points.map(point => point.sessionId), ['s2', 's3']);
  assert.deepEqual(bench.points.map(point => point.value), [90.7, 93.3]);
  assert.equal(bench.best, 120);
  assert.equal(bench.latest, 93.3);
});

test('sparkline spreads points across the box and stays flat for equal values', () => {
  assert.deepEqual(sparklinePoints([90, 100], 84, 28), [[3, 25], [81, 3]]);
  assert.deepEqual(sparklinePoints([95, 95, 95], 84, 28).map(([, y]) => y), [14, 14, 14]);
});
