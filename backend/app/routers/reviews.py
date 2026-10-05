"""Development reviews (/children/{id}/development-reviews...).

Owned by WP-12. Paths are relative to /api (no router prefix); main.py includes this module.

- POST /children/{id}/development-reviews/suggest  [SuggestIn]
       → {suggestion, provider, is_template, baseline, observation_count_since_baseline,
          max_active, focus_areas, baseline_items}          writes nothing
- POST /children/{id}/development-reviews  ReviewCreate
       → 201 {review, current_understanding, warnings}       409 FOCUS_LIMIT rolls back everything
- GET  /children/{id}/development-reviews
       → {reviews: [review] (newest first), context: draft context}

Staff only: parents and out-of-scope users get 404. See app/services/reviews.py for the shapes.
"""
from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas.reviews import ReviewCreate, SuggestIn
from app.services import reviews as svc

router = APIRouter(tags=["reviews"])


@router.post("/children/{child_id}/development-reviews/suggest")
def suggest_review(child_id: str, db: DB, user: CurrentUser, body: SuggestIn | None = None) -> dict:
    return svc.suggest(db, user, child_id, body)


@router.post("/children/{child_id}/development-reviews", status_code=201)
def create_review(child_id: str, body: ReviewCreate, db: DB, user: CurrentUser) -> dict:
    return svc.create_review(db, user, child_id, body)


@router.get("/children/{child_id}/development-reviews")
def list_reviews(child_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.list_reviews(db, user, child_id)
