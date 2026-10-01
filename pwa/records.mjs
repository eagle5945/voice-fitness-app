import { sameExercise } from './progression.mjs';

const validSets = exercise => exercise.sets.filter(set => !set.canceledAt);

// Epley estimate, rounded once so the stored comparison and the shown number always agree.
export function estimateOneRepMax(weight, reps) {
  if (!(weight > 0) || !(reps > 0)) return null;
  return Math.round((reps === 1 ? weight : weight * (1 + reps / 30)) * 10) / 10;
}

const bestOf = exercise => Math.max(0, ...validSets(exercise).map(set => estimateOneRepMax(set.weight, set.reps) ?? 0));

// Call before the new set is added. The first session of a lift has nothing to beat, so it never celebrates.
export function findRecord(sessions, exercise, sessionId, { weight, reps }) {
  const value = estimateOneRepMax(weight, reps);
  if (!value) return null;
  const earlier = sessions.some(session => session.id !== sessionId && session.exercises.some(item => sameExercise(item, exercise) && bestOf(item) > 0));
  if (!earlier) return null;
  const previous = Math.max(...sessions.flatMap(session => session.exercises).filter(item => sameExercise(item, exercise)).map(bestOf));
  return value > previous ? { value, previous } : null;
}

// One point per session (its best set), oldest first, most recently trained lift first.
export function oneRepMaxTrends(sessions, limit = 12) {
  const trends = [];
  for (const session of [...sessions].reverse()) {
    for (const exercise of session.exercises) {
      const value = bestOf(exercise);
      if (!value) continue;
      let trend = trends.find(item => sameExercise(item, exercise));
      if (!trend) trends.push(trend = { name: exercise.name, kind: exercise.kind, points: [] });
      const last = trend.points.at(-1);
      if (last?.sessionId === session.id) last.value = Math.max(last.value, value);
      else trend.points.push({ sessionId: session.id, value });
    }
  }
  const order = new Map(sessions.map((session, index) => [session.id, index]));
  return trends
    .map(trend => ({ name: trend.name, kind: trend.kind, best: Math.max(...trend.points.map(point => point.value)), latest: trend.points.at(-1).value, points: trend.points.slice(-limit) }))
    .sort((a, b) => order.get(a.points.at(-1).sessionId) - order.get(b.points.at(-1).sessionId));
}

export function sparklinePoints(values, width, height, pad = 3) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const y = value => max === min ? height / 2 : height - pad - (value - min) / (max - min) * (height - pad * 2);
  return values.map((value, index) => [pad + index * step, y(value)].map(n => Math.round(n * 10) / 10));
}
