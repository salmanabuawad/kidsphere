"""FastAPI dependencies: the DB session, the current user and role gates.

Typical endpoint::

    @router.get("/children/{child_id}/observations")
    def list_observations(child_id: uuid.UUID, db: DB, user: StaffUser): ...

``current_user`` raises 401 UNAUTHENTICATED; ``require_roles`` raises 403
FORBIDDEN. The session row id of the request is on ``request.state.session_id``.
"""
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.models import User
from app.sessions import COOKIE_NAME, lookup_session

DB = Annotated[Session, Depends(get_db)]


def current_user(request: Request, db: DB) -> User:
    found = lookup_session(db, request.cookies.get(COOKIE_NAME))
    if not found:
        raise AppError("UNAUTHENTICATED")
    user, session = found
    request.state.user = user
    request.state.session_id = session.id
    return user


def require_roles(*roles: str):
    """Dependency factory: the current user, if their role is one of ``roles``."""

    def dependency(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise AppError("FORBIDDEN")
        return user

    return dependency


CurrentUser = Annotated[User, Depends(current_user)]
StaffUser = Annotated[User, Depends(require_roles("admin", "teacher"))]
AdminUser = Annotated[User, Depends(require_roles("admin"))]
