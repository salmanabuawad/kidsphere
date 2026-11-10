"""Family and home (migration 0010): parents' home reflections and the suggested next steps.

- POST /content/{id}/home-reflections  HomeReflectionIn {result, note?, client_request_id?}
       parents only, on content shared with them → 201 {reflection}; a repeated client_request_id → 200
       (staff 403, content not visible to the parent 404). See app/services/home_reflections.py.
- GET  /content/{id}/home-reflections  staff: all; a parent: their own → {reflections}
- GET  /children/{id}/home-reflections  staff only (parents 404) → {reflections} with content title/type
- GET  /children/{id}/next-steps  staff only → {focus_areas: [...]} (app/services/next_steps.py)
"""
from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.deps import DB, CurrentUser
from app.schemas.family import HomeReflectionIn
from app.services import home_reflections as svc
from app.services import next_steps as next_svc

router = APIRouter(tags=["family"])


@router.post("/content/{content_id}/home-reflections", status_code=201)
def create_home_reflection(content_id: str, body: HomeReflectionIn, response: Response, db: DB,
                           user: CurrentUser) -> dict:
    out, created = svc.create_reflection(db, user, content_id, body)
    if not created:
        response.status_code = 200
    return out


@router.get("/content/{content_id}/home-reflections")
def content_home_reflections(content_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.list_for_content(db, user, content_id)


@router.get("/children/{child_id}/home-reflections")
def child_home_reflections(child_id: str, db: DB, user: CurrentUser,
                           limit: Annotated[int, Query(ge=1, le=100)] = 30) -> dict:
    return svc.list_for_child(db, user, child_id, limit)


@router.get("/children/{child_id}/next-steps")
def child_next_steps(child_id: str, db: DB, user: CurrentUser) -> dict:
    return next_svc.next_steps(db, user, child_id)
