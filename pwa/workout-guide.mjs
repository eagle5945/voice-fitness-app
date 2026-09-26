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
