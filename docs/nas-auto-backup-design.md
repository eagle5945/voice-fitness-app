# NAS 자동 백업 설계 (B안: 백업 전용 컨테이너)

2026-10-02 작성. 구현 내용은 `docs/nas-auto-backup-20261002-30.md`에 정리했다.

## 목표와 범위

- iPhone IndexedDB의 루틴과 기록(`main` 레코드 전체, JSON 백업과 같은 형식)을 NAS에 자동으로 보낸다.
- NAS에 쌓인 백업으로 앱에서 바로 복원한다. 홈 화면 아이콘을 다시 설치해 기기 데이터가 지워졌을 때 복구하는 용도가 핵심이다.
- 하지 않는 것: 여러 기기 동기화, 병합, 서버 쪽 조회 화면, 계정. 기기 1대에서 NAS로 보내는 단방향 백업과 수동 복원만 다룬다.

## 제약

- iOS는 홈 화면 웹앱이 닫혀 있으면 코드를 실행하지 않는다(Background Sync, Periodic Sync 미지원). 그래서 백업은 앱이 열려 있을 때만 보낸다.
- 공개 주소는 Funnel → nginx(`127.0.0.1:18085`)이다. 인터넷에 열려 있으므로 토큰 없는 요청은 모두 거부한다.
- SSH 사용자는 docker와 sudo를 쓸 수 없다. 컨테이너 생성, nginx 재생성, 토큰 파일 생성은 사용자가 명령을 직접 실행한다.
- 토큰과 백업 파일은 저장소에 커밋하지 않고, `site/`에 두지 않는다.

## 구성

```
iPhone PWA ──HTTPS──> Funnel ──> nginx :18085 ──/api/backup/──> backup 컨테이너 127.0.0.1:18086
                                     └─ 그 밖의 /api/ 는 지금처럼 404
backup 컨테이너 ──> NAS 앱 폴더/auto-backups/*.json (쓰기 가능한 유일한 경로)
```

### 서버 런타임

- `node:22-alpine` 이미지, Node 표준 라이브러리만 사용(npm 의존성 없음).
- Node를 고른 이유: 앱의 `pwa/domain.mjs`에 있는 `validateBackup`을 서버에서도 그대로 쓰기 위해서다. Python으로 검사를 다시 만들면 앱과 서버의 검사 기준이 어긋날 수 있다.
- 저장소 위치: `deploy/nas/backup-server/server.mjs`. 패키지를 만들 때 `pwa/domain.mjs`를 `backup-server/domain.mjs`로 복사한다. 실행 중인 `site/domain.mjs`를 직접 마운트하지 않는다. 사이트만 갱신했을 때 서버 검사 기준이 재시작 없이 어긋나는 일을 막기 위해서다.
- 테스트: 요청 처리 로직은 순수 함수로 나눠 `node --test`로 검사한다(인증, 크기 제한, 형식 검사, 급감 차단, 보존 개수, 중복 건너뛰기, 파일 이름). 임시 폴더에 파일을 쓰는 통합 테스트도 둔다.

### compose 추가 (`deploy/nas/compose.yaml`)

```yaml
  backup:
    image: node:22-alpine
    container_name: voice-fitness-backup
    restart: unless-stopped
    network_mode: host            # web과 같은 방식. 127.0.0.1:18086에만 바인딩
    user: "${BACKUP_UID}:${BACKUP_GID}"   # NAS의 .env에서 지정. 백업 파일을 SSH 사용자가 읽을 수 있게
    command: ["node", "/app/server.mjs"]
    environment:
      BACKUP_PORT: "18086"
      BACKUP_DIR: /data
      BACKUP_TOKEN_FILE: /run/secrets/backup-token
      BACKUP_KEEP: "60"
    volumes:
      - ./backup-server:/app:ro
      - ./auto-backups:/data
      - ./secrets/backup-token:/run/secrets/backup-token:ro
    read_only: true
    security_opt:
      - no-new-privileges:true
```

- 같은 `compose.yaml`(`name: voice-fitness-pwa`)에 서비스로 추가하므로 `web`과 `backup`은 한 Compose 프로젝트로 묶이고, Container Manager의 프로젝트 화면에도 함께 보인다. 적용 전에 기존 web 컨테이너의 `com.docker.compose.project` 라벨이 `voice-fitness-pwa`인지 확인한다.
- `web` 서비스는 그대로 둔다. 기존 `docker compose up -d web` 흐름과 Hermes 컨테이너에는 영향이 없다. `--remove-orphans`와 전체 Docker 정리는 쓰지 않는다.
- `BACKUP_UID`, `BACKUP_GID`는 NAS 앱 폴더의 `.env`에만 둔다(커밋하지 않음).

### nginx 변경 (`deploy/nas/nginx.conf`)

```nginx
limit_req_zone $binary_remote_addr zone=backup:1m rate=10r/m;   # server 블록 밖

location ^~ /api/backup/ {
    limit_req zone=backup burst=5 nodelay;
    client_max_body_size 6m;
    proxy_pass http://127.0.0.1:18086;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    add_header Cache-Control "no-store" always;
    add_header X-Content-Type-Options nosniff always;
}
location ^~ /api/ { return 404; }   # 기존 유지
```

- 서비스 워커는 이미 `/api/` 요청을 가로채지 않으므로 백업 응답이 캐시되지 않는다(`pwa/sw.js`).

## API

모든 요청은 `Authorization: Bearer <토큰>` 헤더가 필요하다. 토큰이 없거나 틀리면 401을 돌려주고 본문에 아무 정보도 넣지 않는다. 토큰은 `crypto.timingSafeEqual`로 비교한다.

| 메서드·경로 | 동작 | 응답 |
|---|---|---|
| `PUT /api/backup/` | 본문(JSON, 5MB 이하)을 `validateBackup`으로 검사한 뒤 저장 | 201 `{ id, savedAt, routines, sessions, sets }` 또는 200 `{ unchanged: true, id }` |
| `GET /api/backup/` | 백업 목록(최신순, 메타데이터만) | 200 `[{ id, savedAt, routines, sessions, sets, size }]` |
| `GET /api/backup/latest` | 최신 백업 본문 | 200 JSON 또는 404 |
| `GET /api/backup/<id>` | 해당 백업 본문 | 200 JSON 또는 404 |

- **파일 이름:** `YYYYMMDDTHHMMSSZ-<sha256 앞 12자>.json`. `<id>`는 이 이름에서 `.json`을 뺀 값이다. 경로 이동(`..`, `/`)을 막기 위해 id는 정규식으로만 받는다.
- **원자적 저장:** 임시 파일에 쓰고 `fsync`한 뒤 `rename`한다. 쓰다가 멈춰도 깨진 백업이 남지 않는다.
- **중복 건너뛰기:** 내용의 SHA-256이 최신 백업과 같으면 새 파일을 만들지 않는다.
- **급감 차단(409):** 최신 백업보다 세트 수가 절반 미만으로 줄었거나, 루틴과 세트가 모두 0이 되면 저장하지 않고 409 `{ reason: 'shrink', previous, incoming }`를 돌려준다. 앱 데이터가 지워진 상태에서 빈 기록이 자동으로 올라가는 경우를 막기 위해서다. 요청에 `X-Backup-Confirm: shrink` 헤더가 있으면 저장한다(사용자가 앱에서 확인했을 때만 붙인다).
- **보존:** 최신 60개를 남긴다. 단, 지금까지 가장 세트가 많은 백업 1개는 개수와 상관없이 지우지 않는다.
- **로그:** 시각, 결과 코드, 크기만 남긴다. 기록 내용과 토큰은 로그에 쓰지 않는다.

## 앱 변경

### 토큰 보관

- 백업 패널에 “NAS 백업” 설정을 추가한다. 토큰을 처음 한 번 입력하면 연결을 확인(`GET /api/backup/`)한 뒤 저장한다.
- 토큰은 IndexedDB 같은 저장소의 **별도 키**(`nasBackup`)에 둔다. `main` 레코드에 넣지 않는 이유는, `main`은 JSON 백업 파일로 그대로 내보내지기 때문이다. 토큰이 백업 파일이나 NAS에 섞이지 않게 한다.
- 아이콘을 다시 설치하면 토큰도 지워진다. 토큰은 사용자가 비밀번호 관리자 등에 따로 보관하고 다시 입력한다.
- `nasBackup` 키 내용: `{ token, lastSentAt, lastHash, lastError }`. 상태 표시와 중복 전송 방지에만 쓴다.

### 언제 보내나

1. “운동 종료”로 운동을 마쳤을 때
2. 루틴을 저장·삭제했을 때, 기록을 수정·삭제했을 때(3초 디바운스)
3. 앱을 열었을 때 마지막 전송이 24시간보다 오래됐으면
4. 백업 패널의 “지금 NAS에 백업” 버튼

- 보내기 전에 `JSON.stringify(data)`의 SHA-256(`crypto.subtle`)을 `lastHash`와 비교해 같으면 보내지 않는다.
- 오프라인이면 보내지 않고 다음 계기에 다시 시도한다. 실패해도 운동 기록 저장에는 영향이 없다(백업은 기록 저장이 끝난 뒤 따로 실행).
- 운동 중 세트를 저장할 때마다 보내지는 않는다. 세트마다 보내면 요청이 많고, 운동 종료 시점에 한 번 보내도 충분하다.

### 화면 (디자인 시스템 준수)

- 백업 패널에 상태 줄: “NAS 백업 · 오늘 14:03” + 성공 배지(체크 아이콘과 글자), 실패하면 경고 배지와 이유(“토큰이 맞지 않습니다”, “NAS에 연결할 수 없습니다”).
- 자동 백업 성공은 토스트를 띄우지 않는다(매번 뜨면 소음). 실패는 같은 이유로는 하루에 한 번만 토스트로 알린다.
- 409(급감)를 받으면 `confirmAction()`으로 “NAS 백업보다 기록이 크게 줄었습니다. 이 상태로 백업할까요?”를 묻는다. 기본 포커스는 취소다. 확인하면 `X-Backup-Confirm: shrink`를 붙여 다시 보낸다.
- “NAS에서 복원”: 백업 목록을 날짜·루틴 수·세트 수와 함께 보여주고, 고르면 기존 JSON 복원과 같은 확인 창(`confirmAction`)과 `validateBackup`을 거쳐 교체한다.
- 토큰 입력칸은 `type="password"`, `autocomplete="off"`. 보조 설명은 `infoToggle()`(ⓘ)에 넣는다.

### 파일

- 새 모듈 `pwa/nas-backup.mjs`: 요청 생성, 해시, 응답 해석, 재시도 판단(순수 함수 위주, 테스트 포함).
- `pwa/db.mjs`: `nasBackup` 키 읽기·쓰기 추가.
- `pwa/app.mjs`: 계기 연결, 백업 패널 UI, 복원 목록.
- `sw.js` FILES와 `scripts/build_nas_package.py` SITE_FILES에 `nas-backup.mjs` 추가. 빌드 스크립트는 `backup-server/`와 그 안의 `domain.mjs` 복사본도 패키지에 넣는다.
- 데이터베이스 `main` 형식과 JSON 백업 형식은 바꾸지 않는다.
- 버전: `20261002-30`, 캐시 `voice-fitness-v37`.

## 보안 정리

| 위협 | 대응 |
|---|---|
| 남이 공개 주소로 백업을 읽거나 올림 | 32바이트 무작위 토큰, 상수 시간 비교, 401에 정보 없음 |
| 토큰 무작위 대입 | nginx `limit_req` 분당 10회 |
| 큰 요청으로 디스크 채우기 | nginx 6MB, 서버 5MB 제한, 보존 60개 |
| 경로 조작 | id 정규식 검사, 서버는 `/data`만 쓰기 가능, 루트 파일시스템 읽기 전용 |
| 빈 기록이 좋은 백업을 밀어냄 | 409 급감 차단, 최대 세트 백업 영구 보존 |
| 토큰 유출 | 토큰은 NAS `secrets/backup-token`(권한 600)과 iPhone IndexedDB 별도 키에만 있음. 저장소, JSON 백업, 로그, URL에 넣지 않음 |
| 전송 중 노출 | Funnel HTTPS |

저장 시 암호화는 이번 범위에서 빼고, NAS 볼륨 권한으로 보호한다. 필요하면 다음 단계로 둔다.

## NAS 적용 순서 (사용자가 실행하는 명령 포함)

1. 기존 `compose.yaml`, `nginx.conf`, `site/`를 `backups/nas-backup-20261002-30/`에 백업한다(제가 SSH로 실행).
2. 패키지의 `backup-server/`, 새 `compose.yaml`, `nginx.conf`를 임시 폴더에 올리고 해시를 확인한다(제가 실행).
3. 토큰 파일과 백업 폴더를 만든다(사용자 실행, 토큰 값은 화면에 남기지 않고 따로 보관).
4. `.env`에 `BACKUP_UID`, `BACKUP_GID`를 넣는다(사용자 실행, 값은 `id -u`, `id -g`).
5. `docker compose up -d backup`으로 백업 컨테이너만 시작한다(사용자 실행).
6. `docker compose up -d --force-recreate web`으로 nginx만 다시 만든다(사용자 실행).
7. 확인(제가 실행): 토큰 없는 `GET /api/backup/` → 401, 다른 `/api/` → 404, `/` → 200. 토큰을 넣은 확인은 iPhone 앱에서 사용자가 한다.
8. 서버가 먼저 떠 있는 것을 확인한 뒤 사이트 파일을 갱신한다. 앱이 먼저 바뀌어도 서버가 없으면 “NAS에 연결할 수 없습니다”만 표시되고 기록에는 영향이 없다.

## 롤백

- 앱: 백업 폴더의 `site/` 파일을 되돌린다. iPhone 기록 DB는 건드리지 않는다.
- 서버: `docker update --restart=no voice-fitness-backup`, `docker stop voice-fitness-backup` 후 이전 `nginx.conf`로 web만 다시 만든다.
- `auto-backups/`의 백업 파일은 롤백할 때 지우지 않는다.

## 결정이 필요한 항목 (기본값으로 진행 예정)

- 보존 개수 60개, 급감 기준 “세트 수 절반 미만”.
- 운동 중 세트마다가 아니라 운동 종료·루틴 변경·하루 1회 기준으로 보냄.
- 저장 시 암호화는 하지 않음.
