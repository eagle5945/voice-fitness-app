import { recordSets } from './records.mjs';

// Daily and weekly activity for the history tab. Weeks start on Monday, as Korean calendars do.
const DAY = 86_400_000;

// Calendar day of a timestamp in the given (default: device) time zone, as YYYY-MM-DD.
export function dayKey(value, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const keyToUtc = key => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
const utcToKey = ms => new Date(ms).toISOString().slice(0, 10);
const weekday = key => (new Date(keyToUtc(key)).getUTCDay() + 6) % 7;

// Dumbbells are logged per hand, so a set moves twice the logged weight.
export const setVolume = (set, kind) => set.weight * set.reps * (kind === 'dumbbell' ? 2 : 1);

// Grouped by when each set was lifted, so a workout that crosses midnight is split correctly.
export function dailyActivity(sessions, timeZone) {
  const days = new Map();
  for (const session of sessions) for (const exercise of session.exercises) for (const set of exercise.sets) {
    if (set.canceledAt) continue;
    const key = dayKey(set.at, timeZone);
    const day = days.get(key) ?? { sets: 0, volume: 0 };
    day.sets += 1;
    day.volume += setVolume(set, exercise.kind);
    days.set(key, day);
  }
  return days;
}

// Fixed thresholds so the legend can state them: 1–5, 6–10, 11–15, 16+ sets.
export const activityLevel = sets => sets === 0 ? 0 : sets <= 5 ? 1 : sets <= 10 ? 2 : sets <= 15 ? 3 : 4;

export function activityCalendar(sessions, { now = Date.now(), weeks = 16, timeZone } = {}) {
  const days = dailyActivity(sessions, timeZone);
  const today = dayKey(now, timeZone);
  const start = keyToUtc(today) - (weekday(today) + (weeks - 1) * 7) * DAY;
  const columns = Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, index) => {
    const key = utcToKey(start + (week * 7 + index) * DAY);
    const day = days.get(key) ?? { sets: 0, volume: 0 };
    return { key, sets: day.sets, volume: day.volume, level: activityLevel(day.sets), today: key === today, future: key > today };
  }));
  const past = columns.flat().filter(day => !day.future);
  const active = columns.map(column => column.some(day => day.sets));
  // An empty current week has not been missed yet, so the streak counts back from last week.
  let streak = 0;
  for (let week = active.at(-1) ? weeks - 1 : weeks - 2; week >= 0 && active[week]; week--) streak++;
  return { columns, today, activeDays: past.filter(day => day.sets).length, totalSets: past.reduce((n, day) => n + day.sets, 0), streak };
}

export function weeklyVolume(sessions, { now = Date.now(), weeks = 8, timeZone } = {}) {
  const { columns, today } = activityCalendar(sessions, { now, weeks, timeZone });
  const rows = columns.map(column => ({
    start: column[0].key,
    current: column.some(day => day.today),
    days: column.filter(day => day.sets).length,
    sets: column.reduce((n, day) => n + day.sets, 0),
    volume: column.reduce((n, day) => n + day.volume, 0),
  }));
  // Compare the current week with the same weekdays of last week, not the whole of last week.
  const upTo = weekday(today);
  const lastWeekToDate = weeks > 1 ? columns.at(-2).filter((_, index) => index <= upTo).reduce((n, day) => n + day.volume, 0) : 0;
  const thisWeek = rows.at(-1).volume;
  const change = lastWeekToDate > 0 ? Math.round((thisWeek - lastWeekToDate) / lastWeekToDate * 100) : null;
  return { rows, thisWeek, lastWeekToDate, change };
}

// Workout time runs from the start to the last set, so forgetting to press 종료 does not inflate it.
const sessionMinutes = session => {
  const last = Math.max(...session.exercises.flatMap(exercise => exercise.sets.filter(set => !set.canceledAt).map(set => Date.parse(set.at))));
  return Math.max(0, Math.round((last - Date.parse(session.startedAt)) / 60_000));
};

// This week (Monday to today) against the same weekdays of last week, so early in the week is not read as a drop.
export function weeklyReport(sessions, { now = Date.now(), timeZone } = {}) {
  const today = dayKey(now, timeZone);
  const monday = keyToUtc(today) - weekday(today) * DAY;
  const ranges = { thisWeek: [utcToKey(monday), today], lastWeek: [utcToKey(monday - 7 * DAY), utcToKey(keyToUtc(today) - 7 * DAY)] };
  const inRange = (value, [from, to]) => { const key = dayKey(value, timeZone); return key >= from && key <= to; };
  const done = sessions.filter(session => session.exercises.some(exercise => exercise.sets.some(set => !set.canceledAt)));
  const records = recordSets(sessions);
  const days = dailyActivity(sessions, timeZone);
  const summarize = range => {
    const list = done.filter(session => inRange(session.startedAt, range));
    let sets = 0;
    let volume = 0;
    for (const [key, day] of days) if (key >= range[0] && key <= range[1]) { sets += day.sets; volume += day.volume; }
    return { workouts: list.length, minutes: list.reduce((n, session) => n + sessionMinutes(session), 0), sets, volume, records: records.filter(record => inRange(record.at, range)).length };
  };
  const thisWeek = summarize(ranges.thisWeek);
  const lastWeek = summarize(ranges.lastWeek);
  const volumeChange = lastWeek.volume > 0 ? Math.round((thisWeek.volume - lastWeek.volume) / lastWeek.volume * 100) : null;
  return { thisWeek, lastWeek, volumeChange, newRecords: records.filter(record => inRange(record.at, ranges.thisWeek)) };
}

// One plain sentence built from the numbers; no advice beyond what the numbers say.
export function reportSentence({ thisWeek, lastWeek, volumeChange }) {
  if (!thisWeek.workouts) return lastWeek.workouts ? `이번 주는 아직 운동 기록이 없습니다. 지난주 같은 기간에는 ${lastWeek.workouts}번 운동했습니다.` : '이번 주는 아직 운동 기록이 없습니다.';
  const compare = volumeChange === null ? '지난주 같은 기간에는 기록이 없었습니다.'
    : volumeChange === 0 ? '볼륨은 지난주 같은 기간과 같습니다.'
    : `볼륨은 지난주 같은 기간보다 ${Math.abs(volumeChange)}% ${volumeChange > 0 ? '늘었습니다' : '줄었습니다'}.`;
  return `이번 주 ${thisWeek.workouts}번 운동했습니다. ${compare}${thisWeek.records ? ` 신기록 ${thisWeek.records}개를 세웠습니다.` : ''}`;
}
