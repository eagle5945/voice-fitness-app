// Common Korean gym setup. Change here if the bar or plate set differs.
export const BAR_WEIGHT = 20;
export const PLATES = [20, 15, 10, 5, 2.5, 1.25];

// Barbell weight is stored as the total including the bar, so split the rest across both sides.
export function platesFor(total, bar = BAR_WEIGHT, plates = PLATES) {
  if (!(total >= bar)) return { status: 'under-bar', bar };
  let side = Math.round((total - bar) / 2 * 100) / 100;
  const perSide = [];
  for (const plate of plates) {
    while (side >= plate - 1e-9) { perSide.push(plate); side = Math.round((side - plate) * 100) / 100; }
  }
  return { status: side > 0 ? 'partial' : 'exact', bar, perSide, remainder: side };
}

export function plateText(result) {
  if (result.status === 'under-bar') return `바(${result.bar}kg)보다 가벼워요`;
  if (!result.perSide.length && result.status === 'exact') return `빈 바 ${result.bar}kg`;
  const side = result.perSide.length ? `한쪽 ${result.perSide.join(' · ')}` : '한쪽 원판 없음';
  return `바 ${result.bar}kg + ${side}${result.status === 'partial' ? ` (한쪽 ${result.remainder}kg는 맞출 수 없어요)` : ''}`;
}
