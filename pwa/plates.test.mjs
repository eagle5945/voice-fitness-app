import test from 'node:test';
import assert from 'node:assert/strict';
import { platesFor, plateText } from './plates.mjs';

test('splits the weight above the bar into the heaviest plates per side', () => {
  assert.deepEqual(platesFor(72.5), { status: 'exact', bar: 20, perSide: [20, 5, 1.25], remainder: 0 });
  assert.equal(plateText(platesFor(72.5)), '바 20kg + 한쪽 20 · 5 · 1.25');
  assert.deepEqual(platesFor(140).perSide, [20, 20, 20]);
});

test('an empty bar and weights under the bar are explained', () => {
  assert.equal(plateText(platesFor(20)), '빈 바 20kg');
  assert.equal(plateText(platesFor(15)), '바(20kg)보다 가벼워요');
});

test('weights that plates cannot make report the leftover per side', () => {
  const result = platesFor(21);
  assert.deepEqual(result, { status: 'partial', bar: 20, perSide: [], remainder: 0.5 });
  assert.equal(plateText(result), '바 20kg + 한쪽 원판 없음 (한쪽 0.5kg는 맞출 수 없어요)');
  assert.equal(plateText(platesFor(73)), '바 20kg + 한쪽 20 · 5 · 1.25 (한쪽 0.25kg는 맞출 수 없어요)');
});

test('custom bars and plate sets are supported', () => {
  assert.deepEqual(platesFor(60, 15, [25, 10, 2.5]).perSide, [10, 10, 2.5]);
});
