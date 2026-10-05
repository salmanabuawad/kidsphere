"""Child profile sections (GET/PATCH /children/{id}/profile).

Owned by WP-06. Paths are relative to /api (no router prefix); main.py includes this module.
Staff see both perspectives and the merged lists; parents see and write only the
parent perspective. See app/services/profiles.py for the JSON shapes.
"""
from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas.profile import ProfilePatch
from app.services import profiles

router = APIRouter(tags=["profiles"])


@router.get("/children/{child_id}/profile")
def get_profile(child_id: str, db: DB, user: CurrentUser) -> dict:
    return profiles.get_profile(db, user, child_id)


@router.patch("/children/{child_id}/profile")
def patch_profile(child_id: str, body: ProfilePatch, db: DB, user: CurrentUser) -> dict:
    return profiles.update_profile(db, user, child_id, body)
