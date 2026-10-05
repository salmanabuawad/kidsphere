"""Content feedback (POST /content/{id}/feedback).

Owned by WP-11. Paths are relative to /api (no router prefix); main.py includes this module.

- POST /content/{id}/feedback  FeedbackIn {result, support_level?, observation?, what_helped?}
       → 201 {"feedback", "content"}
       approved|completed only (409 otherwise); repeat feedback is allowed. One transaction:
       content_feedback + mirrored observation (source content_feedback) + status → completed.
       See app/services/feedback.py.
"""
from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas.content import FeedbackIn
from app.services import feedback as svc

router = APIRouter(tags=["feedback"])


@router.post("/content/{content_id}/feedback", status_code=201)
def create_feedback(content_id: str, body: FeedbackIn, db: DB, user: CurrentUser) -> dict:
    return svc.create_feedback(db, user, content_id, body)
