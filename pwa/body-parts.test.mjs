import test from 'node:test';
import assert from 'node:assert/strict';
import { guessPart, partOf, recoveryStatus, bodyPartSummary } from './body-parts.mjs';

test('common Korean exercise names map to one main part, compound names first', () => {
  const expected = {
    '바벨 스쿼트': '하체', '프론트 스쿼트': '하체', '불가리안 스플릿 스쿼트': '하체', '레그 프레스': '하체', '레그 익스텐션': '하체', '라잉 레그 컬': '하체', '루마니안 데드리프트': '하체', '힙 쓰러스트': '하체', '카프 레이즈': '하체', '글루트 킥백': '하체', '런지': '하체',
    '벤치프레스': '가슴', '인클라인 벤치 프레스': '가슴', '인클라인 덤벨 프레스': '가슴', '덤벨 플라이': '가슴', '펙덱 플라이': '가슴', '체스트 프레스': '가슴', '케이블 크로스오버': '가슴', '딥스': '가슴', '푸시업': '가슴',
    '데드리프트': '등', '랫풀다운': '등', '바벨 로우': '등', '시티드 케이블 로우': '등', '풀업': '등', '턱걸이': '등', '백 익스텐션': '등',
    '오버헤드 프레스': '어깨', '덤벨 숄더 프레스': '어깨', '사이드 레터럴 레이즈': '어깨', '업라이트 로우': '어깨', '페이스풀': '어깨', '리버스 펙덱': '어깨',
    '바벨 컬': '팔', '해머 컬': '팔', '인클라인 덤벨 컬': '팔', '트라이셉스 푸시다운': '팔', '오버헤드 트라이셉스 익스텐션': '팔', '스컬 크러셔': '팔',
    '행잉 레그 레이즈': '코어', '케이블 크런치': '코어', '플랭크': '코어', 'RDL': '하체',
  };
  for (const [name, part] of Object.entries(expected)) assert.equal(guessPart(name), part, name);
  for (const name of ['슈러그', '머신', '']) assert.equal(guessPart(name), null, name);
});

test('the user choice wins and prototype names never resolve', () => {
  assert.equal(partOf('데드리프트', { 데드리프트: '하체' }), '하체');
  assert.equal(partOf(' 데드리프트 ', {}), '등');
  assert.equal(partOf('constructor', {}), null);
  assert.equal(partOf('슈러그', { 슈러그: '어깨' }), '어깨');
});

test('recovery bands are fixed hour thresholds', () => {
  assert.equal(recoveryStatus(null), 'none');
  assert.equal(recoveryStatus(47.9), 'recovering');
  assert.equal(recoveryStatus(48), 'ready');
  assert.equal(recoveryStatus(167.9), 'ready');
  assert.equal(recoveryStatus(168), 'rested');
});

test('summary counts rolling 7-day sets per part and hours since the last set', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const at = hoursAgo => new Date(now - hoursAgo * 3_600_000).toISOString();
  const ex = (name, kind, sets) => ({ name, kind, sets: sets.map(([hoursAgo, weight, reps, canceled]) => ({ at: at(hoursAgo), weight, reps, canceledAt: canceled ? at(hoursAgo) : null })) });
  const sessions = [
    { exercises: [ex('스쿼트', 'barbell', [[20, 100, 5], [19, 100, 5], [18, 100, 5, true]]), ex('덤벨 컬', 'dumbbell', [[19, 10, 10]]), ex('슈러그', 'barbell', [[19, 60, 10]])] },
    { exercises: [ex('벤치프레스', 'barbell', [[100, 80, 5]]), ex('스쿼트', 'barbell', [[200, 90, 5]])] },
  ];
  const result = bodyPartSummary(sessions, { 슈러그: '어깨' }, { now, routines: [{ exercises: [{ name: '플랭크' }] }] });
  const row = part => result.rows.find(item => item.part === part);
  assert.deepEqual([row('하체').sets, row('하체').volume, row('하체').status, Math.round(row('하체').hours)], [2, 1000, 'recovering', 19]);
  assert.deepEqual([row('팔').sets, row('팔').volume], [1, 200]);
  assert.deepEqual([row('어깨').sets, row('어깨').status], [1, 'recovering']);
  assert.deepEqual([row('가슴').sets, row('가슴').status], [1, 'ready']);
  assert.deepEqual([row('등').sets, row('등').status], [0, 'none']);
  assert.deepEqual(result.unclassified, { sets: 0, names: [] });
  assert.deepEqual(result.names.map(item => [item.name, item.part, item.chosen]), [['덤벨 컬', '팔', false], ['벤치프레스', '가슴', false], ['슈러그', '어깨', true], ['스쿼트', '하체', false], ['플랭크', '코어', false]]);
  const plain = bodyPartSummary(sessions, {}, { now });
  assert.deepEqual(plain.unclassified, { sets: 1, names: ['슈러그'] });
});
