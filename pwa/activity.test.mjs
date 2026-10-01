import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, setVolume, activityLevel, activityCalendar, weeklyVolume } from './activity.mjs';

const zone = 'Asia/Seoul';
let serial = 0;
// Times are given in Korea time so the expected calendar days read naturally.
const set = (kst, weight = 50, reps = 10, extra = {}) => ({ id: `s${++serial}`, inputId: `i${serial}`, weight, reps, source: 'manual', at: new Date(`${kst}+09:00`).toISOString(), updatedAt: null, canceledAt: null, ...extra });
const session = (exercises) => ({ id: `w${++serial}`, startedAt: exercises[0].sets[0]?.at ?? new Date().toISOString(), endedAt: null, exercises });
const exercise = (sets, kind = 'barbell') => ({ id: `e${++serial}`, name: '벤치프레스', kind, weight: 50, target: 10, sets });
// Thursday 1 October 2026, 20:00 in Korea.
const now = Date.parse('2026-10-01T20:00:00+09:00');

test('day keys follow the requested time zone', () => {
  assert.equal(dayKey('2026-09-30T16:30:00Z', zone), '2026-10-01');
  assert.equal(dayKey('2026-09-30T14:30:00Z', zone), '2026-09-30');
});

test('volume doubles dumbbells and activity levels use fixed thresholds', () => {
  assert.equal(setVolume({ weight: 20, reps: 10 }, 'dumbbell'), 400);
  assert.equal(setVolume({ weight: 60, reps: 10 }, 'barbell'), 600);
  assert.deepEqual([0, 1, 5, 6, 10, 11, 15, 16, 30].map(activityLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('the calendar ends on the current Monday-start week and marks today and future days', () => {
  const calendar = activityCalendar([], { now, weeks: 16, timeZone: zone });
  assert.equal(calendar.columns.length, 16);
  assert.ok(calendar.columns.every(column => column.length === 7));
  assert.equal(calendar.columns[0][0].key, '2026-06-15');
  assert.equal(calendar.columns.at(-1)[0].key, '2026-09-28');
  assert.equal(calendar.columns.at(-1)[3].today, true);
  assert.deepEqual(calendar.columns.at(-1).map(day => day.future), [false, false, false, false, true, true, true]);
});

test('sets are counted on the day they were lifted, canceled sets are ignored', () => {
  const sessions = [session([exercise([
    set('2026-09-30T23:50:00'), set('2026-10-01T00:10:00'),
    set('2026-10-01T00:20:00', 50, 10, { canceledAt: '2026-10-01T00:30:00+09:00' }),
  ])])];
  const days = activityCalendar(sessions, { now, timeZone: zone }).columns.at(-1);
  assert.equal(days[2].sets, 1);
  assert.equal(days[3].sets, 1);
  assert.equal(days[3].volume, 500);
});

test('streak counts consecutive active weeks and an empty current week does not break it', () => {
  const sessions = [session([exercise([set('2026-09-22T19:00:00'), set('2026-09-15T19:00:00'), set('2026-09-01T19:00:00')])])];
  const calendar = activityCalendar(sessions, { now, timeZone: zone });
  assert.equal(calendar.streak, 2);
  assert.equal(calendar.activeDays, 3);
  assert.equal(calendar.totalSets, 3);
  const withToday = [...sessions, session([exercise([set('2026-10-01T19:00:00')])])];
  assert.equal(activityCalendar(withToday, { now, timeZone: zone }).streak, 3);
});

test('weekly volume compares this week with the same weekdays of last week', () => {
  const sessions = [session([
    exercise([set('2026-09-21T19:00:00', 100, 10), set('2026-09-26T19:00:00', 100, 10)]),
    exercise([set('2026-09-29T19:00:00', 20, 10), set('2026-10-01T08:00:00', 20, 10)], 'dumbbell'),
  ])];
  const result = weeklyVolume(sessions, { now, weeks: 8, timeZone: zone });
  assert.equal(result.rows.length, 8);
  assert.deepEqual(result.rows.at(-1), { start: '2026-09-28', current: true, days: 2, sets: 2, volume: 800 });
  assert.deepEqual(result.rows.at(-2), { start: '2026-09-21', current: false, days: 2, sets: 2, volume: 2000 });
  // Last week up to Thursday holds only the Monday set (1000), not Saturday's.
  assert.equal(result.lastWeekToDate, 1000);
  assert.equal(result.change, -20);
  assert.equal(weeklyVolume([], { now, timeZone: zone }).change, null);
});
