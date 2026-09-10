#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Assetra — installer/updater untuk satu VM Google Compute Engine
# (Debian 12 / Ubuntu 22.04+). Menjalankan API (Node 22 + SQLite) dan menyajikan
# frontend hasil build dari origin yang sama, di belakang Caddy (HTTPS otomatis).
#
# Pemakaian sebagai "startup script" VM (dijalankan otomatis tiap boot):
#   curl -fsSL https://raw.githubusercontent.com/dimasgardenia/assetra-api/claude/mobile-chrome-repo-testing-hotwug/scripts/gce/install.sh | bash -s -- --boot
# Pemakaian manual / update ke versi terbaru (lewat SSH, sebagai root):
#   sudo bash /opt/assetra/api/scripts/gce/install.sh
#
# Konfigurasi dibaca dari metadata VM (Compute Engine → VM → Edit → Custom metadata)
# atau dari variabel lingkungan dengan nama yang sama (huruf besar, tanpa tanda minus):
#   assetra-branch          cabang git yang dipasang (default: main)
#   assetra-domain          mis. assetraland.com  (kosong = akses lewat IP, HTTP saja)
#   assetra-admin-email     email akun admin pertama (default: landassetra@gmail.com)
#   assetra-admin-password  sandi admin pertama (min 8 karakter) — WAJIB saat pasang pertama
#   assetra-maps-key        kunci Google Maps (VITE_GOOGLE_MAPS_API_KEY)
#   assetra-google-client-id  OAuth Client ID Google Sign-In (default: client "SSO assetra")
#   assetra-resend-key      kunci Resend untuk email verifikasi (opsional)
#   assetra-anthropic-key   kunci Anthropic untuk fitur AI (opsional)
# Nilai yang sudah ada di /etc/assetra/env dipertahankan bila metadata kosong.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR=/opt/assetra
ENV_FILE=/etc/assetra/env
DATA_DIR=/var/lib/assetra
API_REPO=https://github.com/dimasgardenia/assetra-api.git
WEB_REPO=https://github.com/dimasgardenia/assetra-web.git
DEFAULT_GOOGLE_CLIENT_ID=913829727818-1kcfri271ngm2hmrko9qucsnbi0jnkhg.apps.googleusercontent.com
BOOT=0; case "${1:-}" in --boot|boot|*boot) BOOT=1;; esac

[ "$(id -u)" = 0 ] || { echo "Jalankan sebagai root (sudo)."; exit 1; }

# Jalankan dari salinan sementara: git checkout di bawah akan menimpa file ini.
if [ -f "${BASH_SOURCE[0]:-}" ] && [ "${ASSETRA_RELOCATED:-}" != 1 ]; then
  _tmp="$(mktemp)"; cp "${BASH_SOURCE[0]}" "$_tmp"
  ASSETRA_RELOCATED=1 exec bash "$_tmp" "$@"
fi

# Startup script berjalan tiap boot: bila sudah terpasang, cukup pastikan layanan hidup.
if [ "$BOOT" = 1 ] && [ -f "$APP_DIR/.installed" ]; then
  systemctl start assetra caddy || true
  echo "[assetra] sudah terpasang — layanan dipastikan berjalan."; exit 0
fi

log() { echo; echo "──── $* ────"; }
meta() { curl -fs -m 3 -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" 2>/dev/null || true; }
cfg() { # cfg VAR metadata-key default → pakai env VAR, lalu metadata, lalu default
  local v="${!1:-}"; [ -n "$v" ] || v="$(meta "$2")"; [ -n "$v" ] || v="${3:-}"; printf '%s' "$v"
}
envget() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | sed 's/^"\(.*\)"$/\1/' || true; }
envset() { # envset KEY VALUE → tulis/ganti di ENV_FILE (dikutip agar aman untuk systemd)
  mkdir -p "$(dirname "$ENV_FILE")"; touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
  if grep -q "^$1=" "$ENV_FILE"; then
    local esc; esc=$(printf '%s' "$2" | sed 's/[\/&\\]/\\&/g')   # escape hanya untuk pola pengganti sed
    sed -i "s/^$1=.*/$1=\"$esc\"/" "$ENV_FILE"
  else
    printf '%s="%s"\n' "$1" "$2" >> "$ENV_FILE"
  fi
}

BRANCH="$(cfg ASSETRA_BRANCH assetra-branch main)"
DOMAIN="$(cfg ASSETRA_DOMAIN assetra-domain "$(envget DOMAIN)")"
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"; DOMAIN="${DOMAIN#www.}"
ADMIN_EMAIL="$(cfg ASSETRA_ADMIN_EMAIL assetra-admin-email "$(envget ADMIN_EMAIL)")"; ADMIN_EMAIL="${ADMIN_EMAIL:-landassetra@gmail.com}"
ADMIN_PASSWORD="$(cfg ASSETRA_ADMIN_PASSWORD assetra-admin-password "$(envget ADMIN_PASSWORD)")"
MAPS_KEY="$(cfg ASSETRA_MAPS_KEY assetra-maps-key "$(envget VITE_GOOGLE_MAPS_API_KEY)")"
GOOGLE_CLIENT_ID="$(cfg ASSETRA_GOOGLE_CLIENT_ID assetra-google-client-id "$(envget GOOGLE_CLIENT_ID)")"; GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-$DEFAULT_GOOGLE_CLIENT_ID}"
RESEND_KEY="$(cfg ASSETRA_RESEND_KEY assetra-resend-key "$(envget RESEND_API_KEY)")"
ANTHROPIC_KEY="$(cfg ASSETRA_ANTHROPIC_KEY assetra-anthropic-key "$(envget ANTHROPIC_API_KEY)")"
EXT_IP="$(curl -fs -m 3 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || hostname -I | awk '{print $1}')"

if [ -z "$ADMIN_PASSWORD" ] || [ "${#ADMIN_PASSWORD}" -lt 8 ]; then
  echo "[assetra] FATAL: assetra-admin-password belum diisi (min 8 karakter). Tambahkan di metadata VM lalu jalankan ulang."; exit 1
fi

log "1/7 Paket sistem (Node 22, git, Caddy)"
export DEBIAN_FRONTEND=noninteractive
# Saat boot pertama Debian menjalankan apt (unattended-upgrades / agen Google) — tunggu sampai selesai.
wait_apt() {
  local n=0
  while pgrep -x 'apt|apt-get|dpkg' >/dev/null 2>&1 || pgrep -f 'unattended-upgrade$' >/dev/null 2>&1; do
    [ $((n % 6)) = 0 ] && echo "menunggu proses apt lain selesai…"; n=$((n + 1)); sleep 5
    [ $n -gt 180 ] && { echo "apt lain tidak selesai setelah 15 menit"; break; }
  done
}
APT="apt-get -o DPkg::Lock::Timeout=600"
wait_apt; dpkg --configure -a >/dev/null 2>&1 || true   # bereskan instalasi yang terputus
wait_apt; $APT update -qq
wait_apt; $APT install -y -qq curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https build-essential python3 >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  wait_apt; $APT install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  wait_apt; $APT update -qq && $APT install -y -qq caddy >/dev/null
fi
echo "node $(node -v), caddy $(caddy version | cut -d' ' -f1)"

# Swap 2 GB bila RAM kecil (build Vite butuh memori)
if [ ! -f /swapfile ] && [ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" -lt 3000 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap 2G dibuat"
fi

log "2/7 Pengguna & folder"
id assetra >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin assetra
mkdir -p "$APP_DIR" "$DATA_DIR/uploads"

log "3/7 Kode sumber (cabang: $BRANCH)"
g() { git -c "safe.directory=*" "$@"; }   # repo dimiliki user assetra, dijalankan root
fetch() { # fetch DIR REPO — gagal = skrip berhenti (jangan diam-diam build kode lama)
  if [ -d "$1/.git" ]; then
    g -C "$1" fetch -q origin "$BRANCH" && g -C "$1" checkout -q -B "$BRANCH" "origin/$BRANCH" || { echo "GAGAL menarik kode $1"; exit 1; }
  else
    g clone -q --branch "$BRANCH" "$2" "$1" || { echo "GAGAL clone $2"; exit 1; }
  fi
  echo "$1 @ $(g -C "$1" rev-parse --short HEAD)"
}
fetch "$APP_DIR/api" "$API_REPO"
fetch "$APP_DIR/web" "$WEB_REPO"

log "4/7 Konfigurasi ($ENV_FILE)"
if [ -n "$DOMAIN" ]; then APP_URL="https://$DOMAIN"; else APP_URL="http://$EXT_IP"; fi
envset NODE_ENV production
envset TRUST_PROXY true
envset PORT 3001
envset WEB_DIST "$APP_DIR/web-dist"
envset DB_PATH "$DATA_DIR/assetra.db"
envset UPLOAD_DIR "$DATA_DIR/uploads"
[ -n "$(envget JWT_SECRET)" ] || envset JWT_SECRET "$(openssl rand -hex 32)"
envset BRANCH "$BRANCH"
envset DOMAIN "$DOMAIN"
envset APP_URL "$APP_URL"
envset CORS_ORIGIN "$APP_URL"
envset GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
envset ADMIN_EMAIL "$ADMIN_EMAIL"
envset ADMIN_PASSWORD "$ADMIN_PASSWORD"
envset VITE_GOOGLE_MAPS_API_KEY "$MAPS_KEY"
envset RESEND_API_KEY "$RESEND_KEY"
envset ANTHROPIC_API_KEY "$ANTHROPIC_KEY"
if [ -n "$DOMAIN" ]; then envset RESEND_FROM "Assetra <no-reply@$DOMAIN>"; fi
echo "APP_URL=$APP_URL, admin=$ADMIN_EMAIL, maps-key=$([ -n "$MAPS_KEY" ] && echo ada || echo KOSONG), resend=$([ -n "$RESEND_KEY" ] && echo ada || echo KOSONG)"

log "5/7 Build"
( cd "$APP_DIR/api" && npm ci --omit=dev --no-audit --no-fund --loglevel=error )
( cd "$APP_DIR/web" && npm ci --no-audit --no-fund --loglevel=error \
  && VITE_API_BASE="" VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" VITE_GOOGLE_MAPS_API_KEY="$MAPS_KEY" npm run build --silent )
rm -rf "$APP_DIR/web-dist" && cp -r "$APP_DIR/web/dist" "$APP_DIR/web-dist"
chown -R assetra:assetra "$APP_DIR" "$DATA_DIR"
chown assetra:assetra "$ENV_FILE"

log "6/7 Layanan systemd"
cat > /etc/systemd/system/assetra.service <<UNIT
[Unit]
Description=Assetra API + web
After=network-online.target
Wants=network-online.target

[Service]
User=assetra
Group=assetra
WorkingDirectory=$APP_DIR/api
EnvironmentFile=$ENV_FILE
ExecStartPre=/usr/bin/node src/db/seed.js
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable -q assetra
systemctl restart assetra

log "7/7 Caddy (reverse proxy + HTTPS)"
{
  if [ -n "$DOMAIN" ]; then
    printf '%s, www.%s {\n  encode gzip\n  reverse_proxy 127.0.0.1:3001\n}\n\n' "$DOMAIN" "$DOMAIN"
  fi
  printf ':80 {\n  encode gzip\n  reverse_proxy 127.0.0.1:3001\n}\n'
} > /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile >/dev/null 2>&1 || true
systemctl enable -q caddy
systemctl restart caddy

log "Auto-update (cek GitHub tiap 5 menit)"
cat > /etc/systemd/system/assetra-autoupdate.service <<UNIT
[Unit]
Description=Assetra auto-update from GitHub

[Service]
Type=oneshot
ExecStart=/usr/bin/bash $APP_DIR/api/scripts/gce/autoupdate.sh
UNIT
cat > /etc/systemd/system/assetra-autoupdate.timer <<UNIT
[Unit]
Description=Check GitHub for Assetra updates every 5 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable -q --now assetra-autoupdate.timer

sleep 3
if curl -fs -m 5 http://127.0.0.1:3001/api/health >/dev/null; then HEALTH=OK; else HEALTH="GAGAL (lihat: journalctl -u assetra -n 50)"; fi
touch "$APP_DIR/.installed"
echo
echo "════════════════════════════════════════════════════════"
echo " Assetra terpasang.  API: $HEALTH"
echo " Buka:      $APP_URL"
[ -n "$DOMAIN" ] && echo "            (arahkan DNS A record $DOMAIN dan www.$DOMAIN → $EXT_IP; HTTPS aktif otomatis)"
echo " Admin:     $ADMIN_EMAIL"
echo " Log:       sudo journalctl -u assetra -f"
echo " Update:    otomatis tiap 5 menit dari GitHub (manual: sudo bash $APP_DIR/api/scripts/gce/install.sh)"
echo "════════════════════════════════════════════════════════"
