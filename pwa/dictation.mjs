import { parseUtterance, isRepeatPhrase } from './parser.mjs';

// The latest valid set of this exercise in the current session, or null before the first set.
export function lastSetOf(exercise) {
  const set = exercise?.sets.filter(item => !item.canceledAt).at(-1);
  return set ? { weight: set.weight, reps: set.reps } : null;
}

export function previewDictation(text, context) {
  // Checked first: “한 번 더” would otherwise read as one rep.
  if (isRepeatPhrase(text)) {
    const candidate = context.last ? { status: 'ok', weight: context.last.weight, reps: context.last.reps, repeat: true } : { status: 'no-previous' };
    return { status: candidate.status, candidate, text, context: { ...context } };
  }
  const candidate = parseUtterance(text, context.weight);
  return { status: candidate.status, candidate, text, context: { ...context } };
}

export function confirmDictation(preview, text, context) {
  if (!preview || preview.status !== 'ok' || preview.text !== text) {
    throw new Error('문장의 중량과 횟수를 다시 확인해주세요.');
  }
  if (preview.context.sessionId !== context.sessionId || preview.context.exerciseId !== context.exerciseId) {
    throw new Error('운동이 바뀌어 저장하지 않았습니다. 입력창을 다시 열어주세요.');
  }
  return preview;
}
