"""Baselines and current understanding (/children/{id}/baseline, /children/{id}/current-understanding).

Owned by WP-06. Paths are relative to /api (no router prefix); main.py includes this module.
Baselines are immutable: there is deliberately no PUT/PATCH/DELETE route.
"""
from fastapi import APIRouter

from app.deps import DB, StaffUser
from app.services import baselines

router = APIRouter(tags=["baselines"])


@router.post("/children/{child_id}/baseline", status_code=201)
def create_baseline(child_id: str, db: DB, user: StaffUser) -> dict:
    return {"baseline": baselines.create_baseline(db, user, child_id)}


@router.get("/children/{child_id}/baseline")
def get_baseline(child_id: str, db: DB, user: StaffUser) -> dict:
    return baselines.get_baselines(db, user, child_id)


@router.get("/children/{child_id}/current-understanding")
def current_understanding(child_id: str, db: DB, user: StaffUser) -> dict:
    return baselines.get_current_understanding(db, user, child_id)
