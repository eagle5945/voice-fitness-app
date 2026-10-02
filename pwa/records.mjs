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

// Every set that was a record when it was logged, by the same rule as findRecord:
// it must beat all earlier sets of the lift, and an earlier session must already have one.
export function recordSets(sessions) {
  const entries = sessions.flatMap(session => session.exercises.flatMap(exercise => validSets(exercise).map(set => ({ session, exercise, set, value: estimateOneRepMax(set.weight, set.reps) }))))
    .filter(entry => entry.value)
    .sort((a, b) => Date.parse(a.set.at) - Date.parse(b.set.at));
  const seen = [];
  const records = [];
  for (const entry of entries) {
    let lift = seen.find(item => sameExercise(item.exercise, entry.exercise));
    if (!lift) seen.push(lift = { exercise: entry.exercise, best: 0, sessions: new Set() });
    const earlier = [...lift.sessions].some(id => id !== entry.session.id);
    if (earlier && entry.value > lift.best) records.push({ at: entry.set.at, name: entry.exercise.name, kind: entry.exercise.kind, value: entry.value, previous: lift.best });
    lift.best = Math.max(lift.best, entry.value);
    lift.sessions.add(entry.session.id);
  }
  return records;
}

// Best estimate from sessions started before this one, so today's sets never move their own reference.
export function referenceOneRepMax(sessions, exercise, session) {
  const start = Date.parse(session.startedAt);
  const values = sessions
    .filter(item => item.id !== session.id && Date.parse(item.startedAt) < start)
    .flatMap(item => item.exercises)
    .filter(item => sameExercise(item, exercise))
    .map(bestOf)
    .filter(value => value > 0);
  return values.length ? Math.max(...values) : null;
}

// Our own bands; there is no shared standard for naming %1RM zones.
export const INTENSITY_LEVELS = [
  { min: 90, label: '최대' },
  { min: 80, label: '고강도' },
  { min: 70, label: '중강도' },
  { min: 60, label: '보통' },
  { min: 50, label: '가벼움' },
  { min: 0, label: '워밍업' },
];

export function intensityOf(weight, reference) {
  if (!(reference > 0) || !(weight > 0)) return null;
  const percent = Math.round(weight / reference * 100);
  const index = INTENSITY_LEVELS.findIndex(level => percent >= level.min);
  return { percent, label: INTENSITY_LEVELS[index].label, tier: INTENSITY_LEVELS.length - index };
}

// Barbell back squat, bench press and deadlift only; variations are a different lift.
const BIG_THREE = [
  { key: 'squat', label: '스쿼트', match: /스쿼트/, exclude: /프론트|불가리안|스플릿|핵|고블릿|스미스|점프|박스|오버헤드|저처|피스톨|와이드/ },
  { key: 'bench', label: '벤치프레스', match: /벤치프레스|^벤치$/, exclude: /인클라인|디클라인|클로즈|내로우|스미스|플로어/ },
  { key: 'deadlift', label: '데드리프트', match: /데드리프트|^데드$/, exclude: /루마니안|스티프|rdl|트랩|헥스|싱글|원레그|데피싯|랙풀/ },
];

export function bigThreeLift(exercise) {
  if (exercise?.kind !== 'barbell') return null;
  const name = String(exercise.name ?? '').toLowerCase().replace(/\s+/g, '').replace(/^(?:바벨|백|컨벤셔널|스모)/, '');
  return BIG_THREE.find(lift => lift.match.test(name) && !lift.exclude.test(name))?.key ?? null;
}

// Best estimated 1RM per lift from sets done before `until`, and their sum. A lift without sets is left out of the total.
export function bigThree(sessions, { until = Infinity } = {}) {
  const lifts = BIG_THREE.map(({ key, label }) => ({ key, label, best: null, at: null }));
  for (const session of sessions) for (const exercise of session.exercises) {
    const lift = lifts.find(item => item.key === bigThreeLift(exercise));
    if (!lift) continue;
    for (const set of validSets(exercise)) {
      if (Date.parse(set.at) >= until) continue;
      const value = estimateOneRepMax(set.weight, set.reps);
      if (value && (lift.best == null || value > lift.best)) Object.assign(lift, { best: value, at: set.at });
    }
  }
  const done = lifts.filter(lift => lift.best != null);
  return { lifts, total: Math.round(done.reduce((n, lift) => n + lift.best, 0) * 10) / 10, count: done.length };
}

export function sparklinePoints(values, width, height, pad = 3) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const y = value => max === min ? height / 2 : height - pad - (value - min) / (max - min) * (height - pad * 2);
  return values.map((value, index) => [pad + index * step, y(value)].map(n => Math.round(n * 10) / 10));
}
