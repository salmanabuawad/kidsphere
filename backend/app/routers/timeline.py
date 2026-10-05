"""Development timeline (GET /children/{id}/timeline).

Owned by WP-08. Paths are relative to /api (no router prefix); main.py includes this module.

- GET /children/{id}/timeline?limit=30&offset=0
      → {"entries": [entry], "limit", "offset", "has_more"}   newest first

Staff only: parents get 404. See app/services/timeline.py for the entry shape.
"""
from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import DB, CurrentUser
from app.services import timeline as svc

router = APIRouter(tags=["timeline"])


@router.get("/children/{child_id}/timeline")
def get_timeline(
    child_id: str,
    db: DB,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=svc.MAX_LIMIT)] = svc.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
) -> dict:
    return svc.get_timeline(db, user, child_id, limit=limit, offset=offset)
