"""Content feedback: "How did it go?" (spec §20; PLAN-ADJUSTMENTS B4, B5, B9).

``create_feedback`` runs as ONE transaction:

1. a mirrored ``observations`` row (``source='content_feedback'``, ``content_id``,
   the content's ``focus_area_id``, the optional text — NULL allowed for a
   result-only feedback — support level, what helped and the optional
   ``client_request_id``), so the feedback joins the observation history and the
   timeline shows it exactly once;
2. the ``content_feedback`` row, linked to it through ``observation_id``;
3. status approved → completed (completed stays completed: repeat feedback is allowed);
4. the ``feedback.create`` audit row (ids and the result only).

Only ``result`` is required, so a 2-tap feedback (open → tap a result) works.
Feedback is accepted for approved and completed content; anything else is 409
INVALID_TRANSITION. Staff only (parents: 403 on content they can see, else 404).
The child profile is never changed here.

Idempotency: ``client_request_id`` is stored on the mirrored observation, where
UNIQUE (created_by, client_request_id) holds (the same namespace as quick
observations). A request whose id this user already used for this content
returns the existing feedback (HTTP 200, same shape) and changes nothing; an id
already used for other content, or for a quick observation, is 409 DUPLICATE
like the reverse case in services/observations.py.
Two concurrent requests are serialised by the content row lock, and the unique
constraint settles any remaining race (the loser replays the winner's feedback).

Response (201, or 200 for a replay)::

    {"feedback": {id, content_id, result, support_level, observation, what_helped,
                  observation_id, created_at, by_name},
     "content": <content detail, see services/content.py>}
"""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import audit
from app.errors import AppError
from app.models import ContentFeedback, GeneratedContent, Observation, User
from app.schemas.content import FeedbackIn
from app.schemas.observations import normalize_helps
from app.services import content as content_svc
from app.sessions import utcnow


def _existing(db: Session, user: User, request_id: str) -> Observation | None:
    return db.scalars(
        select(Observation).where(Observation.created_by == user.id, Observation.client_request_id == request_id)
    ).first()


def _replay(db: Session, user: User, row: GeneratedContent, existing: Observation) -> dict:
    """The feedback that an earlier request with the same client_request_id saved; nothing changes."""
    fb = None
    if existing.source == "content_feedback" and existing.content_id == row.id:
        fb = db.scalars(
            select(ContentFeedback).where(ContentFeedback.observation_id == existing.id)
            .order_by(ContentFeedback.created_at, ContentFeedback.id).limit(1)
        ).first()
    if fb is None:
        raise AppError("DUPLICATE", "This request id was already used for something else.")
    out = {"feedback": content_svc.feedback_out(fb, user.name), "content": content_svc.detail_out(db, row, staff=True)}
    db.rollback()  # nothing to save; ends the transaction and its content row lock
    return out


def create_feedback(db: Session, user: User, content_id, body: FeedbackIn) -> tuple[dict, bool]:
    """Returns (response, created). ``created`` is False for a replay of an earlier request."""
    row = content_svc.row_for_write(db, user, content_id)  # FOR UPDATE: serialises feedback on this content
    request_id = body.client_request_id
    if request_id:
        existing = _existing(db, user, request_id)
        if existing is not None:
            return _replay(db, user, row, existing), False
    content_svc._require(row, content_svc.USABLE, "Feedback can be added once the content is approved.")
    helps = normalize_helps(body.what_helped)

    obs = Observation(
        child_id=row.child_id,
        focus_area_id=row.focus_area_id,
        content_id=row.id,
        source="content_feedback",
        observed_at=utcnow(),
        observation=body.observation,
        support_level=body.support_level,
        what_helped=helps,
        client_request_id=request_id,
        created_by=user.id,
    )
    try:
        with db.begin_nested():
            db.add(obs)
            db.flush()
    except IntegrityError:
        # A concurrent request with the same client_request_id won the race.
        existing = _existing(db, user, request_id) if request_id else None
        if existing is None:
            raise
        return _replay(db, user, row, existing), False

    fb = ContentFeedback(
        content_id=row.id,
        child_id=row.child_id,
        result=body.result,
        support_level=body.support_level,
        observation=body.observation,
        what_helped=helps,
        observation_id=obs.id,
        created_by=user.id,
    )
    db.add(fb)
    db.flush()

    from_status = row.status
    if row.status == "approved":
        row.status = "completed"
    audit(db, user, "feedback.create", "content_feedback", fb.id, child_id=row.child_id, content_id=row.id,
          observation_id=obs.id, result=body.result, from_status=from_status)
    db.flush()
    out = {"feedback": content_svc.feedback_out(fb, user.name), "content": content_svc.detail_out(db, row, staff=True)}
    db.commit()
    return out, True
