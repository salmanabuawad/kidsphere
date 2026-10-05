"""Child profile: the two perspectives (parent / teacher) and the merged lists.

Storage (child_profiles):

- ``parent_perspective`` / ``teacher_perspective``::

      {"sections": {"who": {...}, "emotions": {...}, ...},
       "entered":  {"who": [{"by", "by_name", "role", "reported_by", "at"}, ...]},
       "wizard":   {"step", "completed_at"}}          # parent perspective only

  ``entered[section]`` is append-only (PLAN-ADJUSTMENTS B2): a stamp is added
  whenever a section changes. ``role`` is who typed it (a teacher may enter the
  parent's answers), ``reported_by`` is whose answers they are (= perspective).

- merged lists ``strengths``, ``interests``, ``motivators``, ``what_helps``,
  ``sensitivities``: the union of both perspectives::

      {"key"|"custom", "sources": ["parent", "teacher", "observation", "review"],
       "added_by", "added_at"}
      what_helps items also carry "list" (the option list of the key);
      sensitivities carry "what_happens" and "what_helps" [items].

  Recomputing keeps items whose sources include ``observation`` or ``review``
  (PLAN-ADJUSTMENTS B3) and keeps ``added_by``/``added_at`` of existing items.

- staff wizard progress: ``wizard_step`` / ``wizard_completed_at`` columns.
"""
import copy
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import get_child_or_404, is_staff
from app.audit import audit
from app.errors import AppError
from app.models import Baseline, Child, ChildProfile, User
from app.schemas.profile import SECTIONS, ProfilePatch, ident, validate_section
from app.sessions import utcnow

MERGED_LISTS = ("strengths", "interests", "motivators", "what_helps", "sensitivities")
PERSPECTIVE_SOURCES = ("parent", "teacher")
PRESERVED_SOURCES = ("observation", "review")

# (section, field, option list) feeding the merged what_helps list.
WHAT_HELPS_FIELDS = (
    ("emotions", "calming_helps", "calming_helps"),
    ("emotions", "transition_helps", "transition_helps"),
    ("emotions", "helps_when_sad", "sad_helps"),
)


def iso(dt) -> str | None:
    return dt.isoformat() if dt is not None else None


# --------------------------------------------------------------------------- rows


def get_profile_row(db: Session, child_id: uuid.UUID, lock: bool = False) -> ChildProfile:
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
    who = sections.get("who") or {}
    for list_name in ("strengths", "interests", "motivators"):
        for raw in who.get(list_name) or []:
            item = _as_item(raw)
            if item:
                yield list_name, _base(item)
    emotions = sections.get("emotions") or {}
    for section, field, option_list in WHAT_HELPS_FIELDS:
        src = emotions if section == "emotions" else sections.get(section) or {}
        for raw in src.get(field) or []:
            item = _as_item(raw)
            if not item or item.get("key") == "other":
                continue
            out = _base(item)
            if "key" in out:
                out["list"] = option_list
            yield "what_helps", out
    environment = sections.get("environment") or {}
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
                entry = {**{k: v for k, v in item.items() if k not in ("what_helps", "what_happens")}, "sources": []}
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


def profile_out(db: Session, user: User, child: Child, profile: ChildProfile) -> dict:
    parent_p = perspective(profile, "parent")
    if not is_staff(user):
        wizard = parent_p.get("wizard") or {}
        return {
            "child_id": str(child.id),
            "perspective": "parent",
            "parent_perspective": parent_p,
            "wizard": {"step": wizard.get("step") or 1, "completed_at": wizard.get("completed_at")},
        }
    return {
        "child_id": str(child.id),
        "perspective": "teacher",
        "parent_perspective": parent_p,
        "teacher_perspective": perspective(profile, "teacher"),
        **{name: list(getattr(profile, name) or []) for name in MERGED_LISTS},
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


def update_profile(db: Session, user: User, child_id, body: ProfilePatch) -> dict:
    child = get_child_or_404(db, user, child_id)
    staff = is_staff(user)
    which = body.perspective or ("teacher" if staff else "parent")
    if not staff and which != "parent":
        raise AppError("FORBIDDEN", "Parents can only answer the parent questions.")
    profile = get_profile_row(db, child.id, lock=True)
    now = utcnow()

    if body.section is not None:
        if body.section not in SECTIONS:  # pragma: no cover - guarded by the Literal
            raise AppError("VALIDATION")
        data = validate_section(body.section, body.data)
        persp = perspective(profile, which)
        before = persp["sections"].get(body.section)
        stamps = persp["entered"].get(body.section)
        if not isinstance(stamps, list):
            stamps = []
        if before != data or not stamps:
            persp["sections"][body.section] = data
            stamps.append({
                "by": str(user.id),
                "by_name": user.name,
                "role": user.role,
                "reported_by": which,
                "at": iso(now),
            })
            persp["entered"][body.section] = stamps
            _set_perspective(profile, which, persp)
            recompute_lists(profile, user.id, now)
            audit(db, user, "profile.section_update", "child_profile", profile.id, child_id=child.id,
                  section=body.section, perspective=which)

    if staff:
        if body.wizard_step is not None:
            profile.wizard_step = body.wizard_step
        if body.complete and profile.wizard_completed_at is None:
            profile.wizard_completed_at = now
    elif body.wizard_step is not None or body.complete:
        persp = perspective(profile, "parent")
        wizard = dict(persp.get("wizard") or {})
        if body.wizard_step is not None:
            wizard["step"] = body.wizard_step
        if body.complete and not wizard.get("completed_at"):
            wizard["completed_at"] = iso(now)
        persp["wizard"] = wizard
        _set_perspective(profile, "parent", persp)

    db.flush()
    out = profile_out(db, user, child, profile)
    db.commit()
    return out
