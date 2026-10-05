"""Quick observations (/children/{id}/observations, /observations/{id}).

Owned by WP-08. Paths are relative to /api (no router prefix); main.py includes this module.

- GET  /children/{id}/observations?focus_area_id&limit=30&offset=0
       → {"observations": [observation], "limit", "offset", "has_more"}   newest first
- POST /children/{id}/observations  ObservationCreate
       → 201 {"observation"}; a repeated client_request_id → 200 with the existing row
- PUT  /observations/{id}  ObservationUpdate (author or admin) → {"observation"}

Staff only: parents get 404. See app/services/observations.py for the shape.
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.deps import DB, CurrentUser
from app.schemas.observations import ObservationCreate, ObservationUpdate
from app.services import observations as svc

router = APIRouter(tags=["observations"])


@router.get("/children/{child_id}/observations")
def list_observations(
    child_id: str,
    db: DB,
    user: CurrentUser,
    focus_area_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=svc.MAX_LIMIT)] = svc.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
) -> dict:
    return svc.list_observations(db, user, child_id, focus_area_id=focus_area_id, limit=limit, offset=offset)


@router.post("/children/{child_id}/observations", status_code=201)
def create_observation(child_id: str, body: ObservationCreate, response: Response, db: DB, user: CurrentUser) -> dict:
    out, created = svc.create_observation(db, user, child_id, body)
    if not created:
        response.status_code = 200
    return out


@router.put("/observations/{observation_id}")
def update_observation(observation_id: str, body: ObservationUpdate, db: DB, user: CurrentUser) -> dict:
    return svc.update_observation(db, user, observation_id, body)
