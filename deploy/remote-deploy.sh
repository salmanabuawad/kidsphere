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

if [ "${FIRST_INSTALL:-0}" = "1" ]; then
  ssh "${SSH_OPTS[@]}" "$TARGET" "cd '$APP_DIR' && DOMAIN='$DOMAIN' APP_DIR='$APP_DIR' bash deploy/install.sh"
else
  ssh "${SSH_OPTS[@]}" "$TARGET" "cd '$APP_DIR' && APP_DIR='$APP_DIR' bash deploy/deploy.sh"
fi
echo "==> Deployed $SHA → https://$DOMAIN"
