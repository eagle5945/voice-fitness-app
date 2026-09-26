const koreaTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function timestamp(value) {
  const parts = Object.fromEntries(koreaTime.formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function cell(value) {
  let text = String(value);
  // Keep user-entered exercise names from becoming spreadsheet formulas.
  if (typeof value === 'string' && (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportWorkoutCsv(data) {
  const rows = [['운동 시작(한국시간)', '운동명', '장비', '중량 기준', '세트', '중량(kg)', '횟수', '입력 방식', '기록 시각(한국시간)']];
  const equipment = { barbell: ['바벨', '바 포함 총중량'], dumbbell: ['덤벨', '한 손 중량'], machine: ['머신', '기구 표시 중량'] };
  for (const session of data.sessions) {
    for (const exercise of session.exercises) {
      exercise.sets.filter(set => !set.canceledAt).forEach((set, index) => {
        rows.push([timestamp(session.startedAt), exercise.name, ...equipment[exercise.kind], index + 1,
          set.weight, set.reps, set.source === 'voice' ? '음성' : '직접 입력', timestamp(set.at)]);
      });
    }
  }
  // UTF-8 BOM lets Excel recognize Korean text when opening the file directly.
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
