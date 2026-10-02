// A questionnaire turned into starter routines by fixed rules. No prediction, nothing stored but the routines.
// Days are built from movement slots (squat, hinge, horizontal push, ...), each filled from an exercise library
// filtered by equipment, sore joints and experience, so the same program comes out different for different answers.
import { guessPart } from './body-parts.mjs';

export const QUESTIONS = [
  { key: 'experience', title: '웨이트 운동 경험이 얼마나 되나요?', options: [['new', '처음이에요'], ['beginner', '3~6개월'], ['mid', '6개월~2년'], ['long', '2년 이상']] },
  { key: 'frequency', title: '일주일에 몇 번 운동할 수 있나요?', options: [['2', '2회'], ['3', '3회'], ['4', '4회'], ['5', '5회'], ['6', '6회']] },
  { key: 'goal', title: '가장 원하는 것은 무엇인가요?', options: [['strength', '무게 늘리기', '근력'], ['size', '몸 만들기', '근비대'], ['fatloss', '체지방 감량'], ['health', '건강·체력']] },
  { key: 'focus', multi: true, exclusive: 'balanced', title: '더 키우고 싶은 부위가 있나요?', hint: '여러 개 고를 수 있어요.', options: [['chest', '가슴'], ['back', '등'], ['shoulders', '어깨'], ['legs', '하체'], ['arms', '팔'], ['core', '코어'], ['balanced', '고르게']] },
  { key: 'pain', multi: true, exclusive: 'none', title: '운동할 때 불편한 곳이 있나요?', hint: '여러 개 고를 수 있어요. 고른 관절에 부담이 큰 종목은 빼고 추천합니다.', options: [['lowerBack', '허리'], ['knee', '무릎'], ['shoulder', '어깨'], ['none', '없음']] },
  { key: 'equipment', title: '쓸 수 있는 장비는요?', options: [['gym', '헬스장 전체', '바벨·덤벨·머신·케이블'], ['home', '홈짐', '바벨·덤벨'], ['dumbbell', '덤벨만'], ['machine', '머신·케이블 위주', '덤벨 포함']] },
  { key: 'time', title: '한 번에 운동할 수 있는 시간은요?', options: [['30', '30분'], ['45', '45분'], ['60', '60분'], ['75', '75분'], ['90', '90분']] },
  { key: 'split', title: '원하는 운동 방식이 있나요?', options: [['auto', '추천에 맡기기'], ['full', '전신', '매번 몸 전체'], ['upperLower', '상·하체', '상체 날과 하체 날'], ['bodyPart', '부위별 분할', '날마다 다른 부위']] },
];

const AVAILABLE = {
  gym: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bar'],
  home: ['barbell', 'dumbbell', 'bodyweight'],
  dumbbell: ['dumbbell', 'bodyweight'],
  machine: ['machine', 'cable', 'dumbbell', 'bodyweight', 'bar'],
};

// The optional last step: weights the user can lift for 5 reps. Asked only when it can be used.
export const askLifts = answers => ['mid', 'long'].includes(answers.experience) && Boolean(AVAILABLE[answers.equipment]?.includes('barbell'));

// [name, equipment, joints it loads, level (2 = not for first-timers), compound, start load: [lift, ratio]]
// Names are chosen so the body-part guess and the big three detection recognize them.
const SLOTS = {
  squat: [['바벨 스쿼트', 'barbell', ['knee', 'lowerBack'], 1, true, ['squat', 1]], ['프론트 스쿼트', 'barbell', ['knee'], 2, true, ['squat', 0.8]], ['핵 스쿼트', 'machine', ['knee'], 1, true], ['레그 프레스', 'machine', ['knee'], 1, true], ['고블릿 스쿼트', 'dumbbell', ['knee'], 1, true, ['squat', 0.25]]],
  hinge: [['데드리프트', 'barbell', ['lowerBack'], 1, true, ['deadlift', 1]], ['루마니안 데드리프트', 'barbell', ['lowerBack'], 1, true, ['deadlift', 0.6]], ['바벨 힙 쓰러스트', 'barbell', [], 1, true, ['squat', 0.8]], ['덤벨 루마니안 데드리프트', 'dumbbell', ['lowerBack'], 1, true, ['deadlift', 0.2]], ['덤벨 힙 쓰러스트', 'dumbbell', [], 1, true], ['백 익스텐션', 'machine', ['lowerBack'], 1, false]],
  lunge: [['불가리안 스플릿 스쿼트', 'dumbbell', ['knee'], 1, true], ['덤벨 런지', 'dumbbell', ['knee'], 1, true], ['덤벨 스텝업', 'dumbbell', ['knee'], 1, true], ['케이블 글루트 킥백', 'cable', [], 1, false], ['힙 어브덕션', 'machine', [], 1, false]],
  kneeIso: [['레그 익스텐션', 'machine', ['knee'], 1, false]],
  hamIso: [['레그 컬', 'machine', [], 1, false], ['싱글 레그 루마니안 데드리프트', 'dumbbell', ['lowerBack'], 2, false]],
  calf: [['카프 레이즈', 'machine', [], 1, false], ['덤벨 카프 레이즈', 'dumbbell', [], 1, false]],
  pushH: [['벤치프레스', 'barbell', ['shoulder'], 1, true, ['bench', 1]], ['인클라인 덤벨 프레스', 'dumbbell', [], 1, true, ['bench', 0.25]], ['덤벨 벤치프레스', 'dumbbell', [], 1, true, ['bench', 0.3]], ['인클라인 벤치프레스', 'barbell', ['shoulder'], 1, true, ['bench', 0.8]], ['체스트 프레스', 'machine', [], 1, true], ['딥스', 'bar', ['shoulder'], 2, true], ['푸시업', 'bodyweight', [], 1, true]],
  chestIso: [['펙덱 플라이', 'machine', [], 1, false], ['케이블 크로스오버', 'cable', [], 1, false], ['덤벨 플라이', 'dumbbell', ['shoulder'], 1, false]],
  pushV: [['오버헤드 프레스', 'barbell', ['shoulder', 'lowerBack'], 1, true, ['bench', 0.6]], ['덤벨 숄더 프레스', 'dumbbell', ['shoulder'], 1, true, ['bench', 0.2]], ['머신 숄더 프레스', 'machine', ['shoulder'], 1, true], ['아놀드 프레스', 'dumbbell', ['shoulder'], 2, true], ['랜드마인 숄더 프레스', 'barbell', [], 1, true]],
  shoulderIso: [['사이드 레터럴 레이즈', 'dumbbell', [], 1, false], ['케이블 레터럴 레이즈', 'cable', [], 1, false], ['머신 레터럴 레이즈', 'machine', [], 1, false]],
  rearDelt: [['페이스풀', 'cable', [], 1, false], ['리버스 펙덱', 'machine', [], 1, false], ['덤벨 리어 델트 플라이', 'dumbbell', [], 1, false]],
  pullV: [['랫풀다운', 'machine', [], 1, true], ['풀업', 'bar', ['shoulder'], 2, true], ['클로즈그립 랫풀다운', 'machine', [], 1, true]],
  pullH: [['바벨 로우', 'barbell', ['lowerBack'], 1, true, ['bench', 0.75]], ['시티드 케이블 로우', 'cable', [], 1, true], ['원암 덤벨 로우', 'dumbbell', [], 1, true, ['bench', 0.35]], ['티바 로우', 'machine', ['lowerBack'], 2, true], ['머신 로우', 'machine', [], 1, true], ['인클라인 덤벨 로우', 'dumbbell', [], 1, true]],
  biceps: [['덤벨 컬', 'dumbbell', [], 1, false], ['바벨 컬', 'barbell', [], 1, false], ['해머 컬', 'dumbbell', [], 1, false], ['케이블 컬', 'cable', [], 1, false], ['인클라인 덤벨 컬', 'dumbbell', [], 1, false], ['프리처 컬', 'machine', [], 1, false]],
  triceps: [['트라이셉스 푸시다운', 'cable', [], 1, false], ['스컬 크러셔', 'barbell', [], 1, false], ['오버헤드 트라이셉스 익스텐션', 'dumbbell', ['shoulder'], 1, false], ['덤벨 킥백', 'dumbbell', [], 1, false]],
  core: [['행잉 레그 레이즈', 'bar', [], 1, false], ['케이블 크런치', 'cable', [], 1, false], ['크런치', 'bodyweight', [], 1, false], ['데드버그', 'bodyweight', [], 1, false], ['러시안 트위스트', 'bodyweight', ['lowerBack'], 1, false]],
};
export const LIBRARY = Object.entries(SLOTS).flatMap(([slot, list]) => list.map(([name, equipment, joints, level, compound, load]) => ({ slot, name, equipment, joints, level, compound, load })));

// The app stores barbell, dumbbell or machine; cables and bodyweight moves are logged like machines.
const kindOf = equipment => (equipment === 'barbell' || equipment === 'dumbbell' ? equipment : 'machine');

const shift = (day, by) => day.map(([slot, variant]) => [slot, variant + by]);
const DAYS = {
  full: [['squat', 0], ['pushH', 0], ['pullV', 0], ['hinge', 1], ['pushV', 0], ['pullH', 0], ['shoulderIso', 0], ['core', 0], ['biceps', 0], ['triceps', 0]],
  fullA: [['squat', 0], ['pushH', 0], ['pullH', 0], ['shoulderIso', 0], ['hamIso', 0], ['biceps', 0], ['core', 0], ['calf', 0]],
  fullB: [['hinge', 0], ['pushV', 0], ['pullV', 0], ['lunge', 0], ['chestIso', 0], ['triceps', 0], ['core', 1], ['rearDelt', 0]],
  fullC: [['squat', 1], ['pushH', 1], ['pullH', 1], ['hinge', 2], ['shoulderIso', 1], ['biceps', 1], ['triceps', 1], ['core', 2]],
  fiveA: [['squat', 0], ['pushH', 0], ['pullH', 0], ['biceps', 0], ['core', 0], ['triceps', 0], ['calf', 0], ['shoulderIso', 0]],
  fiveB: [['squat', 0], ['pushV', 0], ['hinge', 0], ['pullV', 0], ['core', 1], ['rearDelt', 0], ['hamIso', 0], ['biceps', 1]],
  upperA: [['pushH', 0], ['pullH', 0], ['chestIso', 0], ['pullV', 0], ['shoulderIso', 0], ['triceps', 0], ['biceps', 0], ['rearDelt', 0]],
  upperB: [['pushV', 0], ['pullV', 1], ['pushH', 1], ['pullH', 1], ['rearDelt', 1], ['biceps', 1], ['triceps', 1], ['shoulderIso', 1]],
  lowerA: [['squat', 0], ['hinge', 1], ['lunge', 0], ['kneeIso', 0], ['hamIso', 0], ['calf', 0], ['core', 0]],
  lowerB: [['hinge', 0], ['squat', 1], ['lunge', 1], ['hamIso', 1], ['kneeIso', 0], ['calf', 1], ['core', 1]],
  push: [['pushH', 0], ['pushV', 0], ['pushH', 1], ['chestIso', 0], ['shoulderIso', 0], ['triceps', 0], ['triceps', 1], ['chestIso', 1]],
  pull: [['pullV', 0], ['pullH', 0], ['pullH', 1], ['rearDelt', 0], ['biceps', 0], ['biceps', 1], ['pullV', 1], ['core', 0]],
  legs: [['squat', 0], ['hinge', 1], ['lunge', 0], ['kneeIso', 0], ['hamIso', 0], ['calf', 0], ['core', 1]],
  chestTri: [['pushH', 0], ['pushH', 1], ['chestIso', 0], ['pushH', 2], ['chestIso', 1], ['triceps', 0], ['triceps', 1]],
  backBi: [['pullV', 0], ['pullH', 0], ['pullH', 1], ['pullV', 1], ['biceps', 0], ['biceps', 1], ['rearDelt', 0]],
  shoulderCore: [['pushV', 0], ['shoulderIso', 0], ['rearDelt', 0], ['shoulderIso', 1], ['pushV', 1], ['core', 0], ['core', 1]],
  chest: [['pushH', 0], ['pushH', 1], ['chestIso', 0], ['pushH', 2], ['chestIso', 1], ['pushH', 3]],
  back: [['pullV', 0], ['pullH', 0], ['pullH', 1], ['pullV', 1], ['pullH', 2], ['hinge', 5]],
  shoulders: [['pushV', 0], ['shoulderIso', 0], ['rearDelt', 0], ['shoulderIso', 1], ['pushV', 1], ['rearDelt', 1]],
  armsCore: [['biceps', 0], ['triceps', 0], ['biceps', 1], ['triceps', 1], ['biceps', 2], ['triceps', 2], ['core', 0], ['core', 1]],
};

const PROGRAMS = {
  fullBasic: { name: '전신 기초', days: [['전신', DAYS.full]] },
  fullAB: { name: '전신 A/B', days: [['전신 A', DAYS.fullA], ['전신 B', DAYS.fullB]] },
  fullABC: { name: '전신 A/B/C', days: [['전신 A', DAYS.fullA], ['전신 B', DAYS.fullB], ['전신 C', DAYS.fullC]] },
  fiveByFive: { name: '5×5 근력 A/B', fiveByFive: true, days: [['5×5 A', DAYS.fiveA], ['5×5 B', DAYS.fiveB]] },
  upperLower: { name: '상·하체 A/B', days: [['상체 A', DAYS.upperA], ['하체 A', DAYS.lowerA], ['상체 B', DAYS.upperB], ['하체 B', DAYS.lowerB]] },
  upperLowerFull: { name: '상·하체 + 전신', days: [['상체 A', DAYS.upperA], ['하체 A', DAYS.lowerA], ['전신', DAYS.fullC], ['상체 B', DAYS.upperB], ['하체 B', DAYS.lowerB]] },
  ppl: { name: 'PPL 3분할', days: [['밀기', DAYS.push], ['당기기', DAYS.pull], ['하체', DAYS.legs]] },
  pplAB: { name: 'PPL A/B', days: [['밀기 A', DAYS.push], ['당기기 A', DAYS.pull], ['하체 A', DAYS.legs], ['밀기 B', shift(DAYS.push, 1)], ['당기기 B', shift(DAYS.pull, 1)], ['하체 B', DAYS.lowerB]] },
  fourSplit: { name: '4분할', days: [['가슴·삼두', DAYS.chestTri], ['등·이두', DAYS.backBi], ['어깨·코어', DAYS.shoulderCore], ['하체', DAYS.lowerA]] },
  fiveSplit: { name: '5분할', days: [['가슴', DAYS.chest], ['등', DAYS.back], ['어깨', DAYS.shoulders], ['하체', DAYS.lowerA], ['팔·코어', DAYS.armsCore]] },
};
export const PROGRAM_KEYS = Object.keys(PROGRAMS);

const ALTERNATIVE = { fullBasic: 'fullAB', fullAB: 'fullABC', fullABC: 'fullAB', fiveByFive: 'fullABC', upperLower: 'ppl', upperLowerFull: 'upperLower', ppl: 'upperLower', pplAB: 'upperLower', fourSplit: 'upperLower', fiveSplit: 'fourSplit' };

export function pickProgram({ experience, frequency, goal, split = 'auto', equipment = 'gym' }) {
  const days = Number(frequency);
  const barbell = AVAILABLE[equipment].includes('barbell');
  if (split === 'full') return days <= 2 ? (experience === 'new' ? 'fullBasic' : 'fullAB') : (experience === 'new' ? 'fullAB' : 'fullABC');
  if (split === 'upperLower') return days === 5 ? 'upperLowerFull' : 'upperLower';
  if (split === 'bodyPart') return days <= 3 ? 'ppl' : days === 4 ? 'fourSplit' : days === 5 ? (experience === 'long' ? 'fiveSplit' : 'fourSplit') : 'pplAB';
  if (days === 2) return experience === 'new' ? 'fullBasic' : 'fullAB';
  if (experience === 'new') return days >= 4 ? 'fullAB' : 'fullBasic';
  if (days === 3) {
    if (goal === 'strength' && barbell && experience !== 'beginner') return 'fiveByFive';
    return experience === 'long' && goal === 'size' ? 'ppl' : 'fullABC';
  }
  if (days === 4) return 'upperLower';
  if (days === 5) return experience === 'long' ? 'fiveSplit' : 'upperLowerFull';
  return experience === 'beginner' ? 'upperLower' : 'pplAB';
}

// Sets × reps by goal for compound lifts and accessories.
const SCHEME = { strength: { compound: [5, 5], accessory: [3, 8] }, size: { compound: [4, 8], accessory: [3, 12] }, fatloss: { compound: [3, 12], accessory: [3, 15] }, health: { compound: [3, 12], accessory: [2, 15] } };
// A 5-rep weight is roughly this share of what the user can do for the goal's reps.
const LOAD = { strength: 0.9, size: 0.8, fatloss: 0.7, health: 0.7 };
const BASE_COUNT = { 30: 3, 45: 4, 60: 5, 75: 6, 90: 7 };
const MAX_DAY_SETS = 24;
const PART_OF_FOCUS = { chest: '가슴', back: '등', shoulders: '어깨', legs: '하체', arms: '팔', core: '코어' };
const FOCUS_SLOTS = { chest: [['chestIso', 1]], back: [['pullH', 2]], shoulders: [['shoulderIso', 1]], legs: [['lunge', 1]], arms: [['biceps', 1], ['triceps', 1]], core: [['core', 1]] };

// When equipment or a sore joint empties a slot, the day keeps its length with the nearest movement instead.
const FALLBACK = { squat: ['hinge', 2], lunge: ['hinge', 4], kneeIso: ['lunge', 3], hinge: ['hamIso', 0], hamIso: ['hinge', 4], pushH: ['chestIso', 0], pushV: ['shoulderIso', 0], pullV: ['pullH', 2], pullH: ['pullV', 0], chestIso: ['pushH', 2], rearDelt: ['pullH', 2], calf: ['hamIso', 0] };

export function exercisesPerDay({ time, experience, goal }) {
  return Math.min(8, (BASE_COUNT[time] ?? 5) + (['mid', 'long'].includes(experience) ? 1 : 0) + (goal === 'fatloss' ? 1 : 0));
}

function candidates(slot, answers, { ignorePain = false } = {}) {
  const available = AVAILABLE[answers.equipment];
  const pain = ignorePain ? [] : (answers.pain ?? []).filter(item => item !== 'none');
  return LIBRARY.filter(item => item.slot === slot && available.includes(item.equipment)
    && !(answers.experience === 'new' && item.level > 1)
    && !item.joints.some(joint => pain.includes(joint)));
}

const roundTo = (value, step) => Math.round(value / step) * step;
function startWeight(item, goal, lifts) {
  if (item.equipment === 'bodyweight' || item.equipment === 'bar') return 0;
  const base = item.load && lifts[item.load[0]] ? lifts[item.load[0]] * item.load[1] : 0;
  // Dumbbells are per hand and move in 1kg steps; a barbell never goes below the empty 20kg bar.
  if (base > 0) return item.equipment === 'dumbbell' ? Math.max(2, Math.round(base * LOAD[goal])) : Math.max(20, roundTo(base * LOAD[goal], 2.5));
  return { barbell: 20, dumbbell: 6 }[item.equipment] ?? 20;
}

export function buildProgram(programKey, answers, lifts = {}, options = {}) {
  const program = PROGRAMS[programKey];
  const count = exercisesPerDay(answers);
  const scheme = SCHEME[answers.goal] ?? SCHEME.size;
  const focus = (answers.focus ?? []).filter(item => PART_OF_FOCUS[item]);
  const routines = program.days.map(([day, slots]) => {
    const chosen = [];
    const pick = ([slot, variant]) => {
      const list = candidates(slot, answers, options);
      // Start at this day's variant and skip anything already in the day, so A and B days differ.
      for (let step = 0; step < list.length; step++) {
        const item = list[(variant + step) % list.length];
        if (!chosen.includes(item)) return item;
      }
      return null;
    };
    for (const entry of slots) {
      if (chosen.length >= count) break;
      const item = pick(entry) ?? (FALLBACK[entry[0]] ? pick(FALLBACK[entry[0]]) : null);
      if (item) chosen.push(item);
    }
    // Focus parts this day already trains get up to two extra exercises, unless the day is already about that part
    // (a chest day in a body-part split is all chest anyway).
    const parts = chosen.map(item => guessPart(item.name));
    const share = part => parts.filter(item => item === part).length / Math.max(parts.length, 1);
    const boosted = focus.filter(key => parts.includes(PART_OF_FOCUS[key]) && share(PART_OF_FOCUS[key]) < 0.7);
    let extra = 0;
    for (const key of boosted) {
      for (const entry of FOCUS_SLOTS[key]) {
        if (extra >= 2) break;
        const item = pick(entry);
        if (item) { chosen.push(item); extra += 1; }
      }
    }
    const boostedParts = boosted.map(key => PART_OF_FOCUS[key]);
    const exercises = chosen.map(item => {
      let [plannedSets, target] = item.compound ? scheme.compound : scheme.accessory;
      if (program.fiveByFive) [plannedSets, target] = item.equipment !== 'barbell' || !item.compound ? scheme.accessory : item.name === '데드리프트' ? [1, 5] : [5, 5];
      else if (answers.experience === 'new') plannedSets = Math.min(plannedSets, 3);
      if (boostedParts.includes(guessPart(item.name)) && plannedSets > 1) plannedSets = Math.min(plannedSets + 1, 6);
      return { name: item.name, kind: kindOf(item.equipment), weight: startWeight(item, answers.goal, lifts), target, plannedSets };
    });
    // A day stays within MAX_DAY_SETS: the last exercises give up sets first, never below two.
    let total = exercises.reduce((n, item) => n + item.plannedSets, 0);
    for (let index = exercises.length - 1; total > MAX_DAY_SETS && index >= 0; index = index === 0 ? exercises.length - 1 : index - 1) {
      if (exercises.every(item => item.plannedSets <= 2)) break;
      if (exercises[index].plannedSets > 2) { exercises[index].plannedSets -= 1; total -= 1; }
    }
    return { title: `추천 · ${day}`, exercises };
  });
  return { key: programKey, name: program.name, routines };
}

const LABELS = Object.fromEntries(QUESTIONS.map(question => [question.key, Object.fromEntries(question.options.map(([value, label]) => [value, label]))]));
const names = program => new Set(program.routines.flatMap(routine => routine.exercises.map(item => item.name)));
const listText = items => [...items].slice(0, 3).join(', ') + (items.size > 3 ? ' 등' : '');

// Plain sentences saying which answer changed what.
function explain(answers, program) {
  const reasons = [];
  const split = answers.split && answers.split !== 'auto' ? ` · ${LABELS.split[answers.split]} 선호` : '';
  reasons.push(`${LABELS.experience[answers.experience]} · 주 ${answers.frequency}회 · ${LABELS.goal[answers.goal]}${split} → ${program.name}`);
  reasons.push(`${answers.time}분 → 하루 ${exercisesPerDay(answers)}종목${answers.goal === 'fatloss' ? '(감량 목표로 1종목 추가)' : ''}`);
  if (answers.equipment !== 'gym') reasons.push(`${LABELS.equipment[answers.equipment]} → 쓸 수 있는 장비의 종목만`);
  const pain = (answers.pain ?? []).filter(item => item !== 'none');
  if (pain.length) {
    const free = names(buildProgram(program.key, answers, {}, { ignorePain: true }));
    const actual = names(program);
    const removed = new Set([...free].filter(name => !actual.has(name)));
    const added = new Set([...actual].filter(name => !free.has(name)));
    const joints = pain.map(item => LABELS.pain[item]).join('·');
    reasons.push(removed.size ? `${joints} 불편 → ${listText(removed)} 대신 ${added.size ? listText(added) : '다른 종목'}` : `${joints} 불편 → 부담이 큰 종목 없이 구성`);
  }
  const focus = (answers.focus ?? []).filter(item => PART_OF_FOCUS[item]);
  if (focus.length) reasons.push(`${focus.map(item => LABELS.focus[item]).join('·')} 집중 → 관련 종목 추가, 세트 +1`);
  return reasons;
}

export function recommend(answers, lifts = {}) {
  const primaryKey = pickProgram(answers);
  const autoKey = pickProgram({ ...answers, split: 'auto' });
  let alternativeKey = autoKey !== primaryKey ? autoKey : ALTERNATIVE[primaryKey];
  // 5×5 needs a barbell; without one the second choice falls back to full body.
  if (alternativeKey === 'fiveByFive' && !AVAILABLE[answers.equipment].includes('barbell')) alternativeKey = 'fullABC';
  const primary = buildProgram(primaryKey, answers, lifts);
  const alternative = buildProgram(alternativeKey, answers, lifts);
  return { primary: { ...primary, reasons: explain(answers, primary) }, alternative: { ...alternative, reasons: explain(answers, alternative) } };
}

// Substitutes: the same movement first, then related movements; names outside the library fall back to the same body part.
const RELATED = { squat: ['lunge', 'hinge'], hinge: ['hamIso', 'squat'], lunge: ['squat', 'hinge'], kneeIso: ['squat', 'lunge'], hamIso: ['hinge'], calf: [], pushH: ['chestIso', 'pushV'], chestIso: ['pushH'], pushV: ['shoulderIso', 'pushH'], shoulderIso: ['pushV', 'rearDelt'], rearDelt: ['shoulderIso', 'pullH'], pullV: ['pullH'], pullH: ['pullV', 'rearDelt'], biceps: [], triceps: [], core: [] };
export const EQUIPMENT_FILTERS = { barbell: ['barbell'], dumbbell: ['dumbbell'], machine: ['machine', 'cable'], bodyweight: ['bodyweight', 'bar'] };

export function substitutesFor(name, { equipment = 'all', avoid = [] } = {}) {
  const key = String(name ?? '').trim();
  const own = LIBRARY.find(item => item.name === key);
  const keep = item => item.name !== key
    && (equipment === 'all' || EQUIPMENT_FILTERS[equipment].includes(item.equipment))
    && !item.joints.some(joint => avoid.includes(joint));
  const view = (item, group) => ({ name: item.name, kind: kindOf(item.equipment), equipment: item.equipment, joints: item.joints, group });
  if (own) {
    const same = LIBRARY.filter(item => item.slot === own.slot && keep(item)).map(item => view(item, 'same'));
    const similar = RELATED[own.slot].flatMap(slot => LIBRARY.filter(item => item.slot === slot && keep(item))).map(item => view(item, 'similar'));
    return { known: true, part: guessPart(key), list: [...same, ...similar] };
  }
  const part = guessPart(key);
  return { known: false, part, list: part ? LIBRARY.filter(item => guessPart(item.name) === part && keep(item)).map(item => view(item, 'part')) : [] };
}

// Light defaults for a substitute with no history of its own.
export const defaultWeight = equipment => (equipment === 'bodyweight' || equipment === 'bar' ? 0 : equipment === 'dumbbell' ? 6 : 20);

// A substitute with no history starts from the current exercise's weight when both are tied to the same lift
// (barbell bench 100kg → dumbbell bench about 30kg a hand). Otherwise null.
export function estimateFrom(fromName, fromWeight, toName) {
  const from = LIBRARY.find(item => item.name === String(fromName ?? '').trim());
  const to = LIBRARY.find(item => item.name === toName);
  if (!from?.load || !to?.load || from.load[0] !== to.load[0] || !(fromWeight > 0)) return null;
  const value = fromWeight / from.load[1] * to.load[1];
  return to.equipment === 'dumbbell' ? Math.max(2, Math.round(value)) : Math.max(20, roundTo(value, 2.5));
}
