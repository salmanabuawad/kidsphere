#!/usr/bin/env bash
#
# One-time, idempotent provisioning of KidSphere on Ubuntu (run as root from an
# extracted release: `bash deploy/install.sh`). Creates the system user, the
# /var/www/kidsphere layout, the PostgreSQL role + database, backend/.env with a
# generated DB password, the systemd units (the API, and the nightly backup timer
# running deploy/backup.sh) and the nginx site. Safe to re-run: existing .env, DB
# and user are kept.
#
# Requires an existing Let's Encrypt certificate for kids.kortexd.com
# (otherwise run: certbot certonly --webroot -w /var/www/html -d kids.kortexd.com).
set -euo pipefail

SRC=$(cd "$(dirname "$0")/.." && pwd)
APP=/var/www/kidsphere
DB=kidsphere_mvp
DB_USER=kidsphere_mvp

echo "==> system user and directories"
id kidsphere-mvp >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/kidsphere-mvp --shell /usr/sbin/nologin kidsphere-mvp
mkdir -p "$APP/backend" "$APP/frontend" "$APP/uploads" "$APP/releases" /var/backups/kidsphere
chown kidsphere-mvp:kidsphere-mvp "$APP" "$APP/backend" "$APP/frontend" "$APP/releases"
chown kidsphere-mvp:kidsphere-mvp "$APP/uploads" && chmod 750 "$APP/uploads"
chmod 700 /var/backups/kidsphere

echo "==> PostgreSQL role and database"
if [[ ! -f $APP/backend/.env ]]; then
  PW=$(openssl rand -hex 24)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$DB_USER') THEN CREATE ROLE $DB_USER LOGIN; END IF;
END \$\$;
ALTER ROLE $DB_USER PASSWORD '$PW';
SQL
  sed -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql+psycopg://$DB_USER:$PW@127.0.0.1:5432/$DB|" \
      "$SRC/backend/.env.example" > "$APP/backend/.env"
  chown kidsphere-mvp:kidsphere-mvp "$APP/backend/.env"
  chmod 600 "$APP/backend/.env"
  echo "    wrote $APP/backend/.env"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_USER" -E UTF8 -T template0 "$DB"
  echo "    created database $DB"
fi

echo "==> systemd units"
install -m 644 "$SRC/deploy/systemd/kidsphere-mvp-api.service" /etc/systemd/system/kidsphere-mvp-api.service
# Nightly backups: the script lives outside the releases, which are rotated.
install -m 700 "$SRC/deploy/backup.sh" /usr/local/sbin/kidsphere-mvp-backup
install -m 644 "$SRC/deploy/systemd/kidsphere-mvp-backup.service" /etc/systemd/system/kidsphere-mvp-backup.service
install -m 644 "$SRC/deploy/systemd/kidsphere-mvp-backup.timer" /etc/systemd/system/kidsphere-mvp-backup.timer
systemctl daemon-reload
systemctl enable kidsphere-mvp-api >/dev/null
systemctl enable --now kidsphere-mvp-backup.timer >/dev/null

echo "==> nginx"
install -m 644 "$SRC/deploy/nginx/kidsphere-headers.conf" /etc/nginx/snippets/kidsphere-headers.conf
install -m 644 "$SRC/deploy/nginx/kidsphere-ratelimit.conf" /etc/nginx/conf.d/kidsphere-ratelimit.conf
install -m 644 "$SRC/deploy/nginx/kidsphere-mvp.conf" /etc/nginx/sites-available/kidsphere-mvp
# Disable any other enabled site claiming the domain (backed up first).
for f in /etc/nginx/sites-enabled/*; do
  [[ -e $f ]] || continue
  [[ $(readlink -f "$f") == /etc/nginx/sites-available/kidsphere-mvp ]] && continue
  if grep -Eq "server_name[^;]*[[:space:]]kids\.kortexd\.com[[:space:];]" "$f"; then
    mkdir -p /root/backups/nginx
    cp -L "$f" "/root/backups/nginx/$(basename "$f").$(date +%Y%m%d-%H%M%S)"
    rm -f "$f"
    echo "    disabled $f (backup in /root/backups/nginx)"
  fi
done
ln -sfn /etc/nginx/sites-available/kidsphere-mvp /etc/nginx/sites-enabled/kidsphere-mvp
nginx -t
echo "==> provisioned (run deploy/deploy.sh to install the code)"
