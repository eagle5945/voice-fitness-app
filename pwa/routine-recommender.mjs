// A short questionnaire turned into starter routines by fixed rules. No prediction, nothing stored but the routines.

export const QUESTIONS = [
  { key: 'experience', title: '웨이트 운동 경험이 얼마나 되나요?', options: [['new', '처음이에요', '6개월 미만'], ['mid', '6개월~2년'], ['long', '2년 이상']] },
  { key: 'frequency', title: '일주일에 몇 번 운동할 수 있나요?', options: [['2', '2회'], ['3', '3회'], ['4', '4회'], ['5', '5회 이상']] },
  { key: 'goal', title: '가장 원하는 것은 무엇인가요?', options: [['strength', '무게 늘리기', '근력'], ['size', '몸 만들기', '근비대'], ['health', '건강·체력']] },
  { key: 'time', title: '한 번에 운동할 수 있는 시간은요?', options: [['45', '45분'], ['60', '60분'], ['90', '90분']] },
  { key: 'equipment', title: '쓸 수 있는 장비는요?', options: [['barbell', '바벨까지 모두', '헬스장'], ['basic', '덤벨·머신만']] },
];

// The optional sixth step: weights the user can lift for 5 reps. Asked only when it can be used.
export const askLifts = answers => answers.experience !== 'new' && answers.equipment === 'barbell';

// Names match the body-part guesses and the big three detection.
const EXERCISES = {
  squat: { name: '바벨 스쿼트', kind: 'barbell', compound: true, alt: 'legpress' },
  bench: { name: '벤치프레스', kind: 'barbell', compound: true, alt: 'dbBench' },
  deadlift: { name: '데드리프트', kind: 'barbell', compound: true, alt: 'dbRdl' },
  ohp: { name: '오버헤드 프레스', kind: 'barbell', compound: true, alt: 'dbShoulder' },
  row: { name: '바벨 로우', kind: 'barbell', compound: true, alt: 'cableRow' },
  rdl: { name: '루마니안 데드리프트', kind: 'barbell', compound: true, alt: 'dbRdl' },
  legpress: { name: '레그 프레스', kind: 'machine', compound: true },
  dbBench: { name: '덤벨 벤치프레스', kind: 'dumbbell', compound: true },
  dbRdl: { name: '덤벨 루마니안 데드리프트', kind: 'dumbbell', compound: true },
  dbShoulder: { name: '덤벨 숄더 프레스', kind: 'dumbbell', compound: true },
  cableRow: { name: '시티드 케이블 로우', kind: 'machine', compound: true },
  latPulldown: { name: '랫풀다운', kind: 'machine', compound: true },
  incline: { name: '인클라인 덤벨 프레스', kind: 'dumbbell' },
  legCurl: { name: '레그 컬', kind: 'machine' },
  legExtension: { name: '레그 익스텐션', kind: 'machine' },
  calf: { name: '카프 레이즈', kind: 'machine' },
  curl: { name: '덤벨 컬', kind: 'dumbbell' },
  hammer: { name: '해머 컬', kind: 'dumbbell' },
  pushdown: { name: '트라이셉스 푸시다운', kind: 'machine' },
  lateral: { name: '사이드 레터럴 레이즈', kind: 'dumbbell' },
  facePull: { name: '페이스풀', kind: 'machine' },
  fly: { name: '펙덱 플라이', kind: 'machine' },
  legRaise: { name: '행잉 레그 레이즈', kind: 'machine', bodyweight: true },
};

// Each day lists exercises by priority; the time answer keeps the first 4, 5 or 6.
const PROGRAMS = {
  fullBody: { name: '전신 기초', days: [['전신', ['squat', 'bench', 'row', 'ohp', 'latPulldown', 'legRaise']]] },
  fullBodyAB: { name: '전신 A/B', days: [['전신 A', ['squat', 'bench', 'row', 'lateral', 'curl', 'legRaise']], ['전신 B', ['deadlift', 'ohp', 'latPulldown', 'incline', 'legCurl', 'pushdown']]] },
  fiveByFive: { name: '5×5 근력 A/B', fiveByFive: true, days: [['5×5 A', ['squat', 'bench', 'row', 'curl', 'legRaise', 'pushdown']], ['5×5 B', ['squat', 'ohp', 'deadlift', 'latPulldown', 'legRaise', 'facePull']]] },
  upperLower: { name: '상·하체 분할', days: [['상체', ['bench', 'row', 'ohp', 'latPulldown', 'curl', 'pushdown']], ['하체', ['squat', 'rdl', 'legpress', 'legCurl', 'calf', 'legRaise']]] },
  ppl: { name: 'PPL 3분할', days: [['밀기', ['bench', 'ohp', 'incline', 'lateral', 'pushdown', 'fly']], ['당기기', ['deadlift', 'latPulldown', 'row', 'facePull', 'curl', 'hammer']], ['하체', ['squat', 'rdl', 'legpress', 'legCurl', 'legExtension', 'calf']]] },
};

// Second choice for “다른 추천 보기”.
const ALTERNATIVE = { fullBody: 'fullBodyAB', fullBodyAB: 'fiveByFive', fiveByFive: 'fullBodyAB', upperLower: 'ppl', ppl: 'upperLower' };

export function pickProgram({ experience, frequency, goal }) {
  if (experience === 'new' || frequency === '2') return 'fullBody';
  if (frequency === '3') return goal === 'strength' ? 'fiveByFive' : 'fullBodyAB';
  if (frequency === '4') return 'upperLower';
  return 'ppl';
}

// Sets × reps by goal: compound lifts first, then accessories.
const SCHEME = {
  strength: { compound: [5, 5], accessory: [3, 8] },
  size: { compound: [4, 8], accessory: [3, 12] },
  health: { compound: [3, 12], accessory: [2, 15] },
};
// A 5-rep max is roughly this share of what the user can do for the target reps.
const LOAD = { strength: 0.9, size: 0.8, health: 0.7 };

const roundTo = (value, step) => Math.round(value / step) * step;

function startWeight(key, exercise, goal, lifts) {
  if (exercise.bodyweight) return 0;
  const base = { squat: lifts.squat, bench: lifts.bench, deadlift: lifts.deadlift, ohp: lifts.bench && lifts.bench * 0.6, row: lifts.bench && lifts.bench * 0.75, rdl: lifts.deadlift && lifts.deadlift * 0.6 }[key];
  if (base > 0 && exercise.kind === 'barbell') return Math.max(20, roundTo(base * LOAD[goal], 2.5));
  return { barbell: 20, dumbbell: 6, machine: 20 }[exercise.kind];
}

export function buildProgram(programKey, answers, lifts = {}) {
  const program = PROGRAMS[programKey];
  const count = { 45: 4, 60: 5, 90: 6 }[answers.time] ?? 5;
  const scheme = SCHEME[answers.goal] ?? SCHEME.size;
  const swap = key => (answers.equipment === 'basic' && EXERCISES[key].alt ? EXERCISES[key].alt : key);
  const routines = program.days.map(([day, keys]) => ({
    title: `추천 · ${day}`,
    // Without a barbell two lifts can turn into the same machine (squat and leg press); the next one on the list fills the gap.
    exercises: [...new Set(keys.map(swap))].slice(0, count).map(key => {
      const exercise = EXERCISES[key];
      let [plannedSets, target] = exercise.compound ? scheme.compound : scheme.accessory;
      // 5×5 keeps its shape whatever the goal: 5×5 on the barbell lifts, one heavy set of deadlifts, everything else as accessories.
      if (program.fiveByFive) [plannedSets, target] = exercise.kind !== 'barbell' ? scheme.accessory : key === 'deadlift' ? [1, 5] : [5, 5];
      return { name: exercise.name, kind: exercise.kind, weight: startWeight(key, exercise, answers.goal, lifts), target, plannedSets };
    }),
  }));
  return { key: programKey, name: program.name, routines };
}

const LABELS = Object.fromEntries(QUESTIONS.map(question => [question.key, Object.fromEntries(question.options.map(([value, label]) => [value, label]))]));

export function recommend(answers, lifts = {}) {
  const primary = pickProgram(answers);
  const frequency = answers.frequency === '5' ? '주 5회 이상' : `주 ${answers.frequency}회`;
  const reason = `${LABELS.experience[answers.experience]} · ${frequency} · ${LABELS.goal[answers.goal]}`;
  return { reason, primary: buildProgram(primary, answers, lifts), alternative: buildProgram(ALTERNATIVE[primary], answers, lifts) };
}
