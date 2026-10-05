#!/usr/bin/env bash
#
# Server-side deploy of one KidSphere release (run as root from an extracted
# release directory: `bash deploy/deploy.sh`). Steps:
#   1. sync backend/ and frontend/ sources into /var/www/kidsphere, and install
#      the nightly backup script + timer (deploy/backup.sh, systemd/kidsphere-mvp-backup.*)
#   2. (re)build the Python venv when requirements.txt changed
#   3. back up the database (kidsphere-predeploy-<stamp>.dump, newest 10 kept),
#      then `alembic upgrade head`
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

echo "==> nightly backup timer"
# Same as install.sh: keeps the installed backup script and units current, and
# turns the timer on for servers provisioned before it existed.
install -m 700 "$SRC/deploy/backup.sh" /usr/local/sbin/kidsphere-mvp-backup
install -m 644 "$SRC/deploy/systemd/kidsphere-mvp-backup.service" /etc/systemd/system/kidsphere-mvp-backup.service
install -m 644 "$SRC/deploy/systemd/kidsphere-mvp-backup.timer" /etc/systemd/system/kidsphere-mvp-backup.timer
systemctl daemon-reload
systemctl enable --now kidsphere-mvp-backup.timer >/dev/null

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
# Pre-deploy dumps are kidsphere-predeploy-<stamp>.dump; the newest 10 are kept
# (dumps named kidsphere-<stamp>.dump by older deploys count as pre-deploy dumps).
# The nightly nightly-*.dump and uploads-*.tgz have their own rotation in
# deploy/backup.sh. A failed dump leaves no *.partial behind (the EXIT trap).
BACKUPS=/var/backups/kidsphere
DUMP=$BACKUPS/kidsphere-predeploy-$(date +%Y%m%d-%H%M%S).dump
trap 'rm -f -- "$DUMP.partial"' EXIT
(umask 077; sudo -u postgres pg_dump -Fc kidsphere_mvp > "$DUMP.partial")
mv "$DUMP.partial" "$DUMP"
shopt -s nullglob
PREDEPLOY=("$BACKUPS"/kidsphere-predeploy-*.dump "$BACKUPS"/kidsphere-[0-9]*.dump)
shopt -u nullglob
ls -1t "${PREDEPLOY[@]}" | tail -n +11 | xargs -r rm -f
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
