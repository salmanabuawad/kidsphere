"""Admin: users (GET/POST /users, PUT /users/{id}, POST /users/{id}/password).

Owned by WP-07. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from typing import Literal

from fastapi import APIRouter, Query, Request, Response

from app.deps import DB, AdminUser
from app.schemas.admin import PasswordSetIn, UserCreateIn, UserUpdateIn, admin_user_out
from app.services import users as svc

router = APIRouter(tags=["users"])


@router.get("/users")
def list_users(
    db: DB,
    admin: AdminUser,
    role: Literal["admin", "teacher", "parent"] | None = None,
    q: str | None = Query(default=None, max_length=100),
    active: bool | None = None,
) -> dict:
    return {"users": [admin_user_out(u) for u in svc.list_users(db, role=role, q=q, active=active)]}


@router.post("/users", status_code=201)
def create_user(body: UserCreateIn, db: DB, admin: AdminUser) -> dict:
    return {"user": admin_user_out(svc.create_user(db, admin, body))}


@router.put("/users/{user_id}")
def update_user(user_id: str, body: UserUpdateIn, db: DB, admin: AdminUser) -> dict:
    return {"user": admin_user_out(svc.update_user(db, admin, user_id, body))}


@router.post("/users/{user_id}/password", status_code=204)
def set_password(user_id: str, body: PasswordSetIn, request: Request, db: DB, admin: AdminUser) -> Response:
    svc.set_password(db, admin, user_id, body, keep_session_id=getattr(request.state, "session_id", None))
    return Response(status_code=204)
