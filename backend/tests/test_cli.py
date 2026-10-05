import io
import json

import pytest
from sqlalchemy import select

from app import cli
from app.models import AuditLog, User, UserSession
from app.security import verify_password
from tests.test_auth import BCRYPTJS_HASH, BCRYPTJS_PASSWORD, login


class FakeTty(io.StringIO):
    def isatty(self):
        return True


def run(monkeypatch, argv, stdin="", tty=False):
    monkeypatch.setattr("sys.stdin", FakeTty(stdin) if tty else io.StringIO(stdin))
    return cli.main(argv)


def test_create_admin_prompts_for_the_password(monkeypatch, db, client):
    prompts = []

    def fake_getpass(prompt):
        prompts.append(prompt)
        return "Admin-pass-2026"

    monkeypatch.setattr(cli.getpass, "getpass", fake_getpass)
    assert run(monkeypatch, ["create-admin", "--email", "Admin", "--name", "Head Admin"], tty=True) == 0
    assert len(prompts) == 2
    user = db.scalars(select(User).where(User.email == "admin")).one()
    assert (user.role, user.is_active, user.name, user.language) == ("admin", True, "Head Admin", "ar")
    assert user.password_hash.startswith("$2b$12$")
    assert login(client, "admin", "Admin-pass-2026").status_code == 200


def test_create_admin_rejects_mismatch_short_password_and_duplicates(monkeypatch, make_user, capsys):
    answers = iter(["Admin-pass-2026", "different-pass"])
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt: next(answers))
    assert run(monkeypatch, ["create-admin", "--email", "a1", "--name", "A"], tty=True) == 1
    assert run(monkeypatch, ["create-admin", "--email", "a2", "--name", "A"], stdin="short\n") == 1
    make_user("admin", email="taken")
    assert run(monkeypatch, ["create-admin", "--email", "taken", "--name", "A"], stdin="Long-enough-1\n") == 1
    assert "already exists" in capsys.readouterr().err


def test_set_password_from_stdin_revokes_sessions(monkeypatch, db, teacher, client_for, client):
    c = client_for(teacher)
    assert run(monkeypatch, ["set-password", "--email", "teacher@test.local"], stdin="Reset-pass-2026\n") == 0
    assert c.get("/api/me").status_code == 401
    db.expire_all()
    assert db.scalars(select(UserSession)).all() == []
    assert login(client, "teacher@test.local", "Reset-pass-2026").status_code == 200


def test_import_users(monkeypatch, db, client, capsys):
    lines = [
        json.dumps({"email": "Admin", "name": "Admin", "password_hash": BCRYPTJS_HASH, "role": "admin"}),
        json.dumps({"email": "t@kg.example", "name": "Teacher", "password_hash": "$2a$" + BCRYPTJS_HASH[4:]}),
    ]
    assert run(monkeypatch, ["import-users", "--role", "teacher"], stdin="\n".join(lines) + "\n") == 0
    users = {u.email: u for u in db.scalars(select(User))}
    assert users["admin"].role == "admin" and users["t@kg.example"].role == "teacher"
    assert verify_password(BCRYPTJS_PASSWORD, users["admin"].password_hash)
    assert login(client, "admin", BCRYPTJS_PASSWORD).status_code == 200
    # Running again skips existing users.
    assert run(monkeypatch, ["import-users", "--role", "teacher"], stdin="\n".join(lines)) == 0
    assert "skipped 2" in capsys.readouterr().out


@pytest.mark.parametrize("bad", [
    {"email": "x", "name": "X", "password_hash": "$2b$12$tooshort", "role": "admin"},
    {"email": "x", "name": "X", "password_hash": "plaintext-password", "role": "admin"},
    {"email": "x", "name": "X", "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$abc", "role": "admin"},
    {"email": "x", "name": "X", "password_hash": BCRYPTJS_HASH, "role": "superuser"},
    {"email": "bad email", "name": "X", "password_hash": BCRYPTJS_HASH, "role": "admin"},
])
def test_import_users_rejects_malformed_lines(monkeypatch, db, bad):
    good = json.dumps({"email": "good", "name": "G", "password_hash": BCRYPTJS_HASH, "role": "admin"})
    assert run(monkeypatch, ["import-users"], stdin=good + "\n" + json.dumps(bad)) == 1
    assert db.scalars(select(User)).all() == []  # nothing imported when any line is invalid


def test_audit_command_prints_child_entries(monkeypatch, db, teacher, child, capsys):
    from app.audit import audit

    audit(db, teacher, "child.update", "child", child.id, child_id=child.id, fields=["name"])
    audit(db, teacher, "child.update", "child", None, child_id=None)
    db.commit()
    assert run(monkeypatch, ["audit", "--child", str(child.id)]) == 0
    out = capsys.readouterr().out.strip().splitlines()
    assert len(out) == 1
    assert "child.update" in out[0] and "teacher@test.local" in out[0] and '"fields": ["name"]' in out[0]
    assert db.scalars(select(AuditLog)).all()
