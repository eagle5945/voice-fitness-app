export function workoutGuide(session, activeId) {
  const exercises = session?.exercises ?? [];
  const count = item => item.sets.filter(set => !set.canceledAt).length;
  const planned = exercises.filter(item => item.plannedSets > 0);
  const current = exercises.find(item => item.id === activeId);
  const position = exercises.indexOf(current);
  const remaining = [...exercises.slice(position + 1), ...exercises.slice(0, Math.max(position, 0))];
  return {
    position,
    currentCount: current ? count(current) : 0,
    currentComplete: Boolean(current?.plannedSets && count(current) >= current.plannedSets),
    recordedSets: exercises.reduce((n, item) => n + count(item), 0),
    completedSets: planned.reduce((n, item) => n + Math.min(count(item), item.plannedSets), 0),
    totalSets: planned.reduce((n, item) => n + item.plannedSets, 0),
    allComplete: planned.length > 0 && planned.every(item => count(item) >= item.plannedSets),
    next: remaining.find(item => !item.plannedSets || count(item) < item.plannedSets) ?? null,
  };
}

// When each routine was last done: the newest session started from it with at least one valid set.
export function routineLastDone(routines, sessions) {
  const last = new Map(routines.map(routine => [routine.id, null]));
  for (const session of sessions) {
    if (!last.has(session.routineId)) continue;
    if (!session.exercises.some(item => item.sets.some(set => !set.canceledAt))) continue;
    const previous = last.get(session.routineId);
    if (!previous || Date.parse(session.startedAt) > Date.parse(previous)) last.set(session.routineId, session.startedAt);
  }
  return last;
}

// Rotation by rule, not prediction: a routine never done comes first (in list order), otherwise the one done longest ago.
// Needs two routines and some routine history; otherwise there is nothing to rotate.
export function nextRoutine(routines, sessions) {
  if (routines.length < 2) return null;
  const last = routineLastDone(routines, sessions);
  if (![...last.values()].some(Boolean)) return null;
  const fresh = routines.find(routine => !last.get(routine.id));
  if (fresh) return { routine: fresh, lastAt: null };
  const routine = routines.reduce((oldest, item) => (Date.parse(last.get(item.id)) < Date.parse(last.get(oldest.id)) ? item : oldest));
  return { routine, lastAt: last.get(routine.id) };
}

// Calendar days between two timestamps in the device time zone: 0 today, 1 yesterday.
export function daysAgo(iso, now = Date.now(), timeZone) {
  const key = value => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  return Math.round((Date.parse(`${key(now)}T00:00:00Z`) - Date.parse(`${key(iso)}T00:00:00Z`)) / 86_400_000);
}
