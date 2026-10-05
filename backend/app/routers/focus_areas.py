"""Focus areas (/children/{id}/focus-areas, /focus-areas/{id}, /focus-areas/{id}/close).

Owned by WP-06. Paths are relative to /api (no router prefix); main.py includes this module.
Staff only; at most 3 active per child (409 FOCUS_LIMIT).
"""
from typing import Literal

from fastapi import APIRouter

from app.deps import DB, StaffUser
from app.schemas.focus import FocusClose, FocusCreate, FocusUpdate
from app.services import focus_areas

router = APIRouter(tags=["focus_areas"])


@router.get("/children/{child_id}/focus-areas")
def list_focus_areas(child_id: str, db: DB, user: StaffUser,
                     status: Literal["active", "paused", "completed"] | None = None) -> dict:
    return focus_areas.list_focus(db, user, child_id, status)


@router.post("/children/{child_id}/focus-areas", status_code=201)
def create_focus_area(child_id: str, body: FocusCreate, db: DB, user: StaffUser) -> dict:
    return focus_areas.create_focus(db, user, child_id, body)


@router.put("/focus-areas/{focus_id}")
def update_focus_area(focus_id: str, body: FocusUpdate, db: DB, user: StaffUser) -> dict:
    return focus_areas.update_focus(db, user, focus_id, body)


@router.post("/focus-areas/{focus_id}/close")
def close_focus_area(focus_id: str, db: DB, user: StaffUser, body: FocusClose | None = None) -> dict:
    return focus_areas.close_focus(db, user, focus_id, body or FocusClose())
