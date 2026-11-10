"""Pilot support for family journeys (migration 0014): the parent questionnaires and an overview.

Questionnaires
- ``GET /family-questionnaire?language`` returns the questions (app/data/pilot_questionnaire.json).
- ``POST /family-enrolments/{id}/questionnaire {kind: baseline|end, answers}``: a parent of the child
  (staff may enter it on the family's behalf). Every question must be answered with one of its
  options. Answers are descriptive and are never added up into a score.
- The enrolment JSON (services/family_programs.py) says which kinds were answered.

Overview (``GET /family-overview?program_id``), for staff: admins see every child, teachers the
children of their classes. Only plain counts, never per child, never percentages or rankings:
- journeys by status, and by kindergarten;
- for each week: how many families sent a reflection;
- families with a reflection in the last 14 days;
- home reflections, shared activities and drafts awaiting approval for the enrolled children;
- questionnaires: how many baseline and end answer sets, and for each question how many answers
  chose each option, at the start and at the end (the newest answer set per journey).
Pilot results are for usability and participation. They are not evidence of effectiveness.
"""
import json
from collections import Counter
from datetime import timedelta
from functools import lru_cache
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import access
from app.audit import audit
from app.errors import AppError
from app.models import (
    Child,
    Class,
    FamilyEnrolment,
    FamilyProgram,
    FamilyQuestionnaire,
    FamilyWeekReflection,
    GeneratedContent,
    HomeReflection,
    User,
)
from app.sessions import utcnow

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "pilot_questionnaire.json"
RECENT_DAYS = 14


@lru_cache(maxsize=1)
def data() -> dict:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def questionnaire(user: User, language: str | None) -> dict:
    lang = language if language in ("en", "ar", "he") else (user.language or "en")
    d = data()

    def t(entry):
        return entry.get(lang) or entry["en"]

    return {"questions": [{"key": q["key"], "text": t(q["text"]),
                           "options": [{"key": o, "label": t(d["options"][o])} for o in q["options"]]}
                          for q in d["questions"]]}


def answered_kinds(db: Session, enrolment_id) -> list[str]:
    return sorted(set(db.scalars(select(FamilyQuestionnaire.kind).where(FamilyQuestionnaire.enrolment_id == enrolment_id)).all()))


def submit(db: Session, user: User, enrolment_id, body) -> dict:
    row = access.get_child_row_or_404(db, user, FamilyEnrolment, enrolment_id)
    questions = {q["key"]: q["options"] for q in data()["questions"]}
    if set(body.answers) != set(questions):
        raise AppError("VALIDATION", details=[{"path": "answers", "message": "Answer every question."}])
    bad = [k for k, v in body.answers.items() if v not in questions[k]]
    if bad:
        raise AppError("VALIDATION", details=[{"path": f"answers.{k}", "message": "Choose one of the options."} for k in bad])
    q = FamilyQuestionnaire(enrolment_id=row.id, child_id=row.child_id, kind=body.kind, answers=dict(body.answers),
                            created_by=user.id)
    db.add(q)
    db.flush()
    audit(db, user, "family.questionnaire", "family_questionnaire", q.id, child_id=row.child_id, enrolment_id=row.id,
          kind=body.kind, role=user.role)
    db.commit()
    return {"kind": body.kind, "answered": answered_kinds(db, row.id)}


def overview(db: Session, user: User, program_id=None) -> dict:
    if not access.is_staff(user):
        raise AppError("NOT_FOUND")
    scope = access.scoped_child_ids(user)
    stmt = (select(FamilyEnrolment, Class.kindergarten)
            .join(Child, Child.id == FamilyEnrolment.child_id)
            .outerjoin(Class, Class.id == Child.class_id)
            .where(FamilyEnrolment.child_id.in_(scope)))
    if program_id:
        stmt = stmt.where(FamilyEnrolment.program_id == program_id)
    rows = db.execute(stmt).all()
    enrolments = [e for e, _ in rows]
    ids = [e.id for e in enrolments]
    child_ids = list({e.child_id for e in enrolments})
    since = utcnow() - timedelta(days=RECENT_DAYS)

    by_status = Counter(e.status for e in enrolments)
    by_kindergarten = Counter(k or "-" for _, k in rows)
    weekly = Counter()
    recent = set()
    if ids:
        for week, enrolment_id, created_at in db.execute(
            select(FamilyWeekReflection.week, FamilyWeekReflection.enrolment_id, FamilyWeekReflection.created_at)
            .where(FamilyWeekReflection.enrolment_id.in_(ids), FamilyWeekReflection.author_role == "parent")
        ).all():
            weekly[(week, enrolment_id)] = 1
            if created_at >= since:
                recent.add(enrolment_id)
    per_week = Counter(week for week, _ in weekly)

    def count(stmt):
        return db.scalar(stmt) or 0

    content = {
        "home_reflections": count(select(func.count()).select_from(HomeReflection).where(HomeReflection.child_id.in_(child_ids))) if child_ids else 0,
        "shared": count(select(func.count()).select_from(GeneratedContent).where(
            GeneratedContent.child_id.in_(child_ids), GeneratedContent.shared_with_parent.is_(True),
            GeneratedContent.deleted_at.is_(None))) if child_ids else 0,
        "awaiting_approval": count(select(func.count()).select_from(GeneratedContent).where(
            GeneratedContent.child_id.in_(child_ids), GeneratedContent.status == "draft",
            GeneratedContent.deleted_at.is_(None))) if child_ids else 0,
    }

    newest: dict[tuple, dict] = {}
    if ids:
        for q in db.scalars(select(FamilyQuestionnaire).where(FamilyQuestionnaire.enrolment_id.in_(ids))
                            .order_by(FamilyQuestionnaire.created_at)).all():
            newest[(q.enrolment_id, q.kind)] = q.answers
    answers = {kind: {q["key"]: {o: 0 for o in q["options"]} for q in data()["questions"]} for kind in ("baseline", "end")}
    sets = Counter()
    for (_, kind), ans in newest.items():
        sets[kind] += 1
        for key, opt in ans.items():
            if key in answers[kind] and opt in answers[kind][key]:
                answers[kind][key][opt] += 1

    programs = {str(p.id): p.title for p in db.scalars(select(FamilyProgram)).all()}
    return {
        "program_id": str(program_id) if program_id else None,
        "programs": [{"id": k, "title": v} for k, v in programs.items()],
        "journeys": {"total": len(enrolments), "by_status": dict(by_status),
                     "by_kindergarten": [{"kindergarten": k, "count": n} for k, n in sorted(by_kindergarten.items())]},
        "weekly_reflections": [{"week": w, "families": per_week[w]} for w in sorted(per_week)],
        "families_active_recently": len(recent),
        "recent_days": RECENT_DAYS,
        "content": content,
        "questionnaires": {"baseline": sets["baseline"], "end": sets["end"], "answers": answers},
    }
