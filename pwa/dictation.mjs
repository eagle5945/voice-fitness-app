import { parseUtterance } from './parser.mjs';

export function previewDictation(text, context) {
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
