import test from 'node:test';
import assert from 'node:assert/strict';
import { exportWorkoutCsv } from './csv.mjs';

const fixture = (name = '벤치프레스') => ({ sessions: [{
  startedAt: '2026-09-25T16:00:00Z', endedAt: null,
  exercises: [{ name, kind: 'barbell', sets: [
    { weight: 70.5, reps: 20, source: 'voice', at: '2026-09-25T16:01:00Z', canceledAt: null },
    { weight: 90, reps: 1, source: 'manual', at: '2026-09-25T16:02:00Z', canceledAt: '2026-09-25T16:03:00Z' },
    { weight: 0, reps: 0, source: 'manual', at: '2026-09-25T16:04:00Z', canceledAt: null },
  ] }],
}] });

test('exports actual sets with Korean headers, BOM, CRLF, Korea time and numeric quantities', () => {
  const input = fixture();
  const before = structuredClone(input);
  const csv = exportWorkoutCsv(input);
  assert.ok(csv.startsWith('\uFEFF운동 시작(한국시간),운동명,'));
  const rows = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(rows.length, 3);
  assert.equal(rows[1], '2026-09-26 01:00:00,벤치프레스,바벨,바 포함 총중량,1,70.5,20,음성,2026-09-26 01:01:00');
  assert.equal(rows[2], '2026-09-26 01:00:00,벤치프레스,바벨,바 포함 총중량,2,0,0,직접 입력,2026-09-26 01:04:00');
  assert.deepEqual(input, before);
});
test('quotes names containing commas, quotes and newlines', () => {
  const csv = exportWorkoutCsv(fixture('덤벨, "한 손"\n프레스'));
  assert.ok(csv.includes(',"덤벨, ""한 손""\n프레스",'));
});
test('spreadsheet formulas in exercise names remain text', () => {
  for (const name of ['=1+1', '+1', '-1', '@SUM(1)', ' \t=1+1', '\tfoo']) {
    assert.ok(exportWorkoutCsv(fixture(name)).includes(",\u0027" + name + ','));
  }
});
test('empty history still exports a header and dumbbell/machine units are explicit', () => {
  assert.equal(exportWorkoutCsv({ sessions: [] }).split('\r\n').length, 2);
  for (const [kind, expected] of [['dumbbell', '덤벨,한 손 중량'], ['machine', '머신,기구 표시 중량']]) {
    const input = fixture();
    input.sessions[0].exercises[0].kind = kind;
    assert.ok(exportWorkoutCsv(input).includes(expected));
  }
});
