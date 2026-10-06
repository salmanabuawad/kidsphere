"""Child profile: the two perspectives (parent / teacher), the parent questionnaire,
the Teacher Quick Baseline and the merged lists.

Storage (child_profiles):

- ``parent_perspective`` / ``teacher_perspective``::

      {"sections": {"who": {...}, "emotions": {...}, "joy": {...}, ...},
       "entered":  {"who": [{"by", "by_name", "role", "reported_by", "at", "mode", "version_seq"}, ...]},
       "section_status": {"who": {"status", "by", "by_name", "at"}, ...},
       "wizard":   {"step", "completed_at"},                     # parent perspective only
       "questionnaire": {"status", "filled_at", "submitted_at", "resubmitted_at", "submitted_by",
                         "submitted_by_name", "school_year", "entry_mode", "meeting", "migrated"?}}
                                                                 # parent perspective only (PQM)

  The section shapes are in app/schemas/profile.py. ``entered[section]`` is
  append-only (PLAN-ADJUSTMENTS B2): a stamp is added whenever a section changes.
  ``role`` is who typed it (a teacher may enter the parent's answers), ``reported_by``
  is whose answers they are (= perspective) and ``mode`` how they were entered
  (self / on_behalf / meeting). ``version_seq`` is the record_versions seq written
  in the same transaction: every change of a section also inserts the FULL new
  section into ``record_versions`` (key ``<perspective>:<section>``), so the
  family's first answers survive every later edit (X-10). Changes of the
  questionnaire record are versioned as ``parent:_questionnaire``.

  A section with no data has no status (= not started). The first save of a section
  sets ``in_progress``; ``status`` in the PATCH sets any status; sending the
  questionnaire turns every answered parent section that is in progress into
  ``sufficient`` ("Enough for now").

- merged lists ``strengths``, ``interests``, ``motivators``, ``what_helps``,
  ``sensitivities``: the union of both perspectives::

      {"key"|"custom", "sources": ["parent", "teacher", "observation", "review"],
       "added_by", "added_at", "main"?}
      what_helps items also carry "list" (the option list of the key);
      sensitivities carry "what_happens" and "what_helps" [items].

  Parent sources also include the questionnaire's ``joy.special_ability.strength_keys``;
  teacher sources include the quick baseline: ``bridge.main_strengths`` (``main: true``)
  and ``bridge.calms_helps.items``. Recomputing keeps items whose sources include
  ``observation`` or ``review`` (PLAN-ADJUSTMENTS B3) and keeps ``added_by``/``added_at``
  of existing items. The output adds ``provenance`` to every item (app.provenance.badges).

- staff wizard progress: ``wizard_step`` / ``wizard_completed_at`` columns.
"""
import copy
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import provenance, vocab
from app.access import get_child_or_404, is_staff
from app.audit import audit
from app.errors import AppError
from app.models import Baseline, Child, ChildProfile, Class, RecordVersion, User
from app.schemas.profile import (
    PARENT_LEGACY_KEYS,
    PARENT_SECTIONS,
    SECTIONS,
    TEACHER_SECTIONS,
    ProfilePatch,
    has_value,
    ident,
    validate_section,
)
from app.services import history
from app.services.questionnaire_projection import project
from app.sessions import utcnow

MERGED_LISTS = ("strengths", "interests", "motivators", "what_helps", "sensitivities")
PERSPECTIVE_SOURCES = ("parent", "teacher")
PRESERVED_SOURCES = ("observation", "review")
STAFF_MODES = ("on_behalf", "meeting")
QUESTIONNAIRE_KEY = "parent:_questionnaire"

# (section, field, option list) feeding the merged what_helps list.
WHAT_HELPS_FIELDS = (
    ("emotions", "calming_helps", "calming_helps"),
    ("emotions", "transition_helps", "transition_helps"),
    ("emotions", "helps_when_sad", "sad_helps"),
)

# Parent sections whose last stamp tells who entered a merged list's parent items.
LIST_SECTIONS = {
    "strengths": ("who", "joy"),
    "interests": ("who",),
    "motivators": ("who",),
    "what_helps": ("emotions", "separation", "transitions", "environment"),
    "sensitivities": ("environment", "health"),
}


def iso(dt) -> str | None:
    return dt.isoformat() if dt is not None else None


def _invalid(path: str, message: str) -> AppError:
    return AppError("VALIDATION", details=[{"path": path, "message": message}])


# --------------------------------------------------------------------------- rows


def get_profile_row(db: Session, child_id, lock: bool = False) -> ChildProfile:
    """The child's profile row, created on first use."""
    stmt = select(ChildProfile).where(ChildProfile.child_id == child_id)
    if lock:
        stmt = stmt.with_for_update()
    profile = db.scalars(stmt).first()
    if profile is None:
        profile = ChildProfile(child_id=child_id)
        db.add(profile)
        db.flush()
        if lock:
            profile = db.scalars(stmt).first()
    return profile


def perspective(profile: ChildProfile, which: str) -> dict:
    """A normalised deep copy of one perspective: always has ``sections`` and ``entered``."""
    raw = profile.parent_perspective if which == "parent" else profile.teacher_perspective
    data = copy.deepcopy(raw) if isinstance(raw, dict) else {}
    if not isinstance(data.get("sections"), dict):
        data["sections"] = {}
    if not isinstance(data.get("entered"), dict):
        data["entered"] = {}
    return data


def _set_perspective(profile: ChildProfile, which: str, data: dict) -> None:
    if which == "parent":
        profile.parent_perspective = data
    else:
        profile.teacher_perspective = data


def _dict(value) -> dict:
    return value if isinstance(value, dict) else {}


# --------------------------------------------------------------------------- merged lists


def _as_item(item) -> dict | None:
    if isinstance(item, str):
        return {"key": item}
    if isinstance(item, dict) and (item.get("key") or item.get("custom")):
        return item
    return None


def _base(item: dict) -> dict:
    return {"key": item["key"]} if item.get("key") else {"custom": item["custom"]}


def _perspective_items(sections: dict):
    """Yield (merged list, item dict) for everything a perspective contributes."""
    who = _dict(sections.get("who"))
    for list_name in ("strengths", "interests", "motivators"):
        for raw in who.get(list_name) or []:
            item = _as_item(raw)
            if item:
                yield list_name, _base(item)
    # Q7: keys the family picked next to "what is your child especially good at".
    special = _dict(_dict(sections.get("joy")).get("special_ability"))
    for key in special.get("strength_keys") or []:
        if isinstance(key, str) and key:
            yield "strengths", {"key": key}
    # Teacher Quick Baseline: the 3 main strengths and what calms / helps.
    bridge = _dict(sections.get("bridge"))
    for raw in bridge.get("main_strengths") or []:
        item = _as_item(raw)
        if item:
            yield "strengths", {**_base(item), "main": True}
    emotions = _dict(sections.get("emotions"))
    for section, field, option_list in WHAT_HELPS_FIELDS:
        src = emotions if section == "emotions" else _dict(sections.get(section))
        for raw in src.get(field) or []:
            item = _as_item(raw)
            if not item or item.get("key") == "other":
                continue
            out = _base(item)
            if "key" in out:
                out["list"] = option_list
            yield "what_helps", out
    for raw in _dict(bridge.get("calms_helps")).get("items") or []:
        item = _as_item(raw)
        if not item or item.get("key") == "other":
            continue
        out = _base(item)
        if "key" in out:
            out["list"] = raw.get("list") if isinstance(raw, dict) and raw.get("list") else "what_helps"
        yield "what_helps", out
    environment = _dict(sections.get("environment"))
    for raw in environment.get("items") or []:
        item = _as_item(raw)
        if not item:
            continue
        helps = []
        for h in item.get("what_helps") or []:
            h = _as_item(h)
            if h and h.get("key") != "other":
                helps.append(_base(h))
        sens = _base(item)
        sens["what_happens"] = item.get("what_happens")
        sens["what_helps"] = helps
        yield "sensitivities", sens
        for h in helps:
            wh = dict(h)
            if "key" in wh:
                wh["list"] = "sensitivity_helps"
            yield "what_helps", wh


def _merge_into(entry: dict, item: dict, source: str) -> None:
    if source not in entry["sources"]:
        entry["sources"].append(source)
    if item.get("main"):
        entry["main"] = True
    if "what_helps" in item:  # sensitivity: union of helps, all distinct "what happens" texts
        seen = {ident(h) for h in entry.get("what_helps") or []}
        for h in item["what_helps"]:
            if ident(h) not in seen:
                seen.add(ident(h))
                entry.setdefault("what_helps", []).append(h)
        texts = [t for t in (entry.get("what_happens") or "").split(" · ") if t]
        new = item.get("what_happens")
        if new and new not in texts:
            texts.append(new)
        entry["what_happens"] = " · ".join(texts) or None


def compute_lists(parent_sections: dict, teacher_sections: dict) -> dict[str, dict]:
    """Merged items per list from the perspectives only: {list: {ident: entry}}."""
    computed: dict[str, dict] = {name: {} for name in MERGED_LISTS}
    for source, sections in (("parent", parent_sections), ("teacher", teacher_sections)):
        for list_name, item in _perspective_items(sections or {}):
            i = ident(item)
            entry = computed[list_name].get(i)
            if entry is None:
                entry = {**{k: v for k, v in item.items() if k not in ("what_helps", "what_happens", "main")}, "sources": []}
                if list_name == "sensitivities":
                    entry["what_happens"] = None
                    entry["what_helps"] = []
                computed[list_name][i] = entry
            _merge_into(entry, item, source)
    return computed


def recompute_lists(profile: ChildProfile, actor_id, now) -> None:
    """Rebuild the merged lists from both perspectives, keeping observation/review items."""
    computed = compute_lists(perspective(profile, "parent")["sections"], perspective(profile, "teacher")["sections"])
    for name in MERGED_LISTS:
        fresh = computed[name]
        out = []
        for old in getattr(profile, name) or []:
            old = _as_item(old)
            if old is None:
                continue
            i = ident(old)
            kept_sources = [s for s in old.get("sources") or [] if s in PRESERVED_SOURCES]
            entry = fresh.pop(i, None)
            if entry is None and not kept_sources:
                continue  # only came from a perspective that no longer lists it
            item = copy.deepcopy(old)
            if entry is not None:
                for k, v in entry.items():
                    if k != "sources":
                        item[k] = v
            if not (entry or {}).get("main"):
                item.pop("main", None)  # "main" comes only from the quick baseline
            perspective_sources = entry["sources"] if entry else []
            item["sources"] = [s for s in PERSPECTIVE_SOURCES if s in perspective_sources] + kept_sources
            out.append(item)
        for entry in fresh.values():
            entry["sources"] = [s for s in PERSPECTIVE_SOURCES if s in entry["sources"]]
            out.append({**entry, "added_by": str(actor_id) if actor_id else None, "added_at": iso(now)})
        setattr(profile, name, out)


# --------------------------------------------------------------------------- output


def _has_baseline(db: Session, child_id) -> bool:
    return db.scalars(select(Baseline.id).where(Baseline.child_id == child_id).limit(1)).first() is not None


def _last_stamp(persp: dict, sections) -> dict | None:
    best = None
    for name in sections:
        stamps = persp["entered"].get(name)
        if isinstance(stamps, list) and stamps and isinstance(stamps[-1], dict):
            if best is None or str(stamps[-1].get("at") or "") > str(best.get("at") or ""):
                best = stamps[-1]
    return best


def _with_provenance(items, list_name: str, parent_p: dict) -> list[dict]:
    """Merged items with their derived ``provenance`` badges (X-22; never stored)."""
    stamp = _last_stamp(parent_p, LIST_SECTIONS.get(list_name, ()))
    out = []
    for raw in items or []:
        if not isinstance(raw, dict):
            continue
        sources = raw.get("sources") or []
        item = dict(raw)
        item["provenance"] = provenance.badges(sources, stamp=stamp if "parent" in sources else None)
        out.append(item)
    return out


def profile_out(db: Session, user: User, child: Child, profile: ChildProfile) -> dict:
    parent_p = perspective(profile, "parent")
    questionnaire = parent_p.get("questionnaire") if isinstance(parent_p.get("questionnaire"), dict) else None
    if not is_staff(user):
        wizard = _dict(parent_p.get("wizard"))
        return {
            "child_id": str(child.id),
            "perspective": "parent",
            "parent_perspective": parent_p,
            "questionnaire": questionnaire,
            "wizard": {"step": wizard.get("step") or 1, "completed_at": wizard.get("completed_at")},
        }
    teacher_p = perspective(profile, "teacher")
    return {
        "child_id": str(child.id),
        "perspective": "teacher",
        "parent_perspective": parent_p,
        "teacher_perspective": teacher_p,
        "questionnaire": questionnaire,
        "section_status": {"parent": _dict(parent_p.get("section_status")), "teacher": _dict(teacher_p.get("section_status"))},
        **{name: _with_provenance(getattr(profile, name), name, parent_p) for name in MERGED_LISTS},
        "wizard": {"step": profile.wizard_step or 1, "completed_at": iso(profile.wizard_completed_at)},
        "has_baseline": _has_baseline(db, child.id),
    }


# --------------------------------------------------------------------------- endpoints


def get_profile(db: Session, user: User, child_id) -> dict:
    child = get_child_or_404(db, user, child_id)
    profile = get_profile_row(db, child.id)
    out = profile_out(db, user, child, profile)
    db.commit()  # a profile row may have been created
    return out


def school_year(day: date) -> str:
    """The school year a date belongs to (September to August), e.g. "2026-2027"."""
    start = day.year if day.month >= 9 else day.year - 1
    return f"{start}-{start + 1}"


def _entry_mode(user: User, staff: bool, body: ProfilePatch, pqm: dict) -> str:
    """How the parent answers in this request were entered."""
    if not staff:
        return "self"
    q = body.questionnaire
    if q is not None and q.meeting is not None:
        return "meeting"
    if q is not None and q.entry_mode in STAFF_MODES:
        return q.entry_mode
    return pqm.get("entry_mode") if pqm.get("entry_mode") in STAFF_MODES else "on_behalf"


def _answered(sections: dict, path: str) -> bool:
    section, _, field = path.partition(".")
    return field in _dict(sections.get(section))


def _keep_legacy(section: str, stored: dict | None, data: dict, sections: dict) -> dict:
    """Parent perspective: a legacy key whose questionnaire replacement is answered keeps its
    stored value (the projection owns it from then on), and a legacy key the client left out
    keeps its stored value too (earlier-form answers are never dropped by omission)."""
    merged = {**sections, section: data}
    for field, replaced_by in PARENT_LEGACY_KEYS.get(section, {}).items():
        replaced = any(_answered(merged, path) for path in replaced_by)
        if replaced or field not in data:
            if stored and field in stored:
                data[field] = copy.deepcopy(stored[field])
            else:
                data.pop(field, None)
    return data


def _bridge_texts(data: dict):
    yield "data.may_be_difficult", data.get("may_be_difficult")
    for i, line in enumerate(data.get("remember") or []):
        yield f"data.remember.{i}.text", line.get("text")
    for i, slot in enumerate(data.get("main_strengths") or []):
        yield f"data.main_strengths.{i}.custom", slot.get("custom")
        yield f"data.main_strengths.{i}.note", slot.get("note")
    helps = _dict(data.get("calms_helps"))
    yield "data.calms_helps.text", helps.get("text")
    for i, it in enumerate(helps.get("items") or []):
        yield f"data.calms_helps.items.{i}.custom", it.get("custom")
    yield "data.first_area_to_observe.note", _dict(data.get("first_area_to_observe")).get("note")
    question = _dict(data.get("question_for_parent"))
    yield "data.question_for_parent.text", question.get("text")
    yield "data.question_for_parent.outcome_note", question.get("outcome_note")


def _check_bridge_wording(data: dict) -> None:
    """The teacher's own words use everyday, observational language (like reviews): 422."""
    from app.ai.safety import text_issues  # lazy: app.ai must never depend on profile code being importable first

    details = [{"path": path, "message": issue} for path, text in _bridge_texts(data) if text
               for issue in text_issues(text, False)]
    if details:
        raise AppError("UNSAFE_CONTENT", "Please describe what you see in everyday words.", details=details[:20])


def _check_main_strengths(data: dict | None, status: str | None) -> None:
    if status == "sufficient" and len(_dict(data).get("main_strengths") or []) != 3:
        raise _invalid("data.main_strengths", "Choose exactly 3 main strengths before marking the quick baseline as enough.")
    # The bridge is exactly 3 + 3 (PQ-TCH-03): three things to remember as well.
    remember = [r for r in _dict(data).get("remember") or []
                if isinstance(r, dict) and isinstance(r.get("text"), str) and r["text"].strip()]
    if status == "sufficient" and len(remember) != 3:
        raise _invalid("data.remember", "Write 3 things to remember before marking the quick baseline as enough.")


def _bridge_server_fields(db: Session, child_id, parent_p: dict, stored: dict | None, data: dict, now) -> dict:
    """``based_on`` (which family answers were read) and ``question_for_parent.clarified_at``."""
    question = data.get("question_for_parent")
    if isinstance(question, dict):
        if question.get("status") == "clarified":
            old = _dict(_dict(stored).get("question_for_parent"))
            question["clarified_at"] = question.get("clarified_at") or old.get("clarified_at") or iso(now)
        else:
            question.pop("clarified_at", None)
    old_based_on = _dict(stored).get("based_on")
    if stored is not None and {k: v for k, v in stored.items() if k != "based_on"} == {k: v for k, v in data.items() if k != "based_on"}:
        if old_based_on is not None:
            data["based_on"] = old_based_on
        else:
            data.pop("based_on", None)
        return data
    parent_keys = (RecordVersion.child_id == child_id, RecordVersion.entity_type == "profile_section",
                   RecordVersion.entity_key.like("parent:%"))
    pqm = _dict(parent_p.get("questionnaire"))
    data["based_on"] = {
        "parent_version_seq": db.scalar(select(func.max(RecordVersion.seq)).where(
            RecordVersion.child_id == child_id, RecordVersion.entity_type == "profile_section",
            RecordVersion.entity_key == QUESTIONNAIRE_KEY)),
        "parent_version_id": db.scalar(select(func.max(RecordVersion.id)).where(*parent_keys)),
        "questionnaire_status": pqm.get("status"),
        "read_at": iso(now),
    }
    return data


def _child_snapshot(db: Session, child: Child, now: datetime) -> dict:
    from app.services.children import age_parts  # local: children imports nothing from here, keep it lazy

    cls = db.get(Class, child.class_id) if child.class_id else None
    return {
        "name": child.name,
        "preferred_name": child.preferred_name,
        "age": age_parts(child.birth_date, now.date()),
        "class_name": cls.name if cls else None,
        "kindergarten": cls.kindergarten if cls else None,
    }


def _union_languages(db: Session, user: User, child: Child, languages: list[str]) -> None:
    """Q22: home languages the family named join children.additional_languages (never removed)."""
    existing = list(child.additional_languages or [])
    add = [lang for lang in languages
           if lang != child.main_language and lang not in existing and vocab.is_valid("languages", lang)]
    if add:
        child.additional_languages = existing + add
        audit(db, user, "child.update", "child", child.id, child_id=child.id, fields=["additional_languages"],
              via="questionnaire")


def _fill_parent_name(db: Session, user: User, child: Child, who: dict) -> None:
    """PQ-INTRO-02: children.parent_name stays the first parent the family named. It is
    only filled when empty; a name staff already typed is never replaced."""
    if (child.parent_name or "").strip():
        return
    first = next((p.get("name") for p in who.get("parents") or [] if isinstance(p, dict) and p.get("name")), None)
    if first:
        child.parent_name = first[:120]
        audit(db, user, "child.update", "child", child.id, child_id=child.id, fields=["parent_name"], via="questionnaire")


def _set_status(statuses: dict, section: str, status: str, user: User, now) -> None:
    statuses[section] = {"status": status, "by": str(user.id), "by_name": user.name, "at": iso(now)}


def update_profile(db: Session, user: User, child_id, body: ProfilePatch) -> dict:
    child = get_child_or_404(db, user, child_id)
    staff = is_staff(user)
    which = body.perspective or ("teacher" if staff else "parent")
    section = body.section
    q = body.questionnaire
    if not staff and (which != "parent" or section in TEACHER_SECTIONS):
        raise AppError("FORBIDDEN", "Parents can only answer the parent questions.")
    if not staff and q is not None and (q.entry_mode not in (None, "self") or q.meeting is not None):
        raise AppError("FORBIDDEN", "Only staff can record answers for the family.")
    if staff and q is not None and q.entry_mode == "self":
        raise _invalid("questionnaire.entry_mode", "Staff enter the family's answers on_behalf or in a meeting.")
    if section in TEACHER_SECTIONS and which != "teacher":
        raise _invalid("section", "The quick baseline is part of the teacher's answers.")
    if section in PARENT_SECTIONS and which != "parent":
        raise _invalid("section", "This section belongs to the family's questionnaire.")
    if section is not None and section not in SECTIONS:  # pragma: no cover - guarded by the Literal
        raise _invalid("section", "unknown section")

    profile = get_profile_row(db, child.id, lock=True)
    now = utcnow()
    persps = {"parent": perspective(profile, "parent"), "teacher": perspective(profile, "teacher")}
    dirty = {"parent": False, "teacher": False}
    parent_p = persps["parent"]
    pqm_before = copy.deepcopy(_dict(parent_p.get("questionnaire")))
    mode = _entry_mode(user, staff, body, pqm_before)
    sections_changed = False
    parent_touched = False
    languages: list[str] = []

    if section is not None:
        persp = persps[which]
        stored = persp["sections"].get(section) if isinstance(persp["sections"].get(section), dict) else None
        statuses = copy.deepcopy(_dict(persp.get("section_status")))
        current = _dict(statuses.get(section)).get("status")
        if body.data is not None:
            data = validate_section(section, body.data)
            if which == "parent":
                data = _keep_legacy(section, stored, data, persp["sections"])
            if section == "bridge":
                _check_bridge_wording(data)
                _check_main_strengths(data, body.status or current)
                data = _bridge_server_fields(db, child.id, parent_p, stored, data, now)
            stamps = persp["entered"].get(section)
            stamps = list(stamps) if isinstance(stamps, list) else []
            if stored != data or not stamps:
                before_sections = copy.deepcopy(persp["sections"])
                persp["sections"][section] = data
                if which == "parent":
                    languages = project(before_sections, persp["sections"], section)
                stamp_mode = mode if which == "parent" else "self"
                version = history.record(
                    db, child_id=child.id, entity_type="profile_section", key=f"{which}:{section}",
                    data=persp["sections"][section], user=user, reported_by=which,
                    via=stamp_mode if which == "parent" else "manual",
                )
                stamps.append({
                    "by": str(user.id),
                    "by_name": user.name,
                    "role": user.role,
                    "reported_by": which,
                    "at": iso(now),
                    "mode": stamp_mode,
                    "version_seq": version.seq,
                })
                persp["entered"][section] = stamps
                dirty[which] = sections_changed = True
                parent_touched = parent_touched or which == "parent"
                audit(db, user, "profile.section_update", "child_profile", profile.id, child_id=child.id,
                      section=section, perspective=which, mode=stamp_mode)
                if body.status is None and current in (None, "not_started") and has_value(data):
                    _set_status(statuses, section, "in_progress", user, now)
        elif section == "bridge":
            _check_main_strengths(stored, body.status)
        if body.status is not None and body.status != current:
            _set_status(statuses, section, body.status, user, now)
        if statuses != _dict(persp.get("section_status")):
            persp["section_status"] = statuses
            dirty[which] = True

    # ---- the questionnaire record (PQM) and "Send"
    pqm = copy.deepcopy(pqm_before)
    submit = bool(q is not None and q.submit)
    if (parent_touched or q is not None or submit) and not pqm:
        pqm = {"status": "draft", "entry_mode": mode, "filled_at": now.date().isoformat(),
               "school_year": school_year(now.date())}
    if q is not None:
        if q.filled_at is not None:
            pqm["filled_at"] = q.filled_at.isoformat()
        if q.school_year:
            pqm["school_year"] = q.school_year
        if q.entry_mode is not None:
            pqm["entry_mode"] = q.entry_mode
        if q.meeting is not None:
            pqm["entry_mode"] = "meeting"
            pqm["meeting"] = {"date": q.meeting.date.isoformat() if q.meeting.date else None,
                              "attendees": list(q.meeting.attendees)}
    if submit:
        pqm["status"] = "submitted"
        if pqm.get("submitted_at"):
            pqm["resubmitted_at"] = iso(now)
        else:
            pqm["submitted_at"] = iso(now)
        pqm["submitted_by"] = str(user.id)
        pqm["submitted_by_name"] = user.name
        wizard = dict(_dict(parent_p.get("wizard")))
        if not wizard.get("completed_at"):
            wizard["completed_at"] = iso(now)
            parent_p["wizard"] = wizard
        statuses = copy.deepcopy(_dict(parent_p.get("section_status")))
        for name, value in parent_p["sections"].items():
            if has_value(value) and _dict(statuses.get(name)).get("status") in (None, "not_started", "in_progress"):
                _set_status(statuses, name, "sufficient", user, now)
        parent_p["section_status"] = statuses
        audit(db, user, "questionnaire.submit", "child_profile", profile.id, child_id=child.id, mode=mode)
        dirty["parent"] = True
    if pqm != pqm_before:
        parent_p["questionnaire"] = pqm
        dirty["parent"] = True
        if q is not None or submit:
            data = dict(pqm)
            if submit:
                data["child_snapshot"] = _child_snapshot(db, child, now)
            history.record(db, child_id=child.id, entity_type="profile_section", key=QUESTIONNAIRE_KEY, data=data,
                           user=user, reported_by="parent", via=mode)

    # ---- wizard progress
    if staff:
        if body.wizard_step is not None:
            if which == "parent":  # staff filling the family's questionnaire share its step
                wizard = dict(_dict(parent_p.get("wizard")))
                wizard["step"] = body.wizard_step
                parent_p["wizard"] = wizard
                dirty["parent"] = True
            else:
                profile.wizard_step = body.wizard_step
        if body.complete and profile.wizard_completed_at is None:
            profile.wizard_completed_at = now
    elif body.wizard_step is not None or body.complete:
        wizard = dict(_dict(parent_p.get("wizard")))
        if body.wizard_step is not None:
            wizard["step"] = body.wizard_step
        if body.complete and not wizard.get("completed_at"):
            wizard["completed_at"] = iso(now)  # the legacy flag; it does not send the questionnaire
        parent_p["wizard"] = wizard
        dirty["parent"] = True

    for which_p, changed in dirty.items():
        if changed:
            _set_perspective(profile, which_p, persps[which_p])
    if sections_changed:
        recompute_lists(profile, user.id, now)
    if languages:
        _union_languages(db, user, child, languages)
    if parent_touched and section == "who":
        _fill_parent_name(db, user, child, _dict(parent_p["sections"].get("who")))

    db.flush()
    out = profile_out(db, user, child, profile)
    db.commit()
    return out


# --------------------------------------------------------------------------- history (PROF-H)


def _parse_ts(value) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def profile_history(db: Session, user: User, child_id, which: str | None = None, section: str | None = None) -> dict:
    """GET /api/children/{id}/profile/history (staff only; parents get 404).

    Every version of the profile sections (``<perspective>:<section>``), oldest first,
    optionally for one perspective and/or one section (``_questionnaire`` is the record
    metadata). ``initial`` maps each key to the seq of its state when the family first
    sent the questionnaire (else its first version): the "Initial / Latest" toggle.
    """
    child = get_child_or_404(db, user, child_id)
    if not is_staff(user):
        raise AppError("NOT_FOUND", "Child not found.")
    if which is not None and which not in ("parent", "teacher"):
        raise _invalid("perspective", "perspective is parent or teacher")
    if section is not None and section not in (*SECTIONS, "_questionnaire"):
        raise _invalid("section", "unknown section")
    key = f"{which}:{section}" if which and section else None
    rows = history.versions(db, child_id=child.id, entity_type="profile_section", key=key)
    if key is None and which:
        rows = [r for r in rows if r.entity_key.startswith(f"{which}:")]
    if key is None and section:
        rows = [r for r in rows if r.entity_key.endswith(f":{section}")]

    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).first()
    pqm = _dict(_dict(profile.parent_perspective if profile else {}).get("questionnaire"))
    submitted_at = _parse_ts(pqm.get("submitted_at"))
    initial: dict[str, int] = {}
    for row in rows:
        k = row.entity_key
        on_time = submitted_at is not None and k.startswith("parent:") and row.created_at <= submitted_at
        if k not in initial or on_time:
            initial[k] = row.seq
    out = []
    for row in rows:
        v = history.version_out(row)
        v["initial"] = initial.get(row.entity_key) == row.seq
        out.append(v)
    return {"versions": out, "initial": initial, "submitted_at": pqm.get("submitted_at"),
            "questionnaire_status": pqm.get("status")}
