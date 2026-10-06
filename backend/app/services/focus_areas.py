"""Current Focus areas = the goals of the short plan (Domain 15; COVERAGE-MATRIX §3.2.7, §4.3).

At most ``MAX_ACTIVE`` (3) active focus areas per child. Every write that can add
an active area (create, or PUT status back to active) first locks the child row
(``get_child_or_404(..., lock=True)`` → SELECT ... FOR UPDATE), then counts, so
two concurrent requests cannot both pass the check; the service returns 409
FOCUS_LIMIT. The deferred DB constraint trigger ``focus_areas_max_active`` is
only a backstop at COMMIT (app.errors maps it to FOCUS_LIMIT too).

Never overwrite (X-14, X-21): every create, edit and status change, including
the decisions of a development review, appends the full new state of the row to
``record_versions`` (``record_version``; via ``manual`` or ``review`` with the
review id). Reopening a goal clears ``closed_at``/``close_reason`` on the row, but
the earlier closure stays in the version history (``focus_versions``).

Focus area JSON::

    {id, child_id, category, suggestion_key, title, description,
     plan: {strength_used, need, adaptation, what_we_will_do, frequency, who,
            review_on (legacy text), success_looks_like} | null,
     follow_up_on: "YYYY-MM-DD" | null, assessment_id | null, source_need | null,
     status: active|paused|completed, close_reason, created_by, created_at,
     updated_at, closed_at}

GET /children/{id}/focus-areas also returns the Plan tab context::

    {focus_areas, max_active, active_count, open_assessment_id,
     periods: [{id, kind, filled_on, period_from, period_to, status, closed_at}],
     family_hopes: {develop: [{area, label?, text}], categories: [priority_categories],
                    hope_child_feels: [keys], hope_other, note, provenance: [badge]} | null,
     need_candidates: [{assessment_id, index, area, seeing, how_often, focus_area_id,
                        provenance}]}

Family hopes SUGGEST, never decide, the goals (X-35); the need candidates are the
Domain 13 priority needs of the latest observation cycle (X-36).
"""
import re
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import access, provenance, vocab
from app.access import get_child_or_404, get_child_row_or_404
from app.audit import audit
from app.errors import AppError
from app.models import ChildProfile, FocusArea, TeacherAssessment, User
from app.schemas.focus import FocusClose, FocusCreate, FocusUpdate
from app.services import history
from app.sessions import utcnow

MAX_ACTIVE = 3
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DEVELOP_AREAS = ("emotional", "social", "language", "motor", "independence")
STATUS_ORDER = {"active": 0, "paused": 1, "completed": 2}


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def focus_out(row: FocusArea) -> dict:
    return {
        "id": str(row.id),
        "child_id": str(row.child_id),
        "category": row.category,
        "suggestion_key": row.suggestion_key,
        "title": row.title,
        "description": row.description,
        "plan": row.plan,
        "follow_up_on": _iso(row.follow_up_on),
        "assessment_id": str(row.assessment_id) if row.assessment_id else None,
        "source_need": row.source_need,
        "status": row.status,
        "close_reason": row.close_reason,
        "created_by": str(row.created_by) if row.created_by else None,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
        "closed_at": _iso(row.closed_at),
    }


def active_count(db: Session, child_id, exclude_id=None) -> int:
    stmt = select(func.count()).select_from(FocusArea).where(FocusArea.child_id == child_id, FocusArea.status == "active")
    if exclude_id is not None:
        stmt = stmt.where(FocusArea.id != exclude_id)
    return db.scalar(stmt) or 0


def assert_can_add_active(db: Session, child_id, exclude_id=None) -> None:
    """Raise 409 FOCUS_LIMIT when one more active focus area would exceed the limit.
    Call only after the child row is locked."""
    if active_count(db, child_id, exclude_id) >= MAX_ACTIVE:
        raise AppError("FOCUS_LIMIT", details={"max_active": MAX_ACTIVE})


def _suggestion_category(key: str) -> str | None:
    item = vocab.item("focus_suggestions", key)
    return item.get("category") if item else None


def record_version(db: Session, row: FocusArea, user: User | None, *, via: str = "manual", review_id=None):
    """Append the row's full current state to record_versions (call after every change)."""
    db.flush()
    return history.record(db, child_id=row.child_id, entity_type="focus_area", entity_id=row.id,
                          data=history.snapshot(row), user=user, via=via, review_id=review_id)


def _invalid(path: str, message: str) -> AppError:
    return AppError("VALIDATION", details=[{"path": path, "message": message}])


def check_review_on(plan: dict | None, stored: dict | None = None, path: str = "plan.review_on") -> date | None:
    """``plan.review_on`` is legacy free text: an unchanged old value is kept as it is,
    a new or changed one must be an ISO date (returned, to fill ``follow_up_on``)."""
    value = (plan or {}).get("review_on")
    if value is None or value == (stored or {}).get("review_on"):
        return None
    try:
        if not ISO_DATE_RE.match(value):
            raise ValueError
        return date.fromisoformat(value)
    except ValueError:
        raise _invalid(path, "Use a date (YYYY-MM-DD). The follow-up date is follow_up_on.") from None


def open_assessment_id(db: Session, child_id):
    return db.scalar(select(TeacherAssessment.id).where(
        TeacherAssessment.child_id == child_id, TeacherAssessment.status == "open").limit(1))


def check_assessment(db: Session, child_id, assessment_id, path: str = "assessment_id"):
    """The id of one of this child's observation cycles, or 400."""
    if assessment_id is None:
        return None
    found = db.scalar(select(TeacherAssessment.id).where(
        TeacherAssessment.id == assessment_id, TeacherAssessment.child_id == child_id))
    if found is None:
        raise _invalid(path, "unknown observation cycle")
    return found


# --------------------------------------------------------------------------- plan context


def _text(value) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _last_stamp(perspective: dict, *sections: str) -> dict | None:
    entered = perspective.get("entered") if isinstance(perspective.get("entered"), dict) else {}
    for section in sections:
        stamps = entered.get(section)
        if isinstance(stamps, list) and stamps and isinstance(stamps[-1], dict):
            return stamps[-1]
    return None


def family_hopes(profile: ChildProfile | None) -> dict | None:
    """What the family hopes for (questionnaire יא, Q37–Q38; legacy ``priorities``). Suggestions only."""
    pp = profile.parent_perspective if profile is not None and isinstance(profile.parent_perspective, dict) else {}
    sections = pp.get("sections") if isinstance(pp.get("sections"), dict) else {}
    exp = sections.get("expectations") if isinstance(sections.get("expectations"), dict) else {}
    pri = sections.get("priorities") if isinstance(sections.get("priorities"), dict) else {}

    develop = exp.get("develop") if isinstance(exp.get("develop"), dict) else {}
    areas = []
    for area in DEVELOP_AREAS:
        raw = develop.get(area)
        text = _text(raw.get("text")) if isinstance(raw, dict) else _text(raw)
        if text:
            areas.append({"area": area, "label": None, "text": text})
    other = develop.get("other") if isinstance(develop.get("other"), dict) else {}
    if _text(other.get("text")) or _text(other.get("area")):
        areas.append({"area": "other", "label": _text(other.get("area")), "text": _text(other.get("text"))})

    feels = exp.get("hope_child_feels")
    if isinstance(feels, dict):
        selected, feels_other = feels.get("selected"), _text(feels.get("other"))
    else:
        selected, feels_other = feels, None
    selected = [k for k in (selected or []) if isinstance(k, str)] or [
        k for k in (pri.get("hope_child_feels") or []) if isinstance(k, str)]
    categories = [k for k in (pri.get("parent_priorities") or []) if isinstance(k, str)]
    note = None if areas else _text(pri.get("priorities_note"))
    if not (areas or selected or feels_other or categories or note):
        return None
    stamp = _last_stamp(pp, "expectations", "priorities")
    return {
        "develop": areas,
        "categories": categories,
        "hope_child_feels": selected,
        "hope_other": feels_other,
        "note": note,
        "provenance": provenance.badges(stamp=stamp, reported_by="parent"),
    }


def periods(db: Session, child_id) -> list[dict]:
    rows = db.scalars(select(TeacherAssessment).where(TeacherAssessment.child_id == child_id)
                      .order_by(TeacherAssessment.filled_on, TeacherAssessment.created_at)).all()
    return [{
        "id": str(r.id),
        "kind": r.kind,
        "filled_on": _iso(r.filled_on),
        "period_from": _iso(r.period_from),
        "period_to": _iso(r.period_to),
        "status": r.status,
        "closed_at": _iso(r.closed_at),
    } for r in rows]


def need_candidates(db: Session, child_id) -> list[dict]:
    """Domain 13 priority needs of the open (else the latest) observation cycle: Current Focus candidates."""
    cycle = db.scalars(select(TeacherAssessment).where(TeacherAssessment.child_id == child_id)
                       .order_by((TeacherAssessment.status == "open").desc(), TeacherAssessment.created_at.desc())
                       .limit(1)).first()
    if cycle is None:
        return []
    cached = (cycle.domains or {}).get("priority_needs") if isinstance(cycle.domains, dict) else None
    data = cached.get("data") if isinstance(cached, dict) else None
    needs = data.get("needs") if isinstance(data, dict) else None
    out = []
    for i, need in enumerate(needs if isinstance(needs, list) else []):
        if not isinstance(need, dict) or not need.get("area"):
            continue
        out.append({
            "assessment_id": str(cycle.id),
            "assessment_status": cycle.status,
            "index": i,
            "area": need.get("area"),
            "seeing": _text(need.get("seeing")),
            "how_often": _text(need.get("how_often")),
            "focus_area_id": str(need["focus_area_id"]) if need.get("focus_area_id") else None,
            "provenance": provenance.badges(("observation",)),
        })
    return out


# --------------------------------------------------------------------------- endpoints


def list_focus(db: Session, user: User, child_id, status: str | None = None, assessment_id=None) -> dict:
    child = get_child_or_404(db, user, child_id, write=True)
    stmt = select(FocusArea).where(FocusArea.child_id == child.id)
    if status:
        stmt = stmt.where(FocusArea.status == status)
    if assessment_id is not None:
        stmt = stmt.where(FocusArea.assessment_id == assessment_id)
    rows = db.scalars(stmt.order_by(FocusArea.created_at, FocusArea.id)).all()
    rows = sorted(rows, key=lambda r: STATUS_ORDER.get(r.status, 3))
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).first()
    open_id = open_assessment_id(db, child.id)
    return {
        "focus_areas": [focus_out(r) for r in rows],
        "max_active": MAX_ACTIVE,
        "active_count": active_count(db, child.id),
        "open_assessment_id": str(open_id) if open_id else None,
        "periods": periods(db, child.id),
        "family_hopes": family_hopes(profile),
        "need_candidates": need_candidates(db, child.id),
    }


def create_focus(db: Session, user: User, child_id, body: FocusCreate) -> dict:
    child = get_child_or_404(db, user, child_id, write=True, lock=True)
    assert_can_add_active(db, child.id)
    category = body.category or _suggestion_category(body.suggestion_key) or "other"
    title = body.title or vocab.label("focus_suggestions", body.suggestion_key, user.language or "en")
    plan = body.plan.stored() if body.plan else None
    legacy_date = check_review_on(plan)
    if "assessment_id" in body.model_fields_set:
        assessment_id = check_assessment(db, child.id, body.assessment_id)
    else:
        assessment_id = open_assessment_id(db, child.id)
    row = FocusArea(
        child_id=child.id,
        category=category,
        suggestion_key=body.suggestion_key,
        title=title,
        description=body.description,
        plan=plan,
        follow_up_on=body.follow_up_on or legacy_date,
        assessment_id=assessment_id,
        status="active",
        created_by=user.id,
    )
    db.add(row)
    db.flush()
    record_version(db, row, user)
    audit(db, user, "focus.create", "focus_area", row.id, child_id=child.id,
          category=category, suggestion_key=body.suggestion_key)
    db.flush()
    db.refresh(row)
    out = focus_out(row)
    db.commit()
    return {"focus_area": out}


def update_focus(db: Session, user: User, focus_id, body: FocusUpdate) -> dict:
    row = get_child_row_or_404(db, user, FocusArea, focus_id, write=True)
    sent = body.model_fields_set
    changed: list[str] = []
    if "status" in sent and body.status is not None and body.status != row.status:
        if body.status == "active":
            get_child_or_404(db, user, row.child_id, write=True, lock=True)
            assert_can_add_active(db, row.child_id, exclude_id=row.id)
            row.closed_at = None
            row.close_reason = None
        elif row.status == "active":
            row.closed_at = utcnow()
        row.status = body.status
        changed.append("status")
    if "category" in sent and body.category is not None and body.category != row.category:
        row.category = body.category
        changed.append("category")
    if "suggestion_key" in sent and body.suggestion_key != row.suggestion_key:
        row.suggestion_key = body.suggestion_key
        if body.suggestion_key and "category" not in sent:
            row.category = _suggestion_category(body.suggestion_key) or row.category
        changed.append("suggestion_key")
    if "title" in sent and body.title is not None and body.title != row.title:
        row.title = body.title
        changed.append("title")
    if "description" in sent and body.description != row.description:
        row.description = body.description
        changed.append("description")
    legacy_date = None
    if "plan" in sent:
        plan = body.plan.stored() if body.plan else None
        legacy_date = check_review_on(plan, row.plan)
        if plan != row.plan:
            row.plan = plan
            changed.append("plan")
    follow_up_on = body.follow_up_on if "follow_up_on" in sent else legacy_date or row.follow_up_on
    if follow_up_on != row.follow_up_on:
        row.follow_up_on = follow_up_on
        changed.append("follow_up_on")
    if "assessment_id" in sent:
        assessment_id = check_assessment(db, row.child_id, body.assessment_id)
        if assessment_id != row.assessment_id:
            row.assessment_id = assessment_id
            changed.append("assessment_id")
    if changed:
        record_version(db, row, user)
        audit(db, user, "focus.update", "focus_area", row.id, child_id=row.child_id, fields=changed,
              status=row.status)
    db.flush()
    db.refresh(row)
    out = focus_out(row)
    db.commit()
    return {"focus_area": out}


def close_focus(db: Session, user: User, focus_id, body: FocusClose) -> dict:
    row = get_child_row_or_404(db, user, FocusArea, focus_id, write=True)
    if row.status == "completed" and body.status == "paused":
        raise AppError("INVALID_TRANSITION")
    row.status = body.status
    row.close_reason = body.close_reason
    row.closed_at = utcnow()
    record_version(db, row, user)
    audit(db, user, "focus.close", "focus_area", row.id, child_id=row.child_id, status=body.status)
    db.flush()
    db.refresh(row)
    out = focus_out(row)
    db.commit()
    return {"focus_area": out}


# --------------------------------------------------------------------------- history


def status_changes(rows) -> list[dict]:
    """Every status a goal went through, oldest first: the first known state and each change
    (each closure keeps its date and reason even after the goal was reopened)."""
    out: list[dict] = []
    last = None
    for v in rows:
        data = v.data if isinstance(v.data, dict) else {}
        status = data.get("status")
        if status is None or status == last:
            continue
        out.append({
            "seq": v.seq,
            "status": status,
            "previous": last,
            "at": data.get("closed_at") if status != "active" and data.get("closed_at") else _iso(v.created_at),
            "close_reason": data.get("close_reason") if status != "active" else None,
            "changed_by_name": v.changed_by_name,
            "via": v.via,
            "review_id": str(v.review_id) if v.review_id else None,
        })
        last = status
    return out


def focus_versions(db: Session, user: User, focus_id) -> dict:
    """GET /focus-areas/{id}/versions: staff only (parents and out-of-scope users get 404)."""
    if not access.is_staff(user):
        raise AppError("NOT_FOUND")
    row = get_child_row_or_404(db, user, FocusArea, focus_id)
    rows = history.versions(db, child_id=row.child_id, entity_type="focus_area", entity_id=row.id)
    return {
        "focus_area": focus_out(row),
        "versions": [history.version_out(v) for v in rows],
        "status_changes": status_changes(rows),
    }
