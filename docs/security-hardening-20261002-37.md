# 보안 강화 · 20261002-37

2026-10-02 보안 검토 후속 작업.

## 1. NAS 파일 권한 (적용 완료, 코드 변경 없음)

ACL이 없는(Linux mode) 파일 중 누구나 쓸 수 있던 것을 정리했다. 자세한 내용은 `deploy/nas/README.md` ‘파일 권한 정리’.

## 2. 보안 헤더 (deploy/nas/nginx.conf)

- `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
- `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`(camera·microphone·geolocation·payment·usb 끔), `Cross-Origin-Opener-Policy: same-origin`, `Strict-Transport-Security: max-age=31536000`, `server_tokens off`
- nginx는 location에 add_header가 하나라도 있으면 server 단계 add_header를 물려받지 않는다. 그래서 보안 헤더는 server 단계에만 두고, 캐시는 location에서 `expires -1`(Cache-Control: no-cache)로 설정. `/api/backup/`의 no-store는 백업 서버가 보냄
- 앱의 인라인 `style` 속성 2곳(주간 볼륨·부위 막대 폭)을 `data-bar`로 바꾸고 렌더링 후 DOM으로 폭을 지정. 인라인 스크립트·이벤트 속성은 원래 없음
- 받아쓰기는 iPhone 키보드 기능이라 `microphone=()`와 무관

## 4. 강화

- `validateBackup`: 운동 회차의 `routineName`·`routineId`는 없거나 100자 이하 문자열, 운동 이름은 200자 이하(입력칸 제한은 60자, 예전 기록이 막히지 않도록 넉넉히)
- NAS 복원 목록: `backupList()`(nas-backup.mjs)로 id 패턴·날짜를 검사하고 루틴·세트 수를 숫자로 바꾼 뒤 화면에 넣음
- 백업 서버: 캐시 파일 `index.json`에서 읽은 id 중 패턴에 맞는 것만 사용(읽기·삭제 경로에 쓰이므로)
- 백업 컨테이너: `network_mode: host` 대신 자체 bridge 네트워크, 포트는 `127.0.0.1:18086`에만 공개(NAS의 localhost 서비스에 접근 불가). `cap_drop: ALL` 추가. 서버는 컨테이너 안에서 `BACKUP_HOST=0.0.0.0`
- NAS에 남은 옛 STT 파일(`api/`, `setup-stt-secrets.sh`)은 root로 백업 폴더에 옮김(삭제는 사용자가 판단). `state/`는 내용 확인 후 결정

## 하지 않은 것

- 이미지 태그 고정(`node:22-alpine`, `nginx:stable-alpine`): 다이제스트 고정은 보안 업데이트를 놓칠 수 있어 그대로 둠
- 요청 제한 공유: Funnel 뒤에서는 모든 요청이 같은 주소라 분당 10회 제한을 함께 씀. 토큰이 256비트라 대입 공격은 불가능하고, 피해는 백업 지연뿐이라 유지

검증: domain 테스트 1개, nas-backup 테스트 1개, 백업 서버 테스트 1개 추가, 전체 PWA 테스트 119개와 백업 서버 테스트 13개 통과. nginx.conf의 헤더를 그대로 붙이는 로컬 서버에서 화면 이동·NAS 연결과 백업·세트 저장·받아쓰기 창·CSV 내보내기·서비스 워커·글꼴 확인, 콘솔 CSP 위반 0건, 일부러 넣은 인라인 스크립트·스타일은 차단 확인. 패키지에서 꺼낸 백업 서버로 401·201과 `exerciseParts` 저장 확인.
