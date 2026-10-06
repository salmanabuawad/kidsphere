"""Child profile sections (GET/PATCH /children/{id}/profile) and their history.

Paths are relative to /api (no router prefix); main.py includes this module.
Staff see both perspectives and the merged lists; parents see and write only the
parent perspective (their questionnaire, including their own health answers) and
never the teacher perspective or the quick baseline. See app/services/profiles.py
for the JSON shapes.
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


@router.get("/children/{child_id}/profile/history")
def profile_history(child_id: str, db: DB, user: CurrentUser, perspective: str | None = None,
                    section: str | None = None) -> dict:
    """Every saved version of the profile sections (staff only; 404 for parents)."""
    return profiles.profile_history(db, user, child_id, perspective, section)
