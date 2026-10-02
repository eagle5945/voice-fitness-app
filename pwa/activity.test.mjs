import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, setVolume, activityLevel, activityCalendar, weeklyVolume, weeklyReport, reportSentence } from './activity.mjs';

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

test('weekly report compares this week with the same weekdays of last week', () => {
  const lift = (sets, name = '벤치프레스') => ({ ...exercise(sets), name });
  const withStart = (kst, exercises) => ({ ...session(exercises), startedAt: new Date(`${kst}+09:00`).toISOString() });
  const sessions = [
    // This week: Tuesday (60x10 beats last week's 60x8, then 70x5 beats that) and Thursday morning.
    withStart('2026-09-29T18:50:00', [lift([set('2026-09-29T19:00:00', 60, 10), set('2026-09-29T19:30:00', 70, 5)])]),
    withStart('2026-10-01T07:40:00', [lift([set('2026-10-01T08:00:00', 50, 10)])]),
    // Last week: Monday counts, Saturday is after last Thursday and does not.
    withStart('2026-09-21T18:30:00', [lift([set('2026-09-21T19:00:00', 60, 8)])]),
    withStart('2026-09-26T10:00:00', [lift([set('2026-09-26T10:10:00', 40, 10)])]),
    // A forgotten finish does not stretch the time: start to last set only.
    { ...withStart('2026-09-22T19:00:00', [lift([set('2026-09-22T19:20:00', 30, 10)], '스쿼트')]), endedAt: new Date('2026-09-23T03:00:00+09:00').toISOString() },
  ];
  const report = weeklyReport(sessions, { now, timeZone: zone });
  assert.deepEqual(report.thisWeek, { workouts: 2, minutes: 40 + 20, sets: 3, volume: 600 + 350 + 500, records: 2 });
  assert.deepEqual(report.lastWeek, { workouts: 2, minutes: 30 + 20, sets: 2, volume: 480 + 300, records: 0 });
  assert.equal(report.volumeChange, 86);
  assert.equal(report.newRecords[0].name, '벤치프레스');
  assert.equal(reportSentence(report), '이번 주 2번 운동했습니다. 볼륨은 지난주 같은 기간보다 86% 늘었습니다. 신기록 2개를 세웠습니다.');
});

test('report sentences cover empty weeks and missing comparisons', () => {
  const empty = { workouts: 0, minutes: 0, sets: 0, volume: 0, records: 0 };
  assert.equal(reportSentence({ thisWeek: empty, lastWeek: empty, volumeChange: null }), '이번 주는 아직 운동 기록이 없습니다.');
  assert.equal(reportSentence({ thisWeek: empty, lastWeek: { ...empty, workouts: 3 }, volumeChange: null }), '이번 주는 아직 운동 기록이 없습니다. 지난주 같은 기간에는 3번 운동했습니다.');
  assert.equal(reportSentence({ thisWeek: { ...empty, workouts: 1, volume: 500 }, lastWeek: empty, volumeChange: null }), '이번 주 1번 운동했습니다. 지난주 같은 기간에는 기록이 없었습니다.');
  assert.equal(reportSentence({ thisWeek: { ...empty, workouts: 1, volume: 500 }, lastWeek: { ...empty, workouts: 1, volume: 500 }, volumeChange: 0 }), '이번 주 1번 운동했습니다. 볼륨은 지난주 같은 기간과 같습니다.');
});
