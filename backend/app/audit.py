"""Audit log (port of src/lib/audit/index.ts).

``audit(db, actor, action, object_type, object_id, child_id=None, **meta)`` adds
a row to the caller's session; it is committed with the caller's transaction.

Metadata holds primitives only (str, int, float, bool, None, or a list of
those): names, ids, keys and field names. Never put free text about a child
(observations, answers, content) in here. Read it with
``python -m app.cli audit --child <id>``.
"""
import uuid

from sqlalchemy.orm import Session

from app.models import AuditLog, User

_PRIMITIVES = (str, int, float, bool, type(None))


def _check_meta(meta: dict) -> dict:
    out = {}
    for key, value in meta.items():
        if isinstance(value, uuid.UUID):
            value = str(value)
        elif isinstance(value, (list, tuple, set)):
            value = [str(v) if isinstance(v, uuid.UUID) else v for v in value]
            if not all(isinstance(v, _PRIMITIVES) for v in value):
                raise TypeError(f"audit metadata {key!r} must be a list of primitives")
        elif not isinstance(value, _PRIMITIVES):
            raise TypeError(f"audit metadata {key!r} must be a primitive, got {type(value).__name__}")
        out[key] = value
    return out


def audit(
    db: Session,
    actor: User | None,
    action: str,
    object_type: str | None = None,
    object_id: uuid.UUID | str | None = None,
    child_id: uuid.UUID | str | None = None,
    **meta,
) -> AuditLog:
    row = AuditLog(
        actor_id=actor.id if actor is not None else None,
        action=action,
        object_type=object_type,
        object_id=uuid.UUID(str(object_id)) if object_id is not None else None,
        child_id=uuid.UUID(str(child_id)) if child_id is not None else None,
        meta=_check_meta(meta),
    )
    db.add(row)
    return row
