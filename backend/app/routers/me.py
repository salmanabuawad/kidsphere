"""GET/PUT /api/me, POST /api/me/password."""
from fastapi import APIRouter, Request, Response

from app.audit import audit
from app.deps import DB, CurrentUser
from app.errors import AppError
from app.schemas.auth import MeUpdateIn, PasswordChangeIn, user_out
from app.security import hash_password, verify_password
from app.sessions import revoke_user_sessions

router = APIRouter(tags=["me"])


@router.get("/me")
def get_me(user: CurrentUser) -> dict:
    return {"user": user_out(user)}


@router.put("/me")
def update_me(body: MeUpdateIn, user: CurrentUser, db: DB) -> dict:
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    for field, value in changes.items():
        setattr(user, field, value)
    if changes:
        audit(db, user, "user.update", "user", user.id, fields=sorted(changes))
        db.commit()
    return {"user": user_out(user)}


@router.post("/me/password", status_code=204)
def change_password(body: PasswordChangeIn, request: Request, user: CurrentUser, db: DB) -> Response:
    if not verify_password(body.current_password, user.password_hash):
        raise AppError("VALIDATION", "The current password is incorrect.",
                       details=[{"path": "current_password", "message": "incorrect"}])
    user.password_hash = hash_password(body.new_password)
    revoke_user_sessions(db, user.id, keep_session_id=request.state.session_id)
    audit(db, user, "user.password_change", "user", user.id)
    db.commit()
    return Response(status_code=204)
