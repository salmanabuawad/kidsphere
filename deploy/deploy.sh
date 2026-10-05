#!/usr/bin/env bash
#
# Server-side deploy of one KidSphere release (run as root from an extracted
# release directory: `bash deploy/deploy.sh`). Steps:
#   1. sync backend/ and frontend/ sources into /var/www/kidsphere
#   2. (re)build the Python venv when requirements.txt changed
#   3. back up the database, then `alembic upgrade head`
#   4. npm ci (when the lockfile changed) and build the React app into dist.new,
#      then swap it in
#   5. restart kidsphere-mvp-api, wait for /api/health, reload nginx
# Tests are not rerun here; run deploy/ci/remote-test.sh before deploying.
set -euo pipefail

SRC=$(cd "$(dirname "$0")/.." && pwd)
APP=/var/www/kidsphere
NODE_BIN=/opt/kidsphere-node/bin
as_app() { runuser -u kidsphere-mvp -- env -i HOME=/home/kidsphere-mvp PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 "$@"; }

[[ -f $APP/backend/.env ]] || { echo "not provisioned: run deploy/install.sh first" >&2; exit 1; }

echo "==> syncing sources"
rsync -a --delete --exclude venv --exclude .env --exclude '__pycache__' "$SRC/backend/" "$APP/backend/"
chown -R kidsphere-mvp:kidsphere-mvp "$APP/backend"
if [[ -f $SRC/frontend/package.json ]]; then
  rsync -a --delete --exclude node_modules --exclude dist --exclude dist.new "$SRC/frontend/" "$APP/frontend/"
  chown -R kidsphere-mvp:kidsphere-mvp "$APP/frontend"
fi

echo "==> python venv"
cd "$APP/backend"
REQ_HASH=$(sha256sum requirements.txt | cut -c1-16)
if [[ ! -f venv/.ok || $(cat venv/.ok) != "$REQ_HASH" ]]; then
  rm -rf venv
  as_app python3 -m venv venv
  as_app venv/bin/pip install -q --upgrade pip
  as_app venv/bin/pip install -q -r requirements.txt
  echo "$REQ_HASH" > venv/.ok
  chown kidsphere-mvp:kidsphere-mvp venv/.ok
fi

echo "==> database backup + migrations"
STAMP=$(date +%Y%m%d-%H%M%S)
sudo -u postgres pg_dump -Fc kidsphere_mvp > "/var/backups/kidsphere/kidsphere-$STAMP.dump"
ls -1t /var/backups/kidsphere/kidsphere-*.dump | tail -n +11 | xargs -r rm -f
as_app venv/bin/python -m alembic upgrade head

if [[ -f $APP/frontend/package.json ]]; then
  echo "==> frontend build"
  cd "$APP/frontend"
  export NODE_OPTIONS=--max-old-space-size=768
  LOCK_HASH=$(sha256sum package-lock.json | cut -c1-16)
  if [[ ! -f node_modules/.ok || $(cat node_modules/.ok) != "$LOCK_HASH" ]]; then
    as_app env NODE_OPTIONS=$NODE_OPTIONS npm_config_cache=/home/kidsphere-mvp/.npm npm ci --no-audit --no-fund --loglevel=error
    echo "$LOCK_HASH" > node_modules/.ok
    chown kidsphere-mvp:kidsphere-mvp node_modules/.ok
  fi
  rm -rf dist.new
  as_app env NODE_OPTIONS=$NODE_OPTIONS npx vite build --outDir dist.new --emptyOutDir
  rm -rf dist.old
  [[ -d dist ]] && mv dist dist.old
  mv dist.new dist
  rm -rf dist.old
fi

echo "==> restarting kidsphere-mvp-api"
systemctl restart kidsphere-mvp-api
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3071/api/health >/dev/null 2>&1; then break; fi
  sleep 1
  [[ $i == 30 ]] && { journalctl -u kidsphere-mvp-api -n 40 --no-pager; echo "API did not become healthy" >&2; exit 1; }
done
nginx -t && systemctl reload nginx

echo "==> smoke test"
curl -fsS -o /dev/null -w "api health: %{http_code}\n" http://127.0.0.1:3071/api/health
curl -fsS -o /dev/null -w "public /:   %{http_code}\n" https://kids.kortexd.com/
curl -fsS -o /dev/null -w "public api: %{http_code}\n" https://kids.kortexd.com/api/health
echo "==> deployed"
