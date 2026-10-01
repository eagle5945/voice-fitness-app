import { sameExercise } from './progression.mjs';

// Gaps outside this range are warm-up bursts or real breaks, not rest between sets.
const MIN_GAP = 15;
const MAX_GAP = 600;
// After this long the timer is noise: the user has stopped or forgot to finish the workout.
export const REST_VISIBLE_SECONDS = 15 * 60;

const validSets = exercise => exercise.sets.filter(set => !set.canceledAt);

// Median rest in seconds between consecutive sets of the same lift, or null with too little history.
export function typicalRest(sessions, exercise) {
  const gaps = [];
  for (const item of sessions.flatMap(session => session.exercises).filter(entry => sameExercise(entry, exercise))) {
    const times = validSets(item).map(set => Date.parse(set.at)).sort((a, b) => a - b);
    for (let index = 1; index < times.length; index++) {
      const gap = (times[index] - times[index - 1]) / 1000;
      if (gap >= MIN_GAP && gap <= MAX_GAP) gaps.push(gap);
    }
  }
  if (gaps.length < 2) return null;
  gaps.sort((a, b) => a - b);
  const middle = gaps.length >> 1;
  return Math.round(gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2);
}

// Elapsed time is derived from the latest saved set, so a backgrounded iPhone app
// still shows the right value when it comes back.
export function lastSetTime(session) {
  const times = (session?.exercises ?? []).flatMap(validSets).map(set => Date.parse(set.at));
  return times.length ? Math.max(...times) : null;
}

export function restText(since, target, now) {
  const elapsed = Math.max(0, Math.floor((now - since) / 1000));
  if (elapsed > REST_VISIBLE_SECONDS) return null;
  const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return { elapsed, ready: target != null && elapsed >= target, text: `휴식 ${clock(elapsed)}${target != null ? ` / 평소 ${clock(target)}` : ''}` };
}
