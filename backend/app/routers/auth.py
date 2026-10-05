"""POST /api/auth/login, POST /api/auth/logout."""
from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.audit import audit
from app.deps import DB
from app.errors import AppError
from app.models import User
from app.schemas.auth import LoginIn, user_out
from app.security import DUMMY_HASH, verify_password
from app.sessions import (
    COOKIE_NAME,
    clear_session_cookie,
    create_session,
    delete_session,
    lookup_session,
    set_session_cookie,
    utcnow,
)

router = APIRouter(tags=["auth"])


@router.post("/auth/login")
def login(body: LoginIn, request: Request, response: Response, db: DB) -> dict:
    user = db.scalars(select(User).where(User.email == body.identifier)).first()
    # Always run one bcrypt check so the timing does not reveal whether the account exists.
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok or not user.is_active:
        audit(db, user, "auth.login_failed", "user", user.id if user else None)
        db.commit()
        raise AppError("INVALID_CREDENTIALS")
    token = create_session(db, user, request.headers.get("user-agent"))
    user.last_login_at = utcnow()
    audit(db, user, "auth.login", "user", user.id)
    db.commit()
    set_session_cookie(response, token)
    return {"user": user_out(user)}


@router.post("/auth/logout", status_code=204)
def logout(request: Request, db: DB) -> Response:
    token = request.cookies.get(COOKIE_NAME)
    found = lookup_session(db, token)
    delete_session(db, token)
    if found:
        audit(db, found[0], "auth.logout", "user", found[0].id)
    db.commit()
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response
