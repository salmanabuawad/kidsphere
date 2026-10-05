#!/usr/bin/env bash
#
# Run the KidSphere test suites on the Ubuntu server (nothing runs locally).
#
#   deploy/ci/remote-test.sh <label> [backend|frontend|all] [extra pytest args...]
#
#   deploy/ci/remote-test.sh wp02 backend
#   deploy/ci/remote-test.sh wp02 backend -k test_auth -x
#   deploy/ci/remote-test.sh wp03 frontend
#
# Uploads the working tree (tracked + untracked, minus ignored files) of
# backend/, frontend/ and deploy/ to /var/lib/kidsphere-ci/runs/<label> and
# runs deploy/ci/server-run.sh there. Runs are serialised on the server with
# flock, so several callers can use this at once. If the frontend has no
# package-lock.json yet, the one npm generates on the server is copied back.
set -euo pipefail

LABEL=${1:?usage: remote-test.sh <label> [backend|frontend|all] [pytest args...]}
MODE=${2:-all}
shift $(( $# >= 2 ? 2 : 1 ))
[[ $LABEL =~ ^[a-z0-9-]+$ ]] || { echo "label must be [a-z0-9-]+" >&2; exit 2; }
[[ $MODE =~ ^(backend|frontend|all)$ ]] || { echo "mode must be backend|frontend|all" >&2; exit 2; }

HOST=${KS_HOST:-root@185.229.226.37}
KEY=${KS_KEY:-$HOME/.ssh/kidsphere_deploy}
SSH=(ssh -i "$KEY" -o ServerAliveInterval=30 "$HOST")

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

git ls-files -co --exclude-standard -- backend frontend deploy \
  | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done > "$TMP/files"
tar -czf "$TMP/src.tgz" -T "$TMP/files"

RUN=/var/lib/kidsphere-ci/runs/$LABEL
scp -q -i "$KEY" "$TMP/src.tgz" "$HOST:/tmp/kidsphere-ci-$LABEL.tgz"

# Extra args are passed through to pytest; quote each one for the remote shell.
EXTRA=""
for a in "$@"; do EXTRA+=" $(printf '%q' "$a")"; done

set +e
"${SSH[@]}" "set -e; rm -rf $RUN; mkdir -p $RUN; tar -xzf /tmp/kidsphere-ci-$LABEL.tgz -C $RUN; rm -f /tmp/kidsphere-ci-$LABEL.tgz; bash $RUN/deploy/ci/server-run.sh $LABEL $MODE$EXTRA"
STATUS=$?
set -e

if [[ $MODE != backend && ! -f frontend/package-lock.json && -d frontend ]]; then
  scp -q -i "$KEY" "$HOST:$RUN/frontend/package-lock.json" frontend/package-lock.json 2>/dev/null \
    && echo "==> copied generated frontend/package-lock.json back"
fi
exit $STATUS
