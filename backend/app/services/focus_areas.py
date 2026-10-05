"""Current Focus areas (port of src/features/goals/rules.ts + src/server/services/goals.ts).

At most ``MAX_ACTIVE`` (3) active focus areas per child. Every write that can add
an active area (create, or PUT status back to active) first locks the child row
(``get_child_or_404(..., lock=True)`` → SELECT ... FOR UPDATE), then counts, so
two concurrent requests cannot both pass the check.

Focus area JSON::

    {id, child_id, category, suggestion_key, title, description,
     plan: {strength_used, need, adaptation, what_we_will_do, frequency, who,
            review_on, success_looks_like} | null,
     status: active|paused|completed, close_reason, created_by, created_at,
     updated_at, closed_at}
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import vocab
from app.access import get_child_or_404, get_child_row_or_404
from app.audit import audit
from app.errors import AppError
from app.models import FocusArea, User
from app.schemas.focus import FocusClose, FocusCreate, FocusUpdate
from app.sessions import utcnow

MAX_ACTIVE = 3


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def focus_out(row: FocusArea) -> dict:
    return {
        "id": str(row.id),
        "child_id": str(row.child_id),
        "category": row.category,
        "suggestion_key": row.suggestion_key,
        "title": row.title,
        "description": row.description,
        "plan": row.plan,
        "status": row.status,
        "close_reason": row.close_reason,
        "created_by": str(row.created_by) if row.created_by else None,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
        "closed_at": _iso(row.closed_at),
    }


def active_count(db: Session, child_id, exclude_id=None) -> int:
    stmt = select(func.count()).select_from(FocusArea).where(FocusArea.child_id == child_id, FocusArea.status == "active")
    if exclude_id is not None:
        stmt = stmt.where(FocusArea.id != exclude_id)
    return db.scalar(stmt) or 0


def assert_can_add_active(db: Session, child_id, exclude_id=None) -> None:
    """Raise 409 FOCUS_LIMIT when one more active focus area would exceed the limit.
    Call only after the child row is locked."""
    if active_count(db, child_id, exclude_id) >= MAX_ACTIVE:
        raise AppError("FOCUS_LIMIT", details={"max_active": MAX_ACTIVE})


def _suggestion_category(key: str) -> str | None:
    item = vocab.item("focus_suggestions", key)
    return item.get("category") if item else None


def list_focus(db: Session, user: User, child_id, status: str | None = None) -> dict:
    child = get_child_or_404(db, user, child_id, write=True)
    stmt = select(FocusArea).where(FocusArea.child_id == child.id)
    if status:
        stmt = stmt.where(FocusArea.status == status)
    rows = db.scalars(stmt.order_by(FocusArea.created_at, FocusArea.id)).all()
    order = {"active": 0, "paused": 1, "completed": 2}
    rows = sorted(rows, key=lambda r: order.get(r.status, 3))
    return {"focus_areas": [focus_out(r) for r in rows], "max_active": MAX_ACTIVE}


def create_focus(db: Session, user: User, child_id, body: FocusCreate) -> dict:
    child = get_child_or_404(db, user, child_id, write=True, lock=True)
    assert_can_add_active(db, child.id)
    category = body.category or _suggestion_category(body.suggestion_key) or "other"
    title = body.title or vocab.label("focus_suggestions", body.suggestion_key, user.language or "en")
    row = FocusArea(
        child_id=child.id,
        category=category,
        suggestion_key=body.suggestion_key,
        title=title,
        description=body.description,
        plan=body.plan.stored() if body.plan else None,
        status="active",
        created_by=user.id,
    )
    db.add(row)
    db.flush()
    audit(db, user, "focus.create", "focus_area", row.id, child_id=child.id,
          category=category, suggestion_key=body.suggestion_key)
    db.flush()
    db.refresh(row)
    out = focus_out(row)
    db.commit()
    return {"focus_area": out}


def update_focus(db: Session, user: User, focus_id, body: FocusUpdate) -> dict:
    row = get_child_row_or_404(db, user, FocusArea, focus_id, write=True)
    sent = body.model_fields_set
    changed: list[str] = []
    if "status" in sent and body.status is not None and body.status != row.status:
        if body.status == "active":
            get_child_or_404(db, user, row.child_id, write=True, lock=True)
            assert_can_add_active(db, row.child_id, exclude_id=row.id)
            row.closed_at = None
            row.close_reason = None
        elif row.status == "active":
            row.closed_at = utcnow()
        row.status = body.status
        changed.append("status")
    if "category" in sent and body.category is not None and body.category != row.category:
        row.category = body.category
        changed.append("category")
    if "suggestion_key" in sent and body.suggestion_key != row.suggestion_key:
        row.suggestion_key = body.suggestion_key
        if body.suggestion_key and "category" not in sent:
            row.category = _suggestion_category(body.suggestion_key) or row.category
        changed.append("suggestion_key")
    if "title" in sent and body.title is not None and body.title != row.title:
        row.title = body.title
        changed.append("title")
    if "description" in sent and body.description != row.description:
        row.description = body.description
        changed.append("description")
    if "plan" in sent:
        plan = body.plan.stored() if body.plan else None
        if plan != row.plan:
            row.plan = plan
            changed.append("plan")
    if changed:
        audit(db, user, "focus.update", "focus_area", row.id, child_id=row.child_id, fields=changed,
              status=row.status)
    db.flush()
    db.refresh(row)
    out = focus_out(row)
    db.commit()
    return {"focus_area": out}


def close_focus(db: Session, user: User, focus_id, body: FocusClose) -> dict:
    row = get_child_row_or_404(db, user, FocusArea, focus_id, write=True)
    if row.status == "completed" and body.status == "paused":
        raise AppError("INVALID_TRANSITION")
    row.status = body.status
    row.close_reason = body.close_reason
    row.closed_at = utcnow()
    audit(db, user, "focus.close", "focus_area", row.id, child_id=row.child_id, status=body.status)
    db.flush()
    db.refresh(row)
    out = focus_out(row)
    db.commit()
    return {"focus_area": out}
