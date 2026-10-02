import { emptyData, startSession, startRoutine, chooseSessionExercise, saveRoutine, removeRoutine, selectRoutine, setExercise, addSet, updateSet, cancelSet, restoreSet, deleteSetRecord, deleteSession, clearSessionHistory, finishSession, validateBackup, routineDraftFromSession } from './domain.mjs';
import { loadData, saveData, loadNasBackup, saveNasBackup } from './db.mjs';
import { previewDictation, confirmDictation, lastSetOf } from './dictation.mjs';
import { exportWorkoutCsv } from './csv.mjs';
import { workoutGuide, routineLastDone, nextRoutine, daysAgo } from './workout-guide.mjs';
import { findPreviousExercise, suggestProgression } from './progression.mjs';
import { findRecord, oneRepMaxTrends, sparklinePoints, referenceOneRepMax, intensityOf } from './records.mjs';
import { typicalRest, lastSetTime, restText } from './rest.mjs';
import { platesFor, plateText } from './plates.mjs';
import { icon } from './icons.mjs';
import { activityCalendar, weeklyVolume } from './activity.mjs';
import { sha256Hex, shouldSend, sendBackup, listBackups, fetchBackup, errorText } from './nas-backup.mjs';

const main = document.getElementById('app-main');
const dialog = document.getElementById('set-dialog');
const backupInput = document.getElementById('backup-file');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateText = iso => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
const dateTimeText = iso => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const id = () => crypto.randomUUID();

let data = emptyData();
let view = 'home';
let historySessionId = null;
let editingExerciseId = null;
let selectedRoutineId = null;
let dictationContext = null;
let dictationPreview = null;
let dictationSaving = false;
let repeatSaving = false;
let fatalError = null;
// NAS backup settings and status; stored under their own key, never inside data.
let nas = {};
let nasBusy = false;
let nasList = null;
let nasTimer = null;
let backupPanelOpen = false;
// Kept in memory only so declining a suggestion never changes the stored data format.
const dismissedProgression = new Set();

const activeSession = () => data.sessions.find(item => item.id === data.activeSessionId && !item.endedAt);
const activeExercise = () => activeSession()?.exercises.find(item => item.id === data.activeExerciseId);
const setsFor = exercise => exercise.sets.filter(item => !item.canceledAt);
async function commit(next) {
  const valid = validateBackup(next);
  await saveData(valid);
  data = valid;
  render();
  scheduleNasBackup();
}

// Results are announced in a toast region outside <main>, so re-rendering a screen never replays or drops them.
const toastRegion = document.getElementById('toast-region');
const toastIcons = { success: 'circle-check', info: 'info', warning: 'triangle-alert', error: 'triangle-alert' };
function dismissToast(item) {
  if (!item?.isConnected) return;
  item.classList.add('leaving');
  setTimeout(() => item.remove(), 200);
}
function toast({ kind = 'success', text = '', html = '', action = '' }) {
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  item.innerHTML = `<span class="toast-icon">${icon(toastIcons[kind])}</span><div class="toast-body">${html || escapeHtml(text)}</div>${action}<button type="button" class="icon-button toast-close" data-toast-close aria-label="알림 닫기">${icon('x')}</button>`;
  toastRegion.append(item);
  while (toastRegion.children.length > 3) toastRegion.firstElementChild.remove();
  // Errors stay until closed; an undo action needs more reading time than a plain result.
  if (kind !== 'error') setTimeout(() => dismissToast(item), action ? 7000 : 4000);
}
toastRegion.addEventListener('click', event => {
  if (event.target.closest('[data-toast-close]')) dismissToast(event.target.closest('.toast'));
});

function report(error) {
  toast({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
}

const confirmDialog = document.getElementById('confirm-dialog');
confirmDialog.addEventListener('click', event => { if (event.target === confirmDialog) confirmDialog.close('cancel'); });
// Resolves true only for an explicit confirm; Escape, backdrop and Cancel all resolve false.
function confirmAction({ title, message, confirmLabel, danger = true }) {
  return new Promise(resolve => {
    const opener = document.activeElement;
    confirmDialog.classList.toggle('is-danger', danger);
    confirmDialog.querySelector('.confirm-icon').innerHTML = icon(danger ? 'triangle-alert' : 'info', { size: 24 });
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const ok = document.getElementById('confirm-ok');
    ok.className = `button ${danger ? 'danger-solid' : 'primary'}`;
    ok.innerHTML = `${danger ? icon('trash-2') : ''}<span>${escapeHtml(confirmLabel)}</span>`;
    confirmDialog.returnValue = '';
    confirmDialog.addEventListener('close', () => {
      if (opener?.isConnected) opener.focus();
      resolve(confirmDialog.returnValue === 'ok');
    }, { once: true });
    confirmDialog.showModal();
    document.getElementById('confirm-cancel').focus();
  });
}

const planSets = routine => routine.exercises.reduce((n, item) => n + (item.plannedSets ?? 0), 0);
const kindLabel = { barbell: '바벨', dumbbell: '덤벨 한 손', machine: '머신' };
const selection = () => data.routines.find(item => item.id === selectedRoutineId) ?? data.routines.find(item => item.id === data.selectedRoutineId) ?? data.routines[0];
const agoText = iso => { const days = daysAgo(iso); return days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`; };
const shortDate = iso => new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(iso));
const sessionLabel = session => session.routineName ?? session.exercises[0]?.name ?? '자유 운동';
const sessionSetCount = session => session.exercises.reduce((n, item) => n + setsFor(item).length, 0);
const progress = (value, total, label = '계획 세트 진행') => `<progress class="progress" aria-label="${label}" max="${total || 1}" value="${Math.min(value, total)}"></progress>`;
// Every status badge carries text, and an icon where it helps, so meaning never depends on color alone.
const badge = (kind, iconName, text) => `<span class="badge badge-${kind}">${iconName ? icon(iconName, { size: 16 }) : ''}<span>${text}</span></span>`;
const pageHead = (eyebrow, title, description = '', actions = '') => `<header class="page-head"><div class="page-head-text">${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h1 class="page-title">${title}</h1>${description ? `<p class="page-desc">${description}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
// Secondary explanations stay one tap away instead of filling the screen.
const infoToggle = (label, text) => `<details class="info-toggle"><summary aria-label="${label}">${icon('info')}</summary><p class="info-pop">${text}</p></details>`;
const kindShort = { barbell: '바벨', dumbbell: '덤벨', machine: '머신' };
const weightBasis = { barbell: '중량은 바를 포함한 총중량입니다.', dumbbell: '중량은 덤벨 한 손 무게입니다.', machine: '중량은 기구에 표시된 무게입니다.' };
const restLabel = rest => `${rest.text}${rest.ready ? ' · 다음 세트 준비' : ''}`;

function planPreview(routine) {
  return `<ol class="plan-list">${routine.exercises.map((item, index) => `<li><span class="plan-index">${index + 1}</span><span class="list-main"><strong>${escapeHtml(item.name)}</strong><span class="meta">${kindLabel[item.kind]} · ${item.weight}kg · ${item.target}회</span></span>${badge('neutral', '', `${item.plannedSets}세트`)}</li>`).join('')}</ol>`;
}
const recentItem = session => `<li><button class="list-item" data-action="history-detail" data-id="${escapeHtml(session.id)}"><span class="list-main"><strong>${escapeHtml(sessionLabel(session))}</strong><span class="meta">${shortDate(session.startedAt)} · ${sessionSetCount(session)}세트${session.endedAt ? '' : ' · 진행 중'}</span></span>${icon('arrow-right')}</button></li>`;
function sparkline(trend) {
  if (trend.points.length < 2) return '<span class="meta">첫 기록</span>';
  const points = sparklinePoints(trend.points.map(point => point.value), 96, 32);
  const [x, y] = points.at(-1);
  return `<svg class="sparkline" viewBox="0 0 96 32" width="96" height="32" role="img" aria-label="${escapeHtml(`${trend.name} 추정 1RM ${trend.points[0].value}kg에서 ${trend.latest}kg`)}"><polyline points="${points.map(point => point.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x}" cy="${y}" r="3" fill="currentColor"/></svg>`;
}
// Machines are left out: their stack numbers differ from one machine to the next, so %1RM means little.
const intensityKinds = new Set(['barbell', 'dumbbell']);
const referenceFor = (session, exercise) => (intensityKinds.has(exercise.kind) ? referenceOneRepMax(data.sessions, exercise, session) : null);
const intensityBadge = value => badge(value.tier >= 5 ? 'warning' : value.tier >= 3 ? 'primary' : 'neutral', '', `${value.percent}% ${value.label}`);
const intensityInfo = reference => infoToggle('강도 계산 방법', `강도 = 중량 ÷ 기준 1RM. 기준 1RM은 이 운동 전 기록의 최고 추정 1RM ${kgText(reference)}입니다. 50% 미만 워밍업, 50~59% 가벼움, 60~69% 보통, 70~79% 중강도, 80~89% 고강도, 90% 이상 최대. 단계는 이 앱이 정한 기준이며, 머신은 표시하지 않습니다.`);

function setTable(sets, exerciseName, { removable = false, reference = null } = {}) {
  const intensityCell = item => { const value = intensityOf(item.weight, reference); return `<td class="cell-intensity" data-label="강도">${value ? intensityBadge(value) : ''}</td>`; };
  return `<div class="set-table"><table class="data-table list-mobile"><thead><tr><th scope="col">세트</th><th scope="col">중량</th><th scope="col">횟수</th>${reference ? '<th scope="col">강도</th>' : ''}<th scope="col"><span class="sr-only">작업</span></th></tr></thead><tbody>${sets.map((item, index) => `<tr><th scope="row">${index + 1}세트</th><td>${item.weight}kg</td><td>${item.reps}회</td>${reference ? intensityCell(item) : ''}<td class="cell-actions"><button class="icon-button" data-action="edit-set" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(exerciseName)} ${index + 1}세트 수정">${icon('pencil')}</button>${removable ? `<button class="icon-button danger" data-action="delete-set-record" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(exerciseName)} ${index + 1}세트 기록 삭제">${icon('trash-2')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function sessionTable(sessions) {
  return `<table class="data-table cards-mobile session-table"><thead><tr><th scope="col">날짜</th><th scope="col">운동</th><th scope="col">종목</th><th scope="col">세트</th><th scope="col">상태</th><th scope="col"><span class="sr-only">작업</span></th></tr></thead><tbody>${sessions.map(session => {
    const label = escapeHtml(sessionLabel(session));
    return `<tr><td data-label="날짜">${shortDate(session.startedAt)}</td><th scope="row" data-label="운동"><button class="link-button" data-action="history-detail" data-id="${escapeHtml(session.id)}">${label}</button></th><td data-label="종목">${session.exercises.filter(item => setsFor(item).length).length}개</td><td data-label="세트">${sessionSetCount(session)}세트</td><td data-label="상태">${session.endedAt ? badge('success', 'circle-check', '완료') : badge('primary', 'timer', '진행 중')}</td><td class="cell-actions"><button class="icon-button" data-action="history-detail" data-id="${escapeHtml(session.id)}" aria-label="${label} 상세 보기">${icon('arrow-right')}</button><button class="icon-button danger" data-action="delete-session" data-id="${escapeHtml(session.id)}" aria-label="${label} 기록 삭제">${icon('trash-2')}</button></td></tr>`;
  }).join('')}</tbody></table>`;
}
function recordTable(trends) {
  return `<table class="data-table cards-mobile record-table"><thead><tr><th scope="col">종목</th><th scope="col">장비</th><th scope="col">추이</th><th scope="col">최근</th><th scope="col">최고</th></tr></thead><tbody>${trends.map(trend => `<tr><th scope="row" data-label="종목">${escapeHtml(trend.name)}</th><td data-label="장비">${kindLabel[trend.kind]}</td><td data-label="추이" class="cell-chart">${sparkline(trend)}</td><td data-label="최근">${trend.latest}kg</td><td data-label="최고"><strong>${trend.best}kg</strong></td></tr>`).join('')}</tbody></table>`;
}
const kgText = value => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value)}kg`;
const monthDay = key => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;
// The grid is a picture with a text summary; exact numbers live in the weekly table and cell tooltips.
function activitySection() {
  const calendar = activityCalendar(data.sessions);
  const cell = day => `<span class="heat-cell level-${day.level}${day.today ? ' today' : ''}${day.future ? ' future' : ''}"${day.future ? '' : ` title="${monthDay(day.key)} · ${day.sets ? `${day.sets}세트 · ${kgText(day.volume)}` : '운동 없음'}"`}></span>`;
  const columns = calendar.columns.map((column, index) => {
    const first = column.find(day => day.key.endsWith('-01'));
    const label = index === 0 ? column[0] : first;
    return `<div class="heat-week"><span class="heat-month">${label ? `${Number(label.key.slice(5, 7))}월` : ''}</span>${column.map(cell).join('')}</div>`;
  }).join('');
  const levels = [0, 1, 2, 3, 4].map(level => `<span class="heat-cell level-${level}"></span>`).join('');
  return `<section class="section" aria-labelledby="activity-title"><div class="section-head"><h2 id="activity-title" class="section-title">운동 잔디</h2><div class="head-tools"><span class="meta">최근 16주</span>${infoToggle('운동 잔디 기준', '하루 세트 수에 따라 진하게 칠합니다: 1~5 · 6~10 · 11~15 · 16세트 이상. 연속은 한 번이라도 운동한 주를 셉니다.')}</div></div>
    <div class="card activity-card">
      <dl class="activity-summary"><div><dt>운동한 날</dt><dd>${calendar.activeDays}<span class="unit">일</span></dd></div><div><dt>세트</dt><dd>${calendar.totalSets}</dd></div><div><dt>연속</dt><dd>${calendar.streak}<span class="unit">주</span></dd></div></dl>
      <div class="heatmap" role="img" aria-label="최근 16주 동안 ${calendar.activeDays}일 운동, 총 ${calendar.totalSets}세트, ${calendar.streak}주 연속">
        <div class="heat-days" aria-hidden="true"><span></span><span>월</span><span></span><span>수</span><span></span><span>금</span><span></span><span></span></div>
        <div class="heat-grid" aria-hidden="true">${columns}</div>
      </div>
      <div class="heat-legend"><span class="meta">적음</span>${levels}<span class="meta">많음</span></div>
    </div></section>`;
}
function volumeSection() {
  const { rows, thisWeek, change } = weeklyVolume(data.sessions);
  const max = Math.max(...rows.map(row => row.volume), 1);
  const changeText = change === null ? '<p class="meta">지난주 같은 요일까지의 기록이 없습니다.</p>'
    : `<p class="volume-change">${icon(change >= 0 ? 'arrow-up' : 'arrow-down', { size: 18 })}<span>지난주 같은 요일까지보다 ${Math.abs(change)}% ${change >= 0 ? '많음' : '적음'}</span></p>`;
  return `<section class="section" aria-labelledby="volume-title"><div class="section-head"><h2 id="volume-title" class="section-title">주간 볼륨</h2>${infoToggle('주간 볼륨 계산 방법', '볼륨은 중량 × 횟수의 합계입니다. 덤벨은 한 손 중량의 2배로 계산하고, 취소한 세트는 뺍니다.')}</div>
    <div class="card volume-card">
      <div class="volume-headline"><p class="meta">이번 주</p><p class="hero-title">${kgText(thisWeek)}</p>${changeText}</div>
      <table class="data-table volume-table"><thead><tr><th scope="col">주</th><th scope="col">운동일</th><th scope="col">세트</th><th scope="col">볼륨</th></tr></thead><tbody>${[...rows].reverse().map(row => `<tr${row.current ? ' class="current"' : ''}><th scope="row">${row.current ? '이번 주' : `${monthDay(row.start)} 주`}</th><td data-label="운동일">${row.days}일</td><td data-label="세트">${row.sets}세트</td><td class="cell-volume"><span class="volume-bar" aria-hidden="true"><span style="width: ${Math.round(row.volume / max * 100)}%"></span></span><span>${kgText(row.volume)}</span></td></tr>`).join('')}</tbody></table>
    </div></section>`;
}
// Title defaults to the routine name (or first exercise) plus the date; the dialog lets the user edit it.
const sessionRoutineDraft = session => session && routineDraftFromSession(session, `${session.routineName ?? session.exercises[0]?.name ?? '운동'} · ${new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date(session.startedAt))}`);

function renderHeader() {
  const connection = document.getElementById('connection');
  connection.innerHTML = navigator.onLine ? `${icon('circle-check', { size: 16 })}<span>기기에 저장</span>` : `${icon('triangle-alert', { size: 16 })}<span>오프라인</span>`;
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
  const recent = data.sessions.filter(item => item.exercises.some(exercise => setsFor(exercise).length)).slice(0, 3);
  const guide = workoutGuide(session, data.activeExerciseId);
  const next = session ? null : nextRoutine(data.routines, data.sessions);
  const lastDone = routine ? routineLastDone(data.routines, data.sessions).get(routine.id) : null;
  const isNext = next?.routine.id === routine?.id;
  const nextCard = next && !isNext ? `<div class="next-routine"><div class="list-main">${badge('primary', 'repeat', '다음 차례')}<strong>${escapeHtml(next.routine.title)}</strong><span class="meta">${next.lastAt ? `마지막 운동 ${agoText(next.lastAt)}` : '아직 하지 않은 루틴'}</span></div><button class="button secondary" data-action="choose-today-routine" data-id="${escapeHtml(next.routine.id)}">선택</button></div>` : '';
  const date = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  const freeStart = `<button class="button secondary full" data-action="setup-new">${icon('plus')} 루틴 없이 자유 운동 시작</button>`;
  const primary = session ? `<section class="card">
      <div class="card-head"><h2 class="card-title">진행 중인 운동</h2>${badge('primary', 'timer', '기록 중')}</div>
      <p class="hero-title">${escapeHtml(session.routineName ?? activeExercise()?.name ?? '자유 운동')}</p>
      <p class="meta">현재 종목 · ${escapeHtml(activeExercise()?.name ?? '선택 전')}</p>
      <dl class="stat-row"><div><dt>기록한 세트</dt><dd>${guide.recordedSets}</dd></div>${guide.totalSets ? `<div><dt>계획 세트</dt><dd>${guide.completedSets} / ${guide.totalSets}</dd></div>` : ''}</dl>
      ${guide.totalSets ? progress(guide.completedSets, guide.totalSets) : ''}
      <button class="button primary full" data-action="${activeExercise() ? 'resume' : 'setup-new'}">운동 이어하기 ${icon('arrow-right')}</button>
    </section>` : data.routines.length ? `<section class="card">
      <div class="card-head"><h2 class="card-title">오늘의 루틴</h2><div class="head-tools">${next ? infoToggle('다음 차례 기준', '아직 하지 않은 루틴이 있으면 그 루틴을, 없으면 가장 오래전에 한 루틴을 다음 차례로 보여줍니다. 루틴으로 시작해 세트를 기록한 운동만 셉니다.') : ''}<button class="icon-button" data-view="routines" aria-label="루틴 관리">${icon('arrow-right')}</button></div></div>
      ${nextCard}
      <div class="chip-group" role="group" aria-label="오늘 할 루틴 선택">${data.routines.map(item => { const on = item.id === routine?.id; return `<button class="chip ${on ? 'selected' : ''}" aria-pressed="${on}" data-action="choose-today-routine" data-id="${escapeHtml(item.id)}">${on ? icon('check', { size: 16 }) : ''}<span>${escapeHtml(item.title)}</span></button>`; }).join('')}</div>
      <div class="plan-head"><p class="card-title">${escapeHtml(routine.title)}${isNext ? ` ${badge('primary', 'repeat', '다음 차례')}` : ''}</p><span class="meta">${routine.exercises.length}개 종목 · ${planSets(routine)}세트${lastDone ? ` · 마지막 ${agoText(lastDone)}` : ''}</span></div>
      ${planPreview(routine)}
      <button class="button primary full" data-action="start-routine">${icon('dumbbell')} 운동 시작</button>
    </section>${freeStart}` : `<section class="card empty-state"><span class="empty-icon">${icon('list-checks', { size: 28 })}</span><h2 class="card-title">루틴을 먼저 만들어 주세요</h2><p class="meta">자주 하는 운동을 순서대로 저장하면 운동할 때 하나씩 안내합니다.</p><button class="button primary" data-action="new-routine">${icon('plus')} 첫 루틴 만들기</button></section>${freeStart}`;
  return `${pageHead(date, session ? '진행 중인 운동이 있습니다' : '오늘 운동')}
    <div class="layout-split"><div class="col-main stack">${primary}</div>
    <aside class="col-side stack" aria-label="최근 운동과 도움말"><section class="card"><div class="card-head"><h2 class="card-title">최근 운동</h2><button class="icon-button" data-view="history" aria-label="최근 운동 전체 보기">${icon('arrow-right')}</button></div>${recent.length ? `<ul class="list">${recent.map(recentItem).join('')}</ul>` : '<p class="meta">첫 운동을 기록하면 여기에 표시됩니다.</p>'}</section>
    <details class="card disclosure"><summary><span>홈 화면에 추가하기</span>${icon('chevron-down')}</summary><div class="disclosure-body"><p class="meta">Safari 공유 메뉴에서 ‘홈 화면에 추가’를 선택하세요. 루틴과 기록은 이 기기에 저장되며, 기록 탭에서 JSON으로 백업할 수 있습니다.</p><p class="meta version-label">버전 20261002-33</p></div></details></aside></div>`;
}

function renderSetup() {
  const exercise = activeSession()?.exercises.find(item => item.id === editingExerciseId);
  return `${pageHead('운동 설정', exercise ? '목표 변경' : '어떤 운동을 하나요?')}
    <form id="exercise-form" class="card form-card stack">
      <label class="field"><span class="label">운동 이름</span><input name="name" required maxlength="60" autocomplete="off" placeholder="예: 벤치프레스" value="${escapeHtml(exercise?.name ?? '')}"></label>
      <label class="field"><span class="label">장비</span><select name="kind"><option value="machine" ${exercise?.kind === 'machine' ? 'selected' : ''}>머신 · 기구 표시 중량</option><option value="barbell" ${exercise?.kind === 'barbell' ? 'selected' : ''}>바벨 · 바 포함 총중량</option><option value="dumbbell" ${exercise?.kind === 'dumbbell' ? 'selected' : ''}>덤벨 · 한 손 중량</option></select></label>
      <div class="field-grid"><label class="field"><span class="label">중량 (kg)</span><input name="weight" inputmode="decimal" type="number" min="0" max="2000" step="0.5" required value="${exercise?.weight ?? 70}"></label><label class="field"><span class="label">목표 횟수</span><input name="target" inputmode="numeric" type="number" min="1" max="999" step="1" required value="${exercise?.target ?? 10}"></label></div>
      <div class="form-actions"><button class="button secondary" type="button" data-action="back">${icon('arrow-left')} 돌아가기</button><button class="button primary" type="submit">${exercise ? '설정 저장' : '이 종목으로 시작'}</button></div>
    </form>`;
}

function renderActive() {
  const session = activeSession();
  const exercise = activeExercise();
  if (!session || !exercise) { view = 'home'; return renderHome(); }
  const sets = setsFor(exercise);
  const last = lastSetOf(exercise);
  const reference = referenceFor(session, exercise);
  const targetIntensity = intensityOf(exercise.weight, reference);
  const guide = workoutGuide(session, exercise.id);
  const previous = findPreviousExercise(data.sessions, exercise, session.id);
  const previousSets = previous ? setsFor(previous) : [];
  const suggestion = dismissedProgression.has(exercise.id) ? null : suggestProgression(previous, exercise);
  const restSince = lastSetTime(session);
  const restTarget = typicalRest(data.sessions, exercise);
  const rest = restSince && restText(restSince, restTarget, Date.now());
  const eyebrow = `${escapeHtml(session.routineName ?? '자유 운동')}${session.routineName ? ` · ${guide.position + 1}/${session.exercises.length} 종목` : ''}`;
  return `${pageHead(eyebrow, escapeHtml(exercise.name), '', `<button class="button secondary" data-action="finish" aria-label="운동 종료">${icon('flag')} 종료</button>`)}
    <div class="layout-split"><div class="col-main stack">
    <section class="card target-card" aria-label="현재 목표">
      <div class="card-head">${guide.currentComplete ? badge('success', 'circle-check', '계획 세트 완료') : badge('primary', '', `${sets.length + 1}세트 차례`)}<div class="head-tools">${badge('neutral', '', kindShort[exercise.kind])}${infoToggle('장비 중량 기준', weightBasis[exercise.kind])}<button class="icon-button" data-action="edit-exercise" aria-label="목표 변경">${icon('pencil')}</button></div></div>
      <dl class="metric-grid"><div><dt>중량</dt><dd>${exercise.weight}<span class="unit">kg</span></dd></div><div><dt>목표 횟수</dt><dd>${exercise.target}<span class="unit">회</span></dd></div><div><dt>세트</dt><dd>${exercise.plannedSets ? `${Math.min(sets.length, exercise.plannedSets)}<span class="unit">/ ${exercise.plannedSets}</span>` : `${sets.length}<span class="unit">세트</span>`}</dd></div></dl>
      ${exercise.plannedSets ? progress(sets.length, exercise.plannedSets) : ''}
      ${targetIntensity ? `<div class="intensity-line"><span class="meta">1RM 대비</span>${intensityBadge(targetIntensity)}${intensityInfo(reference)}</div>` : ''}
      ${exercise.kind === 'barbell' ? `<p class="plate-line">${icon('dumbbell', { size: 18 })}<span>${plateText(platesFor(exercise.weight))}</span></p>` : ''}
    </section>
    ${rest ? `<p id="rest-timer" class="rest-timer ${rest.ready ? 'ready' : ''}" role="timer" data-since="${restSince}" data-target="${restTarget ?? ''}">${icon('timer', { size: 18 })}${icon('circle-check', { size: 18 })}<span class="rest-text">${restLabel(rest)}</span></p>` : ''}
    ${suggestion ? `<section class="card callout callout-primary progression-card"><div class="callout-head"><span class="callout-icon">${icon('trending-up')}</span><div><p class="card-title">오늘은 ${suggestion.weight}kg 도전</p><p class="meta">지난번 ${suggestion.base}kg로 ${suggestion.sets}세트를 ${suggestion.reps}회 이상 했습니다.</p></div></div><div class="button-row"><button class="button secondary" data-action="dismiss-progression">${exercise.weight}kg 유지</button><button class="button primary" data-action="apply-progression">${icon('arrow-up')} ${suggestion.weight}kg로 올리기</button></div></section>` : ''}
    ${guide.currentComplete ? `<section class="card callout callout-success"><div class="callout-head"><span class="callout-icon">${icon('circle-check')}</span><div><p class="card-title">${guide.allComplete ? '오늘의 루틴을 모두 완료했습니다' : '이 종목의 계획 세트를 완료했습니다'}</p><p class="meta">${guide.allComplete ? '운동을 마무리하고 기록을 저장하세요.' : '다음 종목으로 이어가세요.'}</p></div></div>${guide.next ? `<button class="button primary full" data-action="choose-routine-exercise" data-id="${escapeHtml(guide.next.id)}">다음 종목 · ${escapeHtml(guide.next.name)} ${icon('arrow-right')}</button>` : `<button class="button primary full" data-action="finish">${icon('flag')} 운동 마무리</button>`}<button class="button secondary full" data-action="manual-set">${icon('plus')} 추가 세트 기록</button></section>` : `<div class="record-actions"><button class="button primary record-button" data-action="open-dictation">${icon('mic', { size: 22 })} 받아쓰기로 기록</button><button class="button secondary" data-action="manual-set">${icon('pencil')} 직접 입력</button>${last ? `<button class="button secondary record-repeat" data-action="repeat-set" data-input-id="${id()}">${icon('repeat')} ${last.weight}kg × ${last.reps}회 다시</button>` : ''}</div>`}
    </div><aside class="col-side stack" aria-label="세트 기록과 운동 순서">
    <section class="card"><div class="card-head"><h2 class="card-title">이번 종목 기록</h2><span class="meta">${sets.length}세트</span></div>${sets.length ? setTable(sets, exercise.name, { reference }) : '<p class="meta">첫 세트를 마친 뒤 기록하세요.</p>'}</section>
    ${session.routineName ? `<details class="card disclosure routine-guide"><summary><span>전체 운동 순서 <span class="meta">${guide.completedSets}/${guide.totalSets}세트 완료</span></span>${icon('chevron-down')}</summary><ol class="step-list">${session.exercises.map((item, index) => { const count = setsFor(item).length; const done = item.plannedSets && count >= item.plannedSets; const current = item.id === exercise.id; return `<li><button type="button" class="step ${current ? 'current' : ''} ${done ? 'complete' : ''}" ${current ? 'aria-current="step"' : ''} data-action="choose-routine-exercise" data-id="${escapeHtml(item.id)}"><span class="plan-index">${done ? icon('check', { size: 16 }) : index + 1}</span><span class="list-main"><strong>${escapeHtml(item.name)}</strong><span class="meta">${item.weight}kg · ${item.target}회 · ${item.plannedSets ? `${count}/${item.plannedSets}` : count}세트</span></span>${current ? badge('primary', '', '현재') : done ? badge('success', 'check', '완료') : icon('arrow-right')}</button></li>`; }).join('')}</ol></details>` : `<button class="button secondary full" data-action="setup-new">${icon('plus')} 다른 종목 추가</button>`}
    ${previousSets.length ? `<details class="card disclosure"><summary><span>지난 기록</span>${icon('chevron-down')}</summary><div class="disclosure-body"><p class="meta">${previousSets.map(item => `${item.weight}kg × ${item.reps}회`).join(' / ')}</p></div></details>` : ''}
    </aside></div>`;
}
function renderRoutines() {
  const today = selectedRoutineId ?? data.selectedRoutineId;
  return `${pageHead('루틴', '나의 루틴', '', `<button class="button primary" data-action="new-routine">${icon('plus')} 새 루틴</button>`)}
    ${data.routines.length ? `<div class="card-grid">${data.routines.map(routine => { const title = escapeHtml(routine.title); return `<section class="card routine-card"><div class="card-head"><h2 class="card-title">${title}</h2>${routine.id === today ? badge('primary', 'check', '오늘 선택') : ''}</div><p class="meta">${routine.exercises.length}개 종목 · ${planSets(routine)}세트</p><div class="card-actions"><button class="button secondary" data-action="use-routine" data-id="${escapeHtml(routine.id)}">${icon('check')} 오늘 이 루틴</button><button class="icon-button" data-action="edit-routine" data-id="${escapeHtml(routine.id)}" aria-label="${title} 루틴 수정">${icon('pencil')}</button><button class="icon-button danger" data-action="delete-routine" data-id="${escapeHtml(routine.id)}" aria-label="${title} 루틴 삭제">${icon('trash-2')}</button></div></section>`; }).join('')}</div>` : `<section class="card empty-state"><span class="empty-icon">${icon('list-checks', { size: 28 })}</span><h2 class="card-title">아직 저장한 루틴이 없습니다</h2><p class="meta">운동 이름, 중량, 횟수, 세트 수를 저장하면 운동할 때 순서대로 안내합니다.</p><button class="button primary" data-action="new-routine">${icon('plus')} 첫 루틴 만들기</button></section>`}`;
}
function renderHistory() {
  const session = historySessionId && data.sessions.find(item => item.id === historySessionId);
  if (session) {
    const actions = `${sessionRoutineDraft(session) ? `<button class="button secondary" data-action="routine-from-session" data-id="${escapeHtml(session.id)}">${icon('plus')} 이 기록으로 루틴 만들기</button>` : ''}<button class="button danger" data-action="delete-session" data-id="${escapeHtml(session.id)}">${icon('trash-2')} 이 운동 기록 삭제</button>`;
    return `<button class="text-button back-button" data-action="history-back">${icon('arrow-left')} 기록 목록</button>
      ${pageHead(dateText(session.startedAt), escapeHtml(session.routineName ?? '운동 상세'), `${session.endedAt ? badge('success', 'circle-check', '완료') : badge('primary', 'timer', '진행 중')} <span>${sessionSetCount(session)}세트</span>`, actions)}
      <div class="card-grid">${session.exercises.map(exercise => { const reference = referenceFor(session, exercise); return `<section class="card"><div class="card-head"><h2 class="card-title">${escapeHtml(exercise.name)}</h2><div class="head-tools">${badge('neutral', '', `${setsFor(exercise).length}세트`)}${reference ? intensityInfo(reference) : ''}</div></div>${setsFor(exercise).length ? setTable(setsFor(exercise), exercise.name, { removable: true, reference }) : '<p class="meta">기록한 세트가 없습니다.</p>'}</section>`; }).join('')}</div>`;
  }
  const sessions = data.sessions.filter(item => item.exercises.some(exercise => setsFor(exercise).length));
  const total = sessions.reduce((n, item) => n + sessionSetCount(item), 0);
  const trends = oneRepMaxTrends(data.sessions);
  return `${pageHead('기록', '운동 기록')}
    <dl class="stat-cards"><div class="card stat"><dt>기록한 운동</dt><dd>${sessions.length}<span class="unit">회</span></dd></div><div class="card stat"><dt>누적 세트</dt><dd>${total}<span class="unit">세트</span></dd></div></dl>
    ${sessions.length ? `${activitySection()}${volumeSection()}` : ''}
    <section class="section" aria-labelledby="sessions-title"><div class="section-head"><h2 id="sessions-title" class="section-title">운동 회차</h2></div>${sessions.length ? sessionTable(sessions) : `<div class="card empty-state"><span class="empty-icon">${icon('chart-column', { size: 28 })}</span><h3 class="card-title">아직 기록이 없습니다</h3><p class="meta">첫 운동을 기록하면 여기에 표시됩니다.</p><button class="button primary" data-view="home">${icon('dumbbell')} 운동하러 가기</button></div>`}</section>
    ${trends.length ? `<section class="section" aria-labelledby="records-title"><div class="section-head"><h2 id="records-title" class="section-title">종목별 추정 1RM</h2><div class="head-tools"><span class="meta">${trends.length}종목</span>${infoToggle('추정 1RM 계산 방법', '추정 1RM = 중량 × (1 + 횟수 ÷ 30). 같은 종목·장비끼리 비교합니다.')}</div></div>${recordTable(trends.slice(0, 6))}${trends.length > 6 ? `<details class="disclosure records-more"><summary><span>나머지 ${trends.length - 6}개 종목</span>${icon('chevron-down')}</summary>${recordTable(trends.slice(6))}</details>` : ''}</section>` : ''}
    <details class="card disclosure backup-panel" ${backupPanelOpen ? 'open' : ''}><summary><span>백업 · 복원 · 초기화</span>${icon('chevron-down')}</summary><div class="disclosure-body stack">${nasPanel()}<p class="meta">루틴과 기록은 이 기기에 저장됩니다. CSV는 조회용이고, JSON 백업으로 루틴까지 복원할 수 있습니다.</p><div class="button-wrap"><button class="button secondary" data-action="export-csv">${icon('download')} CSV 내려받기</button><button class="button secondary" data-action="export">${icon('download')} JSON 백업</button><button class="button secondary" data-action="import">${icon('upload')} JSON 복원</button></div><p class="meta">마지막 JSON 백업: ${data.lastBackupAt ? dateText(data.lastBackupAt) : '없음'}</p><div class="danger-zone"><div><p class="card-title">전체 운동 기록 삭제</p><p class="meta">운동 기록과 진행 중인 운동을 지웁니다. 저장된 루틴은 유지됩니다.</p></div><button class="button danger" data-action="clear-history" ${data.sessions.length ? '' : 'disabled'}>${icon('trash-2')} 전체 삭제</button></div></div></details>`;
}

function nasPanel() {
  const head = `<div class="card-head"><p class="card-title">NAS 자동 백업</p>${infoToggle('NAS 자동 백업 안내', '운동을 마칠 때, 루틴이나 기록을 바꿀 때, 앱을 열 때 바뀐 내용이 있으면 NAS로 보냅니다. 운동 중에는 보내지 않습니다. 토큰은 이 기기에만 저장되고 JSON 백업 파일에는 들어가지 않습니다.')}</div>`;
  if (!nas.token) return `<section id="nas-panel" class="nas-panel">${head}<label class="field"><span class="label">백업 토큰</span><input id="nas-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"></label><button class="button primary" data-action="nas-connect" ${nasBusy ? 'disabled' : ''}>${icon('check')} 연결</button></section>`;
  const status = nasBusy ? badge('neutral', '', '백업 중')
    : nas.lastError ? badge('warning', 'triangle-alert', '백업 실패')
    : nas.lastSentAt ? badge('success', 'circle-check', '백업됨') : badge('neutral', '', '백업 전');
  const detail = nas.lastError ? escapeHtml(nas.lastError) : nas.lastSentAt ? `마지막 백업 ${dateTimeText(nas.lastSentAt)}` : '아직 NAS에 보낸 백업이 없습니다.';
  const list = nasList ? `<div class="nas-list-wrap"><div class="card-head"><p class="label">NAS 백업 ${nasList.length}개</p><button class="icon-button" data-action="nas-list-close" aria-label="백업 목록 닫기">${icon('x')}</button></div>${nasList.length ? `<ul class="nas-list">${nasList.map(item => `<li><span class="list-main"><strong>${dateTimeText(item.savedAt)}</strong><span class="meta">루틴 ${item.routines}개 · 세트 ${item.sets}개</span></span><button class="button secondary" data-action="nas-restore" data-id="${escapeHtml(item.id)}">${icon('rotate-ccw')} 복원</button></li>`).join('')}</ul>` : '<p class="meta">NAS에 저장된 백업이 없습니다.</p>'}</div>` : '';
  return `<section id="nas-panel" class="nas-panel">${head}<div class="nas-status">${status}<span class="meta">${detail}</span></div><div class="button-wrap"><button class="button secondary" data-action="nas-now" ${nasBusy ? 'disabled' : ''}>${icon('upload')} 지금 백업</button><button class="button secondary" data-action="nas-list" ${nasBusy ? 'disabled' : ''}>${icon('download')} NAS에서 복원</button><button class="text-button" data-action="nas-disconnect">연결 해제</button></div>${list}</section>`;
}

// Only the NAS panel is redrawn, so a background backup never resets scroll or focus elsewhere.
function renderNasPanel() {
  const panel = document.getElementById('nas-panel');
  if (!panel) return;
  const focused = panel.contains(document.activeElement) ? document.activeElement.dataset?.action : null;
  panel.outerHTML = nasPanel();
  if (focused) document.querySelector(`#nas-panel [data-action="${focused}"]`)?.focus();
}

async function updateNas(patch) {
  nas = { ...nas, ...patch };
  await saveNasBackup(nas);
  renderNasPanel();
}

function scheduleNasBackup(delay = 3000) {
  if (!nas.token) return;
  clearTimeout(nasTimer);
  nasTimer = setTimeout(() => runNasBackup('change').catch(() => {}), delay);
}

async function runNasBackup(reason, { confirmShrink = false } = {}) {
  if (!nas.token || nasBusy) return;
  if (reason === 'manual' && !navigator.onLine) { report(new Error('오프라인 상태입니다. 연결된 뒤 다시 시도하세요.')); return; }
  const text = JSON.stringify(data);
  const hash = await sha256Hex(text);
  // Back to what the NAS already has (for example after restoring): any earlier warning no longer applies.
  if (reason !== 'manual' && hash === nas.lastHash) { if (nas.lastError || nas.declinedHash) await updateNas({ lastError: null, declinedHash: null }); return; }
  // A shrink the user already declined is not asked about again until the data changes.
  if (reason !== 'manual' && hash === nas.declinedHash) return;
  if (!shouldSend({ reason, hash, lastHash: nas.lastHash, activeSessionId: data.activeSessionId, online: navigator.onLine })) return;
  nasBusy = true;
  renderNasPanel();
  let result;
  try { result = await sendBackup(text, nas.token, { confirmShrink }); }
  finally { nasBusy = false; }
  if (result.status === 'saved' || result.status === 'unchanged') {
    await updateNas({ lastSentAt: new Date().toISOString(), lastHash: hash, lastError: null, declinedHash: null });
    if (reason === 'manual') toast({ text: result.status === 'saved' ? `NAS에 백업했습니다. 세트 ${result.body.sets}개` : 'NAS 백업이 이미 최신입니다.' });
    return;
  }
  if (result.status === 'shrink') {
    renderNasPanel();
    const { previous, incoming } = result.body;
    const ok = await confirmAction({ title: 'NAS 백업보다 기록이 줄었습니다', message: `NAS 최신 백업은 세트 ${previous.sets}개, 이 기기는 세트 ${incoming.sets}개입니다. 기기 기록이 지워진 거라면 취소하고 ‘NAS에서 복원’을 쓰세요. 이전 백업은 NAS에 남습니다.`, confirmLabel: '이 상태로 백업' });
    if (ok) { await runNasBackup('manual', { confirmShrink: true }); return; }
    await updateNas({ declinedHash: hash, lastError: '기록이 크게 줄어 자동 백업을 멈췄습니다.' });
    return;
  }
  const message = errorText(result);
  // Automatic failures toast once a day per reason; the status line always shows the latest one.
  const today = new Date().toDateString();
  if (reason === 'manual' || nas.lastError !== message || nas.lastErrorDay !== today) toast({ kind: 'warning', text: message });
  await updateNas({ lastError: message, lastErrorDay: today });
}

async function restoreFromNas(backupId) {
  const result = await fetchBackup(nas.token, backupId);
  if (result.status !== 'ok') throw new Error(errorText(result));
  const imported = validateBackup(result.body);
  const count = imported.sessions.reduce((n, item) => n + item.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0), 0);
  if (!await confirmAction({ title: 'NAS 백업으로 교체할까요?', message: `${imported.routines.length}개 루틴과 ${count}개 세트가 포함된 백업입니다. 현재 기기의 루틴과 기록을 모두 이 백업으로 교체합니다.`, confirmLabel: '백업으로 교체' })) return;
  selectedRoutineId = imported.selectedRoutineId ?? imported.routines[0]?.id ?? null;
  nasList = null;
  await commit(imported);
  historySessionId = null;
  render();
  toast({ text: `${count}개 세트를 복원했습니다.` });
}

function render() {
  renderHeader();
  main.removeAttribute('aria-busy');
  if (fatalError) { main.innerHTML = `<section class="card callout callout-danger" role="alert"><div class="callout-head"><span class="callout-icon">${icon('triangle-alert')}</span><div><p class="card-title">저장된 기록을 읽지 못했습니다</p><p class="meta">${escapeHtml(fatalError.message)}</p></div></div></section>`; return; }
  main.dataset.view = view;
  main.innerHTML = view === 'setup' ? renderSetup() : view === 'active' ? renderActive() : view === 'history' ? renderHistory() : view === 'routines' ? renderRoutines() : renderHome();
}

function go(next) {
  view = next;
  if (next !== 'history') historySessionId = null;
  render();
  window.scrollTo(0, 0);
}

function openSetDialog(setId = '') {
  const set = data.sessions.flatMap(item => item.exercises).flatMap(item => item.sets).find(item => item.id === setId);
  dialog.dataset.setId = set?.id ?? '';
  // One input id per opened dialog, so addSet ignores a repeated save of the same entry.
  dialog.dataset.inputId = id();
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
  const saved = `<p>${weight}kg × ${reps}회 저장됨</p>`;
  return { kind: 'success', html: record ? `${saved}<p class="toast-record">${icon('trophy', { size: 16 })}<span>${escapeHtml(exercise.name)} 신기록 · 추정 1RM ${record.value}kg (이전 ${record.previous}kg)</span></p>` : saved };
}

async function saveVoiceResult(candidate, context) {
  if (data.activeSessionId !== context.sessionId || data.activeExerciseId !== context.exerciseId) throw new Error('운동이 바뀌어 음성 결과를 저장하지 않았습니다.');
  const next = addSet(data, context.sessionId, context.exerciseId, { id: id(), inputId: context.inputId, reps: candidate.reps, weight: candidate.weight, source: 'voice', at: new Date().toISOString() });
  const saved = savedNotice(activeExercise(), candidate);
  await commit(next);
  toast(saved);
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
  const last = lastSetOf(exercise);
  dictationContext = { sessionId: data.activeSessionId, exerciseId: exercise.id, weight: exercise.weight, last, inputId: id() };
  dictationText.value = '';
  clearDictationPreview();
  document.getElementById('dictation-weight-hint').textContent = `“20회”처럼 횟수만 말하면 현재 설정 ${exercise.weight}kg을 사용합니다.${last ? ` “같은 거”라고 말하면 직전 세트 ${last.weight}kg × ${last.reps}회를 다시 기록합니다.` : ''}`;
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
    ? `${dictationPreview.candidate.repeat ? '직전 세트와 같은 ' : ''}${dictationPreview.candidate.weight}kg × ${dictationPreview.candidate.reps}회로 기록할까요?`
    : dictationPreview.status === 'no-previous'
      ? '이 종목에 아직 기록한 세트가 없어 반복할 수 없어요. “70킬로 20회”처럼 말해주세요.'
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
    <div class="section-head"><strong class="routine-row-heading">운동 ${String(index + 1).padStart(2, '0')}</strong><div class="row-tools"><button type="button" class="icon-button" data-action="routine-up" aria-label="이 운동 위로 이동">${icon('arrow-up')}</button><button type="button" class="icon-button" data-action="routine-down" aria-label="이 운동 아래로 이동">${icon('arrow-down')}</button><button type="button" class="icon-button danger" data-action="remove-routine-exercise" aria-label="이 운동 삭제">${icon('trash-2')}</button></div></div>
    <label class="field"><span class="label">운동 이름</span><input data-field="name" maxlength="60" required placeholder="예: 바벨 스쿼트" value="${escapeHtml(item.name ?? '')}"></label>
    <label class="field"><span class="label">장비</span><select data-field="kind"><option value="machine" ${!item.kind || item.kind === 'machine' ? 'selected' : ''}>머신 · 표시 중량</option><option value="barbell" ${item.kind === 'barbell' ? 'selected' : ''}>바벨 · 바 포함 총중량</option><option value="dumbbell" ${item.kind === 'dumbbell' ? 'selected' : ''}>덤벨 · 한 손 중량</option></select></label>
    <div class="routine-values"><label class="field"><span class="label">중량 (kg)</span><input data-field="weight" type="number" inputmode="decimal" min="0" max="2000" step="0.5" required value="${item.weight ?? 20}"></label><label class="field"><span class="label">목표 횟수</span><input data-field="target" type="number" inputmode="numeric" min="1" max="999" step="1" required value="${item.target ?? 15}"></label><label class="field"><span class="label">세트 수</span><input data-field="plannedSets" type="number" inputmode="numeric" min="1" max="99" step="1" required value="${item.plannedSets ?? 4}"></label></div>
  </div>`;
}

function openRoutineDialog(routine = null) {
  editingRoutineId = routine?.id ?? null;
  document.getElementById('routine-title').textContent = editingRoutineId ? '루틴 수정' : '새 운동 루틴';
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

document.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action],button[data-view]');
  if (!button || fatalError) return;
  if (button.dataset.view) { go(button.dataset.view); return; }
  const action = button.dataset.action;
  try {
    if (action === 'choose-today-routine' || action === 'use-routine') { selectedRoutineId = button.dataset.id; await commit(selectRoutine(data, selectedRoutineId)); if (action === 'use-routine') go('home'); }
    else if (action === 'new-routine') openRoutineDialog();
    else if (action === 'edit-routine') openRoutineDialog(data.routines.find(item => item.id === button.dataset.id));
    else if (action === 'routine-from-session') { const draft = sessionRoutineDraft(data.sessions.find(item => item.id === button.dataset.id)); if (draft) openRoutineDialog(draft); }
    else if (action === 'delete-routine') {
      const routine = data.routines.find(item => item.id === button.dataset.id);
      if (!routine || !await confirmAction({ title: '루틴을 삭제할까요?', message: `‘${routine.title}’ 루틴을 삭제합니다. 운동 기록은 삭제되지 않습니다.`, confirmLabel: '루틴 삭제' })) return;
      selectedRoutineId = data.routines.find(item => item.id !== routine.id)?.id ?? null;
      await commit(removeRoutine(data, routine.id));
      selectedRoutineId = data.selectedRoutineId;
      render();
      toast({ text: `‘${routine.title}’ 루틴을 삭제했습니다.` });
    }
    else if (action === 'start-routine') {
      if (activeSession()) throw new Error('진행 중인 운동을 먼저 마쳐주세요.');
      const routineId = selectedRoutineId ?? data.selectedRoutineId;
      view = 'active';
      historySessionId = null;
      await commit(startRoutine(data, routineId, id(), new Date().toISOString(), id));
    }
    else if (action === 'choose-routine-exercise') { view = 'active'; await commit(chooseSessionExercise(data, button.dataset.id)); window.scrollTo(0, 0); }
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
      toast({ text: `목표 중량을 ${suggestion.weight}kg로 올렸습니다.` });
    }
    else if (action === 'dismiss-progression') { dismissedProgression.add(data.activeExerciseId); render(); }
    else if (action === 'open-dictation') openDictation();
    else if (action === 'manual-set') openSetDialog();
    else if (action === 'edit-set') openSetDialog(button.dataset.id);
    else if (action === 'finish') { const guide = workoutGuide(activeSession(), data.activeExerciseId); if (guide.totalSets > guide.completedSets && !await confirmAction({ title: '운동을 마칠까요?', message: `계획보다 ${guide.totalSets - guide.completedSets}세트 적게 기록했습니다. 현재 기록으로 운동을 마칩니다.`, confirmLabel: '운동 종료', danger: false })) return; await commit(finishSession(data, data.activeSessionId, new Date().toISOString())); go('history'); }
    else if (action === 'history-detail') { historySessionId = button.dataset.id; go('history'); historySessionId = button.dataset.id; render(); }
    else if (action === 'history-back') { historySessionId = null; render(); }
    else if (action === 'delete-set-record') {
      const set = data.sessions.flatMap(item => item.exercises).flatMap(item => item.sets).find(item => item.id === button.dataset.id);
      if (!set || !await confirmAction({ title: '세트 기록을 삭제할까요?', message: `${set.weight}kg × ${set.reps}회 세트 기록을 영구 삭제합니다. 되돌릴 수 없습니다.`, confirmLabel: '세트 삭제' })) return;
      await commit(deleteSetRecord(data, button.dataset.id));
      toast({ text: '세트 기록을 삭제했습니다.' });
    }
    else if (action === 'delete-session') {
      const session = data.sessions.find(item => item.id === button.dataset.id);
      if (!session) return;
      const count = session.exercises.reduce((sum, exercise) => sum + setsFor(exercise).length, 0);
      const label = session.routineName ?? session.exercises[0]?.name ?? '운동';
      const active = session.id === data.activeSessionId;
      if (!await confirmAction({ title: '운동 기록을 삭제할까요?', message: `${label} 기록과 포함된 세트 ${count}개를 영구 삭제합니다.${active ? '\n진행 중인 운동도 종료됩니다.' : ''}`, confirmLabel: '기록 삭제' })) return;
      await commit(deleteSession(data, session.id));
      historySessionId = null;
      render();
      toast({ text: `${label} 운동 기록을 삭제했습니다.` });
    }
    else if (action === 'clear-history') {
      const count = data.sessions.reduce((sum, session) => sum + session.exercises.reduce((subtotal, exercise) => subtotal + setsFor(exercise).length, 0), 0);
      if (!await confirmAction({ title: '전체 운동 기록을 삭제할까요?', message: `운동 기록 ${data.sessions.length}회와 세트 ${count}개를 모두 영구 삭제합니다. 저장된 루틴은 유지됩니다.\n삭제 전에 JSON 백업을 권장합니다.`, confirmLabel: '전체 삭제' })) return;
      await commit(clearSessionHistory(data));
      historySessionId = null;
      render();
      toast({ text: '모든 운동 기록을 삭제했습니다. 저장된 루틴은 그대로 있습니다.' });
    }
    else if (action === 'repeat-set') {
      const exercise = activeExercise();
      const last = lastSetOf(exercise);
      if (repeatSaving || !exercise || !last) return;
      // One input id per rendered button, so a double tap stores the set only once.
      repeatSaving = true;
      button.disabled = true;
      try {
        const setId = id();
        const next = addSet(data, data.activeSessionId, exercise.id, { id: setId, inputId: button.dataset.inputId, weight: last.weight, reps: last.reps, source: 'manual', at: new Date().toISOString() });
        // addSet returns the data unchanged when this input id was already stored.
        if (!next.sessions.some(session => session.exercises.some(item => item.sets.some(set => set.id === setId)))) return;
        const saved = savedNotice(exercise, last);
        await commit(next);
        toast({ ...saved, action: `<button type="button" class="text-button" data-action="undo-repeat" data-id="${escapeHtml(setId)}">${icon('rotate-ccw', { size: 18 })} 취소</button>` });
      } finally { repeatSaving = false; }
    }
    else if (action === 'undo-repeat') { dismissToast(button.closest('.toast')); await commit(cancelSet(data, button.dataset.id)); toast({ kind: 'info', text: '방금 반복한 세트를 취소했습니다.' }); }
    else if (action === 'restore-set') { dismissToast(button.closest('.toast')); await commit(restoreSet(data, button.dataset.id)); toast({ text: '세트 기록을 되돌렸습니다.' }); }
    else if (action === 'export' || action === 'export-csv') {
      const csv = action === 'export-csv';
      const contents = csv ? exportWorkoutCsv(data) : JSON.stringify(data, null, 2);
      const url = URL.createObjectURL(new Blob([contents], { type: csv ? 'text/csv;charset=utf-8' : 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `voice-fitness-${new Date().toISOString().slice(0, 10)}.${csv ? 'csv' : 'json'}`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (!csv) await commit({ ...data, lastBackupAt: new Date().toISOString() });
      toast({ kind: 'info', text: `${csv ? 'CSV' : 'JSON 백업'} 파일 내보내기를 시작했습니다. iPhone 파일 앱에 저장됐는지 확인하세요.` });
    }
    else if (action === 'import') backupInput.click();
    else if (action === 'nas-connect') {
      const token = document.getElementById('nas-token')?.value.trim() ?? '';
      if (token.length < 32) throw new Error('NAS에서 만든 백업 토큰을 그대로 붙여 넣어주세요.');
      // The button is disabled in place so a failed check keeps the pasted token in the field.
      button.disabled = true;
      let result;
      try { result = await listBackups(token); } finally { button.disabled = false; }
      if (result.status !== 'ok') throw new Error(errorText(result));
      // After a reinstall the device is empty: offer the NAS backups instead of trying to overwrite them.
      const empty = !data.routines.length && !data.sessions.some(session => sessionSetCount(session));
      if (empty && result.body.length) {
        nasList = result.body;
        await updateNas({ token, lastHash: null, lastError: null, declinedHash: null });
        toast({ kind: 'info', text: 'NAS에 백업이 있습니다. 복원할 백업을 고르세요.' });
        return;
      }
      await updateNas({ token, lastHash: null, lastError: null, declinedHash: null });
      toast({ kind: 'info', text: 'NAS에 연결했습니다. 지금 백업합니다.' });
      await runNasBackup('manual');
    }
    else if (action === 'nas-now') await runNasBackup('manual');
    else if (action === 'nas-list') {
      const result = await listBackups(nas.token);
      if (result.status !== 'ok') throw new Error(errorText(result));
      nasList = result.body;
      renderNasPanel();
    }
    else if (action === 'nas-list-close') { nasList = null; renderNasPanel(); }
    else if (action === 'nas-restore') await restoreFromNas(button.dataset.id);
    else if (action === 'nas-disconnect') {
      if (!await confirmAction({ title: 'NAS 연결을 해제할까요?', message: '이 기기에서 백업 토큰을 지웁니다. NAS에 있는 백업은 그대로 남습니다.', confirmLabel: '연결 해제' })) return;
      clearTimeout(nasTimer);
      nas = {}; nasList = null;
      await saveNasBackup(nas);
      renderNasPanel();
    }
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

// A double tap must not save the same set twice while IndexedDB is still writing.
let setSaving = false;
function lockSetDialog(locked) {
  setSaving = locked;
  for (const control of dialog.querySelectorAll('button, input')) control.disabled = locked;
}
dialog.addEventListener('cancel', event => { if (setSaving) event.preventDefault(); });
document.getElementById('set-cancel').addEventListener('click', () => { if (!setSaving) dialog.close(); });
document.getElementById('set-delete').addEventListener('click', async () => {
  if (setSaving) return;
  try {
    const setId = dialog.dataset.setId;
    if (!setId) return;
    lockSetDialog(true);
    await commit(cancelSet(data, setId));
    dialog.close();
    toast({ kind: 'info', text: '세트 기록을 취소했습니다.', action: `<button type="button" class="text-button" data-action="restore-set" data-id="${escapeHtml(setId)}">${icon('rotate-ccw', { size: 18 })} 되돌리기</button>` });
  } catch (error) { report(error); }
  finally { lockSetDialog(false); }
});
document.getElementById('set-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (setSaving) return;
  const weight = Number(document.getElementById('set-weight').value);
  const rawReps = document.getElementById('set-reps').value;
  const reps = Number(rawReps);
  const inlineError = document.getElementById('set-error');
  if (!rawReps || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 0) { inlineError.textContent = '중량과 실제 횟수를 확인해주세요.'; inlineError.hidden = false; return; }
  try {
    const setId = dialog.dataset.setId;
    lockSetDialog(true);
    const next = setId ? updateSet(data, setId, { weight, reps }) : addSet(data, data.activeSessionId, data.activeExerciseId, { id: id(), inputId: dialog.dataset.inputId, weight, reps, source: 'manual', at: new Date().toISOString() });
    // Edits are corrections, so only newly added sets can announce a record.
    const saved = setId ? { kind: 'success', text: `${weight}kg × ${reps}회 수정됨` } : savedNotice(activeExercise(), { weight, reps });
    await commit(next);
    dialog.close();
    toast(saved);
  } catch (error) { inlineError.textContent = error.message; inlineError.hidden = false; }
  finally { lockSetDialog(false); }
});

backupInput.addEventListener('change', async () => {
  const file = backupInput.files?.[0];
  backupInput.value = '';
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('5MB 이하의 기록 파일을 선택해주세요.');
    const imported = validateBackup(JSON.parse(await file.text()));
    const count = imported.sessions.reduce((n, item) => n + item.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0), 0);
    if (!await confirmAction({ title: '백업으로 교체할까요?', message: `${imported.routines.length}개 루틴과 ${count}개 세트가 포함된 백업입니다. 현재 기기의 루틴과 기록을 모두 이 파일로 교체합니다.`, confirmLabel: '백업으로 교체' })) return;
    selectedRoutineId = imported.selectedRoutineId ?? imported.routines[0]?.id ?? null;
    await commit(imported);
    historySessionId = null;
    render();
    toast({ text: `${count}개 세트를 복원했습니다.` });
  } catch (error) { report(error); }
});

// toggle does not bubble, so it is caught on the way down.
document.addEventListener('toggle', event => { if (event.target.classList?.contains('backup-panel')) backupPanelOpen = event.target.open; }, true);

// Preserve text, focus and preview when iOS switches keyboard modes or connectivity.
window.addEventListener('online', renderHeader);
window.addEventListener('online', () => scheduleNasBackup(1000));
window.addEventListener('offline', renderHeader);

document.addEventListener('click', event => {
  for (const open of document.querySelectorAll('.info-toggle[open]')) if (!open.contains(event.target)) open.open = false;
});

// Only the timer text changes each second; a full render would reset scroll and focus.
setInterval(() => {
  const timer = document.getElementById('rest-timer');
  if (!timer) return;
  const rest = restText(Number(timer.dataset.since), timer.dataset.target ? Number(timer.dataset.target) : null, Date.now());
  if (!rest) { timer.remove(); return; }
  timer.querySelector('.rest-text').textContent = restLabel(rest);
  timer.classList.toggle('ready', rest.ready);
}, 1000);

async function boot() {
  try {
    data = await loadData();
    selectedRoutineId = data.selectedRoutineId ?? data.routines[0]?.id ?? null;
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) navigator.storage.persist().catch(() => {});
    render();
    nas = await loadNasBackup().catch(() => ({}));
    renderNasPanel();
    scheduleNasBackup(2000);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => registration.update().catch(() => {})).catch(() => {});
  } catch (error) { fatalError = error; render(); }
}
boot();
