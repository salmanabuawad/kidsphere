"""Content library (/library...): ready-made content staff assign to children as drafts.

Paths are relative to /api (no router prefix); main.py includes this module.
See app/services/library.py.

- GET  /library                            → {"collections", "items": [item]}   (staff; parents 403)
- GET  /library/{key}                      → {"item": item + content}
- POST /library/{key}/assign  AssignIn     → 201 {"content": [summary]}  a new draft for each child
"""
from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas.library import AssignIn
from app.services import library as svc

router = APIRouter(tags=["library"])


@router.get("/library")
def list_library(user: CurrentUser) -> dict:
    return svc.list_items(user)


@router.get("/library/{key}")
def get_library_item(key: str, user: CurrentUser) -> dict:
    return svc.get_item(user, key)


@router.post("/library/{key}/assign", status_code=201)
def assign_library_item(key: str, body: AssignIn, db: DB, user: CurrentUser) -> dict:
    return svc.assign_item(db, user, key, body)
