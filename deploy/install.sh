#!/usr/bin/env bash
# One-time provisioning of an Ubuntu 22.04/24.04 server for Kidsphere.
# Safe to run on a host that already serves other apps (e.g. kortex-messaging):
# it only adds a new system user, database, nginx site and systemd unit.
#
#   sudo DOMAIN=kids.kortexd.com bash deploy/install.sh
#
# Expects the source in $APP_DIR (remote-deploy.sh uploads it there first).
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/kidsphere}
APP_USER=${APP_USER:-kidsphere}
DOMAIN=${DOMAIN:-kids.kortexd.com}
DB_NAME=${DB_NAME:-kidsphere}
DB_USER=${DB_USER:-kidsphere}
PORT=${PORT:-3070}
STORAGE_DIR=${STORAGE_DIR:-/var/lib/kidsphere/storage}
SEED_DEMO=${SEED_DEMO:-true}
NODE_DIR=${NODE_DIR:-/opt/kidsphere-node}
SERVICE=${SERVICE:-kidsphere}

echo "==> System packages (postgresql, nginx, certbot) ..."
# --no-upgrade: never upgrade/restart packages other apps on this host depend on.
apt-get update -y
apt-get install -y --no-upgrade postgresql postgresql-contrib nginx certbot python3-certbot-nginx curl ca-certificates openssl xz-utils

if ss -ltn "( sport = :$PORT )" | grep -q LISTEN && ! systemctl is-active --quiet "$SERVICE"; then
  echo "!! Port $PORT is already in use by another service. Re-run with PORT=<free port>."; exit 1
fi

echo "==> Private Node.js 22 in $NODE_DIR (system Node is left untouched) ..."
NODE_VERSION=${NODE_VERSION:-v22.23.3}
if [ ! -x "$NODE_DIR/bin/node" ]; then
  ARCH=$(uname -m); case "$ARCH" in x86_64) NARCH=x64;; aarch64) NARCH=arm64;; *) echo "unsupported arch $ARCH"; exit 1;; esac
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$NARCH.tar.xz" -o /tmp/kidsphere-node.tar.xz
  mkdir -p "$NODE_DIR" && tar -xJf /tmp/kidsphere-node.tar.xz -C "$NODE_DIR" --strip-components=1 && rm /tmp/kidsphere-node.tar.xz
fi
export PATH="$NODE_DIR/bin:$PATH"
node -v

echo "==> Service user '$APP_USER' ..."
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$STORAGE_DIR"
chown -R "$APP_USER:$APP_USER" "$STORAGE_DIR" "$APP_DIR"
chmod 700 "$STORAGE_DIR"

echo "==> PostgreSQL database (UTF-8) ..."
systemctl enable --now postgresql
if [ ! -f "$APP_DIR/.env" ]; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
  sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;"

  echo "==> Writing $APP_DIR/.env (secrets generated on the server, never committed) ..."
  cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=$PORT
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
APP_URL=https://$DOMAIN
COOKIE_SECURE=true
DEFAULT_LOCALE=ar

# AI — add a key and restart to use a real provider:
#   sudo nano $APP_DIR/.env && sudo systemctl restart $SERVICE
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5-5
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
AI_DEFAULT_PROVIDER=
AI_TIMEOUT_MS=60000
# Demo instance: allow the clearly-labelled DEMO engine until a key is added.
ALLOW_DEMO_AI_IN_PRODUCTION=true

STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=$STORAGE_DIR
EOF
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

echo "==> systemd unit $SERVICE ..."
sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__APP_USER__#$APP_USER#g" -e "s#__NODE_DIR__#$NODE_DIR#g" "$APP_DIR/deploy/systemd/kidsphere.service" > "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable "$SERVICE"

echo "==> nginx site for $DOMAIN ..."
# Other enabled sites claiming the same server_name are backed up and disabled
# (their sites-available files are left in place so they can be restored).
BACKUP="/root/nginx-backup-$(date +%Y%m%d%H%M%S)"
for f in /etc/nginx/sites-enabled/*; do
  [ -e "$f" ] || continue
  [ "$(basename "$f")" = "$SERVICE.conf" ] && continue
  if grep -qE "server_name[^;]*$DOMAIN" "$f"; then
    mkdir -p "$BACKUP"; cp -L "$f" "$BACKUP/"; rm "$f"
    echo "    disabled existing site $(basename "$f") (backup: $BACKUP)"
  fi
done
TEMPLATE="$APP_DIR/deploy/nginx/kidsphere.conf"
[ -d "/etc/letsencrypt/live/$DOMAIN" ] && TEMPLATE="$APP_DIR/deploy/nginx/kidsphere-tls.conf"
sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__PORT__#$PORT#g" "$TEMPLATE" > "/etc/nginx/sites-available/$SERVICE.conf"
ln -sf "/etc/nginx/sites-available/$SERVICE.conf" "/etc/nginx/sites-enabled/$SERVICE.conf"
nginx -t && systemctl reload nginx

echo "==> Build, migrate, start ..."
NODE_DIR="$NODE_DIR" SERVICE="$SERVICE" APP_USER="$APP_USER" APP_DIR="$APP_DIR" bash "$APP_DIR/deploy/deploy.sh"

if [ "$SEED_DEMO" = "true" ] && [ ! -f /root/$SERVICE-demo-credentials.txt ]; then
  echo "==> Seeding demo tenant with a random password ..."
  SEED_PW="Ks-$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 14)!"
  (cd "$APP_DIR" && set -a && . ./.env && set +a && sudo -u "$APP_USER" env PATH="$NODE_DIR/bin:$PATH" DATABASE_URL="$DATABASE_URL" NODE_ENV=production SEED_ALLOW_PRODUCTION=true SEED_PASSWORD="$SEED_PW" STORAGE_LOCAL_DIR="$STORAGE_LOCAL_DIR" npx tsx prisma/seed.ts)
  printf 'Kidsphere demo accounts (%s)\npassword: %s\nadmin@kidsphere.local teacher@kidsphere.local parent@kidsphere.local\n' "$DOMAIN" "$SEED_PW" > /root/$SERVICE-demo-credentials.txt
  chmod 600 /root/$SERVICE-demo-credentials.txt
  echo "    Demo credentials saved to /root/$SERVICE-demo-credentials.txt (root only)."
fi

echo "==> TLS certificate ..."
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
    echo "!! certbot failed — check that $DOMAIN points to this server, then run: certbot --nginx -d $DOMAIN"
fi

echo "==> Done. https://$DOMAIN"
