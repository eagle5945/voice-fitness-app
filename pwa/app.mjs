import { emptyData, startSession, startRoutine, chooseSessionExercise, saveRoutine, removeRoutine, selectRoutine, setExercise, addSet, updateSet, cancelSet, restoreSet, deleteSetRecord, deleteSession, clearSessionHistory, finishSession, validateBackup } from './domain.mjs';
import { loadData, saveData } from './db.mjs';
import { previewDictation, confirmDictation } from './dictation.mjs';
import { exportWorkoutCsv } from './csv.mjs';
import { workoutGuide } from './workout-guide.mjs';
import { findPreviousExercise, suggestProgression } from './progression.mjs';
import { findRecord, oneRepMaxTrends, sparklinePoints } from './records.mjs';
import { typicalRest, lastSetTime, restText } from './rest.mjs';

const main = document.getElementById('app-main');
const dialog = document.getElementById('set-dialog');
const backupInput = document.getElementById('backup-file');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateText = iso => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
const id = () => crypto.randomUUID();

let data = emptyData();
let view = 'home';
let historySessionId = null;
let editingExerciseId = null;
let selectedRoutineId = null;
let notice = null;
let dictationContext = null;
let dictationPreview = null;
let dictationSaving = false;
let lastCanceledSetId = null;
let fatalError = null;
// Kept in memory only so declining a suggestion never changes the stored data format.
const dismissedProgression = new Set();

const activeSession = () => data.sessions.find(item => item.id === data.activeSessionId && !item.endedAt);
const activeExercise = () => activeSession()?.exercises.find(item => item.id === data.activeExerciseId);
const setsFor = exercise => exercise.sets.filter(item => !item.canceledAt);
const htmlNotice = (kind, message, actions = '') => `<div class="notice ${kind}" role="${kind === 'error' ? 'alert' : 'status'}"><strong>${escapeHtml(message)}</strong>${actions}</div>`;

async function commit(next) {
  const valid = validateBackup(next);
  await saveData(valid);
  data = valid;
  render();
}

function report(error) {
  notice = { kind: 'error', text: error instanceof Error ? error.message : String(error) };
  render();
}

const iconPaths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  edit: '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] ?? iconPaths.arrow}</svg>`;
const planSets = routine => routine.exercises.reduce((n, item) => n + (item.plannedSets ?? 0), 0);
const equipmentText = kind => kind === 'dumbbell' ? '덤벨 · 한 손 중량' : kind === 'machine' ? '머신 · 표시 중량' : '바벨 · 바 포함 총중량';
const selection = () => data.routines.find(item => item.id === selectedRoutineId) ?? data.routines.find(item => item.id === data.selectedRoutineId) ?? data.routines[0];
const progress = (value, total) => `<progress class="workout-progress" aria-label="계획 세트 진행" max="${total || 1}" value="${Math.min(value, total)}"></progress>`;
function noticeMarkup() {
  return notice ? htmlNotice(notice.kind, notice.text, lastCanceledSetId ? `<button class="text-button" data-action="restore-set" data-id="${escapeHtml(lastCanceledSetId)}">되돌리기</button>` : '') : '';
}
function planPreview(routine) {
  return `<ol class="plan-list">${routine.exercises.map((item, index) => `<li><span class="plan-number">${String(index + 1).padStart(2, '0')}</span><span class="plan-description"><strong>${escapeHtml(item.name)}</strong><small>${item.weight}kg · ${item.target}회</small></span><span class="set-badge">${item.plannedSets}세트</span></li>`).join('')}</ol>`;
}
function sessionCard(session, { deletable = false } = {}) {
  const count = session.exercises.reduce((n, item) => n + setsFor(item).length, 0);
  const card = `<button class="history-card" data-action="history-detail" data-id="${escapeHtml(session.id)}"><span class="history-date">${new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(session.startedAt))}</span><span class="history-info"><strong>${escapeHtml(session.routineName ?? session.exercises[0]?.name ?? '자유 운동')}</strong><small>${session.exercises.filter(item => setsFor(item).length).length}개 종목 · ${count}세트${session.endedAt ? '' : ' · 진행 중'}</small></span>${icon('arrow')}</button>`;
  return deletable ? `<div class="swipe-row history-entry" data-swipe-row role="group" aria-label="왼쪽으로 밀어 운동 기록 삭제"><div class="swipe-content">${card}</div><button class="swipe-delete" data-action="delete-session" data-id="${escapeHtml(session.id)}" aria-label="${escapeHtml(session.routineName ?? session.exercises[0]?.name ?? '운동')} 기록 삭제">삭제</button></div>` : card;
}
const kindLabel = { barbell: '바벨', dumbbell: '덤벨 한 손', machine: '머신' };
function recordRow(trend) {
  const points = sparklinePoints(trend.points.map(point => point.value), 84, 28);
  const [x, y] = points.at(-1);
  const chart = points.length > 1 ? `<svg class="sparkline" viewBox="0 0 84 28" width="84" height="28" role="img" aria-label="${escapeHtml(`${trend.name} 추정 1RM ${trend.points[0].value}kg에서 ${trend.latest}kg`)}"><polyline points="${points.map(point => point.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x}" cy="${y}" r="2.6" fill="currentColor"/></svg>` : '<span class="muted small">첫 기록</span>';
  return `<div class="history-card record-row"><span class="history-info"><strong>${escapeHtml(trend.name)}</strong><small>${kindLabel[trend.kind]} · 최근 ${trend.latest}kg</small></span>${chart}<span class="record-best"><small>최고</small><b>${trend.best}</b><small>kg</small></span></div>`;
}
function renderHeader() {
  const connection = document.getElementById('connection');
  connection.textContent = navigator.onLine ? '기기에 저장' : '오프라인';
  connection.classList.toggle('offline', !navigator.onLine);
  for (const [name, active] of [['home', !['history', 'routines'].includes(view)], ['routines', view === 'routines'], ['history', view === 'history']]) {
    const button = document.getElementById(`nav-${name}`);
    if (!button) continue;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
}
function renderHome() {
  const session = activeSession();
  const routine = selection();
  const recent = data.sessions.filter(item => item.exercises.some(exercise => setsFor(exercise).length)).slice(0, 2);
  const guide = workoutGuide(session, data.activeExerciseId);
  const date = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  return `<section class="screen-head"><span class="eyebrow">${date}</span><h2>${session ? '이어서, 한 세트 더.' : '오늘도 나의 페이스로.'}</h2><p>${session ? '진행 중인 운동이 기다리고 있어요.' : '오늘 할 루틴을 고르고 가볍게 시작하세요.'}</p></section>
    ${noticeMarkup()}
    ${session ? `<section class="workout-hero"><div class="section-head"><span class="hero-label">진행 중인 운동</span><span class="live-dot">기록 중</span></div><h3>${escapeHtml(session.routineName ?? activeExercise()?.name ?? '자유 운동')}</h3><p>${escapeHtml(activeExercise()?.name ?? '다음 종목을 선택하세요')}</p><div class="hero-stats"><span><b>${guide.recordedSets}</b> 세트 기록</span>${guide.totalSets ? `<span>목표 ${guide.totalSets}세트</span>` : ''}</div>${guide.totalSets ? progress(guide.completedSets, guide.totalSets) : ''}<button class="button hero-button full" data-action="${activeExercise() ? 'resume' : 'setup-new'}">운동 이어하기 ${icon('arrow')}</button></section>` : `
    <div class="section-head"><h3>오늘의 루틴</h3><button class="text-button" data-view="routines">관리 ${icon('arrow')}</button></div>
    ${data.routines.length ? `<div class="routine-picker" role="group" aria-label="오늘 할 루틴 선택">${data.routines.map(item => `<button class="routine-chip ${item.id === routine?.id ? 'selected' : ''}" aria-pressed="${item.id === routine?.id}" data-action="choose-today-routine" data-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button>`).join('')}</div><section class="card selected-plan"><div class="section-head"><div><span class="eyebrow">선택한 루틴</span><h3>${escapeHtml(routine.title)}</h3></div><span class="plan-total">${routine.exercises.length}개 종목 <span>·</span> ${planSets(routine)}세트</span></div>${planPreview(routine)}<button class="button primary full" data-action="start-routine">운동 시작 ${icon('arrow')}</button></section>` : `<section class="empty welcome-empty"><span class="empty-symbol">${icon('plus')}</span><h3>나만의 루틴부터 만들어볼까요?</h3><p>가슴, 등, 하체… 자주 하는 운동을<br>한 번 저장하면 다음 운동이 편해져요.</p><button class="button primary full" data-action="new-routine">첫 루틴 만들기 ${icon('plus')}</button></section>`}
    <button class="text-button quiet full" data-action="setup-new">루틴 없이 자유 운동 시작</button>`}
    <div class="section-head"><h3>최근 운동</h3><button class="text-button" data-view="history">전체 보기 ${icon('arrow')}</button></div>
    ${recent.length ? `<div class="history-list">${recent.map(sessionCard).join('')}</div>` : '<div class="empty compact"><p>첫 운동을 기록하면 여기에 쌓여요.</p></div>'}
    <details class="help-details"><summary>홈 화면에 추가해서 더 편하게</summary><p class="hint">Safari 공유 메뉴 → 홈 화면에 추가를 선택하세요. 루틴과 기록은 이 기기에 저장됩니다. 기록 탭에서 JSON 백업을 보관할 수 있어요.</p><p class="version-label">버전 20261001-21</p></details>`;
}

function renderSetup() {
  const exercise = activeSession()?.exercises.find(item => item.id === editingExerciseId);
  return `<section class="screen-head"><span class="eyebrow">운동 설정</span><h2>어떤 운동을 하나요?</h2><p>중량과 목표 횟수를 정하세요. 실제 횟수는 세트가 끝난 뒤 기록합니다.</p></section>
    <form id="exercise-form" class="stack">
      <label class="field">운동 이름<input name="name" required maxlength="60" autocomplete="off" placeholder="예: 벤치프레스" value="${escapeHtml(exercise?.name ?? '')}"></label>
      <label class="field">장비<select name="kind"><option value="machine" ${exercise?.kind === 'machine' ? 'selected' : ''}>머신 · 기구 표시 중량</option><option value="barbell" ${exercise?.kind === 'barbell' ? 'selected' : ''}>바벨 · 바 포함 총중량</option><option value="dumbbell" ${exercise?.kind === 'dumbbell' ? 'selected' : ''}>덤벨 · 한 손 중량</option></select></label>
      <div class="field-grid"><label>중량 · kg<input name="weight" inputmode="decimal" type="number" min="0" max="2000" step="0.5" required value="${exercise?.weight ?? 70}"></label><label>목표 횟수<input name="target" inputmode="numeric" type="number" min="1" max="999" step="1" required value="${exercise?.target ?? 10}"></label></div>
      <button class="button primary full" type="submit">${exercise ? '설정 저장' : '이 종목으로 시작'}</button><button class="button secondary full" type="button" data-action="back">돌아가기</button>
    </form>`;
}

function renderActive() {
  const session = activeSession();
  const exercise = activeExercise();
  if (!session || !exercise) { view = 'home'; return renderHome(); }
  const sets = setsFor(exercise);
  const guide = workoutGuide(session, exercise.id);
  const previous = findPreviousExercise(data.sessions, exercise, session.id);
  const previousSets = previous ? setsFor(previous) : [];
  const suggestion = dismissedProgression.has(exercise.id) ? null : suggestProgression(previous, exercise);
  const restSince = lastSetTime(session);
  const restTarget = typicalRest(data.sessions, exercise);
  const rest = restSince && restText(restSince, restTarget, Date.now());
  return `<section class="screen-head"><div class="section-head"><span class="eyebrow">${escapeHtml(session.routineName ?? '자유 운동')}${session.routineName ? ` · ${guide.position + 1}/${session.exercises.length} 종목` : ''}</span><button class="text-button quiet" data-action="finish">운동 종료</button></div><h2>${escapeHtml(exercise.name)}</h2></section>
    <section class="target-card"><div class="section-head"><span class="set-position">${guide.currentComplete ? '계획 세트 완료' : `${sets.length + 1}세트 준비`}</span><button class="text-button" data-action="edit-exercise">목표 변경 ${icon('edit')}</button></div><div class="target-metrics"><div><span>중량</span><strong>${exercise.weight}<small>kg</small></strong></div><div><span>목표 횟수</span><strong>${exercise.target}<small>회</small></strong></div></div><div class="target-footer"><span>${equipmentText(exercise.kind)}</span>${exercise.plannedSets ? `<b>${Math.min(sets.length, exercise.plannedSets)} / ${exercise.plannedSets}세트</b>` : `<b>${sets.length}세트 기록</b>`}</div>${exercise.plannedSets ? progress(sets.length, exercise.plannedSets) : ''}</section>
    ${rest ? `<p id="rest-timer" class="rest-timer ${rest.ready ? 'ready' : ''}" role="timer" data-since="${restSince}" data-target="${restTarget ?? ''}">${rest.text}</p>` : ''}
    ${suggestion ? `<section class="completion-card progression-card"><span class="complete-mark">${icon('up')}</span><div><strong>오늘은 ${suggestion.weight}kg 도전?</strong><p>지난번 ${suggestion.base}kg로 ${suggestion.sets}세트를 ${suggestion.reps}회 이상 해냈어요.</p></div><button class="button primary full" data-action="apply-progression">${suggestion.weight}kg로 올리기 ${icon('arrow')}</button><button class="text-button quiet full" data-action="dismiss-progression">이번엔 ${exercise.weight}kg 유지</button></section>` : ''}
    ${noticeMarkup()}
    ${guide.currentComplete ? `<section class="completion-card"><span class="complete-mark">${icon('check')}</span><div><strong>${guide.allComplete ? '오늘의 루틴을 모두 채웠어요.' : '이 종목의 계획을 채웠어요.'}</strong><p>${guide.allComplete ? '기록을 저장하고 운동을 마무리하세요.' : '다음 종목도 나의 페이스로 이어가세요.'}</p></div>${guide.next ? `<button class="button primary full" data-action="choose-routine-exercise" data-id="${escapeHtml(guide.next.id)}">다음 · ${escapeHtml(guide.next.name)} ${icon('arrow')}</button>` : '<button class="button primary full" data-action="finish">운동 마무리하기</button>'}<button class="text-button quiet full" data-action="manual-set">추가 세트 기록</button></section>` : `<div class="record-actions"><button class="button primary record-button" data-action="open-dictation">${icon('mic')} 받아쓰기로 기록</button><button class="button secondary" data-action="manual-set">${icon('edit')} 직접 입력</button><p class="hint">누른 뒤 iPhone 키보드 마이크로 말해주세요.</p></div>`}
    <div class="section-head"><h3>이번 종목 기록</h3><span class="muted small">${sets.length}세트</span></div>
    ${sets.length ? `<div class="set-list"><div class="set-table-head"><span>세트</span><span>중량 × 횟수</span><span></span></div>${sets.map((item, index) => `<div class="set-row"><span class="number">${String(index + 1).padStart(2, '0')}</span><span class="metric">${item.weight}<small>kg</small> <span class="muted">×</span> ${item.reps}<small>회</small></span><button class="text-button" data-action="edit-set" data-id="${escapeHtml(item.id)}" aria-label="${index + 1}세트 수정">${icon('edit')}</button></div>`).join('')}</div>` : '<div class="empty compact"><p>첫 세트를 마치고 기록해보세요.</p></div>'}
    ${session.routineName ? `<details class="card routine-guide"><summary><span>전체 운동 순서 <small>${guide.completedSets}/${guide.totalSets}세트 완료</small></span></summary><div class="routine-steps">${session.exercises.map((item, index) => { const count = setsFor(item).length; const done = item.plannedSets && count >= item.plannedSets; const current = item.id === exercise.id; return `<button type="button" class="routine-step ${current ? 'current' : ''} ${done ? 'complete' : ''}" ${current ? 'aria-current="step"' : ''} data-action="choose-routine-exercise" data-id="${escapeHtml(item.id)}"><span>${done ? icon('check') : index + 1}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.weight}kg · ${item.target}회 · ${item.plannedSets ? `${count}/${item.plannedSets}` : count}세트</small></span>${current ? '<b>현재</b>' : icon('arrow')}</button>`; }).join('')}</div></details>` : '<button class="button secondary full" data-action="setup-new">다른 종목 추가</button>'}
    ${previousSets.length ? `<details class="help-details"><summary>지난번에는 이렇게 했어요</summary><p class="hint">${previousSets.map(item => `${item.weight}kg × ${item.reps}회`).join(' / ')}</p></details>` : ''}`;
}
function renderRoutines() {
  return `<section class="screen-head"><span class="eyebrow">MY ROUTINES</span><div class="section-head"><h2>나의 루틴</h2><button class="button compact-button primary" data-action="new-routine">${icon('plus')} 만들기</button></div><p>자주 하는 운동을 순서대로 준비해두세요.</p></section>${noticeMarkup()}
    ${data.routines.length ? data.routines.map(routine => `<section class="card routine-library-card"><div class="section-head"><span class="eyebrow">${routine.exercises.length}개 종목 · ${planSets(routine)}세트</span><button class="icon-button" data-action="edit-routine" data-id="${escapeHtml(routine.id)}" aria-label="${escapeHtml(routine.title)} 루틴 수정">${icon('edit')}</button></div><h3>${escapeHtml(routine.title)}</h3><p class="routine-names">${routine.exercises.map(item => escapeHtml(item.name)).join(' · ')}</p><div class="library-actions"><button class="text-button" data-action="use-routine" data-id="${escapeHtml(routine.id)}">오늘 이 루틴 선택 ${icon('arrow')}</button><details class="routine-more"><summary aria-label="${escapeHtml(routine.title)} 더 보기">•••</summary><button class="text-button danger" data-action="delete-routine" data-id="${escapeHtml(routine.id)}">루틴 삭제</button></details></div></section>`).join('') : `<section class="empty welcome-empty"><span class="empty-symbol">${icon('plus')}</span><h3>내 운동의 순서를 만들어보세요.</h3><p>운동명, 중량, 횟수, 세트 수를 저장하면<br>운동할 때 하나씩 안내해드려요.</p><button class="button primary full" data-action="new-routine">첫 루틴 만들기</button></section>`}`;
}
function renderHistory() {
  const session = historySessionId && data.sessions.find(item => item.id === historySessionId);
  if (session) {
    return `<button class="text-button back-button" data-action="history-back">← 기록 목록</button><section class="screen-head"><span class="eyebrow">${dateText(session.startedAt)}</span><h2>${escapeHtml(session.routineName ?? '운동 상세')}</h2><p>${session.endedAt ? '완료한 운동' : '진행 중인 운동'} · ${session.exercises.reduce((n, item) => n + setsFor(item).length, 0)}세트</p><p class="swipe-hint">세트 기록을 왼쪽으로 밀면 삭제 버튼이 보여요.</p><button class="text-button danger" data-action="delete-session" data-id="${escapeHtml(session.id)}">이 운동 기록 삭제</button></section>${noticeMarkup()}
      ${session.exercises.map(exercise => `<section class="card history-group"><div class="section-head"><h3>${escapeHtml(exercise.name)}</h3><span class="set-badge">${setsFor(exercise).length}세트</span></div>${setsFor(exercise).map((item, index) => `<div class="swipe-row set-swipe" data-swipe-row role="group" aria-label="왼쪽으로 밀어 세트 기록 삭제"><div class="swipe-content"><div class="set-row"><span class="number">${String(index + 1).padStart(2, '0')}</span><span class="metric">${item.weight}<small>kg</small> × ${item.reps}<small>회</small></span><button class="text-button" data-action="edit-set" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(exercise.name)} ${index + 1}세트 수정">${icon('edit')}</button></div></div><button class="swipe-delete" data-action="delete-set-record" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(exercise.name)} ${index + 1}세트 기록 삭제">삭제</button></div>`).join('') || '<p class="muted small">기록한 세트가 없습니다.</p>'}</section>`).join('')}`;
  }
  const sessions = data.sessions.filter(item => item.exercises.some(exercise => setsFor(exercise).length));
  const total = sessions.reduce((n, session) => n + session.exercises.reduce((sum, exercise) => sum + setsFor(exercise).length, 0), 0);
  const trends = oneRepMaxTrends(data.sessions);
  return `<section class="screen-head"><span class="eyebrow">MY JOURNAL</span><h2>쌓여가는 나의 운동</h2><p>한 세트씩, 꾸준히 남긴 기록이에요.</p>${sessions.length ? '<p class="swipe-hint">운동 기록을 왼쪽으로 밀면 삭제 버튼이 보여요.</p>' : ''}</section><div class="journal-stats"><div><b>${sessions.length}</b><span>기록한 운동</span></div><div><b>${total}</b><span>누적 세트</span></div></div>${noticeMarkup()}
    ${trends.length ? `<div class="section-head"><h3>종목별 추정 1RM</h3><span class="muted small">${trends.length}종목</span></div><div class="history-list">${trends.slice(0, 4).map(recordRow).join('')}</div>${trends.length > 4 ? `<details class="help-details records-more"><summary>나머지 ${trends.length - 4}개 종목</summary><div class="history-list">${trends.slice(4).map(recordRow).join('')}</div></details>` : ''}<p class="hint">추정 1RM = 중량 × (1 + 횟수 ÷ 30). 같은 종목·장비끼리 비교해요.</p><div class="section-head"><h3>운동 회차</h3></div>` : ''}
    ${sessions.length ? `<div class="history-list">${sessions.map(session => sessionCard(session, { deletable: true })).join('')}</div>` : '<div class="empty"><h3>아직 기록이 없어요.</h3><p>오늘의 첫 운동부터 남겨보세요.</p><button class="button primary" data-view="home">운동하러 가기</button></div>'}
    <details class="card backup-panel"><summary>내 기록 내보내기 · 복원 · 초기화</summary><p class="hint">루틴과 기록은 이 기기에 저장됩니다. CSV는 조회용이고 JSON은 루틴까지 복원하는 백업입니다.</p><div class="backup-actions"><button class="button secondary" data-action="export-csv">CSV로 내려받기</button><button class="button secondary" data-action="export">JSON 백업 내보내기</button><button class="text-button quiet" data-action="import">JSON 백업 복원</button></div><p class="small muted">마지막 JSON 백업 시도: ${data.lastBackupAt ? dateText(data.lastBackupAt) : '없음'}</p><div class="history-reset"><p class="small muted">운동 세트 기록과 진행 중인 운동을 지웁니다. 저장된 루틴은 유지됩니다.</p><button class="button secondary danger full" data-action="clear-history" ${data.sessions.length ? '' : 'disabled'}>전체 운동 기록 삭제</button></div></details>`;
}

function render() {
  renderHeader();
  if (fatalError) { main.innerHTML = htmlNotice('error', `저장된 기록을 읽지 못했습니다: ${fatalError.message}`); return; }
  main.dataset.view = view;
  main.innerHTML = view === 'setup' ? renderSetup() : view === 'active' ? renderActive() : view === 'history' ? renderHistory() : view === 'routines' ? renderRoutines() : renderHome();
}

function go(next) {
  notice = null;
  lastCanceledSetId = null;
  view = next;
  if (next !== 'history') historySessionId = null;
  render();
  window.scrollTo(0, 0);
}

function openSetDialog(setId = '') {
  const set = data.sessions.flatMap(item => item.exercises).flatMap(item => item.sets).find(item => item.id === setId);
  dialog.dataset.setId = set?.id ?? '';
  document.getElementById('set-dialog-title').textContent = set ? '세트 기록 수정' : '세트 직접 입력';
  document.getElementById('set-delete').hidden = !set;
  document.getElementById('set-error').hidden = true;
  document.getElementById('set-weight').value = set?.weight ?? activeExercise()?.weight ?? 0;
  document.getElementById('set-reps').value = set?.reps ?? '';
  dialog.showModal();
  document.getElementById('set-reps').focus();
}

// Checked against the data before the set is added, so the new set never competes with itself.
function savedNotice(exercise, { weight, reps }) {
  const record = exercise && findRecord(data.sessions, exercise, data.activeSessionId, { weight, reps });
  return { kind: 'success', text: `${weight}kg × ${reps}회 저장됨${record ? ` · 🏆 ${exercise.name} 신기록! 추정 1RM ${record.value}kg (이전 ${record.previous}kg)` : ''}` };
}

async function saveVoiceResult(candidate, context) {
  if (data.activeSessionId !== context.sessionId || data.activeExerciseId !== context.exerciseId) throw new Error('운동이 바뀌어 음성 결과를 저장하지 않았습니다.');
  const next = addSet(data, context.sessionId, context.exerciseId, { id: id(), inputId: context.inputId, reps: candidate.reps, weight: candidate.weight, source: 'voice', at: new Date().toISOString() });
  const saved = savedNotice(activeExercise(), candidate);
  await commit(next);
  lastCanceledSetId = null;
  notice = saved;
  render();
}

const dictationDialog = document.getElementById('dictation-dialog');
const dictationText = document.getElementById('dictation-text');
const dictationFeedback = document.getElementById('dictation-feedback');
const dictationSave = document.getElementById('dictation-save');
const dictationCheck = document.getElementById('dictation-check');
const dictationCancel = document.getElementById('dictation-cancel');
const routineDialog = document.getElementById('routine-dialog');
const routineForm = document.getElementById('routine-form');
const routineExerciseList = document.getElementById('routine-exercises');
let editingRoutineId = null;

function clearDictationPreview() {
  dictationPreview = null;
  dictationSave.hidden = true;
  dictationFeedback.hidden = true;
  dictationFeedback.textContent = '';
}

function openDictation() {
  const exercise = activeExercise();
  if (!exercise || dictationSaving) return;
  dictationContext = { sessionId: data.activeSessionId, exerciseId: exercise.id, weight: exercise.weight, inputId: id() };
  dictationText.value = '';
  clearDictationPreview();
  document.getElementById('dictation-weight-hint').textContent = `“20회”처럼 횟수만 말하면 현재 설정 ${exercise.weight}kg을 사용합니다.`;
  dictationDialog.showModal();
  // Keep focus synchronous with the tap so iPhone can display its text keyboard.
  dictationText.focus();
}

dictationText.addEventListener('input', clearDictationPreview);
dictationCancel.addEventListener('click', () => { if (!dictationSaving) dictationDialog.close(); });
dictationDialog.addEventListener('cancel', event => { if (dictationSaving) event.preventDefault(); });
dictationDialog.addEventListener('close', () => { dictationContext = null; clearDictationPreview(); });
document.getElementById('dictation-form').addEventListener('submit', event => {
  event.preventDefault();
  if (dictationSaving || !dictationContext || event.isComposing) return;
  dictationPreview = previewDictation(dictationText.value, dictationContext);
  const valid = dictationPreview.status === 'ok';
  dictationFeedback.className = `notice ${valid ? 'info' : 'warning'}`;
  dictationFeedback.textContent = valid
    ? `${dictationPreview.candidate.weight}kg × ${dictationPreview.candidate.reps}회로 기록할까요?`
    : '중량과 횟수를 확인하지 못했어요. 문장을 “70킬로 20회” 또는 “20회”처럼 수정한 뒤 다시 확인해주세요.';
  dictationFeedback.hidden = false;
  dictationSave.hidden = !valid;
  if (valid) { dictationText.blur(); dictationSave.focus(); }
});
dictationSave.addEventListener('click', async () => {
  if (dictationSaving) return;
  try {
    const result = confirmDictation(dictationPreview, dictationText.value, { sessionId: data.activeSessionId, exerciseId: data.activeExerciseId });
    dictationSaving = true;
    dictationText.disabled = dictationSave.disabled = dictationCheck.disabled = dictationCancel.disabled = true;
    await saveVoiceResult(result.candidate, result.context);
    dictationDialog.close();
  } catch (error) {
    dictationFeedback.className = 'notice error';
    dictationFeedback.textContent = error.message;
    dictationFeedback.hidden = false;
  } finally {
    dictationSaving = false;
    dictationText.disabled = dictationSave.disabled = dictationCheck.disabled = dictationCancel.disabled = false;
  }
});

function routineExerciseRow(item = {}, index = routineExerciseList.children.length) {
  const rowId = item.id ?? id();
  return `<div class="routine-exercise" data-routine-item="${escapeHtml(rowId)}">
    <div class="section-head"><strong class="routine-row-heading">운동 ${String(index + 1).padStart(2, '0')}</strong><div class="row-tools"><button type="button" class="icon-button" data-action="routine-up" aria-label="이 운동 위로 이동">↑</button><button type="button" class="icon-button" data-action="routine-down" aria-label="이 운동 아래로 이동">↓</button><button type="button" class="text-button danger" data-action="remove-routine-exercise">삭제</button></div></div>
    <label class="field">운동 이름<input data-field="name" maxlength="60" required placeholder="예: 바벨 스쿼트" value="${escapeHtml(item.name ?? '')}"></label>
    <label class="field">장비<select data-field="kind"><option value="machine" ${!item.kind || item.kind === 'machine' ? 'selected' : ''}>머신 · 표시 중량</option><option value="barbell" ${item.kind === 'barbell' ? 'selected' : ''}>바벨 · 바 포함 총중량</option><option value="dumbbell" ${item.kind === 'dumbbell' ? 'selected' : ''}>덤벨 · 한 손 중량</option></select></label>
    <div class="routine-values"><label>중량 · kg<input data-field="weight" type="number" inputmode="decimal" min="0" max="2000" step="0.5" required value="${item.weight ?? 20}"></label><label>목표 횟수<input data-field="target" type="number" inputmode="numeric" min="1" max="999" step="1" required value="${item.target ?? 15}"></label><label>세트 수<input data-field="plannedSets" type="number" inputmode="numeric" min="1" max="99" step="1" required value="${item.plannedSets ?? 4}"></label></div>
  </div>`;
}

function openRoutineDialog(routine = null) {
  editingRoutineId = routine?.id ?? null;
  document.getElementById('routine-title').textContent = routine ? '루틴 수정' : '새 운동 루틴';
  routineForm.elements.title.value = routine?.title ?? '';
  routineExerciseList.innerHTML = (routine?.exercises ?? [{}]).map(routineExerciseRow).join('');
  document.getElementById('routine-error').hidden = true;
  updateRoutineRows();
  routineDialog.showModal();
  routineForm.elements.title.focus();
}

document.getElementById('add-routine-exercise').addEventListener('click', () => {
  routineExerciseList.insertAdjacentHTML('beforeend', routineExerciseRow());
  updateRoutineRows();
  routineExerciseList.lastElementChild.querySelector('[data-field="name"]').focus();
});
document.getElementById('routine-cancel').addEventListener('click', () => routineDialog.close());
function updateRoutineRows() {
  [...routineExerciseList.children].forEach((row, index, rows) => {
    row.querySelector('.routine-row-heading').textContent = `운동 ${String(index + 1).padStart(2, '0')}`;
    row.querySelector('[data-action="routine-up"]').disabled = index === 0;
    row.querySelector('[data-action="routine-down"]').disabled = index === rows.length - 1;
  });
}
routineExerciseList.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  const row = button?.closest('.routine-exercise');
  if (!row) return;
  if (button.dataset.action === 'routine-up' && row.previousElementSibling) row.previousElementSibling.before(row);
  if (button.dataset.action === 'routine-down' && row.nextElementSibling) row.nextElementSibling.after(row);
  if (button.dataset.action === 'remove-routine-exercise') {
    if (routineExerciseList.children.length <= 1) { document.getElementById('routine-error').textContent = '운동을 하나 이상 등록해주세요.'; document.getElementById('routine-error').hidden = false; return; }
    row.remove();
  }
  updateRoutineRows();
});
routineForm.addEventListener('submit', async event => {
  event.preventDefault();
  const error = document.getElementById('routine-error');
  try {
    const exercises = [...routineExerciseList.querySelectorAll('.routine-exercise')].map(row => ({
      id: row.dataset.routineItem,
      name: row.querySelector('[data-field="name"]').value,
      kind: row.querySelector('[data-field="kind"]').value,
      weight: Number(row.querySelector('[data-field="weight"]').value),
      target: Number(row.querySelector('[data-field="target"]').value),
      plannedSets: Number(row.querySelector('[data-field="plannedSets"]').value),
    }));
    const next = saveRoutine(data, { id: editingRoutineId ?? id(), title: routineForm.elements.title.value, exercises });
    selectedRoutineId = next.selectedRoutineId;
    await commit(next);
    routineDialog.close();
    view = 'home';
    render();
  } catch (cause) { error.textContent = cause.message; error.hidden = false; }
});

let swipeGesture = null;
let suppressSwipeClickUntil = 0;
function setSwipeOpen(row, open) {
  row.classList.toggle('is-open', open);
  row.querySelector('.swipe-content').setAttribute('aria-expanded', String(open));
}
document.addEventListener('pointerdown', event => {
  const row = event.target.closest('[data-swipe-row]');
  document.querySelectorAll('[data-swipe-row].is-open').forEach(openRow => { if (openRow !== row) setSwipeOpen(openRow, false); });
  swipeGesture = row ? { row, pointerId: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false } : null;
});
document.addEventListener('pointermove', event => {
  const gesture = swipeGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  if (!gesture.horizontal && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.25) gesture.horizontal = true;
  if (gesture.horizontal) event.preventDefault();
}, { passive: false });
document.addEventListener('pointerup', event => {
  const gesture = swipeGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const dx = event.clientX - gesture.x;
  if (gesture.horizontal && Math.abs(dx) > 48) {
    setSwipeOpen(gesture.row, dx < 0);
    suppressSwipeClickUntil = Date.now() + 350;
  }
  swipeGesture = null;
});
document.addEventListener('pointercancel', () => { swipeGesture = null; });
document.addEventListener('click', async event => {
  if (Date.now() < suppressSwipeClickUntil && event.target.closest('[data-swipe-row]')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  const button = event.target.closest('button[data-action],button[data-view]');
  if (!button || fatalError) return;
  if (button.dataset.view) { go(button.dataset.view); return; }
  const action = button.dataset.action;
  try {
    if (action === 'manage-routines') go('routines');
    else if (action === 'choose-today-routine' || action === 'use-routine') { selectedRoutineId = button.dataset.id; await commit(selectRoutine(data, selectedRoutineId)); if (action === 'use-routine') go('home'); }
    else if (action === 'new-routine') openRoutineDialog();
    else if (action === 'edit-routine') openRoutineDialog(data.routines.find(item => item.id === button.dataset.id));
    else if (action === 'delete-routine') { if (window.confirm('이 루틴을 삭제할까요? 운동 기록은 삭제되지 않습니다.')) { selectedRoutineId = data.routines.find(item => item.id !== button.dataset.id)?.id ?? null; await commit(removeRoutine(data, button.dataset.id)); selectedRoutineId = data.selectedRoutineId; render(); } }
    else if (action === 'back-home') go('home');
    else if (action === 'start-routine') {
      if (activeSession()) throw new Error('진행 중인 운동을 먼저 마쳐주세요.');
      const routineId = selectedRoutineId ?? data.selectedRoutineId;
      view = 'active';
      historySessionId = null;
      await commit(startRoutine(data, routineId, id(), new Date().toISOString(), id));
    }
    else if (action === 'choose-routine-exercise') { notice = null; view = 'active'; await commit(chooseSessionExercise(data, button.dataset.id)); window.scrollTo(0, 0); }
    else if (action === 'setup-new') { editingExerciseId = null; go('setup'); }
    else if (action === 'resume') go('active');
    else if (action === 'back') go(activeExercise() ? 'active' : 'home');
    else if (action === 'edit-exercise') { editingExerciseId = data.activeExerciseId; go('setup'); }
    else if (action === 'apply-progression') {
      // Recompute from stored data instead of trusting a weight rendered into the page.
      const exercise = activeExercise();
      const suggestion = exercise && suggestProgression(findPreviousExercise(data.sessions, exercise, data.activeSessionId), exercise);
      if (!suggestion) return;
      await commit(setExercise(data, data.activeSessionId, { id: exercise.id, name: exercise.name, kind: exercise.kind, weight: suggestion.weight, target: exercise.target }));
      lastCanceledSetId = null;
      notice ={ kind: 'success', text: `목표 중량을 ${suggestion.weight}kg로 올렸어요.` };
      render();
    }
    else if (action === 'dismiss-progression') { dismissedProgression.add(data.activeExerciseId); render(); }
    else if (action === 'open-dictation') openDictation();
    else if (action === 'manual-set') openSetDialog();
    else if (action === 'edit-set') openSetDialog(button.dataset.id);
    else if (action === 'finish') { const guide = workoutGuide(activeSession(), data.activeExerciseId); if (guide.totalSets > guide.completedSets && !window.confirm(`계획보다 ${guide.totalSets - guide.completedSets}세트 적게 기록했어요. 현재 기록으로 운동을 마칠까요?`)) return; await commit(finishSession(data, data.activeSessionId, new Date().toISOString())); go('history'); }
    else if (action === 'history-detail') { historySessionId = button.dataset.id; go('history'); historySessionId = button.dataset.id; render(); }
    else if (action === 'history-back') { historySessionId = null; render(); }
    else if (action === 'delete-set-record') {
      const set = data.sessions.flatMap(item => item.exercises).flatMap(item => item.sets).find(item => item.id === button.dataset.id);
      if (!set || !window.confirm(`${set.weight}kg × ${set.reps}회 세트 기록을 영구 삭제할까요?`)) return;
      await commit(deleteSetRecord(data, button.dataset.id));
      notice = { kind: 'success', text: '세트 기록을 삭제했습니다.' };
      render();
    }
    else if (action === 'delete-session') {
      const session = data.sessions.find(item => item.id === button.dataset.id);
      if (!session) return;
      const count = session.exercises.reduce((sum, exercise) => sum + setsFor(exercise).length, 0);
      const label = session.routineName ?? session.exercises[0]?.name ?? '운동';
      const active = session.id === data.activeSessionId;
      if (!window.confirm(`${label} 기록과 포함된 세트 ${count}개를 영구 삭제할까요?${active ? '\n진행 중인 운동도 종료됩니다.' : ''}`)) return;
      await commit(deleteSession(data, session.id));
      historySessionId = null;
      notice = { kind: 'success', text: `${label} 운동 기록을 삭제했습니다.` };
      render();
    }
    else if (action === 'clear-history') {
      const count = data.sessions.reduce((sum, session) => sum + session.exercises.reduce((subtotal, exercise) => subtotal + setsFor(exercise).length, 0), 0);
      if (!window.confirm(`운동 기록 ${data.sessions.length}회와 세트 ${count}개를 모두 영구 삭제할까요?\n저장된 루틴은 유지됩니다. 삭제 전에 JSON 백업을 권장합니다.`)) return;
      await commit(clearSessionHistory(data));
      historySessionId = null;
      lastCanceledSetId = null;
      notice = { kind: 'success', text: '모든 운동 기록을 삭제했습니다. 저장된 루틴은 그대로 있습니다.' };
      render();
    }
    else if (action === 'cancel-set') { await commit(cancelSet(data, button.dataset.id)); lastCanceledSetId = button.dataset.id; notice = { kind: 'info', text: '세트 기록을 취소했습니다.' }; render(); }
    else if (action === 'restore-set') { await commit(restoreSet(data, button.dataset.id)); lastCanceledSetId = null; notice = { kind: 'success', text: '세트 기록을 되돌렸습니다.' }; render(); }
    else if (action === 'export' || action === 'export-csv') {
      const csv = action === 'export-csv';
      const contents = csv ? exportWorkoutCsv(data) : JSON.stringify(data, null, 2);
      const url = URL.createObjectURL(new Blob([contents], { type: csv ? 'text/csv;charset=utf-8' : 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `voice-fitness-${new Date().toISOString().slice(0, 10)}.${csv ? 'csv' : 'json'}`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (!csv) await commit({ ...data, lastBackupAt: new Date().toISOString() });
      notice = { kind: 'info', text: `${csv ? 'CSV' : 'JSON 백업'} 파일 내보내기를 시작했습니다. iPhone 파일 앱에 저장됐는지 확인하세요.` }; render();
    }
    else if (action === 'import') backupInput.click();
  } catch (error) { report(error); }
});

document.addEventListener('change', async event => {
  if (event.target.id !== 'today-routine' || !event.target.value) return;
  try {
    selectedRoutineId = event.target.value;
    await commit(selectRoutine(data, event.target.value));
  } catch (error) { report(error); }
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'exercise-form') return;
  event.preventDefault();
  const form = new FormData(event.target);
  const name = String(form.get('name') ?? '').trim();
  const weight = Number(form.get('weight'));
  const target = Number(form.get('target'));
  const kind = String(form.get('kind'));
  if (!name || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(target) || target < 1) { report(new Error('운동 이름, 중량, 목표 횟수를 확인해주세요.')); return; }
  try {
    let next = data;
    let sessionId = data.activeSessionId;
    if (!sessionId) { sessionId = id(); next = startSession(next, sessionId, new Date().toISOString()); }
    next = setExercise(next, sessionId, { id: editingExerciseId ?? id(), name, kind, weight, target });
    await commit(next);
    editingExerciseId = null;
    go('active');
  } catch (error) { report(error); }
});

document.getElementById('set-cancel').addEventListener('click', () => dialog.close());
document.getElementById('set-delete').addEventListener('click', async () => {
  try {
    const setId = dialog.dataset.setId;
    if (!setId) return;
    await commit(cancelSet(data, setId));
    dialog.close();
    lastCanceledSetId = setId;
    notice = { kind: 'info', text: '세트 기록을 취소했습니다.' };
    render();
  } catch (error) { report(error); }
});
document.getElementById('set-form').addEventListener('submit', async event => {
  event.preventDefault();
  const weight = Number(document.getElementById('set-weight').value);
  const rawReps = document.getElementById('set-reps').value;
  const reps = Number(rawReps);
  const inlineError = document.getElementById('set-error');
  if (!rawReps || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 0) { inlineError.textContent = '중량과 실제 횟수를 확인해주세요.'; inlineError.hidden = false; return; }
  try {
    const setId = dialog.dataset.setId;
    const next = setId ? updateSet(data, setId, { weight, reps }) : addSet(data, data.activeSessionId, data.activeExerciseId, { id: id(), inputId: id(), weight, reps, source: 'manual', at: new Date().toISOString() });
    // Edits are corrections, so only newly added sets can announce a record.
    const saved = setId ? { kind: 'success', text: `${weight}kg × ${reps}회 수정됨` } : savedNotice(activeExercise(), { weight, reps });
    await commit(next);
    dialog.close();
    lastCanceledSetId = null;
    notice = saved;
    render();
  } catch (error) { inlineError.textContent = error.message; inlineError.hidden = false; }
});

backupInput.addEventListener('change', async () => {
  const file = backupInput.files?.[0];
  backupInput.value = '';
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('5MB 이하의 기록 파일을 선택해주세요.');
    const imported = validateBackup(JSON.parse(await file.text()));
    const count = imported.sessions.reduce((n, item) => n + item.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0), 0);
    if (!window.confirm(`${imported.routines.length}개 루틴과 ${count}개 세트가 포함된 백업입니다. 현재 기기의 루틴과 기록을 이 파일로 교체할까요?`)) return;
    selectedRoutineId = imported.selectedRoutineId ?? imported.routines[0]?.id ?? null;
    await commit(imported);
    historySessionId = null;
    notice = { kind: 'success', text: `${count}개 세트를 복원했습니다.` };
    render();
  } catch (error) { report(error); }
});

// Preserve text, focus and preview when iOS switches keyboard modes or connectivity.
window.addEventListener('online', renderHeader);
window.addEventListener('offline', renderHeader);

// Only the timer text changes each second; a full render would reset scroll and focus.
setInterval(() => {
  const timer = document.getElementById('rest-timer');
  if (!timer) return;
  const rest = restText(Number(timer.dataset.since), timer.dataset.target ? Number(timer.dataset.target) : null, Date.now());
  if (!rest) { timer.remove(); return; }
  timer.textContent = rest.text;
  timer.classList.toggle('ready', rest.ready);
}, 1000);

async function boot() {
  try {
    data = await loadData();
    selectedRoutineId = data.selectedRoutineId ?? data.routines[0]?.id ?? null;
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) navigator.storage.persist().catch(() => {});
    render();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => registration.update().catch(() => {})).catch(() => {});
  } catch (error) { fatalError = error; render(); }
}
boot();
