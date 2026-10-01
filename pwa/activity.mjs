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
