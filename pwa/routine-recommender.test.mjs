import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, LIBRARY, PROGRAM_KEYS, askLifts, pickProgram, buildProgram, exercisesPerDay, recommend, substitutesFor, defaultWeight, estimateFrom } from './routine-recommender.mjs';
import { saveRoutine, emptyData } from './domain.mjs';
import { guessPart } from './body-parts.mjs';
import { bigThreeLift } from './records.mjs';

const answers = (extra = {}) => ({ experience: 'mid', frequency: '3', goal: 'size', focus: ['balanced'], pain: ['none'], equipment: 'gym', time: '60', split: 'auto', ...extra });
const names = program => program.routines.flatMap(routine => routine.exercises.map(item => item.name));

test('eight questions; focus and pain allow several answers with one exclusive choice', () => {
  assert.deepEqual(QUESTIONS.map(q => q.key), ['experience', 'frequency', 'goal', 'focus', 'pain', 'equipment', 'time', 'split']);
  assert.deepEqual(QUESTIONS.filter(q => q.multi).map(q => [q.key, q.exclusive]), [['focus', 'balanced'], ['pain', 'none']]);
});

test('the library has about sixty exercises, all classified by body part', () => {
  assert.ok(LIBRARY.length >= 60, String(LIBRARY.length));
  assert.equal(new Set(LIBRARY.map(item => item.name)).size, LIBRARY.length);
  for (const item of LIBRARY) assert.ok(guessPart(item.name), item.name);
  assert.equal(bigThreeLift({ name: '바벨 스쿼트', kind: 'barbell' }), 'squat');
  assert.equal(bigThreeLift({ name: '벤치프레스', kind: 'barbell' }), 'bench');
  assert.equal(bigThreeLift({ name: '데드리프트', kind: 'barbell' }), 'deadlift');
});

test('program choice follows experience, frequency, goal and the split preference', () => {
  assert.equal(pickProgram(answers({ experience: 'new' })), 'fullBasic');
  assert.equal(pickProgram(answers({ experience: 'new', frequency: '4' })), 'fullAB');
  assert.equal(pickProgram(answers({ frequency: '2' })), 'fullAB');
  assert.equal(pickProgram(answers({ goal: 'strength' })), 'fiveByFive');
  assert.equal(pickProgram(answers({ goal: 'strength', equipment: 'dumbbell' })), 'fullABC');
  assert.equal(pickProgram(answers({ goal: 'strength', experience: 'beginner' })), 'fullABC');
  assert.equal(pickProgram(answers({ experience: 'long' })), 'ppl');
  assert.equal(pickProgram(answers({ frequency: '4' })), 'upperLower');
  assert.equal(pickProgram(answers({ frequency: '5' })), 'upperLowerFull');
  assert.equal(pickProgram(answers({ frequency: '5', experience: 'long' })), 'fiveSplit');
  assert.equal(pickProgram(answers({ frequency: '6' })), 'pplAB');
  assert.equal(pickProgram(answers({ frequency: '6', experience: 'beginner' })), 'upperLower');
  assert.equal(pickProgram(answers({ split: 'full', frequency: '5' })), 'fullABC');
  assert.equal(pickProgram(answers({ split: 'upperLower', frequency: '5' })), 'upperLowerFull');
  assert.equal(pickProgram(answers({ split: 'bodyPart', frequency: '4' })), 'fourSplit');
  assert.equal(pickProgram(answers({ split: 'bodyPart', frequency: '5' })), 'fourSplit');
  assert.equal(pickProgram(answers({ split: 'bodyPart', frequency: '5', experience: 'long' })), 'fiveSplit');
});

test('time, experience and fat loss set the exercises per day', () => {
  assert.equal(exercisesPerDay(answers({ time: '30', experience: 'new' })), 3);
  assert.equal(exercisesPerDay(answers({ time: '60' })), 6);
  assert.equal(exercisesPerDay(answers({ time: '90', goal: 'fatloss' })), 8);
  const program = buildProgram('upperLower', answers({ time: '45', experience: 'beginner' }));
  assert.ok(program.routines.every(routine => routine.exercises.length === 4));
});

test('A and B days use different variants of the same movement', () => {
  const program = buildProgram('upperLower', answers({ time: '90' }));
  const [upperA, lowerA, upperB, lowerB] = program.routines.map(routine => routine.exercises.map(item => item.name));
  assert.notDeepEqual(upperA, upperB);
  assert.equal(lowerA[0], '바벨 스쿼트');
  assert.equal(lowerB[0], '데드리프트');
  assert.ok(lowerB.includes('프론트 스쿼트'));
  for (const day of [upperA, lowerA, upperB, lowerB]) assert.equal(new Set(day).size, day.length);
});

test('sore joints remove the exercises that load them', () => {
  const library = Object.fromEntries(LIBRARY.map(item => [item.name, item]));
  for (const pain of [['lowerBack'], ['knee'], ['shoulder'], ['lowerBack', 'knee', 'shoulder']]) {
    for (const key of PROGRAM_KEYS) {
      const program = buildProgram(key, answers({ pain, time: '90' }));
      for (const name of names(program)) assert.ok(!library[name].joints.some(joint => pain.includes(joint)), `${pain} ${key} ${name}`);
    }
  }
  const knees = buildProgram('upperLower', answers({ pain: ['knee'], time: '90' })).routines[1].exercises.map(item => item.name);
  assert.ok(knees.includes('바벨 힙 쓰러스트') && knees.includes('레그 컬'), knees.join());
});

test('equipment limits the library', () => {
  const allowed = { home: ['barbell', 'dumbbell', 'bodyweight'], dumbbell: ['dumbbell', 'bodyweight'], machine: ['machine', 'cable', 'dumbbell', 'bodyweight', 'bar'] };
  const library = Object.fromEntries(LIBRARY.map(item => [item.name, item]));
  for (const [equipment, list] of Object.entries(allowed)) {
    for (const key of PROGRAM_KEYS) for (const name of names(buildProgram(key, answers({ equipment, time: '90' })))) assert.ok(list.includes(library[name].equipment), `${equipment} ${name}`);
  }
  assert.ok(names(buildProgram('fullABC', answers({ equipment: 'dumbbell' }))).every(name => !/바벨|머신|케이블/.test(name)));
});

test('first-timers get no advanced exercises and at most three sets', () => {
  const library = Object.fromEntries(LIBRARY.map(item => [item.name, item]));
  // 5×5 is never offered to first-timers, so it keeps its own set scheme.
  for (const key of PROGRAM_KEYS.filter(key => key !== 'fiveByFive')) {
    const program = buildProgram(key, answers({ experience: 'new', time: '90' }));
    for (const routine of program.routines) for (const item of routine.exercises) {
      assert.equal(library[item.name].level, 1, item.name);
      assert.ok(item.plannedSets <= 3, `${item.name} ${item.plannedSets}`);
    }
  }
});

test('focus parts add exercises and a set on days that train them', () => {
  const plain = buildProgram('ppl', answers({ time: '45' }));
  const focused = buildProgram('ppl', answers({ time: '45', focus: ['arms', 'chest'] }));
  // Push day's first five have no arm exercise, so only chest adds one; pull day has curls, so arms add two; legs add none.
  const push = focused.routines[0].exercises;
  assert.equal(push.length, plain.routines[0].exercises.length + 1);
  assert.equal(focused.routines[1].exercises.length, plain.routines[1].exercises.length + 2);
  assert.equal(focused.routines[2].exercises.length, plain.routines[2].exercises.length);
  const bench = push.find(item => item.name === '벤치프레스');
  assert.equal(bench.plannedSets, 5);
});

test('5×5 keeps its shape: barbell lifts 5×5, one deadlift set, the rest as accessories', () => {
  const program = buildProgram('fiveByFive', answers({ goal: 'strength' }));
  const b = program.routines[1].exercises;
  assert.deepEqual(b.slice(0, 3).map(item => [item.name, item.plannedSets, item.target]), [['바벨 스쿼트', 5, 5], ['오버헤드 프레스', 5, 5], ['데드리프트', 1, 5]]);
  assert.deepEqual([b[3].name, b[3].plannedSets, b[3].target], ['랫풀다운', 3, 8]);
});

test('start weights follow the 5-rep lifts, otherwise light defaults', () => {
  const lifts = { squat: 100, bench: 80, deadlift: 140 };
  const program = buildProgram('fullBasic', answers({ goal: 'strength', time: '90' }), lifts);
  const weight = name => program.routines[0].exercises.find(item => item.name === name)?.weight;
  assert.deepEqual([weight('바벨 스쿼트'), weight('벤치프레스'), weight('루마니안 데드리프트'), weight('오버헤드 프레스'), weight('바벨 로우'), weight('랫풀다운')], [90, 72.5, 75, 42.5, 55, 20]);
  assert.equal(buildProgram('fullBasic', answers()).routines[0].exercises[0].weight, 20);
  assert.equal(askLifts(answers()), true);
  assert.equal(askLifts(answers({ equipment: 'dumbbell' })), false);
  assert.equal(askLifts(answers({ experience: 'beginner' })), false);
});

test('explanations name the program, time, equipment, swaps and focus', () => {
  const result = recommend(answers({ pain: ['knee'], focus: ['legs'], equipment: 'home', frequency: '4', goal: 'fatloss' }));
  const [why, time, equipment, pain, focus] = result.primary.reasons;
  assert.equal(why, '6개월~2년 · 주 4회 · 체지방 감량 → 상·하체 A/B');
  assert.equal(time, '60분 → 하루 7종목(감량 목표로 1종목 추가)');
  assert.equal(equipment, '홈짐 → 쓸 수 있는 장비의 종목만');
  assert.match(pain, /^무릎 불편 → .*바벨 스쿼트.* 대신 /);
  assert.equal(focus, '하체 집중 → 관련 종목 추가, 세트 +1');
  assert.equal(result.alternative.name, 'PPL 3분할');
  assert.equal(recommend(answers({ split: 'full', frequency: '4' })).alternative.name, '상·하체 A/B');
});

test('every answer combination gives valid, distinct, classified routines', () => {
  let checked = 0;
  for (const experience of ['new', 'beginner', 'mid', 'long']) for (const frequency of ['2', '3', '4', '5', '6']) for (const split of ['auto', 'full', 'upperLower', 'bodyPart'])
    for (const equipment of ['gym', 'home', 'dumbbell', 'machine']) for (const [goal, time, pain, focus] of [['strength', '30', ['none'], ['balanced']], ['size', '60', ['knee'], ['arms', 'core']], ['fatloss', '90', ['lowerBack', 'shoulder'], ['legs']], ['health', '45', ['lowerBack', 'knee', 'shoulder'], ['chest', 'back', 'shoulders']]]) {
      const result = recommend({ experience, frequency, goal, focus, pain, equipment, time, split }, { squat: 120, bench: 90, deadlift: 160 });
      for (const program of [result.primary, result.alternative]) for (const routine of program.routines) {
        assert.ok(routine.exercises.length >= Math.min(3, exercisesPerDay({ experience, goal, time })), `${program.key} ${routine.title} ${equipment} ${pain} ${routine.exercises.length}`);
        assert.equal(new Set(routine.exercises.map(item => item.name)).size, routine.exercises.length);
        assert.doesNotThrow(() => saveRoutine(emptyData(), { id: 'r', title: routine.title, exercises: routine.exercises.map((item, index) => ({ id: `e${index}`, ...item })) }));
        checked += 1;
      }
    }
  assert.ok(checked > 5000);
});

test('a day dedicated to the focus part gets no bonus, and no day goes over 24 sets', () => {
  const plain = buildProgram('fiveSplit', answers({ goal: 'strength', experience: 'long', time: '90' }));
  const focused = buildProgram('fiveSplit', answers({ goal: 'strength', experience: 'long', time: '90', focus: ['chest'] }));
  assert.deepEqual(focused.routines[0].exercises, plain.routines[0].exercises);
  for (const key of PROGRAM_KEYS) for (const goal of ['strength', 'size']) {
    const program = buildProgram(key, answers({ goal, experience: 'long', time: '90', focus: ['chest', 'back', 'shoulders', 'legs', 'arms', 'core'] }));
    for (const routine of program.routines) assert.ok(routine.exercises.reduce((n, item) => n + item.plannedSets, 0) <= 24, `${key} ${routine.title}`);
  }
});

test('dumbbell start weights are per hand in 1kg steps', () => {
  const program = buildProgram('fullABC', answers({ goal: 'size', equipment: 'dumbbell' }), { squat: 100, bench: 80, deadlift: 140 });
  const weight = name => program.routines.flatMap(r => r.exercises).find(item => item.name === name)?.weight;
  assert.deepEqual([weight('고블릿 스쿼트'), weight('인클라인 덤벨 프레스'), weight('원암 덤벨 로우')], [20, 16, 22]);
});

test('substitutes list the same movement first, then related ones', () => {
  const squat = substitutesFor(' 바벨 스쿼트 ');
  assert.equal(squat.known, true);
  assert.deepEqual(squat.list.filter(item => item.group === 'same').map(item => item.name), ['프론트 스쿼트', '핵 스쿼트', '레그 프레스', '고블릿 스쿼트']);
  assert.ok(squat.list.some(item => item.group === 'similar' && item.name === '바벨 힙 쓰러스트'));
  assert.ok(!squat.list.some(item => item.name === '바벨 스쿼트'));
  assert.deepEqual(substitutesFor('바벨 스쿼트', { equipment: 'dumbbell', avoid: ['knee'] }).list.map(item => item.name), ['덤벨 루마니안 데드리프트', '덤벨 힙 쓰러스트']);
  assert.ok(substitutesFor('랫풀다운', { equipment: 'machine' }).list.every(item => ['machine', 'cable'].includes(item.equipment)));
});

test('names outside the library fall back to the same body part, or nothing', () => {
  const custom = substitutesFor('스미스 머신 벤치');
  assert.equal(custom.known, false);
  assert.equal(custom.part, '가슴');
  assert.ok(custom.list.length > 0 && custom.list.every(item => item.group === 'part' && guessPart(item.name) === '가슴'));
  assert.deepEqual(substitutesFor('아무 운동').list, []);
  assert.deepEqual([defaultWeight('barbell'), defaultWeight('dumbbell'), defaultWeight('cable'), defaultWeight('bar')], [20, 6, 20, 0]);
});

test('a substitute without history is estimated from the current weight when both share a lift', () => {
  assert.equal(estimateFrom('벤치프레스', 105, '덤벨 벤치프레스'), 32);
  assert.equal(estimateFrom('벤치프레스', 100, '오버헤드 프레스'), 60);
  assert.equal(estimateFrom('바벨 스쿼트', 100, '프론트 스쿼트'), 80);
  assert.equal(estimateFrom('바벨 스쿼트', 100, '레그 프레스'), null); // machines have no shared scale
  assert.equal(estimateFrom('벤치프레스', 100, '바벨 스쿼트'), null);
  assert.equal(estimateFrom('내 운동', 100, '덤벨 벤치프레스'), null);
});
