"""Content feedback: "How did it go?" (spec §20; PLAN-ADJUSTMENTS B4, B5, B9).

``create_feedback`` runs as ONE transaction:

1. a mirrored ``observations`` row (``source='content_feedback'``, ``content_id``,
   the content's ``focus_area_id``, the optional text — NULL allowed for a
   result-only feedback — support level and what helped), so the feedback joins
   the observation history and the timeline shows it exactly once;
2. the ``content_feedback`` row, linked to it through ``observation_id``;
3. status approved → completed (completed stays completed: repeat feedback is allowed);
4. the ``feedback.create`` audit row (ids and the result only).

Only ``result`` is required, so a 2-tap feedback (open → tap a result) works.
Feedback is accepted for approved and completed content; anything else is 409
INVALID_TRANSITION. Staff only (parents: 403 on content they can see, else 404).
The child profile is never changed here.

Response (201)::

    {"feedback": {id, content_id, result, support_level, observation, what_helped,
                  observation_id, created_at, by_name},
     "content": <content detail, see services/content.py>}
"""
from sqlalchemy.orm import Session

from app.audit import audit
from app.models import ContentFeedback, Observation, User
from app.schemas.content import FeedbackIn
from app.schemas.observations import normalize_helps
from app.services import content as content_svc
from app.sessions import utcnow


def create_feedback(db: Session, user: User, content_id, body: FeedbackIn) -> dict:
    row = content_svc.row_for_write(db, user, content_id)
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
        created_by=user.id,
    )
    db.add(obs)
    db.flush()

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
    return out
