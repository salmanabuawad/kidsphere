#!/usr/bin/env bash
#
# Nightly backup of KidSphere, run as root by kidsphere-mvp-backup.timer
# (installed by deploy/install.sh as /usr/local/sbin/kidsphere-mvp-backup).
# By hand: `systemctl start kidsphere-mvp-backup` (or run this script as root).
#
#   /var/backups/kidsphere/nightly-<YYYYmmdd-HHMMSS>.dump   pg_dump -Fc kidsphere_mvp
#   /var/backups/kidsphere/uploads-<YYYYmmdd-HHMMSS>.tgz    tar.gz of /var/www/kidsphere/uploads
#
# The newest 14 of each are kept. Pre-deploy dumps (kidsphere-predeploy-*.dump)
# belong to deploy/deploy.sh, which keeps its own newest 10; they are never
# touched here. The nightly dumps are deliberately not named kidsphere-*.dump:
# older releases' deploy.sh (run again for a rollback) prune that whole glob down
# to 10. Files are written as *.partial and renamed only when complete, and
# the dump is checked with `pg_restore --list` first. umask 077: root-only files.
#
# KS_BACKUP_DIR, KS_UPLOAD_DIR, KS_DB and KS_BACKUP_KEEP override the defaults
# (the backend test suite uses them; production uses the defaults).
set -euo pipefail
umask 077

DEST=${KS_BACKUP_DIR:-/var/backups/kidsphere}
UPLOADS=${KS_UPLOAD_DIR:-/var/www/kidsphere/uploads}
DB=${KS_DB:-kidsphere_mvp}
KEEP=${KS_BACKUP_KEEP:-14}

[[ $KEEP =~ ^[1-9][0-9]*$ ]] || { echo "KS_BACKUP_KEEP must be a positive number" >&2; exit 2; }
[[ -d $UPLOADS ]] || { echo "uploads directory $UPLOADS not found" >&2; exit 1; }

STAMP=$(date +%Y%m%d-%H%M%S)
DUMP=$DEST/nightly-$STAMP.dump
TGZ=$DEST/uploads-$STAMP.tgz
trap 'rm -f -- "$DUMP.partial" "$TGZ.partial"' EXIT

mkdir -p "$DEST"
chmod 700 "$DEST"
cd /  # runuser keeps the working directory; postgres cannot read root's

echo "==> database $DB"
runuser -u postgres -- pg_dump -Fc "$DB" > "$DUMP.partial"
runuser -u postgres -- pg_restore --list < "$DUMP.partial" > /dev/null
mv -- "$DUMP.partial" "$DUMP"

echo "==> uploads $UPLOADS"
# GNU tar exits 1 when a file changed while it was read (a photo saved during the
# backup); the archive is still usable. Anything above 1 is a real failure.
status=0
tar -czf "$TGZ.partial" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")" || status=$?
if (( status > 1 )); then
  echo "tar failed with status $status" >&2
  exit "$status"
fi
mv -- "$TGZ.partial" "$TGZ"

# Keep the newest $KEEP of each kind. The stamp sorts by time, so sort by name.
prune() {
  find "$DEST" -maxdepth 1 -type f -name "$1" -printf '%f\n' | sort -r | tail -n +"$((KEEP + 1))" \
    | while IFS= read -r f; do rm -f -- "$DEST/$f"; done
}
prune 'nightly-*.dump'
prune 'uploads-*.tgz'

echo "==> backup done: $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1)), $(basename "$TGZ") ($(du -h "$TGZ" | cut -f1))"
