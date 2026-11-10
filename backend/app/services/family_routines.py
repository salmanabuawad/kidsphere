"""Family routines (migration 0013): picture schedules for a part of the day.

- The child's parents and staff in scope read, create, edit and delete a child's routines. Steps are
  shown to the child, so every label gets the child-facing wording check (422 UNSAFE_CONTENT).
- Presets (morning, bedtime, arriving at kindergarten) come from ``app/data/routines.json`` in the
  user's language, plus a small set of emojis to choose from.
- Never sent to the AI. Audit ``routine.create|update|delete`` with ids and the number of steps.

Routine JSON: {id, child_id, title, steps: [{emoji, label}], created_by_role, updated_at}
"""
import json
from functools import lru_cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access
from app.ai import find_unsafe_text
from app.audit import audit
from app.errors import AppError
from app.models import FamilyRoutine, User

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "routines.json"
MAX_ROUTINES = 10


@lru_cache(maxsize=1)
def data() -> dict:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def presets(user: User, language: str | None) -> dict:
    lang = language if language in ("en", "ar", "he") else (user.language or "en")
    out = [{"key": p["key"], "title": p["title"].get(lang) or p["title"]["en"],
            "steps": [{"emoji": s["emoji"], "label": s["label"].get(lang) or s["label"]["en"]} for s in p["steps"]]}
           for p in data()["presets"]]
    return {"presets": out, "emojis": data()["emojis"]}


def routine_out(r: FamilyRoutine) -> dict:
    return {"id": str(r.id), "child_id": str(r.child_id), "title": r.title, "steps": r.steps,
            "created_by_role": r.created_by_role, "updated_at": r.updated_at.isoformat() if r.updated_at else None}


def _check(title: str, steps: list[dict]) -> None:
    issues = find_unsafe_text([title, *[s["label"] for s in steps]], child_facing=True)
    if issues:
        raise AppError("UNSAFE_CONTENT", details={"issues": issues[:20]})


def list_routines(db: Session, user: User, child_id) -> dict:
    child = access.get_child_or_404(db, user, child_id)
    rows = db.scalars(select(FamilyRoutine).where(FamilyRoutine.child_id == child.id)
                      .order_by(FamilyRoutine.created_at, FamilyRoutine.id)).all()
    return {"routines": [routine_out(r) for r in rows]}


def create_routine(db: Session, user: User, child_id, body) -> dict:
    child = access.get_child_or_404(db, user, child_id)  # parents may write routines
    steps = [s.model_dump() for s in body.steps]
    _check(body.title, steps)
    count = len(db.scalars(select(FamilyRoutine.id).where(FamilyRoutine.child_id == child.id)).all())
    if count >= MAX_ROUTINES:
        raise AppError("CONFLICT", f"At most {MAX_ROUTINES} routines per child.")
    row = FamilyRoutine(child_id=child.id, title=body.title, steps=steps, created_by=user.id, created_by_role=user.role)
    db.add(row)
    db.flush()
    audit(db, user, "routine.create", "family_routine", row.id, child_id=child.id, steps=len(steps))
    db.commit()
    return {"routine": routine_out(row)}


def update_routine(db: Session, user: User, routine_id, body) -> dict:
    row = access.get_child_row_or_404(db, user, FamilyRoutine, routine_id)
    steps = [s.model_dump() for s in body.steps]
    _check(body.title, steps)
    row.title, row.steps = body.title, steps
    audit(db, user, "routine.update", "family_routine", row.id, child_id=row.child_id, steps=len(steps))
    db.commit()
    return {"routine": routine_out(row)}


def delete_routine(db: Session, user: User, routine_id) -> None:
    row = access.get_child_row_or_404(db, user, FamilyRoutine, routine_id)
    audit(db, user, "routine.delete", "family_routine", row.id, child_id=row.child_id)
    db.delete(row)
    db.commit()
