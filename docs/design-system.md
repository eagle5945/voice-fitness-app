# 디자인 시스템

새 화면이나 컴포넌트는 이 문서와 `pwa/styles.css`의 토큰·클래스를 그대로 사용한다. 화려함보다 정보 전달력, 가독성, 일관성을 우선한다. Gradient, Glassmorphism, 강한 그림자는 쓰지 않는다.

## 토큰

| 용도 | 값 | CSS 변수 |
|---|---|---|
| 배경 | `#F8FAFC` | `--bg` |
| 표면(Card) | `#FFFFFF` | `--surface` |
| 본문 텍스트 | `#0F172A` | `--text` |
| 보조 텍스트 | `#64748B` | `--text-secondary` |
| 테두리(장식) | `#E2E8F0` | `--border` |
| 입력·버튼 외곽선 | `#7C8BA1` | `--border-strong` |
| Primary | `#2563EB` | `--primary` |
| Success | `#16A34A` | `--success` |
| Warning | `#D97706` | `--warning` |
| Danger | `#DC2626` | `--danger` |

**대비 규칙 (WCAG AA).** Success `#16A34A`(흰 배경 3.30:1)와 Warning `#D97706`(3.19:1)은 일반 텍스트 기준 4.5:1에 못 미친다. 그래서 아이콘, 테두리, 연한 배경에만 쓴다. 텍스트에는 `--success-text #15803D`와 `--warning-text #B45309`(각 5.02:1)를 쓴다. 보조 텍스트 `#64748B`는 `#F8FAFC` 위에서 4.55:1이다. 입력칸 외곽선은 비텍스트 대비 3:1을 지켜야 해서 `#E2E8F0`(1.23:1)이 아닌 `--border-strong`을 쓴다.

## 타이포그래피

- **글꼴:** `VF Sans`. Pretendard Variable을 KS X 1001 한글 2,350자와 라틴·숫자·기호로 줄인 subset이다(`pwa/fonts/`, 448KB, 굵기 45~930). Pretendard의 영문 글리프는 Inter 기반이라 영문도 Inter 형태로 표시된다. 글꼴 라이선스는 SIL OFL 1.1(`pwa/fonts/OFL.txt`)이다. Reserved Font Name 조항 때문에 subset의 내부 이름을 `VF Sans`로 바꿨다. 목록에 없는 한글은 시스템 글꼴로 표시된다.
- **본문:** 16px. 텍스트는 어디서도 13px보다 작게 쓰지 않는다.

| 역할 | 크기·굵기 | 클래스 |
|---|---|---|
| 페이지 제목 | 24px(태블릿 이상 28px) / 700 | `.page-title` |
| 섹션 제목 | 20px / 600 | `.section-title` |
| 카드 제목 | 17px / 600 | `.card-title` |
| 강조 수치 | 22~32px / 700, tabular | `.hero-title`, `.metric-grid dd` |
| 본문 | 16px / 400 | 기본 |
| 보조 설명 | 14px, 보조 텍스트색 | `.meta` |
| 라벨 | 14px / 600 | `.label`, `.eyebrow` |
| 배지·탭 라벨 | 13px | `.badge`, 하단 탭 |

## 레이아웃

| 구간 | 좌우 여백 | 내비게이션 | 본문 |
|---|---|---|---|
| 모바일 < 768px | 16px | 하단 탭 3개(엄지로 조작) | 1단 |
| 태블릿 768~1023px | 24px | 왼쪽 고정 Sidebar 232px | 1단 |
| 데스크톱 ≥ 1024px | 32px | 왼쪽 고정 Sidebar | `.layout-split` 2단(작업 영역 / 보조 정보) |

- 콘텐츠 최대 폭은 1440px(`.app-main`)이다.
- 상단 헤더는 `position: fixed`이고, 상태 표시줄 영역(`env(safe-area-inset-top)`)까지 불투명한 흰색으로 덮는다. `theme-color`도 헤더와 같은 `#FFFFFF`로 둔다. iOS Safari는 고정 상단 막대가 있으면 그 색을 상단 끝까지 이어 칠한다. sticky 헤더나 반투명 배경을 쓰면 상태 표시줄 아래로 스크롤된 내용이 흐리게 처리된다.
- `apple-mobile-web-app-status-bar-style`은 반드시 `default`로 둔다. `black-translucent`이면 화면이 상태 표시줄 아래까지 그려지고, iOS 26이 그 위와 아래 약 40pt에 Liquid Glass 흐림을 덮는다. 이 흐림은 CSS로 없앨 수 없다. iOS는 이 설정을 홈 화면에 추가할 때만 읽으므로, 바꾼 뒤에는 아이콘을 지우고 다시 추가해야 한다. 아이콘을 지우면 홈 화면 앱의 저장 데이터가 지워질 수 있으니 먼저 JSON 백업을 받고, 다시 추가한 뒤 복원한다(2026-10-01 확인).
- **Drawer를 쓰지 않는 이유:** 메뉴가 3개뿐이라 모바일에서는 하단 탭이 한 손 조작에 맞는다. 2026-10-01 사용자 결정.

## 컴포넌트

- **Button**(`.button` + `.primary` / `.secondary` / `.danger` / `.danger-solid`, `.full`): 높이 최소 44px, 반경 8px. `.text-button`, `.icon-button`(44×44), `.link-button`도 44px 이상이다.
- **Input/Select/Textarea:** 높이 최소 44px. 글자 16px(iOS 확대 방지). `--border-strong` 외곽선. 포커스 시 Primary 테두리와 3px 링.
- **Card**(`.card`): 반경 12px, 1px `--border` 테두리, 그림자는 `0 1px 2px` 수준까지만 쓴다. 강조 카드는 `.callout-primary` / `-success` / `-danger`(연한 배경과 아이콘).
- **Badge**(`.badge-*`): 항상 텍스트를 포함하고 대개 아이콘도 함께 둔다. 상태를 색으로만 표시하지 않는다(예: “완료”+체크, “진행 중”+타이머, 휴식 타이머 준비 시 체크 아이콘과 “다음 세트 준비” 문구).
- **Icon:** Lucide만 쓴다(`pwa/icons.mjs`, lucide-static 1.49.0, ISC). 새 아이콘은 lucide-static의 SVG 내용을 `paths`에 추가한다. 장식 아이콘은 `aria-hidden`을 붙이고, 아이콘만 있는 버튼에는 `aria-label`을 붙인다.
- **Table**(`.data-table`): 태블릿 이상에서는 표로 보인다. 모바일에서는 `.cards-mobile`이면 카드(`data-label` 표시)로, `.list-mobile`이면 한 줄 목록으로 바뀐다. 행 전체를 클릭 대상으로 만들지 않고, 행 안에 실제 버튼을 둔다.
- **Toast**(`toast()`): 작업 결과를 알린다. 모바일에서는 하단 탭 위, 태블릿 이상에서는 오른쪽 아래에 뜬다. 성공·정보는 4초, 되돌리기 버튼이 있으면 7초 뒤 사라지고, 오류는 닫을 때까지 남는다. 화면을 다시 그려도 사라지지 않도록 `<main>` 밖에 둔다.
- **확인 Dialog**(`confirmAction()`): 삭제·교체 같은 위험한 작업 전에 띄운다. 기본 포커스는 “취소”이고, Esc와 배경 클릭은 취소로 처리한다. 닫힌 뒤에는 연 버튼으로 포커스를 돌려준다.
- **글자 줄이기:** 화면 제목 아래에 안내 문장을 두지 않는다. 공식, 기준, 계산 방법 같은 보조 설명은 `infoToggle()`(ⓘ, 44px 버튼과 팝오버)에 넣는다. 아이콘만 쓰는 버튼은 누구나 아는 동작(수정, 삭제, 닫기, 뒤로, 이동 화살표)에만 쓰고 `aria-label`을 붙인다. 주요 동작(운동 시작, 받아쓰기로 기록, 운동 이어하기)과 상태 배지는 아이콘과 글자를 함께 둔다. 숫자에는 이름과 단위를 남긴다.
- **Skeleton**(`.skeleton`): 저장소를 불러오는 동안 표시한다(`index.html`의 `<main>` 초기 내용).
- **Dialog**(`.dialog`): 모바일에서는 하단 시트, 태블릿 이상에서는 가운데 정렬. 폭은 480px, `.dialog-wide`는 640px.

## 인터랙션·접근성

- Hover와 Transition은 200ms(`--duration`, 허용 범위 150~250ms)를 쓴다. `prefers-reduced-motion`이면 애니메이션을 끈다.
- `:focus-visible`에 2px Primary 외곽선을 둔다. 본문 바로가기 링크와 키보드 Tab 순서는 화면 순서를 따른다.
- 터치 대상은 최소 44×44px이다.
