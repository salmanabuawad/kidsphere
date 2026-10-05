"""Baselines (immutable snapshots) and the initial Current Understanding.

``POST /children/{id}/baseline`` always inserts a new row (PLAN-ADJUSTMENTS B13);
a DB trigger rejects UPDATE and direct DELETE. ``baseline_data``::

    {"basics": {name, preferred_name, birth_date, age{years, months}, gender,
                class_id, class_name, kindergarten, main_language, additional_languages},
     "parent_perspective": {sections, entered, wizard?},
     "teacher_perspective": {sections, entered},
     "strengths", "interests", "motivators", "what_helps", "sensitivities": [merged items],
     "support_needs": {
         "independence": [{area, level, reported_by}],        # levels other than independent
         "sensitivities": [{key|custom, what_happens, what_helps[], sources}],
         "emotions": {"parent": {...}, "teacher": {...}},    # reactions + what helps
         "parent_priorities": {categories[], note, hope_child_feels[], one_thing_to_know}},
     "focus_areas": [{id, category, suggestion_key, title, description, plan, status, created_at}],
     "wizard_completed_at", "created_by": {id, name, role}, "created_at"}

On the first baseline (no current understanding yet) ``child_profiles.current_understanding``
is initialised::

    {summary, strengths[], interests[], what_helps[], areas_for_support[],
     adaptations, next_steps, source: "baseline", baseline_id, created_at}
"""
import copy
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import vocab
from app.access import get_child_or_404
from app.audit import audit
from app.models import Baseline, Child, Class, FocusArea, User
from app.services.focus_areas import focus_out
from app.services.profiles import MERGED_LISTS, get_profile_row, iso, perspective
from app.sessions import utcnow

SUPPORT_NEED_LEVELS = ("some_support", "significant_support")
EMOTION_FIELDS = ("frustration_reactions", "transition_reaction", "morning_separation",
                  "calming_helps", "transition_helps", "helps_when_sad", "what_does_not_help")


def age_parts(birth: date, today: date | None = None) -> dict:
    today = today or date.today()
    years = today.year - birth.year
    months = today.month - birth.month
    if today.day < birth.day:
        months -= 1
    if months < 0:
        years -= 1
        months += 12
    if years < 0:
        return {"years": 0, "months": 0}
    return {"years": years, "months": months}


def _basics(db: Session, child: Child) -> dict:
    klass = db.get(Class, child.class_id) if child.class_id else None
    return {
        "name": child.name,
        "preferred_name": child.preferred_name,
        "birth_date": child.birth_date.isoformat(),
        "age": age_parts(child.birth_date),
        "gender": child.gender,
        "class_id": str(child.class_id) if child.class_id else None,
        "class_name": klass.name if klass else None,
        "kindergarten": klass.kindergarten if klass else None,
        "main_language": child.main_language,
        "additional_languages": list(child.additional_languages or []),
    }


def support_needs(parent_p: dict, teacher_p: dict, sensitivities: list) -> dict:
    independence = []
    emotions = {}
    for who, persp in (("parent", parent_p), ("teacher", teacher_p)):
        sections = persp.get("sections") or {}
        levels = (sections.get("independence") or {}).get("levels") or {}
        for area in vocab.keys("independence_areas"):
            level = levels.get(area)
            if level in SUPPORT_NEED_LEVELS:
                independence.append({"area": area, "level": level, "reported_by": who})
        em = sections.get("emotions") or {}
        picked = {k: copy.deepcopy(em[k]) for k in EMOTION_FIELDS if em.get(k)}
        if picked:
            emotions[who] = picked
    pr = (parent_p.get("sections") or {}).get("priorities") or {}
    return {
        "independence": independence,
        "sensitivities": copy.deepcopy(sensitivities or []),
        "emotions": emotions,
        "parent_priorities": {
            "categories": list(pr.get("parent_priorities") or []),
            "note": pr.get("priorities_note"),
            "hope_child_feels": list(pr.get("hope_child_feels") or []),
            "one_thing_to_know": pr.get("one_thing_to_know"),
        },
    }


def active_focus_rows(db: Session, child_id) -> list[FocusArea]:
    return list(db.scalars(
        select(FocusArea).where(FocusArea.child_id == child_id, FocusArea.status == "active").order_by(FocusArea.created_at)
    ))


# --------------------------------------------------------------------------- current understanding

_SUMMARY = {
    "en": {
        "interests": "{name} appears to enjoy {items}.",
        "strengths": "Strengths noticed so far include {items}.",
        "closing": "This first picture comes from what the family and the kindergarten shared; it will be refined through observations.",
        "helps": "What seems to help: {items}.",
        "next_focus": "Observe {name} in everyday moments connected to the current focus: {items}.",
        "next_none": "Keep observing {name} in everyday moments to learn what helps most.",
        "and": " and ",
        "sep": ", ",
    },
    "ar": {
        "interests": "من الاهتمامات التي لوحظت لدى {name}: {items}.",
        "strengths": "ومن مواطن القوة التي لوحظت حتى الآن: {items}.",
        "closing": "هذه الصورة الأولى مبنية على ما شاركته العائلة والروضة، وستتضح أكثر من خلال الملاحظات.",
        "helps": "ما يبدو أنه يساعد: {items}.",
        "next_focus": "متابعة {name} في المواقف اليومية المرتبطة بالتركيز الحالي: {items}.",
        "next_none": "مواصلة ملاحظة {name} في المواقف اليومية لمعرفة ما يساعد أكثر.",
        "and": " و",
        "sep": "، ",
    },
    "he": {
        "interests": "תחומי עניין שבולטים אצל {name}: {items}.",
        "strengths": "חוזקות שנראו עד כה: {items}.",
        "closing": "התמונה הראשונית הזו מבוססת על מה שהמשפחה והגן שיתפו, והיא תתעדכן בעזרת תצפיות.",
        "helps": "מה שנראה שעוזר: {items}.",
        "next_focus": "להתבונן ב{name} ברגעים יומיומיים הקשורים למיקוד הנוכחי: {items}.",
        "next_none": "להמשיך להתבונן ב{name} ברגעים יומיומיים כדי ללמוד מה עוזר יותר.",
        "and": " ו",
        "sep": ", ",
    },
}

LABEL_LISTS = {"strengths": ("strengths",), "interests": ("interests",)}


def _label(item: dict, lists: tuple[str, ...], lang: str) -> str | None:
    if item.get("custom"):
        return item["custom"]
    key = item.get("key")
    if not key:
        return None
    for list_name in ((item["list"],) if item.get("list") else ()) + lists:
        try:
            if vocab.is_valid(list_name, key):
                return vocab.label(list_name, key, lang)
        except KeyError:
            continue
    return key


def _join(labels: list[str], words: dict) -> str:
    labels = [x for x in labels if x]
    if len(labels) <= 1:
        return "".join(labels)
    return words["sep"].join(labels[:-1]) + words["and"] + labels[-1]


def _strip_item(item: dict) -> dict:
    out = {"key": item["key"]} if item.get("key") else {"custom": item.get("custom")}
    if item.get("list"):
        out["list"] = item["list"]
    return out


def initial_understanding(child: Child, profile, focus_rows: list[FocusArea], lang: str, baseline_id, now) -> dict:
    words = _SUMMARY.get(lang) or _SUMMARY["en"]
    name = (child.preferred_name or "").strip() or (child.name or "").split(" ")[0]
    strengths = [i for i in (profile.strengths or []) if isinstance(i, dict)][:5]
    interests = [i for i in (profile.interests or []) if isinstance(i, dict)][:5]
    helps = [i for i in (profile.what_helps or []) if isinstance(i, dict)][:5]
    help_lists = ("what_helps", "calming_helps", "transition_helps", "sensitivity_helps", "sad_helps")

    parts = []
    if interests:
        parts.append(words["interests"].format(name=name, items=_join([_label(i, ("interests",), lang) for i in interests], words)))
    if strengths:
        parts.append(words["strengths"].format(items=_join([_label(i, ("strengths",), lang) for i in strengths], words)))
    parts.append(words["closing"])
    adaptations = words["helps"].format(items=_join([_label(i, help_lists, lang) for i in helps], words)) if helps else None
    titles = [f.title for f in focus_rows]
    next_steps = (words["next_focus"].format(name=name, items=_join(titles, words)) if titles
                  else words["next_none"].format(name=name))
    return {
        "summary": " ".join(parts),
        "strengths": [_strip_item(i) for i in strengths],
        "interests": [_strip_item(i) for i in interests],
        "what_helps": [_strip_item(i) for i in helps],
        "areas_for_support": titles,
        "adaptations": adaptations,
        "next_steps": next_steps,
        "source": "baseline",
        "baseline_id": str(baseline_id),
        "created_at": iso(now),
    }


# --------------------------------------------------------------------------- endpoints


def _user_ref(db: Session, user_id) -> dict | None:
    if user_id is None:
        return None
    u = db.get(User, user_id)
    return {"id": str(user_id), "name": u.name if u else None}


def baseline_out(db: Session, row: Baseline) -> dict:
    return {
        "id": str(row.id),
        "child_id": str(row.child_id),
        "created_at": iso(row.created_at),
        "created_by": _user_ref(db, row.created_by),
        "baseline_data": row.baseline_data,
    }


def build_baseline_data(db: Session, user: User, child: Child, profile, focus_rows, now) -> dict:
    parent_p = perspective(profile, "parent")
    teacher_p = perspective(profile, "teacher")
    lists = {name: copy.deepcopy(getattr(profile, name) or []) for name in MERGED_LISTS}
    return {
        "basics": _basics(db, child),
        "parent_perspective": parent_p,
        "teacher_perspective": teacher_p,
        **lists,
        "support_needs": support_needs(parent_p, teacher_p, lists["sensitivities"]),
        "focus_areas": [
            {k: v for k, v in focus_out(f).items() if k in ("id", "category", "suggestion_key", "title", "description", "plan", "status", "created_at")}
            for f in focus_rows
        ],
        "wizard_completed_at": iso(profile.wizard_completed_at or now),
        "created_by": {"id": str(user.id), "name": user.name, "role": user.role},
        "created_at": iso(now),
    }


def create_baseline(db: Session, user: User, child_id) -> dict:
    child = get_child_or_404(db, user, child_id, write=True)
    profile = get_profile_row(db, child.id, lock=True)
    now = utcnow()
    focus_rows = active_focus_rows(db, child.id)
    data = build_baseline_data(db, user, child, profile, focus_rows, now)
    row = Baseline(child_id=child.id, baseline_data=data, created_by=user.id)
    db.add(row)
    db.flush()
    if profile.wizard_completed_at is None:
        profile.wizard_completed_at = now
    if not profile.current_understanding:
        profile.current_understanding = initial_understanding(child, profile, focus_rows, user.language or "en", row.id, now)
    audit(db, user, "baseline.create", "baseline", row.id, child_id=child.id)
    db.flush()
    db.refresh(row)
    out = baseline_out(db, row)
    db.commit()
    return out


def list_baselines(db: Session, child_id) -> list[Baseline]:
    return list(db.scalars(
        select(Baseline).where(Baseline.child_id == child_id).order_by(Baseline.created_at.desc(), Baseline.id)
    ))


def get_baselines(db: Session, user: User, child_id) -> dict:
    child = get_child_or_404(db, user, child_id, write=True)
    rows = list_baselines(db, child.id)
    return {
        "latest": baseline_out(db, rows[0]) if rows else None,
        "earlier": [
            {"id": str(r.id), "created_at": iso(r.created_at), "created_by": _user_ref(db, r.created_by)}
            for r in rows[1:]
        ],
    }


def baseline_summary(data: dict) -> dict:
    return {
        "strengths": data.get("strengths") or [],
        "interests": data.get("interests") or [],
        "what_helps": data.get("what_helps") or [],
        "support_needs": data.get("support_needs") or {},
        "focus_areas": data.get("focus_areas") or [],
    }


def get_current_understanding(db: Session, user: User, child_id) -> dict:
    child = get_child_or_404(db, user, child_id, write=True)
    profile = get_profile_row(db, child.id)
    rows = list_baselines(db, child.id)
    latest = rows[0] if rows else None
    out = {
        "current_understanding": profile.current_understanding,
        "baseline": {
            "id": str(latest.id),
            "created_at": iso(latest.created_at),
            "created_by": _user_ref(db, latest.created_by),
            "summary": baseline_summary(latest.baseline_data or {}),
        } if latest else None,
    }
    db.commit()
    return out
