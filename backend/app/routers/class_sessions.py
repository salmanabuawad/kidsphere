"""Class sessions (/class-sessions...): a group activity run with children of a class, and how each
child did. Paths are relative to /api (no router prefix); main.py includes this module.
See app/services/class_sessions.py. Staff only (parents 403); other classes are 404.

- GET  /class-sessions?class_id&library_item_id     → {"sessions": [summary]}  newest first, at most 50
- POST /class-sessions  SessionCreate                → 201 {"session": detail}
- GET  /class-sessions/{id}                          → {"session": detail}
- PUT  /class-sessions/{id}/children  ParticipantsIn → {"session"}
- PUT  /class-sessions/{id}/observations  SessionNotesIn → {"session"}  one observation per child (created or updated)
"""
import uuid

from fastapi import APIRouter

from app.deps import DB, StaffUser
from app.schemas.class_sessions import ParticipantsIn, SessionCreate, SessionNotesIn
from app.services import class_sessions as svc

router = APIRouter(tags=["class-sessions"])


@router.get("/class-sessions")
def list_sessions(db: DB, user: StaffUser, class_id: uuid.UUID | None = None, library_item_id: uuid.UUID | None = None) -> dict:
    return svc.list_sessions(db, user, class_id=class_id, library_item_id=library_item_id)


@router.post("/class-sessions", status_code=201)
def create_session(body: SessionCreate, db: DB, user: StaffUser) -> dict:
    return svc.create_session(db, user, body)


@router.get("/class-sessions/{session_id}")
def get_session(session_id: str, db: DB, user: StaffUser) -> dict:
    return svc.get_session(db, user, session_id)


@router.put("/class-sessions/{session_id}/children")
def set_participants(session_id: str, body: ParticipantsIn, db: DB, user: StaffUser) -> dict:
    return svc.set_participants(db, user, session_id, body)


@router.put("/class-sessions/{session_id}/observations")
def save_notes(session_id: str, body: SessionNotesIn, db: DB, user: StaffUser) -> dict:
    return svc.save_notes(db, user, session_id, body)
