#!/usr/bin/env bash
# Rebuild and restart Kidsphere from the source currently in $APP_DIR.
# Normally invoked by deploy/remote-deploy.sh after it uploads `git archive HEAD`.
#
#   sudo bash deploy/deploy.sh
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/kidsphere}
APP_USER=${APP_USER:-kidsphere}
NODE_DIR=${NODE_DIR:-/opt/kidsphere-node}
cd "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

run() { sudo -u "$APP_USER" -H bash -c "export PATH='$NODE_DIR/bin':$PATH && cd '$APP_DIR' && set -a && . ./.env && set +a && $*"; }

echo "==> Dependencies ..."
LOCK_HASH=$(md5sum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat node_modules/.lockhash 2>/dev/null)" != "$LOCK_HASH" ]; then
  run "npm ci --no-audit --no-fund --include=dev"
  echo "$LOCK_HASH" > node_modules/.lockhash
else
  echo "    unchanged — skipping npm ci"
fi

echo "==> Database migrations ..."
run "npx prisma migrate deploy"

echo "==> Production build ..."
run "npm run build"
# Standalone server needs the static assets next to it.
run "rm -rf .next/standalone/.next/static .next/standalone/public && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public"

echo "==> Restart ..."
systemctl restart kidsphere
sleep 3
PORT=$(grep -E '^PORT=' .env | cut -d= -f2)
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT:-3070}/api/health" >/dev/null; then echo "    healthy"; exit 0; fi
  sleep 2
done
echo "!! health check failed — see: journalctl -u kidsphere -n 100"
exit 1
