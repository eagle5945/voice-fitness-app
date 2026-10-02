import test from 'node:test';
import assert from 'node:assert/strict';
import { previewDictation, confirmDictation, lastSetOf } from './dictation.mjs';

const context = { sessionId: 's', exerciseId: 'e', weight: 70, inputId: 'i' };
test('dictated text requires explicit confirmation and uses current weight for reps only', () => {
  const preview = previewDictation('스무 회', context);
  assert.equal(preview.candidate.weight, 70);
  assert.equal(confirmDictation(preview, '스무 회', context).candidate.reps, 20);
});
test('edits after preview cannot save the previous result', () => {
  const preview = previewDictation('20키로 30회', context);
  assert.throws(() => confirmDictation(preview, '70키로 20회', context), /다시 확인/);
});
test('changing exercise or session prevents saving a stale draft', () => {
  const preview = previewDictation('20키로 30회', context);
  for (const changed of [{ ...context, exerciseId: 'other' }, { ...context, sessionId: 'other' }]) {
    assert.throws(() => confirmDictation(preview, preview.text, changed), /운동이 바뀌어/);
  }
});
test('missing reps and conflicting weights cannot be confirmed', () => {
  for (const text of ['20kg 실패', '20KG, 30KG', '']) {
    const preview = previewDictation(text, context);
    assert.notEqual(preview.status, 'ok');
    assert.throws(() => confirmDictation(preview, text, context));
  }
});
test('preview captures context without following later mutations', () => {
  const mutable = { ...context };
  const preview = previewDictation('70킬로 20회', mutable);
  mutable.exerciseId = 'other';
  assert.equal(preview.context.exerciseId, 'e');
  assert.equal(confirmDictation(preview, preview.text, context).context.inputId, 'i');
});

test('a repeat phrase reuses the last set of this exercise', () => {
  const preview = previewDictation('같은 거요', { ...context, last: { weight: 72.5, reps: 8 } });
  assert.equal(preview.status, 'ok');
  assert.deepEqual([preview.candidate.weight, preview.candidate.reps, preview.candidate.repeat], [72.5, 8, true]);
  assert.equal(confirmDictation(preview, '같은 거요', context).candidate.reps, 8);
});
test('a repeat phrase before the first set cannot be saved', () => {
  const preview = previewDictation('한 번 더', context);
  assert.equal(preview.status, 'no-previous');
  assert.throws(() => confirmDictation(preview, '한 번 더', context));
});
test('spoken numbers win over a repeat phrase', () => {
  const preview = previewDictation('다시 12회', { ...context, last: { weight: 60, reps: 8 } });
  assert.deepEqual([preview.candidate.weight, preview.candidate.reps], [70, 12]);
});
test('lastSetOf skips canceled sets', () => {
  const exercise = { sets: [{ weight: 60, reps: 10 }, { weight: 65, reps: 8 }, { weight: 70, reps: 5, canceledAt: '2026-10-02T00:00:00Z' }] };
  assert.deepEqual(lastSetOf(exercise), { weight: 65, reps: 8 });
  assert.equal(lastSetOf({ sets: [] }), null);
  assert.equal(lastSetOf(null), null);
});
