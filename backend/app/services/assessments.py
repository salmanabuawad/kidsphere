"""Teacher full observation (observation model א + D1–D13; COVERAGE-MATRIX §4.2, X-08, X-11, X-36, X-37).

Staff only: parents (and anyone out of scope) get 404 on every endpoint.

Storage
- ``teacher_assessments``: one row per observation cycle (kind initial | reassessment; at most
  one open and one initial cycle per child). The header holds section א and a
  ``child_snapshot`` {name, preferred_name, birth_date, age_at_fill{years, months}, class_id,
  class_name, kindergarten, teacher_name}, refreshed on every header change. A closed cycle
  is immutable (DB trigger); start a reassessment instead.
- ``teacher_assessment_entries``: every domain save appends the full domain document
  (append-only, DB trigger); ``teacher_assessments.domains`` caches the latest one per
  domain: ``{<domain>: {status, entry_id, data, updated_by, updated_by_name, updated_at}}``.

Locking: a domain save locks its cycle row FOR UPDATE before inserting the entry (the
entry trigger then takes FOR NO KEY UPDATE on the same row). Creating a cycle and turning a
need into a Current Focus lock the child row (FOR UPDATE) first.

Assessment JSON (``assessment_out``)::

    {id, child_id, kind, number (1 = first cycle), previous_id, status: open|closed,
     filled_on, period_from, period_to, period_note, teacher_id, teacher_name, filled_by_text,
     child_snapshot, created_by, created_by_name, created_at, updated_at, closed_by,
     closed_by_name, closed_at,
     domains: {<domain>: {status, data, entry_id, updated_at, updated_by, updated_by_name,
                          provenance: ["teacher_observed"]}},      # missing domain = not started
     need_focus_areas: [{index, area, focus_area_id, title, status}]}

Audit actions: assessment.create / update / domain_update / close / apply / need_focus
(ids, keys and field names only).
"""
import copy
import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access, provenance, vocab
from app.ai.safety import text_issues
from app.audit import audit
from app.errors import AppError
from app.models import (
    Child,
    ChildProfile,
    Class,
    FocusArea,
    Observation,
    TeacherAssessment,
    TeacherAssessmentEntry,
    User,
)
from app.schemas.assessments import (
    DOMAINS,
    HEADER_FIELDS,
    AssessmentApply,
    AssessmentCreate,
    AssessmentHeaderPatch,
    DomainPut,
    NeedFocus,
    validate_domain,
)
from app.services import history
from app.services.focus_areas import assert_can_add_active, focus_out
from app.sessions import utcnow

STRENGTHS_MIN = 3
FUTURE_SLACK = timedelta(days=1)


def _iso(value):
    return value.isoformat() if value is not None else None


def _str(value):
    return str(value) if value is not None else None


def _require_staff(user: User) -> None:
    if not access.is_staff(user):
        raise AppError("NOT_FOUND")


def _staff_child(db: Session, user: User, child_id, lock: bool = False) -> Child:
    _require_staff(user)
    return access.get_child_or_404(db, user, child_id, write=True, lock=lock)


def _cycle(db: Session, user: User, assessment_id, lock: bool = False) -> TeacherAssessment:
    _require_staff(user)
    return access.get_child_row_or_404(db, user, TeacherAssessment, assessment_id, write=True, lock=lock)


def _assert_open(cycle: TeacherAssessment) -> None:
    if cycle.status != "open":
        raise AppError("ASSESSMENT_CLOSED")


# --------------------------------------------------------------------------- header helpers


def age_on(birth: date, on: date) -> dict:
    months = (on.year - birth.year) * 12 + (on.month - birth.month) - (1 if on.day < birth.day else 0)
    months = max(months, 0)
    return {"years": months // 12, "months": months % 12}


def child_snapshot(db: Session, child: Child, filled_on: date, teacher_id) -> dict:
    """Section א as it was at the fill date (kept with the cycle; refreshed while it is open)."""
    cls = db.get(Class, child.class_id) if child.class_id else None
    teacher = db.get(User, teacher_id) if teacher_id else None
    return {
        "name": child.name,
        "preferred_name": child.preferred_name,
        "birth_date": _iso(child.birth_date),
        "age_at_fill": age_on(child.birth_date, filled_on),
        "class_id": _str(cls.id) if cls else None,
        "class_name": cls.name if cls else None,
        "kindergarten": cls.kindergarten if cls else None,
        "teacher_name": teacher.name if teacher else None,
    }


def _check_teacher(db: Session, teacher_id) -> None:
    if teacher_id is None:
        return
    found = db.get(User, teacher_id)
    if found is None or found.role not in access.STAFF_ROLES or not found.is_active:
        raise AppError("VALIDATION", details=[{"path": "teacher_id", "message": "Choose a teacher or an admin."}])


def _check_filled_on(value: date | None) -> None:
    if value is not None and value > utcnow().date() + FUTURE_SLACK:
        raise AppError("VALIDATION", details=[{"path": "filled_on", "message": "The date cannot be in the future."}])


def _check_period(period_from, period_to) -> None:
    if period_from is not None and period_to is not None and period_from > period_to:
        raise AppError("VALIDATION", details=[{"path": "period_to", "message": "The period ends before it starts."}])


# --------------------------------------------------------------------------- output


def _names(db: Session, ids) -> dict:
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all())


def _numbers(db: Session, child_id) -> dict:
    rows = db.scalars(select(TeacherAssessment.id).where(TeacherAssessment.child_id == child_id)
                      .order_by(TeacherAssessment.created_at, TeacherAssessment.id)).all()
    return {rid: n for n, rid in enumerate(rows, start=1)}


def _need_focus_areas(db: Session, cycle: TeacherAssessment) -> list[dict]:
    rows = db.scalars(select(FocusArea).where(FocusArea.child_id == cycle.child_id,
                                              FocusArea.assessment_id == cycle.id,
                                              FocusArea.source_need.is_not(None))
                      .order_by(FocusArea.created_at, FocusArea.id)).all()
    out = []
    for row in rows:
        need = row.source_need if isinstance(row.source_need, dict) else {}
        if need.get("assessment_id") != str(cycle.id):
            continue
        out.append({"index": need.get("index"), "area": need.get("area"), "focus_area_id": str(row.id),
                    "title": row.title, "status": row.status})
    return out


def _domains_out(cycle: TeacherAssessment) -> dict:
    out = {}
    for domain, cached in (cycle.domains or {}).items():
        if domain not in DOMAINS or not isinstance(cached, dict):
            continue
        out[domain] = {
            "status": cached.get("status") or "in_progress",
            "data": cached.get("data") or {},
            "entry_id": cached.get("entry_id"),
            "updated_at": cached.get("updated_at"),
            "updated_by": cached.get("updated_by"),
            "updated_by_name": cached.get("updated_by_name"),
            "provenance": provenance.derive(["observation"]),
        }
    return out


def assessment_out(db: Session, cycle: TeacherAssessment, number: int | None = None) -> dict:
    names = _names(db, (cycle.teacher_id, cycle.created_by, cycle.closed_by))
    if number is None:
        number = _numbers(db, cycle.child_id).get(cycle.id)
    return {
        "id": str(cycle.id),
        "child_id": str(cycle.child_id),
        "kind": cycle.kind,
        "number": number,
        "previous_id": _str(cycle.previous_id),
        "status": cycle.status,
        "filled_on": _iso(cycle.filled_on),
        "period_from": _iso(cycle.period_from),
        "period_to": _iso(cycle.period_to),
        "period_note": cycle.period_note,
        "teacher_id": _str(cycle.teacher_id),
        "teacher_name": names.get(cycle.teacher_id),
        "filled_by_text": cycle.filled_by_text,
        "child_snapshot": cycle.child_snapshot or {},
        "created_by": _str(cycle.created_by),
        "created_by_name": names.get(cycle.created_by),
        "created_at": _iso(cycle.created_at),
        "updated_at": _iso(cycle.updated_at),
        "closed_by": _str(cycle.closed_by),
        "closed_by_name": names.get(cycle.closed_by),
        "closed_at": _iso(cycle.closed_at),
        "domains": _domains_out(cycle),
        "need_focus_areas": _need_focus_areas(db, cycle),
    }


def _summary(cycle: TeacherAssessment, number: int | None) -> dict:
    return {
        "id": str(cycle.id),
        "kind": cycle.kind,
        "number": number,
        "status": cycle.status,
        "filled_on": _iso(cycle.filled_on),
        "period_from": _iso(cycle.period_from),
        "period_to": _iso(cycle.period_to),
        "closed_at": _iso(cycle.closed_at),
    }


def entry_out(entry: TeacherAssessmentEntry) -> dict:
    return {
        "id": str(entry.id),
        "assessment_id": str(entry.assessment_id),
        "domain": entry.domain,
        "status": entry.status,
        "data": entry.data,
        "entered_by": _str(entry.entered_by),
        "entered_by_name": entry.entered_by_name,
        "entered_role": entry.entered_role,
        "entered_at": _iso(entry.entered_at),
        "provenance": provenance.derive(["observation"]),
    }


def _out(db: Session, cycle: TeacherAssessment) -> dict:
    db.flush()
    db.refresh(cycle)
    return assessment_out(db, cycle)


# --------------------------------------------------------------------------- entries


def _insert_entry(db: Session, user: User, cycle: TeacherAssessment, domain: str, status: str,
                  data: dict) -> TeacherAssessmentEntry:
    entry = TeacherAssessmentEntry(
        assessment_id=cycle.id,
        child_id=cycle.child_id,
        domain=domain,
        status=status,
        data=data,
        entered_by=user.id,
        entered_by_name=user.name,
        entered_role=user.role,
    )
    db.add(entry)
    db.flush()
    db.refresh(entry)
    cache = copy.deepcopy(cycle.domains) if isinstance(cycle.domains, dict) else {}
    cache[domain] = {
        "status": status,
        "entry_id": str(entry.id),
        "data": data,
        "updated_by": str(user.id),
        "updated_by_name": user.name,
        "updated_at": _iso(entry.entered_at),
    }
    cycle.domains = cache  # a new value: JSONB changes are not tracked in place
    return entry


def _collect(data, key: str, out: set) -> set:
    """Every value under ``key`` (lists are flattened), anywhere inside ``data``."""
    if isinstance(data, dict):
        for k, v in data.items():
            if k == key:
                for value in v if isinstance(v, list) else [v]:
                    if value is not None:
                        out.add(str(value))
            else:
                _collect(v, key, out)
    elif isinstance(data, list):
        for v in data:
            _collect(v, key, out)
    return out


def _check_links(db: Session, child_id, data: dict) -> None:
    """Linked observations and focus areas must belong to the same child."""
    obs_ids = _collect(data, "observation_ids", set())
    if obs_ids:
        found = {str(i) for i in db.scalars(select(Observation.id).where(
            Observation.id.in_([uuid.UUID(i) for i in obs_ids]), Observation.child_id == child_id))}
        if obs_ids - found:
            raise AppError("VALIDATION", details=[{"path": "data", "message": "A linked observation does not belong to the child."}])
    focus_ids = _collect(data, "focus_area_id", set())
    if focus_ids:
        found = {str(i) for i in db.scalars(select(FocusArea.id).where(
            FocusArea.id.in_([uuid.UUID(i) for i in focus_ids]), FocusArea.child_id == child_id))}
        if focus_ids - found:
            raise AppError("VALIDATION", details=[{"path": "data", "message": "A linked focus area does not belong to the child."}])


def _strings(data, path: str = ""):
    if isinstance(data, str):
        yield path, data
    elif isinstance(data, dict):
        for k, v in data.items():
            yield from _strings(v, f"{path}.{k}" if path else str(k))
    elif isinstance(data, list):
        for i, v in enumerate(data):
            yield from _strings(v, f"{path}.{i}")


# Keys whose string values are vocabulary keys or ids, not teacher text.
_NOT_TEXT = {"level", "seen_in", "key", "list", "area", "effect", "context", "contexts", "observation_ids",
             "focus_area_id", "assessment_id", "entry_id", "filled_on", "avoids_physical_activity"}


def warnings_for(domain: str, data: dict) -> list[dict]:
    """Soft warnings (never blocking, OQ-3): wording in teacher text, and fewer than 3 strengths."""
    out = []
    for path, text in _strings(data):
        if set(path.split(".")) & _NOT_TEXT:
            continue
        for issue in text_issues(text, False):
            out.append({"code": "wording", "path": path, "message": issue})
    if domain == "strengths" and len(data.get("items") or []) < STRENGTHS_MIN:
        out.append({"code": "strengths_below_3", "path": "items",
                    "message": "Try to name at least 3 strengths, abilities or interests."})
    return out


# --------------------------------------------------------------------------- endpoints


def list_assessments(db: Session, user: User, child_id) -> dict:
    """{current: the open cycle (else the latest one) | null, earlier: [summaries], newest first}."""
    child = _staff_child(db, user, child_id)
    rows = db.scalars(select(TeacherAssessment).where(TeacherAssessment.child_id == child.id)
                      .order_by(TeacherAssessment.created_at.desc(), TeacherAssessment.id.desc())).all()
    numbers = _numbers(db, child.id)
    current = next((r for r in rows if r.status == "open"), rows[0] if rows else None)
    return {
        "current": assessment_out(db, current, numbers.get(current.id)) if current is not None else None,
        "earlier": [_summary(r, numbers.get(r.id)) for r in rows if r is not current],
    }


def create_assessment(db: Session, user: User, child_id, body: AssessmentCreate) -> dict:
    child = _staff_child(db, user, child_id, lock=True)
    rows = db.scalars(select(TeacherAssessment).where(TeacherAssessment.child_id == child.id)
                      .order_by(TeacherAssessment.created_at.desc(), TeacherAssessment.id.desc())).all()
    if any(r.status == "open" for r in rows):
        raise AppError("ASSESSMENT_OPEN")
    has_initial = any(r.kind == "initial" for r in rows)
    kind = body.kind or ("reassessment" if has_initial else "initial")
    if kind == "initial" and has_initial:
        raise AppError("CONFLICT", "This child already has an initial observation. Start a reassessment instead.")
    previous = rows[0] if rows else None
    teacher_id = body.teacher_id or user.id
    _check_teacher(db, teacher_id)
    _check_filled_on(body.filled_on)
    filled_on = body.filled_on or utcnow().date()
    cycle = TeacherAssessment(
        child_id=child.id,
        kind=kind,
        previous_id=previous.id if previous else None,
        filled_on=filled_on,
        period_from=body.period_from,
        period_to=body.period_to,
        period_note=body.period_note,
        teacher_id=teacher_id,
        filled_by_text=body.filled_by_text,
        child_snapshot=child_snapshot(db, child, filled_on, teacher_id),
        domains={},
        status="open",
        created_by=user.id,
    )
    db.add(cycle)
    db.flush()
    copied: list[str] = []
    if body.copy_forward and previous is not None:
        for domain in DOMAINS:
            cached = (previous.domains or {}).get(domain)
            if not isinstance(cached, dict) or not cached.get("data"):
                continue
            data = copy.deepcopy(cached["data"])
            data["carried_from"] = {"assessment_id": str(previous.id), "entry_id": cached.get("entry_id"),
                                    "filled_on": _iso(previous.filled_on)}
            _insert_entry(db, user, cycle, domain, "in_progress", data)
            copied.append(domain)
    audit(db, user, "assessment.create", "teacher_assessment", cycle.id, child_id=child.id, kind=kind,
          previous_id=previous.id if previous else None, copy_forward=bool(body.copy_forward), copied=copied)
    out = _out(db, cycle)
    db.commit()
    return {"assessment": out}


def get_assessment(db: Session, user: User, assessment_id) -> dict:
    cycle = _cycle(db, user, assessment_id)
    return {"assessment": assessment_out(db, cycle)}


def update_header(db: Session, user: User, assessment_id, body: AssessmentHeaderPatch) -> dict:
    cycle = _cycle(db, user, assessment_id, lock=True)
    _assert_open(cycle)
    sent = body.model_fields_set
    changed: list[str] = []
    for field in HEADER_FIELDS:
        if field not in sent:
            continue
        value = getattr(body, field)
        if field == "filled_on":
            if value is None:
                continue
            _check_filled_on(value)
        if field == "teacher_id":
            _check_teacher(db, value)
        if value != getattr(cycle, field):
            setattr(cycle, field, value)
            changed.append(field)
    _check_period(cycle.period_from, cycle.period_to)
    child = db.get(Child, cycle.child_id)
    snapshot = child_snapshot(db, child, cycle.filled_on, cycle.teacher_id)
    if snapshot != cycle.child_snapshot:
        cycle.child_snapshot = snapshot
        changed.append("child_snapshot")
    if changed:
        audit(db, user, "assessment.update", "teacher_assessment", cycle.id, child_id=cycle.child_id, fields=changed)
    out = _out(db, cycle)
    db.commit()
    return {"assessment": out}


def put_domain(db: Session, user: User, assessment_id, domain: str, body: DomainPut) -> dict:
    cycle = _cycle(db, user, assessment_id, lock=True)
    _assert_open(cycle)
    data = validate_domain(domain, body.data)
    _check_links(db, cycle.child_id, data)
    entry = _insert_entry(db, user, cycle, domain, body.status, data)
    audit(db, user, "assessment.domain_update", "teacher_assessment", cycle.id, child_id=cycle.child_id,
          domain=domain, status=body.status, entry_id=entry.id)
    db.flush()
    out = {
        "domain": domain,
        "status": body.status,
        "data": data,
        "entry_id": str(entry.id),
        "updated_at": _iso(entry.entered_at),
        "updated_by_name": user.name,
        "provenance": provenance.derive(["observation"]),
        "warnings": warnings_for(domain, data),
    }
    db.commit()
    return out


def domain_history(db: Session, user: User, assessment_id, domain: str) -> dict:
    cycle = _cycle(db, user, assessment_id)
    rows = db.scalars(select(TeacherAssessmentEntry).where(TeacherAssessmentEntry.assessment_id == cycle.id,
                                                           TeacherAssessmentEntry.domain == domain)
                      .order_by(TeacherAssessmentEntry.entered_at.desc(), TeacherAssessmentEntry.id.desc())).all()
    return {"assessment_id": str(cycle.id), "domain": domain, "entries": [entry_out(r) for r in rows]}


def close_assessment(db: Session, user: User, assessment_id) -> dict:
    cycle = _cycle(db, user, assessment_id, lock=True)
    _assert_open(cycle)
    cycle.status = "closed"
    cycle.closed_at = utcnow()
    cycle.closed_by = user.id
    audit(db, user, "assessment.close", "teacher_assessment", cycle.id, child_id=cycle.child_id)
    out = _out(db, cycle)
    db.commit()
    return {"assessment": out}


def _profile_for_update(db: Session, child_id) -> ChildProfile:
    stmt = select(ChildProfile).where(ChildProfile.child_id == child_id).with_for_update()
    profile = db.scalars(stmt).first()
    if profile is None:
        db.add(ChildProfile(child_id=child_id))
        db.flush()
        profile = db.scalars(stmt).first()
    return profile


def _ident(item) -> tuple[str, str] | None:
    if isinstance(item, str):
        return ("k", item)
    if isinstance(item, dict):
        if item.get("key"):
            return ("k", item["key"])
        if item.get("custom"):
            return ("c", str(item["custom"]).strip().casefold())
    return None


def apply_to_profile(db: Session, user: User, assessment_id, body: AssessmentApply) -> dict:
    """Merge teacher-observed items into the profile lists (X-37). Items keep their other
    sources; they gain source ``observation`` (kept by profiles.recompute_lists) and
    ``via: {assessment_id, domain}``."""
    cycle = _cycle(db, user, assessment_id)
    profile = _profile_for_update(db, cycle.child_id)
    current = [copy.deepcopy(i) if isinstance(i, dict) else {"key": i} for i in getattr(profile, body.list) or []]
    index = {_ident(i): n for n, i in enumerate(current) if _ident(i) is not None}
    via = {"assessment_id": str(cycle.id), "domain": body.domain}
    now = _iso(utcnow())
    added = 0
    for item in body.items:
        base = {"key": item.key} if item.key is not None else {"custom": item.custom}
        if body.list == "what_helps" and item.key is not None:
            base["list"] = item.list
        found = index.get(_ident(base))
        if found is not None:
            entry = current[found]
            sources = [s for s in entry.get("sources") or [] if isinstance(s, str)]
            if "observation" not in sources:
                sources.append("observation")
            entry["sources"] = sources
            entry["via"] = via
            continue
        current.append({**base, "sources": ["observation"], "via": via, "added_by": str(user.id), "added_at": now})
        index[_ident(base)] = len(current) - 1
        added += 1
    setattr(profile, body.list, current)
    audit(db, user, "assessment.apply", "teacher_assessment", cycle.id, child_id=cycle.child_id, list=body.list,
          domain=body.domain, count=len(body.items), added=added)
    db.flush()
    out = {"list": body.list, "items": current, "added": added}
    db.commit()
    return out


def need_to_focus(db: Session, user: User, assessment_id, index: int, body: NeedFocus) -> dict:
    """D13 → Current Focus (X-36): a new active focus area with plan.need = what we see and
    source_need = {assessment_id, index, area}. 409 FOCUS_LIMIT at 3 active areas."""
    cycle = _cycle(db, user, assessment_id)
    child = access.get_child_or_404(db, user, cycle.child_id, write=True, lock=True)
    cached = (cycle.domains or {}).get("priority_needs") or {}
    needs = (cached.get("data") or {}).get("needs") or []
    if index < 0 or index >= len(needs):
        raise AppError("NOT_FOUND", "This need is not there.")
    need = needs[index]
    area = need.get("area")
    taken = db.scalars(select(FocusArea.id).where(
        FocusArea.child_id == child.id,
        FocusArea.status.in_(("active", "paused")),
        FocusArea.source_need["assessment_id"].astext == str(cycle.id),
        FocusArea.source_need["index"].as_integer() == index,
    )).first()
    if taken is not None:
        raise AppError("DUPLICATE", "This need is already a Current Focus.")
    title = body.title
    if title is None and area != "behaviour":
        title = vocab.label("need_areas", area, user.language or "en")
    if not title:
        raise AppError("VALIDATION", details=[{"path": "title", "message": "Name a concrete focus for this area."}])
    category = body.category or (vocab.item("need_areas", area) or {}).get("category") or "other"
    assert_can_add_active(db, child.id)
    row = FocusArea(
        child_id=child.id,
        category=category,
        title=title,
        plan={"need": need["seeing"]} if need.get("seeing") else None,
        status="active",
        created_by=user.id,
        assessment_id=cycle.id,
        source_need={"assessment_id": str(cycle.id), "index": index, "area": area},
    )
    db.add(row)
    db.flush()
    history.record(db, child_id=child.id, entity_type="focus_area", entity_id=row.id, data=history.snapshot(row),
                   user=user, via="assessment")
    audit(db, user, "assessment.need_focus", "teacher_assessment", cycle.id, child_id=child.id, index=index,
          area=area, focus_area_id=row.id, category=category)
    db.flush()
    db.refresh(row)
    out = focus_out(row)
    db.commit()
    return {"focus_area": out}
