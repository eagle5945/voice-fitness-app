export const emptyData = () => ({ version: 1, routines: [], sessions: [], activeSessionId: null, activeExerciseId: null, lastBackupAt: null, selectedRoutineId: null });

const copy = data => structuredClone(data);
const findSession = (data, id) => data.sessions.find(item => item.id === id);
const findExercise = (session, id) => session.exercises.find(item => item.id === id);
const validWeight = value => Number.isFinite(value) && value >= 0 && value <= 2000;
const validReps = value => Number.isInteger(value) && value >= 0 && value <= 999;
const validDate = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));

export function startSession(source, id, startedAt) {
  const data = copy(source);
  if (!id || data.sessions.some(item => item.id === id)) throw new Error('운동일지 ID가 중복됩니다.');
  data.sessions.unshift({ id, startedAt, endedAt: null, exercises: [] });
  data.activeSessionId = id;
  data.activeExerciseId = null;
  return data;
}

export function setExercise(source, sessionId, input) {
  const data = copy(source);
  const session = findSession(data, sessionId);
  if (!session || session.endedAt) throw new Error('진행 중인 운동이 없습니다.');
  if (!input.id || !input.name?.trim() || !validWeight(input.weight) || !Number.isInteger(input.target) || input.target < 1 || input.target > 999) {
    throw new Error('종목과 중량, 목표 횟수를 확인해주세요.');
  }
  let exercise = findExercise(session, input.id);
  if (exercise) Object.assign(exercise, { name: input.name.trim(), kind: input.kind, weight: input.weight, target: input.target, ...(input.plannedSets ? { plannedSets: input.plannedSets } : {}) });
  else {
    exercise = { id: input.id, name: input.name.trim(), kind: input.kind, weight: input.weight, target: input.target, ...(input.plannedSets ? { plannedSets: input.plannedSets } : {}), sets: [] };
    session.exercises.push(exercise);
  }
  data.activeSessionId = sessionId;
  data.activeExerciseId = exercise.id;
  return data;
}

export function saveRoutine(source, routine) {
  if (!routine?.id || !routine.title?.trim() || routine.title.trim().length > 40 || !Array.isArray(routine.exercises) || !routine.exercises.length) throw new Error('루틴 제목과 운동을 하나 이상 입력해주세요.');
  const ids = new Set();
  const exercises = routine.exercises.map(item => {
    if (!item.id || ids.has(item.id) || !item.name?.trim() || item.name.trim().length > 60 || !['barbell', 'dumbbell', 'machine'].includes(item.kind) || !validWeight(item.weight) || !Number.isInteger(item.target) || item.target < 1 || item.target > 999 || !Number.isInteger(item.plannedSets) || item.plannedSets < 1 || item.plannedSets > 99) throw new Error('각 운동의 이름, 장비, 중량, 횟수, 세트 수를 확인해주세요.');
    ids.add(item.id);
    return { id: item.id, name: item.name.trim(), kind: item.kind, weight: item.weight, target: item.target, plannedSets: item.plannedSets };
  });
  const data = copy(source);
  const saved = { id: routine.id, title: routine.title.trim(), exercises };
  const index = data.routines.findIndex(item => item.id === routine.id);
  if (index < 0) data.routines.push(saved); else data.routines[index] = saved;
  data.selectedRoutineId = saved.id;
  return data;
}

// A draft for the routine dialog: what was actually done, using each exercise's last valid set.
export function routineDraftFromSession(session, title) {
  const exercises = (session?.exercises ?? []).map(exercise => {
    const sets = exercise.sets.filter(set => !set.canceledAt);
    if (!sets.length) return null;
    return { name: exercise.name, kind: exercise.kind, weight: sets.at(-1).weight, target: exercise.target, plannedSets: Math.min(sets.length, 99) };
  }).filter(Boolean);
  return exercises.length ? { title: title.slice(0, 40), exercises } : null;
}

export function removeRoutine(source, routineId) {
  const data = copy(source);
  data.routines = data.routines.filter(item => item.id !== routineId);
  if (data.selectedRoutineId === routineId) data.selectedRoutineId = data.routines[0]?.id ?? null;
  return data;
}

export function selectRoutine(source, routineId) {
  const data = copy(source);
  if (!data.routines.some(item => item.id === routineId)) throw new Error('저장된 루틴을 찾지 못했습니다.');
  data.selectedRoutineId = routineId;
  return data;
}

export function startRoutine(source, routineId, sessionId, startedAt, makeId) {
  const routine = source.routines.find(item => item.id === routineId);
  if (!routine) throw new Error('시작할 루틴을 선택해주세요.');
  let data = startSession(source, sessionId, startedAt);
  data.sessions[0].routineId = routine.id;
  data.sessions[0].routineName = routine.title;
  for (const item of routine.exercises) {
    data = setExercise(data, sessionId, { id: makeId(), name: item.name, kind: item.kind, weight: item.weight, target: item.target, plannedSets: item.plannedSets });
  }
  data.activeExerciseId = data.sessions[0].exercises[0].id;
  return data;
}

export function chooseSessionExercise(source, exerciseId) {
  const data = copy(source);
  const session = findSession(data, data.activeSessionId);
  if (!session || session.endedAt || !session.exercises.some(item => item.id === exerciseId)) throw new Error('진행 중인 운동에서 종목을 찾지 못했습니다.');
  data.activeExerciseId = exerciseId;
  return data;
}

export function addSet(source, sessionId, exerciseId, input) {
  const data = copy(source);
  const session = findSession(data, sessionId);
  const exercise = session && findExercise(session, exerciseId);
  if (!exercise || session.endedAt) throw new Error('진행 중인 종목이 없습니다.');
  if (!validWeight(input.weight) || !validReps(input.reps)) throw new Error('중량 또는 횟수가 올바르지 않습니다.');
  if (!input.id || !input.inputId || !['voice', 'manual'].includes(input.source)) throw new Error('입력 정보가 올바르지 않습니다.');
  if (data.sessions.some(item => item.exercises.some(entry => entry.sets.some(set => set.inputId === input.inputId)))) return data;
  exercise.sets.push({ id: input.id, inputId: input.inputId, weight: input.weight, reps: input.reps, source: input.source, at: input.at, updatedAt: null, canceledAt: null });
  return data;
}

function changeSet(source, setId, mutate) {
  const data = copy(source);
  const set = data.sessions.flatMap(item => item.exercises).flatMap(item => item.sets).find(item => item.id === setId);
  if (!set) throw new Error('세트를 찾지 못했습니다.');
  mutate(set);
  return data;
}

export function updateSet(data, setId, { reps, weight }, at = new Date().toISOString()) {
  if (!validWeight(weight) || !validReps(reps)) throw new Error('중량 또는 횟수가 올바르지 않습니다.');
  return changeSet(data, setId, set => { set.reps = reps; set.weight = weight; set.updatedAt = at; });
}

export const cancelSet = (data, setId, at = new Date().toISOString()) => changeSet(data, setId, set => { set.canceledAt = at; });
export const restoreSet = (data, setId) => changeSet(data, setId, set => { set.canceledAt = null; });

export function deleteSetRecord(source, setId) {
  const data = copy(source);
  let found = false;
  for (const session of data.sessions) for (const exercise of session.exercises) {
    const index = exercise.sets.findIndex(set => set.id === setId);
    if (index >= 0) { exercise.sets.splice(index, 1); found = true; break; }
  }
  if (!found) throw new Error('세트 기록을 찾지 못했습니다.');
  return data;
}

export function deleteSession(source, sessionId) {
  const data = copy(source);
  const index = data.sessions.findIndex(session => session.id === sessionId);
  if (index < 0) throw new Error('운동 기록을 찾지 못했습니다.');
  data.sessions.splice(index, 1);
  if (data.activeSessionId === sessionId) { data.activeSessionId = null; data.activeExerciseId = null; }
  return data;
}

export function clearSessionHistory(source) {
  const data = copy(source);
  data.sessions = [];
  data.activeSessionId = null;
  data.activeExerciseId = null;
  return data;
}

export function finishSession(source, sessionId, endedAt) {
  const data = copy(source);
  const session = findSession(data, sessionId);
  if (!session) throw new Error('운동일지를 찾지 못했습니다.');
  session.endedAt = endedAt;
  if (data.activeSessionId === sessionId) { data.activeSessionId = null; data.activeExerciseId = null; }
  return data;
}

export function validateBackup(input) {
  if (!input || typeof input !== 'object' || input.version !== 1 || !Array.isArray(input.sessions)) throw new Error('지원하지 않는 기록 파일입니다.');
  const data = { ...emptyData(), ...input, routines: input.routines ?? [] };
  if (!Array.isArray(data.routines)) throw new Error('운동 루틴 형식이 올바르지 않습니다.');
  const routineIds = new Set();
  for (const routine of data.routines) {
    if (!routine || typeof routine.id !== 'string' || !routine.id || routineIds.has(routine.id) || typeof routine.title !== 'string' || !routine.title.trim() || routine.title.length > 40 || !Array.isArray(routine.exercises) || !routine.exercises.length) throw new Error('운동 루틴 형식이 올바르지 않습니다.');
    routineIds.add(routine.id);
    const itemIds = new Set();
    for (const item of routine.exercises) {
      if (!item || typeof item.id !== 'string' || !item.id || itemIds.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60 || !['barbell', 'dumbbell', 'machine'].includes(item.kind) || !validWeight(item.weight) || !validReps(item.target) || item.target < 1 || !Number.isInteger(item.plannedSets) || item.plannedSets < 1 || item.plannedSets > 99) throw new Error('루틴 운동 형식이 올바르지 않습니다.');
      itemIds.add(item.id);
    }
  }
  const ids = new Set();
  const inputIds = new Set();
  const register = id => {
    if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('기록 ID가 올바르지 않습니다.');
    ids.add(id);
  };
  for (const session of data.sessions) {
    if (!session || !Array.isArray(session.exercises) || !validDate(session.startedAt) || (session.endedAt != null && !validDate(session.endedAt))) throw new Error('운동일지 형식이 올바르지 않습니다.');
    register(session.id);
    for (const exercise of session.exercises) {
      if (!exercise || !Array.isArray(exercise.sets) || typeof exercise.name !== 'string' || !exercise.name.trim() || !['barbell', 'dumbbell', 'machine'].includes(exercise.kind) || !validWeight(exercise.weight) || !validReps(exercise.target) || exercise.target < 1 || (exercise.plannedSets != null && (!Number.isInteger(exercise.plannedSets) || exercise.plannedSets < 1 || exercise.plannedSets > 99))) throw new Error('운동 항목 형식이 올바르지 않습니다.');
      register(exercise.id);
      for (const set of exercise.sets) {
        if (!set || !validWeight(set.weight) || !validReps(set.reps) || !validDate(set.at) || (set.updatedAt != null && !validDate(set.updatedAt)) || (set.canceledAt != null && !validDate(set.canceledAt)) || !['voice', 'manual'].includes(set.source) || typeof set.inputId !== 'string' || !set.inputId || inputIds.has(set.inputId)) throw new Error('세트 형식이 올바르지 않습니다.');
        inputIds.add(set.inputId);
        register(set.id);
      }
    }
  }
  if (data.activeSessionId && !data.sessions.some(item => item.id === data.activeSessionId && !item.endedAt)) throw new Error('진행 중인 운동 정보가 올바르지 않습니다.');
  if (data.activeExerciseId && !data.sessions.some(item => item.id === data.activeSessionId && item.exercises.some(entry => entry.id === data.activeExerciseId))) throw new Error('진행 중인 종목 정보가 올바르지 않습니다.');
  if (data.lastBackupAt != null && !validDate(data.lastBackupAt)) throw new Error('백업 시각이 올바르지 않습니다.');
  if (data.selectedRoutineId != null && !data.routines.some(item => item.id === data.selectedRoutineId)) throw new Error('선택한 운동 루틴을 찾지 못했습니다.');
  return data;
}
