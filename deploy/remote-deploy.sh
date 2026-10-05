#!/usr/bin/env bash
#
# Deploy the committed HEAD to kids.kortexd.com (run from Git Bash):
#
#   deploy/remote-deploy.sh            # deploy
#   deploy/remote-deploy.sh --install  # first time: provision, then deploy
#
# Ships `git archive HEAD` (committed code only — uncommitted changes are not
# deployed) to /var/www/kidsphere/releases/<sha> and runs deploy/deploy.sh there.
set -euo pipefail

HOST=${KS_HOST:-root@185.229.226.37}
KEY=${KS_KEY:-$HOME/.ssh/kidsphere_deploy}
INSTALL=0
[[ ${1:-} == --install ]] && INSTALL=1

cd "$(git rev-parse --show-toplevel)"
SHA=$(git rev-parse --short HEAD)
[[ -z $(git status --porcelain -- backend frontend deploy) ]] || echo "warning: uncommitted changes in backend/frontend/deploy are NOT deployed"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive --format=tar.gz -o "$TMP/release.tgz" HEAD backend frontend deploy
scp -q -i "$KEY" "$TMP/release.tgz" "$HOST:/tmp/kidsphere-$SHA.tgz"

REL=/var/www/kidsphere/releases/$SHA
ssh -i "$KEY" "$HOST" "set -e
  mkdir -p $REL && rm -rf $REL/* && tar -xzf /tmp/kidsphere-$SHA.tgz -C $REL && rm -f /tmp/kidsphere-$SHA.tgz
  if [ $INSTALL = 1 ]; then bash $REL/deploy/install.sh; fi
  bash $REL/deploy/deploy.sh
  ls -1dt /var/www/kidsphere/releases/* | tail -n +6 | xargs -r rm -rf"
echo "deployed $SHA"
