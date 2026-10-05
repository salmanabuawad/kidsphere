"""Opaque, revocable login sessions (port of src/lib/auth/session.ts).

The cookie ``ks_session`` holds a random token; the ``sessions`` table stores
only its sha256. Sessions are deleted on logout, password change, role change
and deactivation (use ``revoke_user_sessions``).
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, UserSession
from app.security import hash_token, new_token

COOKIE_NAME = "ks_session"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_session(db: Session, user: User, user_agent: str | None = None) -> str:
    """Insert a session row (caller commits) and return the raw token for the cookie."""
    token = new_token()
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at <= utcnow()))
    db.add(UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=utcnow() + timedelta(days=settings.session_days),
        user_agent=(user_agent or "")[:200] or None,
    ))
    return token


def lookup_session(db: Session, token: str | None) -> tuple[User, UserSession] | None:
    """The active user and session for a cookie token, or None (unknown, expired or inactive user)."""
    if not token:
        return None
    row = db.execute(
        select(User, UserSession)
        .join(UserSession, UserSession.user_id == User.id)
        .where(UserSession.token_hash == hash_token(token), UserSession.expires_at > utcnow(), User.is_active.is_(True))
    ).first()
    return (row[0], row[1]) if row else None


def delete_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(token)))


def revoke_user_sessions(db: Session, user_id: uuid.UUID, keep_session_id: uuid.UUID | None = None) -> None:
    """Delete all sessions of a user (optionally keeping the current one). Caller commits."""
    stmt = delete(UserSession).where(UserSession.user_id == user_id)
    if keep_session_id is not None:
        stmt = stmt.where(UserSession.id != keep_session_id)
    db.execute(stmt)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_days * 24 * 3600,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=settings.cookie_secure)
