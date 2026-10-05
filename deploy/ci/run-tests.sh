#!/usr/bin/env bash
#
# Runs as kidsphere-ci under the CI lock: backend pytest against the throwaway
# kidsphere_test DB, then frontend type-check, lint, vitest and build.
set -uo pipefail
RUN=$1; MODE=$2; shift 2
CI=/var/lib/kidsphere-ci
mkdir -p "$CI/cache"
FAIL=0

if [[ $MODE != frontend && -d $RUN/backend ]]; then
  echo "==> backend"
  cd "$RUN/backend"
  H=$(cat requirements*.txt 2>/dev/null | sha256sum | cut -c1-16)
  VENV=$CI/cache/venv-$H
  # Built in place (console-script shebangs embed the venv path); .ok marks a finished install.
  if [[ ! -f $VENV/.ok ]]; then
    echo "==> creating venv $VENV"
    rm -rf "$VENV"
    python3 -m venv "$VENV" && "$VENV/bin/pip" install -q --upgrade pip \
      && "$VENV/bin/pip" install -q -r requirements-dev.txt && touch "$VENV/.ok" \
      || { rm -rf "$VENV"; echo "pip install failed"; exit 1; }
  fi
  set -a; . "$CI/ci.env"; set +a
  export UPLOAD_DIR=$RUN/uploads ANTHROPIC_API_KEY= COOKIE_SECURE=false
  mkdir -p "$UPLOAD_DIR"
  "$VENV/bin/python" -m pytest -q -p no:cacheprovider "$@" || FAIL=1
fi

if [[ $MODE != backend && -d $RUN/frontend ]]; then
  echo "==> frontend"
  cd "$RUN/frontend"
  export NODE_OPTIONS=--max-old-space-size=768 npm_config_cache=$CI/cache/npm npm_config_audit=false npm_config_fund=false
  if [[ -f package-lock.json ]]; then
    H=$(sha256sum package-lock.json | cut -c1-16)
    NM=$CI/cache/nm-$H
    # The cache dir keeps the name node_modules so packages resolved through the
    # symlink's real path still find their hoisted siblings.
    if [[ ! -f $NM/.ok ]]; then
      echo "==> npm ci (cache $NM)"
      rm -rf "$NM"; mkdir -p "$NM"
      npm ci --no-audit --no-fund --loglevel=error && mv node_modules "$NM/node_modules" && touch "$NM/.ok" \
        || { rm -rf "$NM"; echo "npm ci failed"; exit 1; }
    fi
    rm -rf node_modules; ln -s "$NM/node_modules" node_modules
  else
    echo "==> no package-lock.json: npm install (lock will be copied back)"
    npm install --no-audit --no-fund --loglevel=error || { echo "npm install failed"; exit 1; }
  fi
  for script in typecheck lint test build; do
    if node -e "process.exit(require('./package.json').scripts?.['$script']?0:1)"; then
      echo "==> npm run $script"
      npm run -s "$script" || FAIL=1
    fi
  done
fi

if [[ $FAIL == 0 ]]; then echo "==> ALL PASSED"; else echo "==> FAILURES"; fi
exit $FAIL
