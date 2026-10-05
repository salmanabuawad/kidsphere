"""Development timeline (spec §22, PLAN-ADJUSTMENTS B5, A6).

One chronological list, newest first, built from:

- observations: ``source=quick`` → ``observation``; ``source=content_feedback``
  → ``content_feedback``, joined to its generated_content title and to the
  content_feedback ``result`` via ``content_feedback.observation_id``.
  content_feedback rows are never listed on their own, so one feedback is
  exactly one entry.
- baselines → ``baseline``
- focus areas → ``focus_opened`` (created_at) and ``focus_closed`` (closed_at,
  status paused or completed)
- generated content approved or completed → ``content_approved`` (approved_at)
- development reviews → ``review``

Pagination is limit/offset ("Load older"). Each source is read in the same
order (at DESC, id DESC) up to offset+limit+1 rows and the sources are merged,
which gives exactly the same page as one big UNION would.

Entry JSON (absent fields are null)::

    {type, at, id, title, text, support_level, result, status, context, area,
     content_id, content_title, content_type, focus_area_id, focus_area_title,
     by_name}

No counts, percentages or scores are ever returned (spec §26).
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Baseline,
    ContentFeedback,
    DevelopmentReview,
    FocusArea,
    GeneratedContent,
    Observation,
    User,
)
from app.services.observations import staff_child

DEFAULT_LIMIT = 30
MAX_LIMIT = 100

ENTRY_FIELDS = ("title", "text", "support_level", "result", "status", "context", "area", "content_id",
                "content_title", "content_type", "focus_area_id", "focus_area_title")


def _entry(type_: str, at, id_, by=None, **fields) -> dict:
    out = {"type": type_, "at": at, "id": str(id_), "_by": by}
    for name in ENTRY_FIELDS:
        value = fields.get(name)
        out[name] = str(value) if name.endswith("_id") and value is not None else value
    return out


def _observations(db: Session, child_id, n: int) -> list[dict]:
    result = (
        select(ContentFeedback.result).where(ContentFeedback.observation_id == Observation.id)
        .order_by(ContentFeedback.created_at.desc()).limit(1).correlate(Observation).scalar_subquery()
    )
    stmt = (
        select(Observation, FocusArea.title, GeneratedContent.title, GeneratedContent.content_type, result)
        .outerjoin(FocusArea, FocusArea.id == Observation.focus_area_id)
        .outerjoin(GeneratedContent, GeneratedContent.id == Observation.content_id)
        .where(Observation.child_id == child_id)
        .order_by(Observation.observed_at.desc(), Observation.id.desc())
        .limit(n)
    )
    out = []
    for obs, focus_title, content_title, content_type, res in db.execute(stmt).all():
        feedback = obs.source == "content_feedback"
        out.append(_entry(
            "content_feedback" if feedback else "observation", obs.observed_at, obs.id, obs.created_by,
            text=obs.observation, support_level=obs.support_level, result=res if feedback else None,
            context=obs.context, area=obs.area, content_id=obs.content_id, content_title=content_title,
            content_type=content_type, focus_area_id=obs.focus_area_id, focus_area_title=focus_title,
        ))
    return out


def _baselines(db: Session, child_id, n: int) -> list[dict]:
    rows = db.scalars(
        select(Baseline).where(Baseline.child_id == child_id)
        .order_by(Baseline.created_at.desc(), Baseline.id.desc()).limit(n)
    ).all()
    return [_entry("baseline", r.created_at, r.id, r.created_by) for r in rows]


def _focus_opened(db: Session, child_id, n: int) -> list[dict]:
    rows = db.scalars(
        select(FocusArea).where(FocusArea.child_id == child_id)
        .order_by(FocusArea.created_at.desc(), FocusArea.id.desc()).limit(n)
    ).all()
    return [
        _entry("focus_opened", r.created_at, r.id, r.created_by, title=r.title, area=r.category,
               focus_area_id=r.id, focus_area_title=r.title)
        for r in rows
    ]


def _focus_closed(db: Session, child_id, n: int) -> list[dict]:
    rows = db.scalars(
        select(FocusArea)
        .where(FocusArea.child_id == child_id, FocusArea.closed_at.is_not(None), FocusArea.status.in_(("paused", "completed")))
        .order_by(FocusArea.closed_at.desc(), FocusArea.id.desc()).limit(n)
    ).all()
    return [
        _entry("focus_closed", r.closed_at, r.id, None, title=r.title, status=r.status, area=r.category,
               focus_area_id=r.id, focus_area_title=r.title, text=r.close_reason)
        for r in rows
    ]


def _content(db: Session, child_id, n: int) -> list[dict]:
    stmt = (
        select(GeneratedContent, FocusArea.title)
        .outerjoin(FocusArea, FocusArea.id == GeneratedContent.focus_area_id)
        .where(GeneratedContent.child_id == child_id, GeneratedContent.approved_at.is_not(None),
               GeneratedContent.status.in_(("approved", "completed")))
        .order_by(GeneratedContent.approved_at.desc(), GeneratedContent.id.desc()).limit(n)
    )
    return [
        _entry("content_approved", c.approved_at, c.id, c.approved_by, title=c.title, status=c.status,
               content_id=c.id, content_title=c.title, content_type=c.content_type,
               focus_area_id=c.focus_area_id, focus_area_title=focus_title)
        for c, focus_title in db.execute(stmt).all()
    ]


def _reviews(db: Session, child_id, n: int) -> list[dict]:
    rows = db.scalars(
        select(DevelopmentReview).where(DevelopmentReview.child_id == child_id)
        .order_by(DevelopmentReview.created_at.desc(), DevelopmentReview.id.desc()).limit(n)
    ).all()
    return [_entry("review", r.created_at, r.id, r.created_by, text=r.summary) for r in rows]


SOURCES = (_observations, _baselines, _focus_opened, _focus_closed, _content, _reviews)


def get_timeline(db: Session, user, child_id, limit: int = DEFAULT_LIMIT, offset: int = 0) -> dict:
    child = staff_child(db, user, child_id)
    n = offset + limit + 1
    merged = [e for source in SOURCES for e in source(db, child.id, n)]
    merged.sort(key=lambda e: (e["at"], e["id"], e["type"]), reverse=True)
    page = merged[offset:offset + limit]

    user_ids = {e["_by"] for e in page if e["_by"] is not None}
    names = dict(db.execute(select(User.id, User.name).where(User.id.in_(user_ids))).all()) if user_ids else {}
    entries = []
    for e in page:
        by = e.pop("_by")
        e["at"] = e["at"].isoformat()
        e["by_name"] = names.get(by)
        entries.append(e)
    return {"entries": entries, "limit": limit, "offset": offset, "has_more": len(merged) > offset + limit}
