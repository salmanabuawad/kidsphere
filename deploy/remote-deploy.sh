#!/usr/bin/env bash
# One-command remote deploy (run from a dev machine with SSH key access).
#
#   SSH_HOST=185.229.226.37 bash deploy/remote-deploy.sh            # deploy
#   SSH_HOST=185.229.226.37 FIRST_INSTALL=1 bash deploy/remote-deploy.sh   # first time
#
# Uploads exactly the committed HEAD (`git archive`), never local secrets or
# runtime files (.env, node_modules, .data are not tracked).
set -euo pipefail

SSH_HOST=${SSH_HOST:?set SSH_HOST}
SSH_USER=${SSH_USER:-root}
APP_DIR=${APP_DIR:-/opt/kidsphere}
DOMAIN=${DOMAIN:-kids.kortexd.com}
# Names on the server (override to avoid clashing with other apps on the host).
APP_USER=${APP_USER:-kidsphere}
SERVICE=${SERVICE:-kidsphere}
DB_NAME=${DB_NAME:-kidsphere}
DB_USER=${DB_USER:-kidsphere}
PORT=${PORT:-3070}
STORAGE_DIR=${STORAGE_DIR:-/var/lib/$SERVICE/storage}
REMOTE_ENV="APP_DIR='$APP_DIR' APP_USER='$APP_USER' SERVICE='$SERVICE' DB_NAME='$DB_NAME' DB_USER='$DB_USER' PORT='$PORT' STORAGE_DIR='$STORAGE_DIR' DOMAIN='$DOMAIN'"
TARGET="$SSH_USER@$SSH_HOST"
SSH_KEY=${SSH_KEY:-$HOME/.ssh/kidsphere_deploy}
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[ -f "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")

cd "$(git rev-parse --show-toplevel)"
SHA=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain)" ]; then
  echo "WARNING: uncommitted changes are NOT deployed — deploying HEAD $SHA"
fi

echo "==> Uploading $SHA to $TARGET:$APP_DIR ..."
git archive --format=tar.gz HEAD | ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p '$APP_DIR' && tar -xzf - -C '$APP_DIR' && echo '$SHA' > '$APP_DIR/REVISION'"

# Optional local build (BUILD_LOCALLY=1). Only use it from Linux/macOS: Turbopack standalone
# bundles contain symlinks that Windows cannot reproduce. Default: build on the server.
if [ "${BUILD_LOCALLY:-0}" = "1" ]; then
  echo "==> Building production bundle locally ..."
  npm run build
  BUNDLE=$(mktemp -t kidsphere-bundle.XXXXXX).tgz
  # Never ship local .env files inside the bundle.
  tar -czf "$BUNDLE" --exclude=".next/standalone/.env*" .next/standalone .next/static public
  echo "==> Uploading bundle ($(du -h "$BUNDLE" | cut -f1)) ..."
  ssh "${SSH_OPTS[@]}" "$TARGET" "cat > '$APP_DIR/build.tgz'" < "$BUNDLE"
  rm -f "$BUNDLE"
fi

if [ "${FIRST_INSTALL:-0}" = "1" ]; then
  ssh "${SSH_OPTS[@]}" "$TARGET" "cd '$APP_DIR' && $REMOTE_ENV bash deploy/install.sh"
else
  ssh "${SSH_OPTS[@]}" "$TARGET" "cd '$APP_DIR' && $REMOTE_ENV bash deploy/deploy.sh"
fi
echo "==> Deployed $SHA → https://$DOMAIN"
