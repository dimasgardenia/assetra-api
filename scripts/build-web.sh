#!/usr/bin/env bash
# Clone assetra-web and build it into ./web-dist so the API can serve it
# (WEB_DIST=./web-dist). Used by render.yaml and any single-service host.
#
#   WEB_REPO    git URL of the frontend (default: dimasgardenia/assetra-web)
#   WEB_BRANCH  branch to build (default: same branch as this checkout, then main)
set -euo pipefail
cd "$(dirname "$0")/.."

WEB_REPO="${WEB_REPO:-https://github.com/dimasgardenia/assetra-web.git}"
if [ -z "${WEB_BRANCH:-}" ]; then
  WEB_BRANCH="${RENDER_GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
fi

rm -rf .web-src web-dist
if ! git clone --depth 1 --branch "$WEB_BRANCH" "$WEB_REPO" .web-src 2>/dev/null; then
  echo "[build-web] branch '$WEB_BRANCH' not found in $WEB_REPO, falling back to main"
  git clone --depth 1 --branch main "$WEB_REPO" .web-src
fi

cd .web-src
npm ci --no-audit --no-fund
# Empty VITE_API_BASE = same origin: the API serves both the SPA and /api.
VITE_API_BASE="" VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-}" npm run build
cd ..
mv .web-src/dist web-dist
rm -rf .web-src
echo "[build-web] frontend built into ./web-dist ($(du -sh web-dist | cut -f1))"
