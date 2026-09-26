const koreanNumbers = new Map([
  ['영', 0], ['공', 0], ['한', 1], ['하나', 1], ['일', 1], ['두', 2], ['둘', 2], ['이', 2],
  ['세', 3], ['셋', 3], ['삼', 3], ['네', 4], ['넷', 4], ['사', 4], ['다섯', 5], ['오', 5],
  ['여섯', 6], ['육', 6], ['일곱', 7], ['칠', 7], ['여덟', 8], ['팔', 8], ['아홉', 9], ['구', 9],
  ['열', 10], ['열하나', 11], ['열한', 11], ['열둘', 12], ['열두', 12], ['열셋', 13],
  ['열세', 13], ['열넷', 14], ['열네', 14], ['열다섯', 15], ['열여섯', 16],
  ['열일곱', 17], ['열여덟', 18], ['열아홉', 19], ['스물', 20], ['스무', 20],
  ['서른', 30], ['마흔', 40], ['쉰', 50], ['육십', 60], ['칠십', 70], ['팔십', 80], ['구십', 90],
]);

function numberOf(raw) {
  const compact = raw.replace(/\s+/g, '');
  if (/^\d+(?:\.\d+)?$/.test(compact)) return Number(compact);
  if (koreanNumbers.has(compact)) return koreanNumbers.get(compact);
  const tens = compact.match(/^(스물|서른|마흔|쉰)(.+)$/);
  if (tens && koreanNumbers.has(tens[1]) && koreanNumbers.has(tens[2]) && koreanNumbers.get(tens[2]) > 0 && koreanNumbers.get(tens[2]) < 10) {
    return koreanNumbers.get(tens[1]) + koreanNumbers.get(tens[2]);
  }
  if (compact && /^(?:[일이삼사오육칠팔구]?천)?(?:[일이삼사오육칠팔구]?백)?(?:[일이삼사오육칠팔구]?십)?[일이삼사오육칠팔구]?$/.test(compact)) {
    let total = 0;
    let digit = 0;
    for (const char of compact) {
      const unit = { 천: 1000, 백: 100, 십: 10 }[char];
      if (unit) { total += (digit || 1) * unit; digit = 0; }
      else digit = koreanNumbers.get(char);
    }
    return total + digit;
  }
  return null;
}

// Match only number words, so a preceding unit or sentence cannot become part of a number.
const numberChars = [...new Set([...koreanNumbers.keys()].join('') + '백천')].join('');
const numberToken = `[0-9]+(?:\\.[0-9]+)?|[${numberChars}]+(?:\\s+[${numberChars}]+)*`;
const numberStart = '(?<![가-힣0-9.+-])';
const weightUnit = '(?:kg|킬로그램|키로그램|킬로|키로)';
const weightPattern = new RegExp(`${numberStart}(${numberToken})\\s*${weightUnit}(?![a-z가-힣])`, 'gi');
const weightMention = new RegExp(weightUnit, 'i');
const repsPattern = new RegExp(`${numberStart}(${numberToken})\\s*(?:회|개|번)(?=$|\\s|[.,!?]|밖에|(?:입니다|이에요|예요|했어요|했습니다|했어|완료)(?:$|\\s|[.,!?]))`, 'gi');

export function parseUtterance(raw, currentWeight) {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return { status: 'invalid' };
  const weights = [...text.matchAll(weightPattern)].map(match => numberOf(match[1]));
  const remaining = text.replace(weightPattern, ' ');
  // Never silently replace an explicitly spoken but unsupported weight with the preset weight.
  if (weights.includes(null) || weightMention.test(remaining)) return { status: 'invalid' };
  const reps = [...remaining.matchAll(repsPattern)].map(match => numberOf(match[1]));
  if (reps.length === 0 && !weights.length && /^\d+$/.test(text)) reps.push(Number(text));
  if (!reps.length || weights.length > 1 || reps.length > 1 || !Number.isInteger(reps[0]) || reps[0] < 0 || reps[0] > 999) {
    return reps.length > 1 || weights.length > 1 ? { status: 'ambiguous' } : { status: 'invalid' };
  }
  const weight = weights.length ? weights[0] : currentWeight;
  if (!Number.isFinite(weight) || weight < 0 || weight > 2000) return { status: 'invalid' };
  return { status: 'ok', reps: reps[0], weight };
}

export function parseAlternatives(texts, currentWeight) {
  const choices = [];
  for (const text of texts) {
    const result = parseUtterance(text, currentWeight);
    if (result.status !== 'ok') continue;
    if (!choices.some(item => item.reps === result.reps && item.weight === result.weight)) choices.push({ reps: result.reps, weight: result.weight });
  }
  if (!choices.length) return { status: 'invalid' };
  if (choices.length === 1) return { status: 'ok', ...choices[0] };
  return { status: 'ambiguous', choices: choices.slice(0, 3) };
}
