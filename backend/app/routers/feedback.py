"""Content feedback (POST /content/{id}/feedback).

Owned by WP-11. Paths are relative to /api (no router prefix); main.py includes this module.

- POST /content/{id}/feedback  FeedbackIn {result, support_level?, observation?, what_helped?, client_request_id?}
       → 201 {"feedback", "content"}; a repeated client_request_id → 200 with the existing feedback
       (409 DUPLICATE when that id was used for other content or a quick observation).
       approved|completed only (409 otherwise); repeat feedback is allowed. One transaction:
       content_feedback + mirrored observation (source content_feedback) + status → completed.
       See app/services/feedback.py.
"""
from fastapi import APIRouter, Response

from app.deps import DB, CurrentUser
from app.schemas.content import FeedbackIn
from app.services import feedback as svc

router = APIRouter(tags=["feedback"])


@router.post("/content/{content_id}/feedback", status_code=201)
def create_feedback(content_id: str, body: FeedbackIn, response: Response, db: DB, user: CurrentUser) -> dict:
    out, created = svc.create_feedback(db, user, content_id, body)
    if not created:
        response.status_code = 200
    return out
