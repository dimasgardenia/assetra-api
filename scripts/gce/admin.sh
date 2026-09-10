#!/usr/bin/env bash
# Jadikan akun sebagai admin di VM:  sudo bash /opt/assetra/api/scripts/gce/admin.sh <email> [sandi]
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Jalankan dengan sudo"; exit 1; }
[ -n "${1:-}" ] || { echo "Pemakaian: sudo bash $0 <email> [sandi]"; exit 1; }
set -a; . /etc/assetra/env; set +a
cd /opt/assetra/api
sudo -u assetra --preserve-env=DB_PATH,NODE_ENV node scripts/make-admin.mjs "$1" "${2:-}"
