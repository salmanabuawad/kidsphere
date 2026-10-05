"""Server-side admin commands. Run from backend/ with the venv python:

    python -m app.cli create-admin --email admin --name "Admin" [--language ar]
    python -m app.cli set-password --email admin
    python -m app.cli import-users [--role admin] < users.jsonl
    python -m app.cli audit --child <child-uuid> [--limit 200]

Passwords are never taken from argv: they are prompted for (twice) on a
terminal, or read from the first line of stdin when stdin is not a terminal.

import-users reads JSON lines ``{"email", "name", "password_hash", "role"}``
(``role`` may come from ``--role`` instead). Hashes must be 60-character
``$2a$``/``$2b$`` bcrypt hashes; the whole import is rejected if any line is
invalid. Existing identifiers are skipped.
"""
import argparse
import getpass
import json
import re
import sys
import uuid

from sqlalchemy import select

from app.audit import audit
from app.db import SessionLocal
from app.models import AuditLog, User
from app.security import hash_password, is_bcrypt_hash
from app.sessions import revoke_user_sessions

IDENTIFIER_RE = re.compile(r"^[a-z0-9._%+@-]{2,200}$")
ROLES = ("admin", "teacher", "parent")
LANGUAGES = ("ar", "he", "en")
MIN_PASSWORD = 8


class CliError(Exception):
    pass


def _identifier(value: str) -> str:
    ident = (value or "").strip().lower()
    if not IDENTIFIER_RE.match(ident):
        raise CliError(f"invalid e-mail/username: {value!r}")
    return ident


def read_password() -> str:
    if sys.stdin.isatty():
        password = getpass.getpass("New password: ")
        if getpass.getpass("Repeat password: ") != password:
            raise CliError("passwords do not match")
    else:
        password = sys.stdin.readline().rstrip("\r\n")
    if len(password) < MIN_PASSWORD:
        raise CliError(f"password must be at least {MIN_PASSWORD} characters")
    return password


def cmd_create_admin(args) -> int:
    email = _identifier(args.email)
    name = args.name.strip()
    if not name:
        raise CliError("name is required")
    with SessionLocal() as db:
        if db.scalars(select(User).where(User.email == email)).first():
            raise CliError(f"a user {email!r} already exists (use set-password)")
        password = read_password()
        user = User(email=email, name=name, password_hash=hash_password(password), role="admin",
                    language=args.language, is_active=True)
        db.add(user)
        db.flush()
        audit(db, None, "user.create", "user", user.id, role="admin", via="cli")
        db.commit()
        print(f"created admin {email} ({user.id})")
    return 0


def cmd_set_password(args) -> int:
    email = _identifier(args.email)
    with SessionLocal() as db:
        user = db.scalars(select(User).where(User.email == email)).first()
        if user is None:
            raise CliError(f"no user {email!r}")
        user.password_hash = hash_password(read_password())
        revoke_user_sessions(db, user.id)
        audit(db, None, "user.password_set", "user", user.id, via="cli")
        db.commit()
        print(f"password set for {email}; existing sessions revoked")
    return 0


def _parse_import_line(lineno: int, line: str, default_role: str | None) -> dict:
    try:
        data = json.loads(line)
    except json.JSONDecodeError as exc:
        raise CliError(f"line {lineno}: not valid JSON ({exc.msg})") from None
    if not isinstance(data, dict):
        raise CliError(f"line {lineno}: expected a JSON object")
    try:
        email = _identifier(str(data.get("email", "")))
    except CliError as exc:
        raise CliError(f"line {lineno}: {exc}") from None
    name = str(data.get("name") or "").strip() or email
    password_hash = str(data.get("password_hash") or "")
    if not is_bcrypt_hash(password_hash):
        raise CliError(f"line {lineno}: password_hash is not a 60-character $2a$/$2b$ bcrypt hash")
    role = data.get("role") or default_role
    if role not in ROLES:
        raise CliError(f"line {lineno}: role must be one of {', '.join(ROLES)}")
    language = data.get("language") or "ar"
    if language not in LANGUAGES:
        raise CliError(f"line {lineno}: language must be one of {', '.join(LANGUAGES)}")
    return {"email": email, "name": name, "password_hash": password_hash, "role": role, "language": language}


def cmd_import_users(args) -> int:
    rows = [
        _parse_import_line(n, line, args.role)
        for n, line in enumerate(sys.stdin.read().splitlines(), start=1)
        if line.strip()
    ]
    if not rows:
        raise CliError("no users on stdin")
    created = skipped = 0
    with SessionLocal() as db:
        for row in rows:
            if db.scalars(select(User).where(User.email == row["email"])).first():
                print(f"skipped {row['email']}: already exists")
                skipped += 1
                continue
            user = User(**row, is_active=True)
            db.add(user)
            db.flush()
            audit(db, None, "user.create", "user", user.id, role=row["role"], via="cli-import")
            created += 1
        db.commit()
    print(f"imported {created} user(s), skipped {skipped}")
    return 0


def cmd_audit(args) -> int:
    try:
        child_id = uuid.UUID(args.child)
    except ValueError:
        raise CliError("--child must be a uuid") from None
    with SessionLocal() as db:
        rows = db.execute(
            select(AuditLog, User.email)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(AuditLog.child_id == child_id)
            .order_by(AuditLog.created_at, AuditLog.id)
            .limit(args.limit)
        ).all()
    for entry, actor_email in rows:
        target = f"{entry.object_type}:{entry.object_id}" if entry.object_type else "-"
        meta = json.dumps(entry.meta, ensure_ascii=False, sort_keys=True)
        print(f"{entry.created_at:%Y-%m-%d %H:%M:%S}  {entry.action:<24} {actor_email or '-':<24} {target}  {meta}")
    if not rows:
        print("no audit entries for this child")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="KidSphere admin commands")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin", help="create an active admin (password prompted or read from stdin)")
    p.add_argument("--email", required=True, help="e-mail address or username")
    p.add_argument("--name", required=True)
    p.add_argument("--language", choices=LANGUAGES, default="ar")
    p.set_defaults(func=cmd_create_admin)

    p = sub.add_parser("set-password", help="set a user's password and revoke their sessions")
    p.add_argument("--email", required=True, help="e-mail address or username")
    p.set_defaults(func=cmd_set_password)

    p = sub.add_parser("import-users", help="import users with existing bcrypt hashes (JSON lines on stdin)")
    p.add_argument("--role", choices=ROLES, help="role for lines without a role")
    p.set_defaults(func=cmd_import_users)

    p = sub.add_parser("audit", help="print the audit log of one child")
    p.add_argument("--child", required=True)
    p.add_argument("--limit", type=int, default=500)
    p.set_defaults(func=cmd_audit)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except CliError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
