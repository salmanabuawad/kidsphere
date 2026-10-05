"""Quick observations (spec §21; port of src/server/services/observations.ts).

Staff only. Parents get 404 (observations are never part of the parent view,
PLAN-ADJUSTMENTS B14). Every lookup goes through app.access, so a child or an
observation outside the user's scope is a 404 too.

Idempotency: a POST with a ``client_request_id`` that this user already used
returns the existing row (HTTP 200 instead of 201). Two concurrent requests
are resolved by the UNIQUE (created_by, client_request_id) constraint.

Observation JSON::

    {id, child_id, source: quick|content_feedback, observed_at, focus_area_id,
     focus_area_title, content_id, content_title, result, area, context,
     observation, support_level, what_helped: [{key}|{custom}] | null, note,
     details: {what_i_see, when, what_needed, what_we_did, did_it_change} | null,
     created_by: {id, name} | null, created_at, updated_at}
"""
from datetime import timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import access
from app.audit import audit
from app.errors import AppError
from app.models import ContentFeedback, FocusArea, GeneratedContent, Observation, User
from app.schemas.observations import ObservationCreate, ObservationUpdate, normalize_helps
from app.sessions import utcnow

DEFAULT_LIMIT = 30
MAX_LIMIT = 100
# Clock skew allowed for observed_at coming from a phone.
FUTURE_SLACK = timedelta(minutes=10)


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def staff_child(db: Session, user: User, child_id, lock: bool = False):
    """The child, for staff in scope. Parents (and anyone else) get 404."""
    if not access.is_staff(user):
        raise AppError("NOT_FOUND", "Child not found.")
    return access.get_child_or_404(db, user, child_id, write=True, lock=lock)


def _observed_at(value):
    if value is None:
        return utcnow()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    if value > utcnow() + FUTURE_SLACK:
        raise AppError("VALIDATION", details=[{"path": "observed_at", "message": "The time cannot be in the future."}])
    return value


def _check_focus(db: Session, child_id, focus_area_id) -> None:
    if focus_area_id is None:
        return
    found = db.scalar(select(FocusArea.id).where(FocusArea.id == focus_area_id, FocusArea.child_id == child_id))
    if found is None:
        raise AppError("VALIDATION", details=[{"path": "focus_area_id", "message": "This focus area does not belong to the child."}])


def _query():
    result = (
        select(ContentFeedback.result).where(ContentFeedback.observation_id == Observation.id)
        .order_by(ContentFeedback.created_at.desc()).limit(1).correlate(Observation).scalar_subquery()
    )
    return (
        select(Observation, FocusArea.title, GeneratedContent.title, result, User.id, User.name)
        .outerjoin(FocusArea, FocusArea.id == Observation.focus_area_id)
        .outerjoin(GeneratedContent, GeneratedContent.id == Observation.content_id)
        .outerjoin(User, User.id == Observation.created_by)
    )


def _out(row) -> dict:
    obs, focus_title, content_title, result, user_id, user_name = row
    return {
        "id": str(obs.id),
        "child_id": str(obs.child_id),
        "source": obs.source,
        "observed_at": _iso(obs.observed_at),
        "focus_area_id": str(obs.focus_area_id) if obs.focus_area_id else None,
        "focus_area_title": focus_title,
        "content_id": str(obs.content_id) if obs.content_id else None,
        "content_title": content_title,
        "result": result,
        "area": obs.area,
        "context": obs.context,
        "observation": obs.observation,
        "support_level": obs.support_level,
        "what_helped": obs.what_helped,
        "note": obs.note,
        "details": obs.details,
        "created_by": {"id": str(user_id), "name": user_name} if user_id else None,
        "created_at": _iso(obs.created_at),
        "updated_at": _iso(obs.updated_at),
    }


def observation_out(db: Session, obs_id) -> dict:
    return _out(db.execute(_query().where(Observation.id == obs_id)).one())


def list_observations(db: Session, user: User, child_id, focus_area_id=None, limit: int = DEFAULT_LIMIT,
                      offset: int = 0) -> dict:
    child = staff_child(db, user, child_id)
    stmt = _query().where(Observation.child_id == child.id)
    if focus_area_id is not None:
        stmt = stmt.where(Observation.focus_area_id == focus_area_id)
    stmt = stmt.order_by(Observation.observed_at.desc(), Observation.created_at.desc(), Observation.id.desc())
    rows = db.execute(stmt.limit(limit + 1).offset(offset)).all()
    return {
        "observations": [_out(r) for r in rows[:limit]],
        "limit": limit,
        "offset": offset,
        "has_more": len(rows) > limit,
    }


def _existing(db: Session, user: User, request_id: str) -> Observation | None:
    return db.scalars(
        select(Observation).where(Observation.created_by == user.id, Observation.client_request_id == request_id)
    ).first()


def _replay(db: Session, child, existing: Observation) -> tuple[dict, bool]:
    if existing.child_id != child.id:
        raise AppError("DUPLICATE", "This request id was already used for another child.")
    return {"observation": observation_out(db, existing.id)}, False


def create_observation(db: Session, user: User, child_id, body: ObservationCreate) -> tuple[dict, bool]:
    """Returns ({"observation": ...}, created). ``created`` is False for a replay."""
    child = staff_child(db, user, child_id)
    if body.client_request_id:
        existing = _existing(db, user, body.client_request_id)
        if existing is not None:
            return _replay(db, child, existing)
    _check_focus(db, child.id, body.focus_area_id)
    row = Observation(
        child_id=child.id,
        focus_area_id=body.focus_area_id,
        source="quick",
        observed_at=_observed_at(body.observed_at),
        area=body.area,
        context=body.context,
        observation=body.observation,
        support_level=body.support_level,
        what_helped=normalize_helps(body.what_helped),
        note=body.note,
        details=body.details.stored() if body.details else None,
        client_request_id=body.client_request_id,
        created_by=user.id,
    )
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        # A concurrent request with the same client_request_id won the race.
        if not body.client_request_id:
            raise
        existing = _existing(db, user, body.client_request_id)
        if existing is None:
            raise
        return _replay(db, child, existing)
    audit(db, user, "observation.create", "observation", row.id, child_id=child.id,
          focus_area_id=body.focus_area_id, source="quick")
    db.flush()
    out = observation_out(db, row.id)
    db.commit()
    return {"observation": out}, True


UPDATABLE = ("observed_at", "focus_area_id", "area", "context", "observation", "support_level", "what_helped", "note", "details")


def update_observation(db: Session, user: User, observation_id, body: ObservationUpdate) -> dict:
    if not access.is_staff(user):
        raise AppError("NOT_FOUND")
    row = access.get_child_row_or_404(db, user, Observation, observation_id, write=True)
    if user.role != "admin" and row.created_by != user.id:
        raise AppError("FORBIDDEN", "Only the author or an admin can edit this observation.")
    if row.source != "quick":
        raise AppError("CONFLICT", "Feedback is edited from the content it belongs to.")
    sent = body.model_fields_set
    changed: list[str] = []
    for field in UPDATABLE:
        if field not in sent:
            continue
        value = getattr(body, field)
        if field == "observed_at":
            if value is None:
                continue
            value = _observed_at(value)
        elif field == "focus_area_id":
            _check_focus(db, row.child_id, value)
        elif field == "what_helped":
            value = normalize_helps(value)
        elif field == "details":
            value = value.stored() if value is not None else None
        if value != getattr(row, field):
            setattr(row, field, value)
            changed.append(field)
    if changed:
        audit(db, user, "observation.update", "observation", row.id, child_id=row.child_id, fields=changed)
    db.flush()
    out = observation_out(db, row.id)
    db.commit()
    return {"observation": out}
