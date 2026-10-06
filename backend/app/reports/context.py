"""Everything a report builder needs about one export: the child, the options,
the language and lazily loaded child data (read-only queries, no writes).

Builders read only the database tables of COVERAGE-MATRIX §3 and the static
registries (``app.vocab.source_registry``). Nothing here imports the AI package (app/ai).

    ctx = ReportContext(db, user, child, klass, request, lang)
    ctx.tr("markers.not_answered")
    ctx.label("support_levels", "independent")      option label in the report language
    ctx.option_label(["pq_interests"], "animals")   first list that knows the key, else None
    ctx.profile / ctx.parent_p / ctx.teacher_p      child_profiles row and normalised perspectives
    ctx.assessment(cycle_id=None)                   the teacher-observation cycle for R3
    ctx.latest_entries(assessment)                  {domain: TeacherAssessmentEntry}
    ctx.observations(date_from, date_to, limit)     observations with their focus/content titles
    ctx.user_names(ids)                             {id: name}
"""
from __future__ import annotations

import copy
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import vocab
from app.models import (
    Baseline,
    Child,
    ChildProfile,
    Class,
    ContentFeedback,
    DevelopmentReview,
    FocusArea,
    FunctionalSummary,
    GeneratedContent,
    Observation,
    RecordVersion,
    TeacherAssessment,
    TeacherAssessmentEntry,
    User,
)
from app.reports.i18n import LOCAL_TZ, Translator, to_date

# Hard caps that keep one report's memory bounded (a report is never paginated by the API).
MAX_OBSERVATIONS = 300
MAX_ROWS = 400


def local_start(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=LOCAL_TZ)


def local_end(d: date) -> datetime:
    """Exclusive end of the local day ``d``."""
    return datetime.combine(d + timedelta(days=1), time.min, tzinfo=LOCAL_TZ)


def age_parts(birth_date: date, on: date) -> tuple[int, int]:
    months = (on.year - birth_date.year) * 12 + (on.month - birth_date.month)
    if on.day < birth_date.day:
        months -= 1
    months = max(months, 0)
    return months // 12, months % 12


@dataclass
class ReportContext:
    db: Session
    user: User
    child: Child
    klass: Class | None
    request: object  # app.schemas.reports.ReportRequest
    lang: str
    today: date
    tr: Translator = field(init=False)
    _cache: dict = field(default_factory=dict, init=False, repr=False)

    def __post_init__(self):
        self.tr = Translator(self.lang)

    # ------------------------------------------------------------------ options and labels

    @property
    def opts(self):
        return self.request

    def label(self, list_name: str, key: str | None) -> str:
        if not key:
            return ""
        try:
            return vocab.label(list_name, key, self.lang)
        except KeyError:
            return self.fallback_label(list_name, key)

    def option_label(self, lists, key) -> str | None:
        """The label of ``key`` in the first of ``lists`` that has it, else None."""
        if not isinstance(key, str) or not key:
            return None
        for list_name in lists or ():
            try:
                found = vocab.item(list_name, key)
            except KeyError:
                continue
            if found is not None:
                return vocab.label(list_name, key, self.lang)
        return None

    def fallback_label(self, list_name: str, key: str) -> str:
        """Labels for lists that another package adds (lists/*.json) when they are not there yet."""
        msg = f"options.{list_name}.{key}"
        if self.tr.has(msg):
            return self.tr(msg)
        return key.replace("_", " ")

    def yes_no(self, value: bool) -> str:
        return self.label("yes_no", "yes" if value else "no") or self.tr("markers.yes" if value else "markers.no")

    def date(self, value) -> str:
        return self.tr.date(value)

    def item_text(self, item, lists=()) -> str | None:
        """A profile/baseline list item ({key}|{custom}|"key") as its label."""
        if isinstance(item, str):
            return self.option_label(lists, item) or item
        if not isinstance(item, dict):
            return None
        if item.get("key"):
            return self.option_label(lists, item["key"]) or self.fallback_label(lists[0] if lists else "", item["key"])
        custom = item.get("custom")
        return custom if isinstance(custom, str) and custom.strip() else None

    def registry(self, name: str):
        """The normalised source registry (app.reports.builders.registry.Registry), loaded once per export."""
        key = ("registry", name)
        if key not in self._cache:
            from app.reports.builders.registry import load

            self._cache[key] = load(name)
        return self._cache[key]

    # ------------------------------------------------------------------ child basics

    @property
    def display_name(self) -> str:
        return (self.child.preferred_name or self.child.name or "").strip()

    def age_text(self, on: date | None = None) -> str:
        years, months = age_parts(self.child.birth_date, on or self.today)
        return self.tr.age(years, months)

    def range(self, default_from: date | None = None, default_to: date | None = None) -> tuple[date | None, date | None]:
        r = self.request
        return (r.date_from or default_from, r.date_to or default_to)

    def range_text(self, date_from: date | None, date_to: date | None) -> str:
        if date_from and date_to:
            return self.tr("range.from_to", start=self.date(date_from), end=self.date(date_to))
        if date_from:
            return self.tr("range.since", start=self.date(date_from))
        if date_to:
            return self.tr("range.until", end=self.date(date_to))
        return self.tr("range.all")

    # ------------------------------------------------------------------ profile

    @property
    def profile(self) -> ChildProfile | None:
        if "profile" not in self._cache:
            self._cache["profile"] = self.db.scalars(
                select(ChildProfile).where(ChildProfile.child_id == self.child.id)).first()
        return self._cache["profile"]

    def _perspective(self, which: str) -> dict:
        raw = None
        if self.profile is not None:
            raw = self.profile.parent_perspective if which == "parent" else self.profile.teacher_perspective
        data = copy.deepcopy(raw) if isinstance(raw, dict) else {}
        for key in ("sections", "entered", "section_status", "questionnaire"):
            if not isinstance(data.get(key), dict):
                data[key] = {}
        return data

    @property
    def parent_p(self) -> dict:
        if "parent_p" not in self._cache:
            self._cache["parent_p"] = self._perspective("parent")
        return self._cache["parent_p"]

    @property
    def teacher_p(self) -> dict:
        if "teacher_p" not in self._cache:
            self._cache["teacher_p"] = self._perspective("teacher")
        return self._cache["teacher_p"]

    def merged_list(self, name: str) -> list:
        if self.profile is None:
            return []
        value = getattr(self.profile, name, None)
        return value if isinstance(value, list) else []

    # ------------------------------------------------------------------ people

    def user_names(self, ids) -> dict:
        wanted = {i for i in ids if i}
        known = self._cache.setdefault("names", {})
        missing = [i for i in wanted if i not in known]
        if missing:
            uuids = []
            for i in missing:
                try:
                    uuids.append(i if isinstance(i, uuid.UUID) else uuid.UUID(str(i)))
                except ValueError:
                    known[i] = None
            for uid, name in self.db.execute(select(User.id, User.name).where(User.id.in_(uuids))).all():
                known[uid] = name
                known[str(uid)] = name
        return {i: known.get(i) for i in wanted}

    def user_name(self, uid) -> str | None:
        if not uid:
            return None
        return self.user_names([uid]).get(uid)

    # ------------------------------------------------------------------ teacher observation cycles

    def assessments(self) -> list[TeacherAssessment]:
        if "assessments" not in self._cache:
            self._cache["assessments"] = list(self.db.scalars(
                select(TeacherAssessment).where(TeacherAssessment.child_id == self.child.id)
                .order_by(TeacherAssessment.filled_on, TeacherAssessment.created_at)))
        return self._cache["assessments"]

    def assessment(self) -> TeacherAssessment | None:
        """The cycle chosen in the request, else the open one, else the latest."""
        rows = self.assessments()
        wanted = getattr(self.request, "assessment_id", None)
        if wanted:
            return next((a for a in rows if a.id == wanted), None)
        open_rows = [a for a in rows if a.status == "open"]
        if open_rows:
            return open_rows[-1]
        return rows[-1] if rows else None

    def latest_entries(self, assessment: TeacherAssessment | None) -> dict[str, TeacherAssessmentEntry]:
        if assessment is None:
            return {}
        key = ("entries", assessment.id)
        if key not in self._cache:
            rows = self.db.scalars(
                select(TeacherAssessmentEntry)
                .where(TeacherAssessmentEntry.assessment_id == assessment.id)
                .order_by(TeacherAssessmentEntry.domain, TeacherAssessmentEntry.entered_at.desc(),
                          TeacherAssessmentEntry.id.desc())
                .distinct(TeacherAssessmentEntry.domain))
            self._cache[key] = {row.domain: row for row in rows}
        return self._cache[key]

    # ------------------------------------------------------------------ other child rows

    def baselines(self) -> list[Baseline]:
        if "baselines" not in self._cache:
            self._cache["baselines"] = list(self.db.scalars(
                select(Baseline).where(Baseline.child_id == self.child.id)
                .order_by(Baseline.created_at, Baseline.id)))
        return self._cache["baselines"]

    def focus_areas(self) -> list[FocusArea]:
        if "focus" not in self._cache:
            self._cache["focus"] = list(self.db.scalars(
                select(FocusArea).where(FocusArea.child_id == self.child.id)
                .order_by(FocusArea.created_at, FocusArea.id)))
        return self._cache["focus"]

    def focus_versions(self) -> list[RecordVersion]:
        if "focus_versions" not in self._cache:
            self._cache["focus_versions"] = list(self.db.scalars(
                select(RecordVersion)
                .where(RecordVersion.child_id == self.child.id, RecordVersion.entity_type == "focus_area")
                .order_by(RecordVersion.entity_id, RecordVersion.seq)))
        return self._cache["focus_versions"]

    def reviews(self) -> list[DevelopmentReview]:
        if "reviews" not in self._cache:
            self._cache["reviews"] = list(self.db.scalars(
                select(DevelopmentReview).where(DevelopmentReview.child_id == self.child.id)
                .order_by(DevelopmentReview.review_date, DevelopmentReview.created_at)))
        return self._cache["reviews"]

    def approved_summaries(self) -> list[FunctionalSummary]:
        """Approved functional summaries only, oldest first. Drafts are never printed."""
        if "summaries" not in self._cache:
            self._cache["summaries"] = list(self.db.scalars(
                select(FunctionalSummary)
                .where(FunctionalSummary.child_id == self.child.id, FunctionalSummary.status == "approved",
                       FunctionalSummary.approved_at.is_not(None))
                .order_by(FunctionalSummary.approved_at, FunctionalSummary.created_at)))
        return self._cache["summaries"]

    def content(self, date_from: date | None = None, date_to: date | None = None) -> list[GeneratedContent]:
        """Approved or completed activities (never drafts, never deleted ones), by approval time."""
        stmt = select(GeneratedContent).where(
            GeneratedContent.child_id == self.child.id,
            GeneratedContent.status.in_(("approved", "completed")),
            GeneratedContent.approved_at.is_not(None),
            GeneratedContent.deleted_at.is_(None),
        )
        if date_from:
            stmt = stmt.where(GeneratedContent.approved_at >= local_start(date_from))
        if date_to:
            stmt = stmt.where(GeneratedContent.approved_at < local_end(date_to))
        stmt = stmt.order_by(GeneratedContent.approved_at, GeneratedContent.id).limit(MAX_ROWS)
        return list(self.db.scalars(stmt))

    def feedback_for(self, content_ids) -> dict:
        ids = [i for i in content_ids if i]
        if not ids:
            return {}
        out: dict = {}
        rows = self.db.scalars(select(ContentFeedback).where(ContentFeedback.content_id.in_(ids))
                               .order_by(ContentFeedback.created_at))
        for row in rows:
            out.setdefault(row.content_id, []).append(row)
        return out

    def observations(self, date_from: date | None = None, date_to: date | None = None,
                     limit: int = MAX_OBSERVATIONS, structured_only: bool = False) -> list[dict]:
        """Observations in the local-date range, oldest first (the latest ``limit`` of them)."""
        result = (
            select(ContentFeedback.result).where(ContentFeedback.observation_id == Observation.id)
            .order_by(ContentFeedback.created_at.desc()).limit(1).correlate(Observation).scalar_subquery()
        )
        stmt = (
            select(Observation, FocusArea.title, GeneratedContent.title, result)
            .outerjoin(FocusArea, FocusArea.id == Observation.focus_area_id)
            .outerjoin(GeneratedContent, GeneratedContent.id == Observation.content_id)
            .where(Observation.child_id == self.child.id)
        )
        if date_from:
            stmt = stmt.where(Observation.observed_at >= local_start(date_from))
        if date_to:
            stmt = stmt.where(Observation.observed_at < local_end(date_to))
        if structured_only:
            stmt = stmt.where(Observation.details.is_not(None))
        stmt = stmt.order_by(Observation.observed_at.desc(), Observation.id.desc()).limit(limit)
        rows = [
            {"obs": obs, "focus_title": focus_title, "content_title": content_title, "result": res}
            for obs, focus_title, content_title, res in self.db.execute(stmt).all()
        ]
        rows.reverse()
        return rows

    def local_date(self, value) -> date | None:
        return to_date(value)
