#!/usr/bin/env bash
#
# Server side of remote-test.sh. Runs as root, takes the CI lock, then runs the
# suites as the unprivileged kidsphere-ci user. Never touches production
# services, databases or nginx.
set -euo pipefail
LABEL=$1; MODE=$2; shift 2
CI=/var/lib/kidsphere-ci
RUN=$CI/runs/$LABEL

exec 9>"$CI/lock"
echo "==> waiting for the CI lock"
flock 9
chown -R kidsphere-ci:kidsphere-ci "$RUN"
runuser -u kidsphere-ci -- env -i HOME="$CI" PATH=/opt/kidsphere-node/bin:/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 \
  bash "$RUN/deploy/ci/run-tests.sh" "$RUN" "$MODE" "$@"
