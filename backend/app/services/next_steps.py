"""Suggested next steps per active Current Focus (Observe → Reflect → Adapt), staff only.

``GET /api/children/{id}/next-steps`` explains, for each active focus area, what was recorded lately
and what could come next. It is a deterministic rule, not an AI call, and it never changes anything:
the teacher decides and creates the content herself (the suggestion only pre-fills Create content).

Facts and suggestions are kept apart:

- ``facts``: the newest (at most 4) things recorded for the focus, each with who reported it:
  ``teacher_feedback`` (content feedback result), ``home_reflection`` (a parent's result on shared
  content; parent-reported) and ``observation`` (quick or session observations: support level).
  Never a free text, a count or a score.
- ``signal``: from the newest fact that has a result or support level:
  worked_well / independent → ``build``; partly / some_support → ``repeat``;
  did_not_work / significant_support → ``smaller_step``; nothing yet → ``start``.
- ``suggestions``: content types to create next in growth_support mode for this focus (the UI explains
  each signal in plain words), plus up to 3 published library items whose goals include the focus
  suggestion key.

Response::

    {focus_areas: [{focus_area_id, title, category, suggestion_key, signal,
                    facts: [{kind, at, result, support_level, content_title, content_type, reported_by}],
                    suggestions: [{content_type, mode}],
                    library: [{id, title, content_type, language}]}]}
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ContentFeedback,
    FocusArea,
    GeneratedContent,
    HomeReflection,
    LibraryCollection,
    LibraryItem,
    Observation,
    User,
)
from app.services.observations import staff_child

MAX_FACTS = 4
MAX_LIBRARY = 3
SIGNAL_BY_RESULT = {"worked_well": "build", "partly": "repeat", "did_not_work": "smaller_step"}
SIGNAL_BY_SUPPORT = {"independent": "build", "some_support": "repeat", "significant_support": "smaller_step"}
SUGGESTED_TYPES = {
    "start": ("story", "home_activity"),
    "build": ("digital_game", "home_activity"),
    "repeat": ("real_world_activity", "home_activity"),
    "smaller_step": ("story", "real_world_activity"),
}


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def _fact(kind: str, at, *, result=None, support_level=None, content=None, reported_by="teacher") -> dict:
    return {
        "kind": kind,
        "at": at,
        "result": result,
        "support_level": support_level,
        "content_title": content.title if content is not None else None,
        "content_type": content.content_type if content is not None else None,
        "reported_by": reported_by,
    }


def _facts(db: Session, focus: FocusArea) -> list[dict]:
    n = MAX_FACTS
    facts = [
        _fact("teacher_feedback", fb.created_at, result=fb.result, content=c)
        for fb, c in db.execute(
            select(ContentFeedback, GeneratedContent)
            .join(GeneratedContent, GeneratedContent.id == ContentFeedback.content_id)
            .where(GeneratedContent.focus_area_id == focus.id)
            .order_by(ContentFeedback.created_at.desc()).limit(n)
        ).all()
    ]
    facts += [
        _fact("home_reflection", r.created_at, result=r.result, content=c, reported_by="parent")
        for r, c in db.execute(
            select(HomeReflection, GeneratedContent)
            .join(GeneratedContent, GeneratedContent.id == HomeReflection.content_id)
            .where(GeneratedContent.focus_area_id == focus.id)
            .order_by(HomeReflection.created_at.desc()).limit(n)
        ).all()
    ]
    # Feedback already appears above through its own row; its mirrored observation is left out here.
    facts += [
        _fact("observation", o.observed_at, support_level=o.support_level)
        for o in db.scalars(
            select(Observation)
            .where(Observation.focus_area_id == focus.id, Observation.source != "content_feedback")
            .order_by(Observation.observed_at.desc()).limit(n)
        ).all()
    ]
    facts.sort(key=lambda f: f["at"], reverse=True)
    return facts[:n]


def signal_of(facts: list[dict]) -> str:
    for f in facts:
        if f["result"] in SIGNAL_BY_RESULT:
            return SIGNAL_BY_RESULT[f["result"]]
        if f["support_level"] in SIGNAL_BY_SUPPORT:
            return SIGNAL_BY_SUPPORT[f["support_level"]]
    return "start"


def _library(db: Session, key: str | None) -> list[dict]:
    if not key:
        return []
    rows = db.scalars(
        select(LibraryItem)
        .join(LibraryCollection, LibraryCollection.id == LibraryItem.collection_id)
        .where(LibraryItem.status == "published", LibraryCollection.status == "published",
               LibraryItem.goals.contains([{"key": key}]))
        .order_by(LibraryItem.sort_order, LibraryItem.title).limit(MAX_LIBRARY)
    ).all()
    return [{"id": str(i.id), "title": i.title, "content_type": i.content_type, "language": i.language} for i in rows]


def next_steps(db: Session, user: User, child_id) -> dict:
    child = staff_child(db, user, child_id)
    focus_rows = db.scalars(
        select(FocusArea).where(FocusArea.child_id == child.id, FocusArea.status == "active")
        .order_by(FocusArea.created_at, FocusArea.id)
    ).all()
    out = []
    for focus in focus_rows:
        facts = _facts(db, focus)
        signal = signal_of(facts)
        out.append({
            "focus_area_id": str(focus.id),
            "title": focus.title,
            "category": focus.category,
            "suggestion_key": focus.suggestion_key,
            "signal": signal,
            "facts": [{**f, "at": _iso(f["at"])} for f in facts],
            "suggestions": [{"content_type": t, "mode": "growth_support"} for t in SUGGESTED_TYPES[signal]],
            "library": _library(db, focus.suggestion_key),
        })
    return {"focus_areas": out}
