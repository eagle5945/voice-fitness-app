import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUtterance, isRepeatPhrase } from './parser.mjs';

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
  ['70킬로에 20회', 70, 20],
  ['70kg으로 20회', 70, 20],
  ['70킬로로 12회', 70, 12],
  ['70킬로그램에 12번', 70, 12],
  ['20회요', 10, 20],
  ['12개요', 10, 12],
  ['열두 번이요', 10, 12],
  ['70킬로 12회요.', 70, 12],
  ['12회 했다', 10, 12],
  ['일흔 킬로 12회', 70, 12],
  ['예순다섯 키로에 열 번', 65, 10],
  ['여든 킬로 다섯 회', 80, 5],
  ['아흔 키로 세 번', 90, 3],
]) {
  test(`parses an explicit workout quantity: ${text}`, () => {
    assert.deepEqual(parseUtterance(text, 10), { status: 'ok', weight, reps });
  });
}

for (const text of ['70키로', '70 20', '-5회', '1.5회', '이십점오키로 20회', '모르는무게 키로 20회', '70킬로미터 20회', '스물열 회', '70킬로에서 20회', '70킬로요 20회', '20회예정', '일흔열 회']) {
  test(`does not guess a malformed quantity: ${text}`, () => {
    assert.equal(parseUtterance(text, 10).status, 'invalid');
  });
}

test('multiple weights or rep counts still require clarification', () => {
  assert.equal(parseUtterance('70키로 80키로 20회', 10).status, 'ambiguous');
  assert.equal(parseUtterance('70키로 8회 18회', 10).status, 'ambiguous');
});

test('repeat phrases are recognized without numbers', () => {
  for (const text of ['같은 거', '같은거요', '같은 걸로', '똑같이', '똑같이요.', '똑같은 걸로', '한 번 더', '한 세트 더', '다시', '다시 한 번', '아까랑 같이', '아까처럼', '방금이랑 똑같이', '그대로', '같은 거 했어요']) {
    assert.equal(isRepeatPhrase(text), true, text);
  }
  for (const text of ['', '같은 거 20회', '다시 70킬로', '한 번', '같이 가자', '20회', '다시는 안 해']) {
    assert.equal(isRepeatPhrase(text), false, text);
  }
});
