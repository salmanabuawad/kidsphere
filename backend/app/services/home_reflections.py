"""Home reflections: a parent's "How did it go at home?" on content shared with them (migration 0010).

Rules
- Only a parent linked to the child may write one, and only on content they can see
  (``shared_with_parent`` and approved|completed; anything else is 404). Staff get 403: they record
  what they see as content feedback or observations instead.
- A reflection is parent-reported. It is NOT an observation, it never changes the content status or
  the child profile, and it is never sent to the AI (its note is parent free text, PRIVACY.md).
- Rows are only inserted. A repeated ``client_request_id`` of the same parent returns the first save
  (HTTP 200) and changes nothing.
- Audit ``home_reflection.create`` holds ids and the result only, never the note.

Reading
- ``GET /content/{id}/home-reflections``: staff see every reflection on the content; a parent sees
  their own (the content must be visible to them).
- ``GET /children/{id}/home-reflections``: staff only (parents 404), newest first, with the content
  title and type.

Reflection JSON::

    {id, content_id, child_id, result, note, created_at, by_name,
     content_title?, content_type?}   (the last two in the child list)
"""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import access
from app.audit import audit
from app.errors import AppError
from app.models import GeneratedContent, HomeReflection, User
from app.schemas.family import HomeReflectionIn
from app.services import content as content_svc
from app.services.observations import staff_child

MAX_LIST = 100


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def reflection_out(r: HomeReflection, by_name: str | None, content: GeneratedContent | None = None) -> dict:
    out = {
        "id": str(r.id),
        "content_id": str(r.content_id),
        "child_id": str(r.child_id),
        "result": r.result,
        "note": r.note,
        "created_at": _iso(r.created_at),
        "by_name": by_name,
    }
    if content is not None:
        out["content_title"] = content.title
        out["content_type"] = content.content_type
    return out


def _parent_content(db: Session, user: User, content_id) -> GeneratedContent:
    """Content a parent may reflect on; staff 403 (on content they can see), anything else 404."""
    row = content_svc.live_row_or_404(db, user, content_id)
    if access.is_staff(user):
        raise AppError("FORBIDDEN", "Home reflections are written by parents.")
    if not content_svc.parent_visible(row):
        raise AppError("NOT_FOUND")
    return row


def _existing(db: Session, user: User, request_id: str) -> HomeReflection | None:
    return db.scalars(select(HomeReflection).where(HomeReflection.created_by == user.id,
                                                   HomeReflection.client_request_id == request_id)).first()


def _replay(db: Session, user: User, row: GeneratedContent, existing: HomeReflection) -> dict:
    if existing.content_id != row.id:
        raise AppError("DUPLICATE", "This request id was already used for something else.")
    out = {"reflection": reflection_out(existing, user.name)}
    db.rollback()
    return out


def create_reflection(db: Session, user: User, content_id, body: HomeReflectionIn) -> tuple[dict, bool]:
    """Returns (response, created). ``created`` is False for a replay of an earlier request."""
    row = _parent_content(db, user, content_id)
    request_id = body.client_request_id
    if request_id:
        existing = _existing(db, user, request_id)
        if existing is not None:
            return _replay(db, user, row, existing), False
    reflection = HomeReflection(content_id=row.id, child_id=row.child_id, result=body.result, note=body.note,
                                client_request_id=request_id, created_by=user.id)
    try:
        with db.begin_nested():
            db.add(reflection)
            db.flush()
    except IntegrityError:
        existing = _existing(db, user, request_id) if request_id else None
        if existing is None:
            raise
        return _replay(db, user, row, existing), False
    audit(db, user, "home_reflection.create", "home_reflection", reflection.id, child_id=row.child_id,
          content_id=row.id, result=body.result, has_note=body.note is not None)
    db.flush()
    out = {"reflection": reflection_out(reflection, user.name)}
    db.commit()
    return out, True


def _names(db: Session, rows) -> dict:
    ids = {r.created_by for r in rows if r.created_by is not None}
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all()) if ids else {}


def list_for_content(db: Session, user: User, content_id) -> dict:
    row = content_svc.live_row_or_404(db, user, content_id)
    stmt = select(HomeReflection).where(HomeReflection.content_id == row.id)
    if not access.is_staff(user):
        if not content_svc.parent_visible(row):
            raise AppError("NOT_FOUND")
        stmt = stmt.where(HomeReflection.created_by == user.id)
    rows = db.scalars(stmt.order_by(HomeReflection.created_at.desc(), HomeReflection.id.desc()).limit(MAX_LIST)).all()
    names = _names(db, rows)
    return {"reflections": [reflection_out(r, names.get(r.created_by)) for r in rows]}


def list_for_child(db: Session, user: User, child_id, limit: int = 30) -> dict:
    child = staff_child(db, user, child_id)
    pairs = db.execute(
        select(HomeReflection, GeneratedContent)
        .join(GeneratedContent, GeneratedContent.id == HomeReflection.content_id)
        .where(HomeReflection.child_id == child.id)
        .order_by(HomeReflection.created_at.desc(), HomeReflection.id.desc()).limit(min(limit, MAX_LIST))
    ).all()
    names = _names(db, [r for r, _ in pairs])
    return {"reflections": [reflection_out(r, names.get(r.created_by), c) for r, c in pairs]}
