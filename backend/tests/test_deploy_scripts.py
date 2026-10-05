"""deploy/: the nightly backup script (run against stub runuser/pg_dump/pg_restore and temp
directories), its systemd units and their wiring, and a syntax check of every deploy script.
Nothing here touches a real database, /var/backups or systemd."""
import os
import re
import stat
import subprocess
import tarfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
DEPLOY = BACKEND.parent / "deploy"
needs_deploy = pytest.mark.skipif(not (DEPLOY / "backup.sh").is_file(), reason="deploy/ is not next to backend/")

# Stand-ins for runuser, pg_dump and pg_restore, passed to the script as exported bash
# functions (BASH_FUNC_<name>%%), which take precedence over the real commands. Stub
# files would not do: /tmp on the CI server does not allow executing files.
STUBS = {
    # runuser -u <user> -- <command...>: record the call, then run the command as the test user.
    "runuser": 'echo "runuser $*" >> "$STUB_LOG"; while [ "$1" != "--" ]; do shift; done; shift; "$@"',
    "pg_dump": 'echo "pg_dump $*" >> "$STUB_LOG"; printf "PGDMP fake dump"; [ -z "${PG_DUMP_FAIL:-}" ]',
    # pg_restore --list reads the archive from stdin: it must be a pg_dump custom archive.
    "pg_restore": 'echo "pg_restore $*" >> "$STUB_LOG"; head -c 5 | grep -q PGDMP',
}


@pytest.fixture
def backup_env(tmp_path):
    uploads = tmp_path / "www" / "uploads"
    (uploads / "children").mkdir(parents=True)
    (uploads / "children" / "photo.jpg").write_bytes(b"jpeg")
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(tmp_path),
        "KS_BACKUP_DIR": str(tmp_path / "backups"),
        "KS_UPLOAD_DIR": str(uploads),
        "STUB_LOG": str(tmp_path / "calls.log"),
        **{f"BASH_FUNC_{name}%%": f"() {{ {body}; }}" for name, body in STUBS.items()},
    }
    return env, tmp_path / "backups", tmp_path


def run_backup(env, **extra):
    return subprocess.run(["bash", str(DEPLOY / "backup.sh")], env={**env, **extra},
                          capture_output=True, text=True, timeout=60)


@needs_deploy
def test_backup_writes_a_root_only_dump_and_uploads_archive(backup_env):
    env, dest, tmp = backup_env
    r = run_backup(env)
    assert r.returncode == 0, r.stderr
    (dump,) = dest.glob("nightly-*.dump")
    (tgz,) = dest.glob("uploads-*.tgz")
    stamp = re.fullmatch(r"nightly-(\d{8}-\d{6})\.dump", dump.name).group(1)
    assert tgz.name == f"uploads-{stamp}.tgz"
    assert dump.read_bytes() == b"PGDMP fake dump"
    with tarfile.open(tgz) as archive:
        assert "uploads/children/photo.jpg" in archive.getnames()
    assert stat.S_IMODE(dest.stat().st_mode) == 0o700
    for f in (dump, tgz):
        assert stat.S_IMODE(f.stat().st_mode) == 0o600
    assert sorted(p.name for p in dest.iterdir()) == sorted([dump.name, tgz.name])  # no *.partial left
    calls = (tmp / "calls.log").read_text()
    assert "runuser -u postgres -- pg_dump -Fc kidsphere_mvp" in calls
    assert "runuser -u postgres -- pg_restore --list" in calls


@needs_deploy
def test_backup_keeps_the_newest_14_of_each_and_leaves_other_files_alone(backup_env):
    env, dest, _ = backup_env
    dest.mkdir()
    old = [f"20250101-0000{i:02d}" for i in range(20)]
    for s in old:
        (dest / f"nightly-{s}.dump").write_text("old")
        (dest / f"uploads-{s}.tgz").write_text("old")
    others = ["kidsphere-predeploy-20250101-000000.dump", "kidsphere-20240101-000000.dump", "notes.txt"]
    for name in others:
        (dest / name).write_text("keep")

    r = run_backup(env)
    assert r.returncode == 0, r.stderr
    nightly = sorted(p.name for p in dest.glob("nightly-*.dump"))
    uploads = sorted(p.name for p in dest.glob("uploads-*.tgz"))
    assert len(nightly) == 14 and len(uploads) == 14
    assert nightly[:13] == [f"nightly-{s}.dump" for s in old[-13:]]  # + tonight's dump
    assert uploads[:13] == [f"uploads-{s}.tgz" for s in old[-13:]]
    for name in others:
        assert (dest / name).read_text() == "keep"

    r = run_backup(env, KS_BACKUP_KEEP="2")
    assert r.returncode == 0, r.stderr
    assert len(list(dest.glob("nightly-*.dump"))) == 2 and len(list(dest.glob("uploads-*.tgz"))) == 2


@needs_deploy
def test_a_failed_dump_fails_the_run_and_leaves_nothing_behind(backup_env):
    env, dest, tmp = backup_env
    r = run_backup(env, PG_DUMP_FAIL="1")
    assert r.returncode != 0
    assert list(dest.iterdir()) == []  # neither a partial dump nor an uploads archive

    r = run_backup(env, KS_UPLOAD_DIR=str(tmp / "missing"))
    assert r.returncode != 0 and "not found" in r.stderr
    r = run_backup(env, KS_BACKUP_KEEP="0")
    assert r.returncode != 0


@needs_deploy
def test_backup_timer_units_and_install_wiring():
    service = (DEPLOY / "systemd" / "kidsphere-mvp-backup.service").read_text()
    timer = (DEPLOY / "systemd" / "kidsphere-mvp-backup.timer").read_text()
    assert "Type=oneshot" in service and "ExecStart=/usr/local/sbin/kidsphere-mvp-backup" in service
    assert "User=root" in service
    assert "OnCalendar=*-*-* 03:30:00" in timer and re.search(r"^RandomizedDelaySec=\S+", timer, re.M)
    assert "Persistent=true" in timer and "Unit=kidsphere-mvp-backup.service" in timer
    assert "WantedBy=timers.target" in timer

    script = (DEPLOY / "backup.sh").read_text()
    assert "set -euo pipefail" in script and "umask 077" in script
    for name in ("install.sh", "deploy.sh"):  # the installed copy lives outside the rotated releases
        text = (DEPLOY / name).read_text()
        assert 'install -m 700 "$SRC/deploy/backup.sh" /usr/local/sbin/kidsphere-mvp-backup' in text, name
        assert "kidsphere-mvp-backup.service /etc/systemd/system/" in text.replace('"', ""), name
        assert "kidsphere-mvp-backup.timer /etc/systemd/system/" in text.replace('"', ""), name
        assert "systemctl enable --now kidsphere-mvp-backup.timer" in text, name

    deploy = (DEPLOY / "deploy.sh").read_text()
    assert "kidsphere-predeploy-$(date +%Y%m%d-%H%M%S).dump" in deploy
    assert "tail -n +11" in deploy  # the newest 10 pre-deploy dumps
    # A failed pg_dump (set -e) must not leave a partial dump with child data behind.
    trap_at = deploy.index("""trap 'rm -f -- "$DUMP.partial"' EXIT""")
    assert deploy.index('DUMP=$BACKUPS/') < trap_at < deploy.index('> "$DUMP.partial"')


@needs_deploy
def test_nightly_dumps_survive_the_retention_of_older_releases(backup_env):
    """A rollback runs an older release's deploy.sh, which prunes kidsphere-*.dump down to 10."""
    env, dest, _ = backup_env
    r = run_backup(env)
    assert r.returncode == 0, r.stderr
    assert list(dest.glob("nightly-*.dump")) and not list(dest.glob("kidsphere-*.dump"))


@pytest.mark.parametrize("script", sorted(str(p.relative_to(DEPLOY)) for p in DEPLOY.rglob("*.sh")))
def test_deploy_scripts_parse(script):
    r = subprocess.run(["bash", "-n", str(DEPLOY / script)], capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr


def test_env_example_matches_the_settings():
    """install.sh copies backend/.env.example to .env and rewrites DATABASE_URL; every key must be a setting."""
    from sqlalchemy import make_url

    from app.config import Settings

    values = {}
    for line in (BACKEND / ".env.example").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            key, _, value = line.partition("=")
            values[key] = value
    assert set(values) <= {name.upper() for name in Settings.model_fields}
    assert "APP_URL" not in values and "app_url" not in Settings.model_fields  # unused, removed
    for url in (values["DATABASE_URL"], Settings.model_fields["database_url"].default):
        parsed = make_url(url)
        assert (parsed.username, parsed.database) == ("kidsphere_mvp", "kidsphere_mvp"), url
