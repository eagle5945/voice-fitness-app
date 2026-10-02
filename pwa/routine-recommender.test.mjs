import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, askLifts, pickProgram, buildProgram, recommend } from './routine-recommender.mjs';
import { saveRoutine, emptyData } from './domain.mjs';
import { guessPart } from './body-parts.mjs';
import { bigThreeLift } from './records.mjs';

const answers = (extra = {}) => ({ experience: 'mid', frequency: '3', goal: 'size', time: '60', equipment: 'barbell', ...extra });

test('five questions, each with buttons only', () => {
  assert.deepEqual(QUESTIONS.map(q => q.key), ['experience', 'frequency', 'goal', 'time', 'equipment']);
  for (const question of QUESTIONS) assert.ok(question.options.length >= 2);
});

test('program rules follow the table', () => {
  assert.equal(pickProgram(answers({ experience: 'new', frequency: '5' })), 'fullBody');
  assert.equal(pickProgram(answers({ frequency: '2' })), 'fullBody');
  assert.equal(pickProgram(answers({ goal: 'strength' })), 'fiveByFive');
  assert.equal(pickProgram(answers({ goal: 'health' })), 'fullBodyAB');
  assert.equal(pickProgram(answers({ frequency: '4' })), 'upperLower');
  assert.equal(pickProgram(answers({ frequency: '5', experience: 'long' })), 'ppl');
});

test('the lift question is asked only when it can be used', () => {
  assert.equal(askLifts(answers()), true);
  assert.equal(askLifts(answers({ experience: 'new' })), false);
  assert.equal(askLifts(answers({ equipment: 'basic' })), false);
});

test('time sets the number of exercises and the goal sets sets × reps', () => {
  const short = buildProgram('fullBodyAB', answers({ time: '45', goal: 'strength' }));
  assert.equal(short.routines.length, 2);
  assert.equal(short.routines[0].exercises.length, 4);
  assert.deepEqual(short.routines[0].exercises.map(e => [e.name, e.plannedSets, e.target]), [['바벨 스쿼트', 5, 5], ['벤치프레스', 5, 5], ['바벨 로우', 5, 5], ['사이드 레터럴 레이즈', 3, 8]]);
  const long = buildProgram('ppl', answers({ time: '90', goal: 'health' }));
  assert.equal(long.routines.length, 3);
  assert.ok(long.routines.every(r => r.exercises.length === 6));
  assert.deepEqual([long.routines[0].exercises[0].plannedSets, long.routines[0].exercises[0].target], [3, 12]);
  assert.deepEqual([long.routines[0].exercises[3].plannedSets, long.routines[0].exercises[3].target], [2, 15]);
});

test('5×5 keeps 5×5 on the main lifts and one heavy deadlift set', () => {
  const program = buildProgram('fiveByFive', answers({ goal: 'size', time: '60' }));
  const b = program.routines[1].exercises;
  assert.deepEqual(b.slice(0, 3).map(e => [e.name, e.plannedSets, e.target]), [['바벨 스쿼트', 5, 5], ['오버헤드 프레스', 5, 5], ['데드리프트', 1, 5]]);
  assert.deepEqual([b[3].name, b[3].plannedSets, b[3].target], ['랫풀다운', 3, 12]); // machines are accessories in 5×5
});

test('without a barbell, lifts are swapped and duplicates are filled by the next exercise', () => {
  const program = buildProgram('upperLower', answers({ equipment: 'basic', time: '60' }));
  const legs = program.routines[1].exercises.map(e => e.name);
  assert.deepEqual(legs, ['레그 프레스', '덤벨 루마니안 데드리프트', '레그 컬', '카프 레이즈', '행잉 레그 레이즈']);
  assert.ok(program.routines.flatMap(r => r.exercises).every(e => e.kind !== 'barbell'));
});

test('start weights come from 5-rep lifts when given, otherwise light defaults', () => {
  const light = buildProgram('fullBody', answers({ goal: 'strength' })).routines[0].exercises;
  assert.deepEqual(light.map(e => e.weight), [20, 20, 20, 20, 20]);
  const lifts = buildProgram('fullBody', answers({ goal: 'strength' }), { squat: 100, bench: 80, deadlift: 140 }).routines[0].exercises;
  assert.deepEqual(lifts.map(e => [e.name, e.weight]), [['바벨 스쿼트', 90], ['벤치프레스', 72.5], ['바벨 로우', 55], ['오버헤드 프레스', 42.5], ['랫풀다운', 20]]);
  const size = buildProgram('fullBody', answers({ goal: 'size' }), { squat: 30 }).routines[0].exercises;
  assert.equal(size[0].weight, 25); // never below the empty bar's 20kg, rounded to 2.5kg
  assert.equal(buildProgram('fullBody', answers({ time: '90' })).routines[0].exercises.at(-1).weight, 0);
});

test('every recommended routine is valid, classified and keeps the big three names', () => {
  for (const frequency of ['2', '3', '4', '5']) for (const goal of ['strength', 'size', 'health']) for (const equipment of ['barbell', 'basic']) for (const time of ['45', '60', '90']) {
    const result = recommend(answers({ frequency, goal, equipment, time, experience: 'long' }), { squat: 120, bench: 90, deadlift: 160 });
    for (const program of [result.primary, result.alternative]) for (const routine of program.routines) {
      assert.doesNotThrow(() => saveRoutine(emptyData(), { id: 'r', title: routine.title, exercises: routine.exercises.map((e, i) => ({ id: `e${i}`, ...e })) }));
      assert.equal(new Set(routine.exercises.map(e => e.name)).size, routine.exercises.length);
      for (const e of routine.exercises) assert.ok(guessPart(e.name), e.name);
    }
  }
  assert.equal(bigThreeLift({ name: '바벨 스쿼트', kind: 'barbell' }), 'squat');
  assert.equal(bigThreeLift({ name: '덤벨 벤치프레스', kind: 'dumbbell' }), null);
});

test('recommend explains the choice and offers a second program', () => {
  const result = recommend(answers({ goal: 'strength' }));
  assert.equal(result.reason, '6개월~2년 · 주 3회 · 무게 늘리기');
  assert.equal(result.primary.name, '5×5 근력 A/B');
  assert.equal(result.alternative.name, '전신 A/B');
  assert.equal(recommend(answers({ frequency: '5', experience: 'long' })).reason, '2년 이상 · 주 5회 이상 · 몸 만들기');
});
