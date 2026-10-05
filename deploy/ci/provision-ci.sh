#!/usr/bin/env bash
# One-time, as root on the server: CI user, throwaway test DB, env file.
set -euo pipefail
id kidsphere-ci >/dev/null 2>&1 || useradd --system --home-dir /var/lib/kidsphere-ci --create-home --shell /usr/sbin/nologin kidsphere-ci
mkdir -p /var/lib/kidsphere-ci/runs /var/lib/kidsphere-ci/cache
if [[ ! -f /var/lib/kidsphere-ci/ci.env ]]; then
  PW=$(openssl rand -hex 24)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='kidsphere_ci') THEN CREATE ROLE kidsphere_ci LOGIN; END IF;
END \$\$;
ALTER ROLE kidsphere_ci PASSWORD '$PW';
SQL
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='kidsphere_test'" | grep -q 1 \
    || sudo -u postgres createdb -O kidsphere_ci -E UTF8 -T template0 kidsphere_test
  printf 'DATABASE_URL=postgresql+psycopg://kidsphere_ci:%s@127.0.0.1:5432/kidsphere_test\n' "$PW" > /var/lib/kidsphere-ci/ci.env
fi
chown -R kidsphere-ci:kidsphere-ci /var/lib/kidsphere-ci
chmod 600 /var/lib/kidsphere-ci/ci.env
echo "CI provisioned"
