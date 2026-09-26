import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUtterance } from './parser.mjs';

for (const [text, weight, reps] of [
  ['70키로 20회', 70, 20],
  ['70키로그램 20회', 70, 20],
  ['칠십 킬로 이십 회', 70, 20],
  ['칠십 키로 스무 번', 70, 20],
  ['이십 킬로 서른 회', 20, 30],
  ['70kg 20회입니다.', 70, 20],
  ['70킬로 20회했어요', 70, 20],
  ['70킬로20회', 70, 20],
  ['백이십 킬로 열두 회', 120, 12],
  ['이번엔 여덟 개밖에 못 했어', 10, 8],
  ['스물 다섯 회', 10, 25],
]) {
  test(`parses an explicit workout quantity: ${text}`, () => {
    assert.deepEqual(parseUtterance(text, 10), { status: 'ok', weight, reps });
  });
}

for (const text of ['70키로', '70 20', '-5회', '1.5회', '이십점오키로 20회', '모르는무게 키로 20회', '70킬로미터 20회', '스물열 회']) {
  test(`does not guess a malformed quantity: ${text}`, () => {
    assert.equal(parseUtterance(text, 10).status, 'invalid');
  });
}

test('multiple weights or rep counts still require clarification', () => {
  assert.equal(parseUtterance('70키로 80키로 20회', 10).status, 'ambiguous');
  assert.equal(parseUtterance('70키로 8회 18회', 10).status, 'ambiguous');
});
