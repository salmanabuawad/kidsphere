"""Who may see which child (port of src/lib/permissions/index.ts, 3 roles).

The scope is always part of the same SELECT as the lookup, so an id outside
the user's scope is indistinguishable from one that does not exist (404).
A role/action failure on a visible child is 403.

- admin:   every child
- teacher: children whose class_id is one of the teacher's classes (class_teachers)
- parent:  children linked in child_parents

Archived children are visible to admins only.
"""
import uuid

from sqlalchemy import ColumnElement, Select, false, select, true
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Child, ChildParent, ClassTeacher, User

STAFF_ROLES = ("admin", "teacher")


def is_staff(user: User) -> bool:
    return user.role in STAFF_ROLES


def child_scope(user: User) -> ColumnElement[bool]:
    """SQL predicate on ``Child`` restricting rows to the children this user may access."""
    if user.role == "admin":
        return true()
    if user.role == "teacher":
        return Child.class_id.in_(select(ClassTeacher.class_id).where(ClassTeacher.user_id == user.id))
    if user.role == "parent":
        return Child.id.in_(select(ChildParent.child_id).where(ChildParent.user_id == user.id))
    return false()


def visible_children(user: User, include_archived: bool = False) -> Select:
    """``select(Child)`` limited to the user's scope (archived rows only for admins who ask)."""
    stmt = select(Child).where(child_scope(user))
    if not (include_archived and user.role == "admin"):
        stmt = stmt.where(Child.archived_at.is_(None))
    return stmt


def scoped_child_ids(user: User) -> Select:
    """Subquery of visible child ids, for filtering child-owned rows:
    ``select(Observation).where(Observation.child_id.in_(scoped_child_ids(user)))``."""
    return select(Child.id).where(child_scope(user), Child.archived_at.is_(None))


def _as_uuid(value) -> uuid.UUID | None:
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def get_child_or_404(db: Session, user: User, child_id, write: bool = False, lock: bool = False,
                     include_archived: bool = False) -> Child:
    """Load a child the user may access, or raise.

    - out of scope / unknown / archived (non-admin) -> 404 NOT_FOUND
    - ``write=True`` and the user is not staff -> 403 FORBIDDEN
      (parent writes to their own perspective/basics are handled by the
      owning service, which calls this with ``write=False`` and checks fields)
    - ``lock=True`` adds ``FOR UPDATE`` on the child row (e.g. the 3-active-focus rule)
    """
    cid = _as_uuid(child_id)
    if cid is None:
        raise AppError("NOT_FOUND", "Child not found.")
    stmt = visible_children(user, include_archived=include_archived).where(Child.id == cid)
    if lock:
        stmt = stmt.with_for_update(of=Child)
    child = db.scalars(stmt).first()
    if child is None:
        raise AppError("NOT_FOUND", "Child not found.")
    if write and not is_staff(user):
        raise AppError("FORBIDDEN")
    return child


def get_child_row_or_404(db: Session, user: User, model, row_id, write: bool = False, lock: bool = False):
    """Load a child-owned row (any model with ``child_id``: FocusArea, Observation,
    GeneratedContent, ...) whose child is in the user's scope, or raise 404/403 as above."""
    rid = _as_uuid(row_id)
    if rid is None:
        raise AppError("NOT_FOUND")
    stmt = select(model).where(model.id == rid, model.child_id.in_(scoped_child_ids(user)))
    if lock:
        stmt = stmt.with_for_update(of=model)
    row = db.scalars(stmt).first()
    if row is None:
        raise AppError("NOT_FOUND")
    if write and not is_staff(user):
        raise AppError("FORBIDDEN")
    return row
