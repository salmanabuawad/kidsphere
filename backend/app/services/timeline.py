"""Development timeline (spec §22, PLAN-ADJUSTMENTS B5, A6; COVERAGE-MATRIX X-20, X-21, X-34, §4.5).

One chronological list, newest first, built from:

- observations: ``source=quick`` → ``observation``; ``source=content_feedback``
  → ``content_feedback``, joined to its generated_content title/type and to the
  content_feedback ``result`` via ``content_feedback.observation_id``.
  content_feedback rows are never listed on their own, so one feedback is
  exactly one entry (B5).
- baselines → ``baseline``
- the parent questionnaire → ``questionnaire_submitted`` (each distinct
  submission: ``record_versions`` key ``parent:_questionnaire`` with
  status=submitted, plus ``parent_perspective.questionnaire`` itself, which
  also covers migrated questionnaires)
- focus areas (= plan goals) → ``focus_opened`` (created_at); and from their
  ``record_versions`` history: ``focus_closed`` for every version that closed
  the goal (active → paused/completed, or paused ↔ completed), so a goal that
  was closed, reopened and closed again keeps both closures (X-21), and
  ``plan_changed`` for every version that changed title, description,
  category, plan or follow-up date, or reopened the goal (``changes`` lists the
  fields; "status" means reopened). A closed goal without any version history
  falls back to its row (closed_at / close_reason).
- generated content approved or completed → ``content_approved`` (approved_at)
- development reviews → ``review``
- approved functional summaries → ``summary_approved`` (approved_at)
- closed teacher observation cycles → ``assessment_closed`` (closed_at)

Filters (all optional, combined with AND; X-34, no BI). Each source is filtered
in its own query before the merge, so pagination stays exact:

- ``date_from`` / ``date_to``: the entry's date (UTC) is within [from, to].
- ``type``: only these entry types (repeat the parameter).
- ``focus_area_id``: entries about that goal: its observations and feedback,
  its focus_opened / plan_changed / focus_closed, content made for it, and
  reviews that reviewed it. Other entry types are left out.
- ``domain`` (one of the 12 AI domains): observations and feedback whose
  ``domains`` include it, or whose area / focus category maps to it (the 0002
  area → domain map); focus entries and content approved for a focus whose
  category maps to it. Other entry types are left out.
- ``content_type``: content_approved and content_feedback for content of that
  type. Other entry types are left out.
- ``result``: content_feedback with that result. Other entry types are left out.

Pagination is limit/offset ("Load older"). Each source returns up to
offset+limit+1 rows in the same order (at DESC, id DESC) and the sources are
merged, which gives exactly the same page as one big UNION would.

Entry JSON (absent fields are null)::

    {type, at, id, title, text, support_level, result, status, context, area,
     content_id, content_title, content_type, focus_area_id, focus_area_title,
     changes, via, by_name}

``status`` is the focus status (focus_*/plan_changed), the content status
(content_approved), the entry mode self|on_behalf|meeting
(questionnaire_submitted), the summary source manual|ai_draft
(summary_approved) or the cycle kind initial|reassessment (assessment_closed).
``via`` is how a goal changed (manual | review | status | backfill …).

No counts, percentages or scores are ever returned (spec §26).
"""
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import (
    Baseline,
    ChildProfile,
    ContentFeedback,
    DevelopmentReview,
    FocusArea,
    FunctionalSummary,
    GeneratedContent,
    Observation,
    RecordVersion,
    TeacherAssessment,
    User,
)
from app.services.observations import staff_child

DEFAULT_LIMIT = 30
MAX_LIMIT = 100

ENTRY_TYPES = (
    "baseline", "questionnaire_submitted", "focus_opened", "plan_changed", "focus_closed", "observation",
    "content_feedback", "content_approved", "review", "summary_approved", "assessment_closed",
)

ENTRY_FIELDS = ("title", "text", "support_level", "result", "status", "context", "area", "content_id",
                "content_title", "content_type", "focus_area_id", "focus_area_title", "changes", "via")

# Which entry types a filter keeps (the others are left out while it is set).
FOCUS_TYPES = frozenset({"observation", "content_feedback", "content_approved", "focus_opened", "plan_changed",
                         "focus_closed", "review"})
DOMAIN_TYPES = frozenset({"observation", "content_feedback", "content_approved", "focus_opened", "plan_changed",
                          "focus_closed"})
CONTENT_TYPES = frozenset({"content_feedback", "content_approved"})

# Focus category / observation area (priority_categories) -> AI domains: the map
# migration 0002 used to backfill observations.domains.
CATEGORY_DOMAINS = {
    "emotional": ("emotional",),
    "social": ("social",),
    "language": ("language",),
    "communication": ("communication",),
    "attention": ("executive_function",),
    "motor": ("gross_motor", "fine_motor"),
    "independence": ("independence",),
    "learning": ("cognitive",),
    "transitions": ("daily_routine",),
    "confidence": ("emotional",),
}

CLOSED_STATUSES = ("paused", "completed")
# A focus version that changes one of these is a plan change (D15: goal, method,
# frequency, responsible, success indicator, follow-up date).
PLAN_FIELDS = ("title", "description", "category", "plan", "follow_up_on")


def categories_for(domain: str) -> tuple[str, ...]:
    """The focus categories / observation areas that map to an AI domain."""
    return tuple(c for c, domains in CATEGORY_DOMAINS.items() if domain in domains)


@dataclass(frozen=True)
class Filters:
    date_from: date | None = None
    date_to: date | None = None
    focus_area_id: uuid.UUID | None = None
    domain: str | None = None
    content_type: str | None = None
    result: str | None = None
    types: frozenset[str] | None = None

    @property
    def start(self) -> datetime | None:
        return datetime.combine(self.date_from, time.min, timezone.utc) if self.date_from else None

    @property
    def end(self) -> datetime | None:
        """Exclusive upper bound: the start of the day after date_to."""
        return datetime.combine(self.date_to + timedelta(days=1), time.min, timezone.utc) if self.date_to else None

    def keeps(self, type_: str) -> bool:
        """Whether entries of this type can match at all."""
        if self.types is not None and type_ not in self.types:
            return False
        if self.result is not None and type_ != "content_feedback":
            return False
        if self.content_type is not None and type_ not in CONTENT_TYPES:
            return False
        if self.focus_area_id is not None and type_ not in FOCUS_TYPES:
            return False
        if self.domain is not None and type_ not in DOMAIN_TYPES:
            return False
        return True

    def in_range(self, at: datetime | None) -> bool:
        if at is None:
            return False
        return (self.start is None or at >= self.start) and (self.end is None or at < self.end)

    def range_conds(self, column) -> list:
        conds = []
        if self.start is not None:
            conds.append(column >= self.start)
        if self.end is not None:
            conds.append(column < self.end)
        return conds

    def category_ok(self, category: str | None) -> bool:
        return self.domain is None or category in categories_for(self.domain)


def make_filters(*, date_from=None, date_to=None, focus_area_id=None, domain=None, content_type=None, result=None,
                 types=None) -> Filters:
    if date_from and date_to and date_from > date_to:
        raise AppError("VALIDATION", details=[{"path": "date_from", "message": "The start date is after the end date."}])
    return Filters(date_from=date_from, date_to=date_to, focus_area_id=focus_area_id, domain=domain,
                   content_type=content_type, result=result, types=frozenset(types) if types else None)


# --------------------------------------------------------------------------- helpers


def _entry(type_: str, at, id_, by=None, by_name=None, **fields) -> dict:
    out = {"type": type_, "at": at, "id": str(id_), "_by": by, "_by_name": by_name}
    for name in ENTRY_FIELDS:
        value = fields.get(name)
        out[name] = str(value) if name.endswith("_id") and value is not None else value
    return out


def _parse_dt(value) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _uuid(value) -> uuid.UUID | None:
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _newest(entries: list[dict], n: int) -> list[dict]:
    entries.sort(key=lambda e: (e["at"], e["id"]), reverse=True)
    return entries[:n]


# --------------------------------------------------------------------------- sources


def _observations(db: Session, child_id, n: int, f: Filters) -> list[dict]:
    want_obs, want_fb = f.keeps("observation"), f.keeps("content_feedback")
    if not (want_obs or want_fb):
        return []
    result = (
        select(ContentFeedback.result).where(ContentFeedback.observation_id == Observation.id)
        .order_by(ContentFeedback.created_at.desc()).limit(1).correlate(Observation).scalar_subquery()
    )
    stmt = (
        select(Observation, FocusArea.title, GeneratedContent.title, GeneratedContent.content_type, result)
        .outerjoin(FocusArea, FocusArea.id == Observation.focus_area_id)
        .outerjoin(GeneratedContent, GeneratedContent.id == Observation.content_id)
        .where(Observation.child_id == child_id, *f.range_conds(Observation.observed_at))
    )
    if not want_obs:
        stmt = stmt.where(Observation.source == "content_feedback")
    elif not want_fb:
        stmt = stmt.where(Observation.source != "content_feedback")
    if f.focus_area_id is not None:
        stmt = stmt.where(Observation.focus_area_id == f.focus_area_id)
    if f.domain is not None:
        cats = categories_for(f.domain)
        stmt = stmt.where(or_(Observation.domains.contains([f.domain]), Observation.area.in_(cats),
                              FocusArea.category.in_(cats)))
    if f.content_type is not None:
        stmt = stmt.where(GeneratedContent.content_type == f.content_type)
    if f.result is not None:
        stmt = stmt.where(result == f.result)
    stmt = stmt.order_by(Observation.observed_at.desc(), Observation.id.desc()).limit(n)
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


def _baselines(db: Session, child_id, n: int, f: Filters) -> list[dict]:
    if not f.keeps("baseline"):
        return []
    rows = db.scalars(
        select(Baseline).where(Baseline.child_id == child_id, *f.range_conds(Baseline.created_at))
        .order_by(Baseline.created_at.desc(), Baseline.id.desc()).limit(n)
    ).all()
    return [_entry("baseline", r.created_at, r.id, r.created_by) for r in rows]


def _questionnaire(db: Session, child_id, n: int, f: Filters) -> list[dict]:
    """Each distinct submission of the parent questionnaire (by submitted_at)."""
    if not f.keeps("questionnaire_submitted"):
        return []
    found: dict[datetime, dict] = {}
    versions = db.scalars(
        select(RecordVersion).where(RecordVersion.child_id == child_id, RecordVersion.entity_type == "profile_section",
                                    RecordVersion.entity_key == "parent:_questionnaire")
        .order_by(RecordVersion.seq)
    ).all()
    for rv in versions:
        data = rv.data if isinstance(rv.data, dict) else {}
        at = _parse_dt(data.get("submitted_at")) if data.get("status") == "submitted" else None
        if at is not None and at not in found:
            by = _uuid(data.get("submitted_by")) or rv.changed_by
            found[at] = _entry("questionnaire_submitted", at, rv.id, by,
                               None if _uuid(data.get("submitted_by")) else rv.changed_by_name,
                               status=data.get("entry_mode"))
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child_id)).first()
    pp = profile.parent_perspective if profile is not None and isinstance(profile.parent_perspective, dict) else {}
    q = pp.get("questionnaire") if isinstance(pp.get("questionnaire"), dict) else {}
    at = _parse_dt(q.get("submitted_at")) if q.get("status") == "submitted" else None
    if at is not None and at not in found:
        found[at] = _entry("questionnaire_submitted", at, profile.id, _uuid(q.get("submitted_by")),
                           status=q.get("entry_mode"))
    return _newest([e for e in found.values() if f.in_range(e["at"])], n)


def _focus_opened(db: Session, child_id, n: int, f: Filters) -> list[dict]:
    if not f.keeps("focus_opened"):
        return []
    stmt = select(FocusArea).where(FocusArea.child_id == child_id, *f.range_conds(FocusArea.created_at))
    if f.focus_area_id is not None:
        stmt = stmt.where(FocusArea.id == f.focus_area_id)
    if f.domain is not None:
        stmt = stmt.where(FocusArea.category.in_(categories_for(f.domain)))
    rows = db.scalars(stmt.order_by(FocusArea.created_at.desc(), FocusArea.id.desc()).limit(n)).all()
    return [
        _entry("focus_opened", r.created_at, r.id, r.created_by, title=r.title, area=r.category,
               focus_area_id=r.id, focus_area_title=r.title)
        for r in rows
    ]


def _focus_history(db: Session, child_id, n: int, f: Filters) -> list[dict]:
    """focus_closed and plan_changed entries from the focus areas' record_versions."""
    want_closed, want_changed = f.keeps("focus_closed"), f.keeps("plan_changed")
    if not (want_closed or want_changed):
        return []
    focus_stmt = select(FocusArea).where(FocusArea.child_id == child_id)
    rv_stmt = select(RecordVersion).where(RecordVersion.child_id == child_id, RecordVersion.entity_type == "focus_area")
    if f.focus_area_id is not None:
        focus_stmt = focus_stmt.where(FocusArea.id == f.focus_area_id)
        rv_stmt = rv_stmt.where(RecordVersion.entity_id == f.focus_area_id)
    focus = {r.id: r for r in db.scalars(focus_stmt).all()}
    history: dict[uuid.UUID, list[RecordVersion]] = {}
    for rv in db.scalars(rv_stmt.order_by(RecordVersion.entity_id, RecordVersion.seq, RecordVersion.id)).all():
        history.setdefault(rv.entity_id, []).append(rv)

    out = []
    for fid in set(focus) | set(history):
        row = focus.get(fid)
        current_title = row.title if row is not None else None
        closures: list[datetime] = []
        prev: dict | None = None
        for rv in history.get(fid, []):
            data = rv.data if isinstance(rv.data, dict) else {}
            status = data.get("status")
            category = data.get("category")
            fields = dict(title=data.get("title"), status=status, area=category, focus_area_id=fid,
                          focus_area_title=current_title or data.get("title"), via=rv.via)
            if status in CLOSED_STATUSES and (prev is None or prev.get("status") != status):
                at = _parse_dt(data.get("closed_at")) or rv.created_at
                closures.append(at)
                if want_closed and f.category_ok(category):
                    out.append(_entry("focus_closed", at, rv.id, rv.changed_by, rv.changed_by_name,
                                      text=data.get("close_reason"), **fields))
            if prev is not None:
                changes = [k for k in PLAN_FIELDS if data.get(k) != prev.get(k)]
                if status == "active" and prev.get("status") in CLOSED_STATUSES:
                    changes.append("status")
                if changes and want_changed and f.category_ok(category):
                    out.append(_entry("plan_changed", rv.created_at, rv.id, rv.changed_by, rv.changed_by_name,
                                      changes=changes, **fields))
            prev = data
        # A closure the history does not hold (no versions yet): take it from the row.
        if (row is not None and want_closed and row.status in CLOSED_STATUSES and row.closed_at is not None
                and row.closed_at not in closures and f.category_ok(row.category)):
            out.append(_entry("focus_closed", row.closed_at, row.id, None, text=row.close_reason, title=row.title,
                              status=row.status, area=row.category, focus_area_id=row.id,
                              focus_area_title=row.title))
    return _newest([e for e in out if f.in_range(e["at"])], n)


def _content(db: Session, child_id, n: int, f: Filters) -> list[dict]:
    if not f.keeps("content_approved"):
        return []
    stmt = (
        select(GeneratedContent, FocusArea.title)
        .outerjoin(FocusArea, FocusArea.id == GeneratedContent.focus_area_id)
        .where(GeneratedContent.child_id == child_id, GeneratedContent.approved_at.is_not(None),
               GeneratedContent.status.in_(("approved", "completed")), *f.range_conds(GeneratedContent.approved_at))
    )
    if f.focus_area_id is not None:
        stmt = stmt.where(GeneratedContent.focus_area_id == f.focus_area_id)
    if f.domain is not None:
        stmt = stmt.where(FocusArea.category.in_(categories_for(f.domain)))
    if f.content_type is not None:
        stmt = stmt.where(GeneratedContent.content_type == f.content_type)
    stmt = stmt.order_by(GeneratedContent.approved_at.desc(), GeneratedContent.id.desc()).limit(n)
    return [
        _entry("content_approved", c.approved_at, c.id, c.approved_by, title=c.title, status=c.status,
               content_id=c.id, content_title=c.title, content_type=c.content_type,
               focus_area_id=c.focus_area_id, focus_area_title=focus_title)
        for c, focus_title in db.execute(stmt).all()
    ]


def _reviews(db: Session, child_id, n: int, f: Filters) -> list[dict]:
    if not f.keeps("review"):
        return []
    stmt = select(DevelopmentReview).where(DevelopmentReview.child_id == child_id,
                                           *f.range_conds(DevelopmentReview.created_at))
    if f.focus_area_id is not None:
        stmt = stmt.where(DevelopmentReview.focus_review.contains([{"focus_area_id": str(f.focus_area_id)}]))
    rows = db.scalars(stmt.order_by(DevelopmentReview.created_at.desc(), DevelopmentReview.id.desc()).limit(n)).all()
    return [_entry("review", r.created_at, r.id, r.created_by, text=r.summary) for r in rows]


def _summaries(db: Session, child_id, n: int, f: Filters) -> list[dict]:
    if not f.keeps("summary_approved"):
        return []
    rows = db.scalars(
        select(FunctionalSummary)
        .where(FunctionalSummary.child_id == child_id, FunctionalSummary.status == "approved",
               FunctionalSummary.approved_at.is_not(None), *f.range_conds(FunctionalSummary.approved_at))
        .order_by(FunctionalSummary.approved_at.desc(), FunctionalSummary.id.desc()).limit(n)
    ).all()
    return [_entry("summary_approved", r.approved_at, r.id, r.approved_by, text=r.general_description,
                   status=r.source) for r in rows]


def _assessments(db: Session, child_id, n: int, f: Filters) -> list[dict]:
    if not f.keeps("assessment_closed"):
        return []
    rows = db.scalars(
        select(TeacherAssessment)
        .where(TeacherAssessment.child_id == child_id, TeacherAssessment.status == "closed",
               TeacherAssessment.closed_at.is_not(None), *f.range_conds(TeacherAssessment.closed_at))
        .order_by(TeacherAssessment.closed_at.desc(), TeacherAssessment.id.desc()).limit(n)
    ).all()
    return [_entry("assessment_closed", r.closed_at, r.id, r.closed_by, status=r.kind) for r in rows]


SOURCES = (_observations, _baselines, _questionnaire, _focus_opened, _focus_history, _content, _reviews,
           _summaries, _assessments)


def get_timeline(db: Session, user, child_id, limit: int = DEFAULT_LIMIT, offset: int = 0,
                 filters: Filters | None = None) -> dict:
    child = staff_child(db, user, child_id)
    f = filters or Filters()
    n = offset + limit + 1
    merged = [e for source in SOURCES for e in source(db, child.id, n, f)]
    merged.sort(key=lambda e: (e["at"], e["id"], e["type"]), reverse=True)
    page = merged[offset:offset + limit]

    user_ids = {e["_by"] for e in page if e["_by"] is not None and e["_by_name"] is None}
    names = dict(db.execute(select(User.id, User.name).where(User.id.in_(user_ids))).all()) if user_ids else {}
    entries = []
    for e in page:
        by, by_name = e.pop("_by"), e.pop("_by_name")
        e["at"] = e["at"].isoformat()
        e["by_name"] = by_name if by_name is not None else names.get(by)
        entries.append(e)
    return {"entries": entries, "limit": limit, "offset": offset, "has_more": len(merged) > offset + limit}
