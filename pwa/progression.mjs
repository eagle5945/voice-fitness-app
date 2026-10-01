// Weight added per suggestion. Adjust when the gym's plates or dumbbells use other steps.
export const PROGRESSION_STEP = { barbell: 2.5, dumbbell: 1, machine: 5 };

const validSets = exercise => exercise.sets.filter(set => !set.canceledAt);
// Dumbbells are logged per hand, so the same name on other equipment is a different lift.
export const sameExercise = (a, b) => a.name === b.name && a.kind === b.kind;

// Sessions are stored newest first, so the first match is the latest earlier attempt.
export function findPreviousExercise(sessions, exercise, currentSessionId) {
  return sessions.filter(session => session.id !== currentSessionId)
    .flatMap(session => session.exercises)
    .find(item => sameExercise(item, exercise) && validSets(item).length) ?? null;
}

export function suggestProgression(previous, current) {
  if (!previous || !current || validSets(current).length || current.target > previous.target) return null;
  const step = PROGRESSION_STEP[current.kind];
  const sets = validSets(previous);
  const required = previous.plannedSets ?? sets.length;
  // Use logged weights: dictation can record a weight different from the exercise setting.
  const hits = sets.filter(set => set.reps >= previous.target).map(set => set.weight).sort((a, b) => b - a);
  if (!step || !required || hits.length < required) return null;
  const base = hits[required - 1];
  const weight = Math.round((base + step) * 100) / 100;
  if (weight > 2000 || current.weight >= weight) return null;
  return { weight, base, step, sets: required, reps: previous.target };
}
