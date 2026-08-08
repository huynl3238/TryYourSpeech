#!/usr/bin/env bash
#
# Canh bao qua email khi he thong hong.
#
# Ly do ton tai: 06/08/2026 VPS reboot, hai container Postgres/Redis khong tu bat
# lai. Backend van song va nginx van tra trang web binh thuong, nen nhin tu ngoai
# vao khong co gi bat thuong — chi la khong ai dang nhap noi. Hong 23 tieng moi
# bi phat hien. `restart: unless-stopped` da chan duoc dung nguyen nhan do, nhung
# dia day, Postgres tu chet hay khoa OpenAI het han thi van se am tham y nhu vay.
#
# Chay tu cron tren VPS, KHONG nam trong ung dung: mot bo theo doi nhet vao
# backend se chet cung backend, tuc la vo dung dung luc can nhat.
#
# Han che da biet: script nay chay tren chinh VPS duoc theo doi, nen ca VPS sap
# thi khong co canh bao nao. Muon bat ca truong hop do thi can mot bo kiem tra
# dat o ben ngoai (vi du GitHub Actions chay dinh ky).
#
# Cai dat:
#   cp ops/tys-watchdog.sh /root/tys-watchdog.sh && chmod +x /root/tys-watchdog.sh
#   ( crontab -l 2>/dev/null; echo '*/5 * * * * /root/tys-watchdog.sh' ) | crontab -
#
# Thu ma khong lam anh huong dich vu that: tro sang mot URL chac chan hong
#   TYS_HEALTH_URL=https://try-your-speech.lehuytramy.site/api/khong-ton-tai /root/tys-watchdog.sh

set -uo pipefail

HEALTH_URL="${TYS_HEALTH_URL:-https://try-your-speech.lehuytramy.site/api/health}"
ENV_FILE="${TYS_ENV_FILE:-/root/TryYourSpeech/backend/.env}"
STATE_FILE="/root/.tys-watchdog.state"
LOG_FILE="/var/log/tys-watchdog.log"
LOCK_FILE="/run/tys-watchdog.lock"
ALERT_TO="nguyenlehuyy2020@gmail.com"

# Neu hong keo dai thi nhac lai sau 6 tieng. Khong nhac moi 5 phut: bi spam thi
# nguoi ta tat thong bao, va luc do bo canh bao thanh vo dung.
REALERT_SECONDS=21600

# Chi mot ban chay cung luc. Mot lan curl treo 20 giay khong duoc de cron lan sau
# chay chong len roi gui hai email cho cung mot su co.
exec 9>"$LOCK_FILE" || exit 0
flock -n 9 || exit 0

log() {
  printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG_FILE"
}

# Log khong duoc phinh ra vo han tren o dia 31GB.
trim_log() {
  if [ -f "$LOG_FILE" ] && [ "$(stat -c %s "$LOG_FILE")" -gt 1048576 ]; then
    tail -n 500 "$LOG_FILE" >"$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
}

# Doc lai khoa Resend cua chinh ung dung thay vi giu mot ban sao thu hai. Mot
# secret nam o hai cho la mot cho se bi quen khi doi khoa.
read_secrets() {
  RESEND_API_KEY="$(sed -n 's/^RESEND_API_KEY=//p' "$ENV_FILE" | head -1)"
  EMAIL_FROM="$(sed -n 's/^EMAIL_FROM=//p' "$ENV_FILE" | head -1)"
}

send_mail() {
  local subject="$1" body="$2" payload config code

  if [ -z "${RESEND_API_KEY:-}" ] || [ -z "${EMAIL_FROM:-}" ]; then
    log "KHONG GUI DUOC: thieu RESEND_API_KEY hoac EMAIL_FROM trong $ENV_FILE"
    return 1
  fi

  # jq tu lo phan escape, khong tu noi chuoi JSON bang tay.
  payload="$(jq -n \
    --arg from "$EMAIL_FROM" \
    --arg to "$ALERT_TO" \
    --arg subject "$subject" \
    --arg text "$body" \
    '{from: $from, to: [$to], subject: $subject, text: $text}')"

  # Khoa di qua file config chu khong qua dong lenh: tham so cua curl hien ra
  # trong `ps` cho moi user tren may doc duoc.
  umask 077
  config="$(mktemp)"
  printf 'header = "authorization: Bearer %s"\n' "$RESEND_API_KEY" >"$config"

  code="$(curl -s -o /tmp/tys-watchdog-mail.out -w '%{http_code}' --max-time 25 \
    --config "$config" \
    -X POST https://api.resend.com/emails \
    -H 'content-type: application/json' \
    -d "$payload")"
  rm -f "$config"

  if [ "$code" = "200" ]; then
    log "da gui email: $subject"
    return 0
  fi

  log "GUI EMAIL LOI http=$code $(head -c 200 /tmp/tys-watchdog-mail.out 2>/dev/null | tr '\n' ' ')"
  return 1
}

# Tra ve: "ok" hoac "fail", kem chi tiet trong bien toan cuc DETAIL.
check_health() {
  local raw code json

  raw="$(curl -s --max-time 20 -w $'\n%{http_code}' "$HEALTH_URL" 2>/dev/null)"
  code="$(printf '%s' "$raw" | tail -n 1)"
  json="$(printf '%s' "$raw" | sed '$d')"

  if [ "$code" = "200" ]; then
    local status
    status="$(printf '%s' "$json" | jq -r '.status // empty' 2>/dev/null)"
    if [ "$status" = "ok" ]; then
      DETAIL=""
      echo ok
      return
    fi
  fi

  # Chi lay ten dich vu va thong bao loi. KHONG dua ca JSON vao email: no liet ke
  # ten cac bien moi truong, va khong co ly do gi de nhung chung vao mot email.
  local broken
  broken="$(printf '%s' "$json" | jq -r '
    .services // {} | to_entries[]
    | select((.value.ok // true) == false)
    | "- \(.key): \(.value.error // "khong ok")"' 2>/dev/null)"

  DETAIL="$(printf 'URL: %s\nHTTP: %s\n' "$HEALTH_URL" "${code:-khong-phan-hoi}")"
  if [ -n "$broken" ]; then
    DETAIL="$(printf '%s\nDich vu loi:\n%s\n' "$DETAIL" "$broken")"
  fi
  DETAIL="$(printf '%s\nDocker:\n%s\n\nPM2:\n%s\n\nDia:\n%s\n' \
    "$DETAIL" \
    "$(docker ps -a --format '{{.Names}}: {{.Status}}' 2>&1 | head -10)" \
    "$(pm2 jlist 2>/dev/null | jq -r '.[] | "\(.name): \(.pm2_env.status)"' 2>/dev/null | head -5)" \
    "$(df -h / | tail -1)")"

  echo fail
}

trim_log
read_secrets

DETAIL=""
current="$(check_health)"
now="$(date +%s)"

previous="ok"
last_alert_at=0
if [ -f "$STATE_FILE" ]; then
  read -r previous last_alert_at <"$STATE_FILE" 2>/dev/null || true
  previous="${previous:-ok}"
  last_alert_at="${last_alert_at:-0}"
fi

if [ "$current" = "fail" ]; then
  since_last=$((now - last_alert_at))

  if [ "$previous" = "ok" ]; then
    log "HONG — gui canh bao"
    send_mail "[TryYourSpeech] Hệ thống đang lỗi" \
      "$(printf 'Kiem tra luc %s cho thay he thong khong hoat dong binh thuong.\n\n%s\n\nXem them: https://try-your-speech.lehuytramy.site/api/health\n' "$(date '+%F %T')" "$DETAIL")"
    printf '%s %s\n' fail "$now" >"$STATE_FILE"
  elif [ "$since_last" -ge "$REALERT_SECONDS" ]; then
    log "VAN CON HONG sau $since_last giay — nhac lai"
    send_mail "[TryYourSpeech] Vẫn đang lỗi" \
      "$(printf 'He thong van chua hoat dong lai, tinh tu canh bao truoc da %s gio.\n\n%s\n' "$((since_last / 3600))" "$DETAIL")"
    printf '%s %s\n' fail "$now" >"$STATE_FILE"
  else
    log "van con hong — chua den luc nhac lai"
    printf '%s %s\n' fail "$last_alert_at" >"$STATE_FILE"
  fi
  exit 0
fi

if [ "$previous" = "fail" ]; then
  log "da hoat dong lai — gui email thong bao"
  send_mail "[TryYourSpeech] Hệ thống đã hoạt động lại" \
    "$(printf 'Kiem tra luc %s cho thay he thong da tro lai binh thuong.\n' "$(date '+%F %T')")"
fi

printf '%s %s\n' ok 0 >"$STATE_FILE"
log "ok"
