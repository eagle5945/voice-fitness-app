import { BODY_PARTS } from './domain.mjs';

export { BODY_PARTS };

const HOUR = 3_600_000;

// Checked in order, compound names first: 레그 컬 is legs before 컬 is arms, 업라이트 로우 is shoulders before 로우 is back.
// A name that matches nothing stays unclassified; a wrong guess would be worse than none.
const RULES = [
  ['코어', /레그레이즈|크런치|플랭크|싯업|윗몸|복근|코어|러시안트위스트|롤아웃|데드버그|사이드밴드|니업/],
  ['하체', /레그컬|레그익스텐션|레그프레스|루마니안|rdl|스티프|굿모닝|힙쓰러스트|힙스러스트|브릿지|카프|종아리|런지|스쿼트|스플릿|스텝업|어덕션|애덕션|어브덕션|햄스트링|글루트|하체/],
  ['등', /백익스텐션|하이퍼익스텐션/],
  ['어깨', /업라이트로우|페이스풀|리어델트|리버스플라이|리버스펙덱/],
  ['가슴', /팔굽혀|푸시업|푸쉬업|딥스|벤치|체스트|펙덱|크로스오버|가슴|플라이/],
  ['팔', /컬|이두|삼두|트라이셉|바이셉|킥백|푸시다운|푸쉬다운|프레스다운|익스텐션|스컬|해머|전완|리스트|팔/],
  ['어깨', /숄더|오버헤드|밀리터리|레터럴|레이즈|아놀드|어깨/],
  // Conventional deadlift is counted as back; change it in 종목 분류 if you train it as a leg lift.
  ['등', /데드리프트|랫|로우|풀업|턱걸이|풀다운|친업|등/],
  ['가슴', /인클라인|디클라인|덤벨프레스/],
];

export function guessPart(name) {
  const text = String(name ?? '').toLowerCase().replace(/\s+/g, '');
  return RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

// The user's choice wins; Object.hasOwn keeps names like “constructor” away from the prototype.
export function partOf(name, overrides = {}) {
  const key = String(name ?? '').trim();
  return Object.hasOwn(overrides, key) ? overrides[key] : guessPart(key);
}

// This app's own bands, not physiology: under 48 hours 회복 중, under 7 days 준비됨, longer 오래 쉼.
export function recoveryStatus(hours) {
  if (hours == null) return 'none';
  if (hours < 48) return 'recovering';
  if (hours < 168) return 'ready';
  return 'rested';
}

// Sets per part over the last 7 days (rolling, so Monday never reads as zero) and hours since the part's last set.
// Each exercise counts toward its one main part only.
export function bodyPartSummary(sessions, overrides = {}, { now = Date.now(), routines = [] } = {}) {
  const parts = new Map(BODY_PARTS.map(part => [part, { part, sets: 0, volume: 0, lastAt: null }]));
  const unclassified = { sets: 0, names: new Set() };
  const names = new Set(routines.flatMap(routine => routine.exercises.map(item => item.name.trim())));
  const since = now - 7 * 24 * HOUR;
  for (const session of sessions) for (const exercise of session.exercises) {
    const name = exercise.name.trim();
    const sets = exercise.sets.filter(set => !set.canceledAt);
    if (sets.length) names.add(name);
    const entry = parts.get(partOf(name, overrides));
    for (const set of sets) {
      const at = Date.parse(set.at);
      if (!entry) { if (at >= since) { unclassified.sets += 1; unclassified.names.add(name); } continue; }
      if (at >= since) { entry.sets += 1; entry.volume += set.weight * set.reps * (exercise.kind === 'dumbbell' ? 2 : 1); }
      if (!entry.lastAt || at > Date.parse(entry.lastAt)) entry.lastAt = set.at;
    }
  }
  const rows = [...parts.values()].map(row => {
    const hours = row.lastAt ? Math.max(0, (now - Date.parse(row.lastAt)) / HOUR) : null;
    return { ...row, hours, status: recoveryStatus(hours) };
  });
  const list = [...names].sort((a, b) => a.localeCompare(b, 'ko')).map(name => ({ name, part: partOf(name, overrides), guess: guessPart(name), chosen: Object.hasOwn(overrides, name) }));
  return { rows, unclassified: { sets: unclassified.sets, names: [...unclassified.names] }, names: list };
}
