"""Kindergartens (/me/kindergartens, /kindergartens/theme).

Paths are relative to /api (no router prefix); main.py includes this module.

- GET /me/kindergartens        → {"kindergartens": [{name, theme, classes: [{id, name}]}]}  (any signed-in user)
- PUT /kindergartens/theme {kindergarten, theme|null} → {kindergarten, theme}               (admin)
"""
from fastapi import APIRouter

from app.deps import DB, AdminUser, CurrentUser
from app.schemas.kindergartens import ThemeIn
from app.services import kindergartens as svc

router = APIRouter(tags=["kindergartens"])


@router.get("/me/kindergartens")
def my_kindergartens(db: DB, user: CurrentUser) -> dict:
    return svc.mine(db, user)


@router.put("/kindergartens/theme")
def set_theme(body: ThemeIn, db: DB, admin: AdminUser) -> dict:
    return svc.set_theme(db, admin, body)
