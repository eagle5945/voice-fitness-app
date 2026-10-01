import test from 'node:test';
import assert from 'node:assert/strict';
import { typicalRest, lastSetTime, restText } from './rest.mjs';

const base = Date.parse('2026-09-30T10:00:00.000Z');
let serial = 0;
const set = (seconds, extra = {}) => ({ id: `s${++serial}`, inputId: `i${serial}`, weight: 70, reps: 10, source: 'manual', at: new Date(base + seconds * 1000).toISOString(), updatedAt: null, canceledAt: null, ...extra });
const exercise = (sets, extra = {}) => ({ id: `e${++serial}`, name: '벤치프레스', kind: 'barbell', weight: 70, target: 10, sets, ...extra });
const bench = { name: '벤치프레스', kind: 'barbell' };

test('typical rest is the median gap between sets of the same lift', () => {
  const sessions = [
    { id: 'a', exercises: [exercise([set(0), set(90), set(210)])] },
    { id: 'b', exercises: [exercise([set(1000), set(1100)])] },
  ];
  assert.equal(typicalRest(sessions, bench), 100);
});

test('breaks, bursts, canceled sets and other equipment are ignored', () => {
  const sessions = [{ id: 'a', exercises: [
    exercise([set(0), set(5), set(125), set(245, { canceledAt: '2026-09-30T10:05:00.000Z' }), set(1500), set(1620)]),
    exercise([set(0), set(30), set(60)], { kind: 'dumbbell' }),
  ] }];
  assert.equal(typicalRest(sessions, bench), 120);
});

test('too little history gives no typical rest', () => {
  assert.equal(typicalRest([{ id: 'a', exercises: [exercise([set(0), set(90)])] }], bench), null);
});

test('last set time spans every exercise of the session and skips canceled sets', () => {
  const session = { exercises: [exercise([set(100)]), exercise([set(200), set(300, { canceledAt: '2026-09-30T10:06:00.000Z' })])] };
  assert.equal(lastSetTime(session), base + 200_000);
  assert.equal(lastSetTime({ exercises: [] }), null);
});

test('rest text counts up, turns ready at the typical rest and hides after 15 minutes', () => {
  assert.deepEqual(restText(base, 120, base + 75_000), { elapsed: 75, ready: false, text: '휴식 1:15 / 평소 2:00' });
  assert.equal(restText(base, 120, base + 120_000).ready, true);
  assert.deepEqual(restText(base, null, base + 9_000), { elapsed: 9, ready: false, text: '휴식 0:09' });
  assert.equal(restText(base, 120, base + 901_000), null);
});
