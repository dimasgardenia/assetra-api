#!/usr/bin/env bash
# Auto-update Assetra: dijalankan systemd timer tiap 5 menit di VM.
# Bila commit terbaru di GitHub (cabang yang dipasang) berbeda dari yang
# terpasang, jalankan install.sh versi terbaru (tarik kode, build, restart).
set -euo pipefail
APP_DIR=/opt/assetra
ENV_FILE=/etc/assetra/env
API_REPO=https://github.com/dimasgardenia/assetra-api.git
WEB_REPO=https://github.com/dimasgardenia/assetra-web.git

exec 9>/run/lock/assetra-update.lock
flock -n 9 || { echo "[autoupdate] proses update lain masih berjalan"; exit 0; }

BRANCH="$(sed -n 's/^BRANCH=//p' "$ENV_FILE" | tr -d '"')"; BRANCH="${BRANCH:-main}"
remote() { git ls-remote -q "$1" "refs/heads/$BRANCH" 2>/dev/null | cut -f1; }
API_REMOTE="$(remote "$API_REPO")"; WEB_REMOTE="$(remote "$WEB_REPO")"
API_LOCAL="$(git -c safe.directory='*' -C "$APP_DIR/api" rev-parse HEAD 2>/dev/null || true)"
WEB_LOCAL="$(git -c safe.directory='*' -C "$APP_DIR/web" rev-parse HEAD 2>/dev/null || true)"

if [ -z "$API_REMOTE" ] || [ -z "$WEB_REMOTE" ]; then echo "[autoupdate] GitHub tidak terjangkau, coba lagi nanti"; exit 0; fi
if [ "$API_REMOTE" = "$API_LOCAL" ] && [ "$WEB_REMOTE" = "$WEB_LOCAL" ]; then exit 0; fi

echo "[autoupdate] perubahan terdeteksi (api ${API_LOCAL:0:7}→${API_REMOTE:0:7}, web ${WEB_LOCAL:0:7}→${WEB_REMOTE:0:7}) — memperbarui…"
TMP="$(mktemp)"
if ! curl -fsSL "https://raw.githubusercontent.com/dimasgardenia/assetra-api/$BRANCH/scripts/gce/install.sh" -o "$TMP"; then
  cp "$APP_DIR/api/scripts/gce/install.sh" "$TMP"
fi
ASSETRA_BRANCH="$BRANCH" bash "$TMP"
rm -f "$TMP"
echo "[autoupdate] selesai"
