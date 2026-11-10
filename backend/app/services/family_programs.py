"""Family programs (migration 0012): a weekly journey for families, such as the eight weeks of
"Roots of Resilience" (docs/family-resilience/PLAN.md).

Who does what
- **Admins** create and edit programs (title, description and 1-12 weeks, each text in en/ar/he)
  and publish, unpublish or archive them. Nothing is deleted. Every text gets the parent-facing
  wording check (no clinical words, no scores): a problem is 422 UNSAFE_CONTENT {issues}.
- **Teachers** (and admins) enrol a child of their classes in a published program from a start
  date, and complete or stop an enrolment. One active enrolment per child and program (409).
  They may add a short note of guidance for the family on any week.
- **Parents** of the child see the journey (the program texts, the current week, the content the
  teacher shared since the start) and answer each week's reflection (result + optional note).
- The current week is derived: week n starts on ``started_on + 7*(n-1)`` days; before the start
  it is 0, after the last week it stays on the last week.
- Week reflections are parent-reported (teacher notes are the teacher's); none of it ever reaches
  the AI, and nothing here changes the child profile.

Enrolment JSON::

    {id, child_id, status, started_on, current_week, weeks_count,
     program: {id, title, description, weeks[], status},
     reflections: [{id, week, author_role, result, note, created_at, by_name}],
     shared_content: [{id, title, content_type, approved_at}]}   (approved + shared since the start)
"""
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access
from app.ai import find_unsafe_text
from app.audit import audit
from app.errors import AppError
from app.models import FamilyEnrolment, FamilyProgram, FamilyWeekReflection, GeneratedContent, User
from app.schemas.family import EnrolIn, EnrolmentUpdate, ProgramCreate, ProgramUpdate, WeekReflectionIn
from app.sessions import utcnow
from app.services import family_pilot

LANGS = ("en", "ar", "he")


def _iso(v):
    return v.isoformat() if v is not None else None


def _clean(text_obj) -> dict:
    """A {en, ar, he} text with the empty languages left out."""
    if text_obj is None:
        return {}
    data = text_obj.model_dump() if hasattr(text_obj, "model_dump") else dict(text_obj)
    return {k: v.strip() for k, v in data.items() if k in LANGS and isinstance(v, str) and v.strip()}


def _week(w) -> dict:
    return {"content_type": w.content_type, "topic": _clean(w.topic), "lesson": _clean(w.lesson),
            "try_at_home": _clean(w.try_at_home), "reflection": _clean(w.reflection)}


def _check_wording(title: dict, description: dict, weeks: list[dict]) -> None:
    texts = list(title.values()) + list(description.values())
    for w in weeks:
        for key in ("topic", "lesson", "try_at_home", "reflection"):
            texts += list(w[key].values())
    issues = find_unsafe_text(texts, child_facing=True)
    if issues:
        raise AppError("UNSAFE_CONTENT", details={"issues": issues[:20]})


def program_out(p: FamilyProgram) -> dict:
    return {"id": str(p.id), "title": p.title, "description": p.description or {}, "weeks": p.weeks or [],
            "status": p.status, "updated_at": _iso(p.updated_at)}


def list_programs(db: Session, user: User) -> dict:
    if not access.is_staff(user):
        raise AppError("FORBIDDEN")
    stmt = select(FamilyProgram).order_by(FamilyProgram.created_at)
    if user.role != "admin":
        stmt = stmt.where(FamilyProgram.status == "published")
    return {"programs": [program_out(p) for p in db.scalars(stmt).all()]}


def _program_row(db: Session, program_id) -> FamilyProgram:
    row = db.get(FamilyProgram, access._as_uuid(program_id)) if access._as_uuid(program_id) else None
    if row is None:
        raise AppError("NOT_FOUND")
    return row


def get_program(db: Session, user: User, program_id) -> dict:
    if not access.is_staff(user):
        raise AppError("FORBIDDEN")
    row = _program_row(db, program_id)
    if user.role != "admin" and row.status != "published":
        raise AppError("NOT_FOUND")
    return {"program": program_out(row)}


def create_program(db: Session, user: User, body: ProgramCreate) -> dict:
    title, description = _clean(body.title), _clean(body.description)
    weeks = [_week(w) for w in body.weeks]
    _check_wording(title, description, weeks)
    row = FamilyProgram(title=title, description=description or None, weeks=weeks, status=body.status,
                        created_by=user.id, updated_by=user.id)
    db.add(row)
    db.flush()
    audit(db, user, "family_program.create", "family_program", row.id, weeks=len(weeks), status=body.status)
    db.commit()
    return {"program": program_out(row)}


def update_program(db: Session, user: User, program_id, body: ProgramUpdate) -> dict:
    row = _program_row(db, program_id)
    changes = body.model_dump(exclude_unset=True)
    title = _clean(body.title) if "title" in changes and body.title is not None else row.title
    description = _clean(body.description) if "description" in changes else (row.description or {})
    weeks = [_week(w) for w in body.weeks] if body.weeks is not None else (row.weeks or [])
    _check_wording(title, description, weeks)
    row.title, row.description, row.weeks = title, description or None, weeks
    if body.status is not None:
        row.status = body.status
    row.updated_by = user.id
    audit(db, user, "family_program.update", "family_program", row.id, fields=sorted(changes))
    db.commit()
    return {"program": program_out(row)}


# --------------------------------------------------------------------------- enrolments


def current_week(started_on: date, weeks_count: int, today: date | None = None) -> int:
    today = today or utcnow().date()
    if today < started_on or weeks_count <= 0:
        return 0
    return min(weeks_count, (today - started_on).days // 7 + 1)


def _names(db: Session, ids) -> dict:
    ids = {i for i in ids if i is not None}
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all()) if ids else {}


def enrolment_out(db: Session, e: FamilyEnrolment, program: FamilyProgram, staff: bool) -> dict:
    reflections = db.scalars(select(FamilyWeekReflection).where(FamilyWeekReflection.enrolment_id == e.id)
                             .order_by(FamilyWeekReflection.week, FamilyWeekReflection.created_at)).all()
    names = _names(db, [r.created_by for r in reflections])
    start = datetime.combine(e.started_on, time.min, timezone.utc)
    shared = db.scalars(
        select(GeneratedContent).where(GeneratedContent.child_id == e.child_id, GeneratedContent.deleted_at.is_(None),
                                       GeneratedContent.shared_with_parent.is_(True),
                                       GeneratedContent.status.in_(("approved", "completed")),
                                       GeneratedContent.approved_at >= start - timedelta(days=7))
        .order_by(GeneratedContent.approved_at.desc()).limit(30)
    ).all()
    weeks = program.weeks or []
    return {
        "id": str(e.id),
        "child_id": str(e.child_id),
        "status": e.status,
        "started_on": e.started_on.isoformat(),
        "current_week": current_week(e.started_on, len(weeks)),
        "weeks_count": len(weeks),
        "program": program_out(program),
        "reflections": [{"id": str(r.id), "week": r.week, "author_role": r.author_role, "result": r.result,
                         "note": r.note, "created_at": _iso(r.created_at), "by_name": names.get(r.created_by)}
                        for r in reflections],
        "shared_content": [{"id": str(c.id), "title": c.title, "content_type": c.content_type,
                            "approved_at": _iso(c.approved_at)} for c in shared],
        "can_edit": staff,
        "questionnaires": family_pilot.answered_kinds(db, e.id),
    }


def list_enrolments(db: Session, user: User, child_id) -> dict:
    child = access.get_child_or_404(db, user, child_id)
    rows = db.execute(
        select(FamilyEnrolment, FamilyProgram).join(FamilyProgram, FamilyProgram.id == FamilyEnrolment.program_id)
        .where(FamilyEnrolment.child_id == child.id).order_by(FamilyEnrolment.created_at.desc())
    ).all()
    staff = access.is_staff(user)
    return {"enrolments": [enrolment_out(db, e, p, staff) for e, p in rows]}


def enrol(db: Session, user: User, child_id, body: EnrolIn) -> dict:
    child = access.get_child_or_404(db, user, child_id, write=True)
    program = db.get(FamilyProgram, body.program_id)
    if program is None or program.status != "published":
        raise AppError("VALIDATION", details=[{"path": "program_id", "message": "Choose a published program."}])
    started = body.started_on or utcnow().date()
    existing = db.scalars(select(FamilyEnrolment).where(FamilyEnrolment.child_id == child.id,
                                                        FamilyEnrolment.program_id == program.id,
                                                        FamilyEnrolment.status == "active")).first()
    if existing is not None:
        raise AppError("DUPLICATE", "This child is already in this program.")
    row = FamilyEnrolment(child_id=child.id, program_id=program.id, started_on=started, created_by=user.id)
    db.add(row)
    db.flush()
    audit(db, user, "family.enrol", "family_enrolment", row.id, child_id=child.id, program_id=program.id,
          started_on=started.isoformat())
    db.commit()
    return {"enrolment": enrolment_out(db, row, program, staff=True)}


def _enrolment(db: Session, user: User, enrolment_id, write: bool = False) -> FamilyEnrolment:
    return access.get_child_row_or_404(db, user, FamilyEnrolment, enrolment_id, write=write)


def update_enrolment(db: Session, user: User, enrolment_id, body: EnrolmentUpdate) -> dict:
    row = _enrolment(db, user, enrolment_id, write=True)
    if row.status != body.status:
        if body.status == "active":
            clash = db.scalars(select(FamilyEnrolment).where(
                FamilyEnrolment.child_id == row.child_id, FamilyEnrolment.program_id == row.program_id,
                FamilyEnrolment.status == "active", FamilyEnrolment.id != row.id)).first()
            if clash is not None:
                raise AppError("DUPLICATE", "This child is already in this program.")
        audit(db, user, "family.enrolment_status", "family_enrolment", row.id, child_id=row.child_id,
              from_status=row.status, to_status=body.status)
        row.status = body.status
        db.commit()
    return {"enrolment": enrolment_out(db, row, db.get(FamilyProgram, row.program_id), staff=True)}


def add_reflection(db: Session, user: User, enrolment_id, body: WeekReflectionIn) -> dict:
    """A parent's weekly reflection (result required) or a teacher's note of guidance (note required)."""
    row = _enrolment(db, user, enrolment_id)
    program = db.get(FamilyProgram, row.program_id)
    staff = access.is_staff(user)
    if row.status != "active":
        raise AppError("INVALID_TRANSITION", "This journey is not active.")
    if body.week > len(program.weeks or []):
        raise AppError("VALIDATION", details=[{"path": "week", "message": "This program has no such week."}])
    if not staff and body.week > max(current_week(row.started_on, len(program.weeks or [])), 1):
        raise AppError("VALIDATION", details=[{"path": "week", "message": "This week has not started yet."}])
    if staff and not body.note:
        raise AppError("VALIDATION", details=[{"path": "note", "message": "Write a short note for the family."}])
    if not staff and not body.result:
        raise AppError("VALIDATION", details=[{"path": "result", "message": "Choose how it went."}])
    if staff and body.note:
        issues = find_unsafe_text([body.note], child_facing=True)
        if issues:
            raise AppError("UNSAFE_CONTENT", details={"issues": issues[:20]})
    r = FamilyWeekReflection(enrolment_id=row.id, child_id=row.child_id, week=body.week,
                             author_role="teacher" if staff else "parent", result=body.result, note=body.note,
                             created_by=user.id)
    db.add(r)
    db.flush()
    audit(db, user, "family.week_reflection", "family_week_reflection", r.id, child_id=row.child_id,
          enrolment_id=row.id, week=body.week, author_role=r.author_role, result=body.result,
          has_note=body.note is not None)
    db.commit()
    return {"enrolment": enrolment_out(db, row, program, staff=staff)}
