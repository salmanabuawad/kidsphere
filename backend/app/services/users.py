"""Admin user management (port of src/server/services/admin.ts, 3 roles).

Users are never deleted: they are deactivated. A role change, a deactivation
and an admin-set password end every session of the target user. A role change
also drops the old role's assignments (class_teachers for a teacher,
child_parents for a parent). An admin can neither demote nor deactivate themselves.
"""
import uuid

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.audit import audit
from app.errors import AppError
from app.models import ChildParent, ClassTeacher, User
from app.schemas.admin import PasswordSetIn, UserCreateIn, UserUpdateIn
from app.security import hash_password
from app.sessions import revoke_user_sessions


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_users(db: Session, role: str | None = None, q: str | None = None, active: bool | None = None) -> list[User]:
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if active is not None:
        stmt = stmt.where(User.is_active.is_(active))
    q = (q or "").strip()
    if q:
        pattern = f"%{_escape_like(q.lower())}%"
        stmt = stmt.where(or_(func.lower(User.name).like(pattern, escape="\\"), User.email.like(pattern, escape="\\")))
    return list(db.scalars(stmt.order_by(func.lower(User.name), User.email)))


def get_user_or_404(db: Session, user_id) -> User:
    try:
        uid = uuid.UUID(str(user_id))
    except ValueError:
        raise AppError("NOT_FOUND", "User not found.")
    user = db.get(User, uid)
    if user is None:
        raise AppError("NOT_FOUND", "User not found.")
    return user


def create_user(db: Session, actor: User, body: UserCreateIn) -> User:
    if db.scalars(select(User.id).where(User.email == body.email)).first() is not None:
        raise AppError("DUPLICATE", "A user with this e-mail/username already exists.",
                       details=[{"path": "email", "message": "already exists"}])
    user = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        language=body.language,
        is_active=True,
    )
    db.add(user)
    db.flush()
    audit(db, actor, "user.create", "user", user.id, role=user.role)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, actor: User, user_id, body: UserUpdateIn) -> User:
    user = get_user_or_404(db, user_id)
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if user.id == actor.id and (
        ("role" in changes and changes["role"] != user.role) or changes.get("is_active") is False
    ):
        raise AppError("FORBIDDEN", "You cannot change your own role or deactivate yourself.")

    changed = {k: v for k, v in changes.items() if getattr(user, k) != v}
    if not changed:
        return user
    old_role = user.role
    for field, value in changed.items():
        setattr(user, field, value)
    if "role" in changed or changed.get("is_active") is False:
        revoke_user_sessions(db, user.id)
    meta = {"fields": sorted(changed)}
    if "role" in changed:
        meta.update(from_role=old_role, to_role=user.role)
        # Assignments of the old role would be stale (and silently come back on a later
        # role change), so they go: class assignments for teachers, child links for parents.
        if old_role == "teacher":
            meta["removed_classes"] = db.execute(delete(ClassTeacher).where(ClassTeacher.user_id == user.id)).rowcount
        elif old_role == "parent":
            meta["removed_child_links"] = db.execute(delete(ChildParent).where(ChildParent.user_id == user.id)).rowcount
    if "is_active" in changed:
        meta["is_active"] = user.is_active
    audit(db, actor, "user.update", "user", user.id, **meta)
    db.commit()
    db.refresh(user)
    return user


def set_password(db: Session, actor: User, user_id, body: PasswordSetIn, keep_session_id: uuid.UUID | None = None) -> None:
    user = get_user_or_404(db, user_id)
    user.password_hash = hash_password(body.password)
    # Setting your own password here keeps your current session (like /me/password).
    revoke_user_sessions(db, user.id, keep_session_id=keep_session_id if user.id == actor.id else None)
    audit(db, actor, "user.password_set", "user", user.id)
    db.commit()
