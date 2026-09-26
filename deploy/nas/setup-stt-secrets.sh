#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SECRETS_DIR="$PROJECT_DIR/secrets"
SECRETS_FILE="$SECRETS_DIR/stt.json"

if [ -e "$SECRETS_FILE" ]; then
  echo "이미 $SECRETS_FILE 파일이 있습니다. 기존 인증정보를 덮어쓰지 않았습니다." >&2
  exit 1
fi

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"
printf 'Hermes 사용자명: ' >&2
IFS= read -r HERMES_USERNAME
printf 'Hermes 비밀번호: ' >&2
stty -echo
restore_echo() { stty echo 2>/dev/null || true; }
trap restore_echo EXIT HUP INT TERM
IFS= read -r HERMES_PASSWORD
restore_echo
printf '\n' >&2
trap - EXIT HUP INT TERM

if [ -z "$HERMES_USERNAME" ] || [ -z "$HERMES_PASSWORD" ]; then
  echo "사용자명과 비밀번호를 모두 입력해야 합니다." >&2
  unset HERMES_USERNAME HERMES_PASSWORD
  exit 1
fi

printf '%s\n%s\n' "$HERMES_USERNAME" "$HERMES_PASSWORD" |
  docker run --rm -i -v "$SECRETS_DIR:/out" --entrypoint node node:22-alpine -e '
    const fs = require("node:fs");
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", part => input += part);
    process.stdin.on("end", () => {
      const lines = input.replace(/\n$/, "").split("\n");
      if (lines.length !== 2 || !lines[0] || !lines[1]) process.exit(2);
      const secrets = {
        HERMES_USERNAME: lines[0],
        HERMES_PASSWORD: lines[1]
      };
      fs.writeFileSync("/out/stt.json", JSON.stringify(secrets) + "\n", { mode: 0o600, flag: "wx" });
      fs.chmodSync("/out/stt.json", 0o600);
      process.stdout.write("\nHermes 인증 정보를 저장했습니다.\n");
    });
  '

unset HERMES_USERNAME HERMES_PASSWORD
chmod 600 "$SECRETS_FILE"
echo "Hermes 인증 파일을 권한 600으로 만들었습니다: $SECRETS_FILE"
