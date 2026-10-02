import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateOneRepMax, findRecord, oneRepMaxTrends, sparklinePoints, referenceOneRepMax, intensityOf, recordSets, bigThreeLift, bigThree } from './records.mjs';

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

test('the reference 1RM comes only from sessions started earlier', () => {
  const lift = (weight, reps, extra = {}) => ({ name: '스쿼트', kind: 'barbell', weight, target: 5, sets: [{ weight, reps, ...extra }] });
  const sessions = [
    { id: 'later', startedAt: '2026-10-03T09:00:00Z', exercises: [lift(150, 1)] },
    { id: 'today', startedAt: '2026-10-02T09:00:00Z', exercises: [lift(120, 5)] },
    { id: 'old', startedAt: '2026-09-30T09:00:00Z', exercises: [lift(100, 5), { name: '스쿼트', kind: 'dumbbell', weight: 200, target: 5, sets: [{ weight: 200, reps: 5 }] }] },
    { id: 'older', startedAt: '2026-09-28T09:00:00Z', exercises: [lift(110, 3, { canceledAt: '2026-09-28T09:10:00Z' })] },
  ];
  assert.equal(referenceOneRepMax(sessions, { name: '스쿼트', kind: 'barbell' }, sessions[1]), 116.7);
  assert.equal(referenceOneRepMax(sessions, { name: '스쿼트', kind: 'barbell' }, sessions[2]), null);
  assert.equal(referenceOneRepMax(sessions, { name: '벤치프레스', kind: 'barbell' }, sessions[1]), null);
});

test('intensity is weight over the reference with our six bands', () => {
  assert.deepEqual(intensityOf(91, 116.7), { percent: 78, label: '중강도', tier: 4 });
  assert.equal(intensityOf(40, 100).label, '워밍업');
  assert.equal(intensityOf(50, 100).label, '가벼움');
  assert.equal(intensityOf(60, 100).label, '보통');
  assert.equal(intensityOf(80, 100).label, '고강도');
  assert.deepEqual(intensityOf(105, 100), { percent: 105, label: '최대', tier: 6 });
  assert.equal(intensityOf(100, null), null);
  assert.equal(intensityOf(0, 100), null);
});

test('recordSets lists the sets that were records when logged', () => {
  const s = (id, at, sets, name = '스쿼트') => ({ id, startedAt: at, exercises: [{ name, kind: 'barbell', weight: 0, target: 5, sets: sets.map(([weight, reps, minute, canceled]) => ({ weight, reps, at: new Date(Date.parse(at) + minute * 60_000).toISOString(), canceledAt: canceled ? at : null })) }] });
  const sessions = [
    s('3', '2026-10-01T09:00:00Z', [[100, 5, 1], [105, 5, 2], [104, 5, 3], [200, 5, 4, true]]),
    s('2', '2026-09-28T09:00:00Z', [[100, 3, 1]], '벤치프레스'),
    s('1', '2026-09-25T09:00:00Z', [[100, 4, 1], [110, 1, 2]]),
  ];
  const records = recordSets(sessions);
  // Session 1 is the first for squat and the only bench session celebrates nothing; 100x5 beats 113.3, 105x5 beats 116.7.
  assert.deepEqual(records.map(r => [r.name, r.value, r.previous]), [['스쿼트', 116.7, 113.3], ['스쿼트', 122.5, 116.7]]);
});

test('only barbell back squat, bench press and deadlift count toward the big three', () => {
  const lift = (name, kind = 'barbell') => bigThreeLift({ name, kind });
  for (const [name, key] of [['스쿼트', 'squat'], ['바벨 스쿼트', 'squat'], ['백스쿼트', 'squat'], ['벤치프레스', 'bench'], ['바벨 벤치 프레스', 'bench'], ['벤치', 'bench'], ['데드리프트', 'deadlift'], ['컨벤셔널 데드리프트', 'deadlift'], ['스모 데드리프트', 'deadlift'], ['데드', 'deadlift']]) assert.equal(lift(name), key, name);
  for (const name of ['프론트 스쿼트', '불가리안 스플릿 스쿼트', '핵스쿼트', '스미스 스쿼트', '인클라인 벤치프레스', '클로즈그립 벤치프레스', '루마니안 데드리프트', '스티프 데드리프트', '트랩바 데드리프트', '벤치 딥스']) assert.equal(lift(name), null, name);
  assert.equal(lift('스쿼트', 'machine'), null);
  assert.equal(lift('벤치프레스', 'dumbbell'), null);
});

test('big three sums the best estimate of each lift and can look back in time', () => {
  const s = (at, name, weight, reps, canceled = false) => ({ id: at, startedAt: at, exercises: [{ name, kind: 'barbell', sets: [{ weight, reps, at, canceledAt: canceled ? at : null }] }] });
  const sessions = [
    s('2026-10-01T09:00:00Z', '바벨 스쿼트', 120, 5),
    s('2026-09-30T09:00:00Z', '벤치프레스', 100, 1),
    s('2026-09-29T09:00:00Z', '벤치프레스', 300, 1, true),
    s('2026-09-01T09:00:00Z', '스쿼트', 100, 5),
    s('2026-09-01T10:00:00Z', '프론트 스쿼트', 200, 5),
  ];
  const now = bigThree(sessions);
  assert.deepEqual(now.lifts.map(lift => lift.best), [140, 100, null]);
  assert.equal(now.total, 240);
  assert.equal(now.count, 2);
  const before = bigThree(sessions, { until: Date.parse('2026-09-15T00:00:00Z') });
  assert.deepEqual([before.total, before.count], [116.7, 1]);
});
