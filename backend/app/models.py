"""All 22 tables as SQLAlchemy 2 models.

The schema itself is created by the hand-written Alembic revisions in
``migrations/versions/`` (``0001_initial.py`` … ``0004_child_people.py``); these
models must mirror them (tests/test_migrations.py checks that every column
exists in both).

History tables (0002): ``record_versions``, ``teacher_assessment_entries`` and
``report_exports`` are append-only; ``ai_suggestions`` only allow a pending
outcome to be resolved; ``functional_summaries`` only allow draft -> approved;
a closed ``teacher_assessments`` row is immutable. DB triggers enforce this:
never UPDATE or DELETE those rows, insert a new one instead. Write versions
through ``app.services.history.record``.

Conventions:
- uuid primary keys (Python ``uuid4`` default, ``gen_random_uuid()`` in the DB).
- Enumerations are TEXT + CHECK in the DB and plain ``str`` here; the allowed
  values are listed in the ``*_VALUES`` tuples below (mirror them with
  ``Literal`` in Pydantic schemas).
- JSONB columns are plain ``dict``/``list``. Assign a new value to change them
  (``row.strengths = [...]``) or call ``sqlalchemy.orm.attributes.flag_modified``
  after an in-place change; in-place mutations are not tracked.
- There are deliberately no ORM relationships: write explicit ``select()``s.
- ``AuditLog.meta`` maps to the ``metadata`` column (``metadata`` is reserved
  by SQLAlchemy's declarative base).
"""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    SmallInteger,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, DATERANGE, JSONB, UUID, Range
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

ROLE_VALUES = ("admin", "teacher", "parent")
LANGUAGE_VALUES = ("ar", "he", "en")
GENDER_VALUES = ("girl", "boy", "unspecified")
FOCUS_STATUS_VALUES = ("active", "paused", "completed")
MODE_VALUES = ("strength_builder", "growth_support")
CONTENT_TYPE_VALUES = ("story", "video", "digital_game", "real_world_activity")
CONTENT_STATUS_VALUES = ("draft", "approved", "completed", "archived")
VIDEO_STATUS_VALUES = ("script_ready", "generating", "ready", "failed")
OBSERVATION_SOURCE_VALUES = ("quick", "content_feedback")
SUPPORT_LEVEL_VALUES = ("independent", "some_support", "significant_support", "not_observed")
FEEDBACK_RESULT_VALUES = ("worked_well", "partly", "did_not_work")

# 0002 (COVERAGE-MATRIX §3). Labels for the lists live in app/data/lists/common.json.
AI_DOMAIN_VALUES = (
    "emotional", "social", "communication", "language", "executive_function", "play",
    "gross_motor", "fine_motor", "independence", "sensory", "cognitive", "daily_routine",
)
ASSESSMENT_DOMAIN_VALUES = (
    "emotional", "social", "language", "executive_function", "play", "gross_motor", "fine_motor",
    "independence", "sensory", "cognitive", "daily_routine", "strengths", "priority_needs",
)
SECTION_STATUS_VALUES = ("not_started", "in_progress", "sufficient", "review_later")
RECORD_ENTITY_VALUES = ("profile_section", "observation", "focus_area", "content")
RECORD_VIA_VALUES = (
    "backfill", "self", "on_behalf", "meeting", "manual", "review", "assessment",
    "generated", "regenerated", "edited", "status", "system",
)
CHANGED_ROLE_VALUES = ("admin", "teacher", "parent", "system")
REPORTED_BY_VALUES = ("parent", "teacher")
AI_SUGGESTION_KIND_VALUES = ("understanding", "functional_summary", "observation_questions")
AI_SUGGESTION_OUTCOME_VALUES = ("pending", "accepted", "edited", "discarded")
AI_SUGGESTION_USED_BY_VALUES = ("development_review", "functional_summary")
ASSESSMENT_KIND_VALUES = ("initial", "reassessment")
ASSESSMENT_STATUS_VALUES = ("open", "closed")
ASSESSMENT_ENTERED_ROLE_VALUES = ("admin", "teacher")
SUMMARY_SOURCE_VALUES = ("manual", "ai_draft")
SUMMARY_STATUS_VALUES = ("draft", "approved")
REPORT_TYPE_VALUES = (
    "full", "parent_questionnaire", "teacher_observation", "current_development", "intervention_plan", "timeline",
)


class Base(DeclarativeBase):
    pass


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


def _updated() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


def _user_fk(nullable: bool = True) -> Mapped[uuid.UUID | None]:
    return mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=nullable)


def _child_fk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), ForeignKey("children.id", ondelete="CASCADE"), nullable=False)


def _jsonb_list() -> Mapped[list]:
    return mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))


def _jsonb_dict() -> Mapped[dict]:
    return mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    # Login identifier: an e-mail address or a plain username, always lower-case.
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(Text, nullable=False, default="ar", server_default="ar")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()


class Class(Base):
    __tablename__ = "classes"

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    kindergarten: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = _created()


class ClassTeacher(Base):
    __tablename__ = "class_teachers"

    class_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)


class Child(Base):
    __tablename__ = "children"

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    preferred_name: Mapped[str | None] = mapped_column(Text)
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    gender: Mapped[str | None] = mapped_column(Text)
    class_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("classes.id", ondelete="SET NULL"))
    main_language: Mapped[str] = mapped_column(Text, nullable=False)
    additional_languages: Mapped[list] = _jsonb_list()
    photo_path: Mapped[str | None] = mapped_column(Text)
    parent_name: Mapped[str | None] = mapped_column(Text)
    parent_contact: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class ChildParent(Base):
    __tablename__ = "child_parents"

    child_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("children.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    relation: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()


class ChildProfile(Base):
    __tablename__ = "child_profiles"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("children.id", ondelete="CASCADE"), nullable=False, unique=True)
    parent_perspective: Mapped[dict] = _jsonb_dict()
    teacher_perspective: Mapped[dict] = _jsonb_dict()
    strengths: Mapped[list] = _jsonb_list()
    interests: Mapped[list] = _jsonb_list()
    motivators: Mapped[list] = _jsonb_list()
    what_helps: Mapped[list] = _jsonb_list()
    sensitivities: Mapped[list] = _jsonb_list()
    current_understanding: Mapped[dict | None] = mapped_column(JSONB)
    wizard_step: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1, server_default=text("1"))
    wizard_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class Baseline(Base):
    """Immutable snapshot: a DB trigger rejects UPDATE and direct DELETE."""

    __tablename__ = "baselines"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    baseline_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()


class FocusArea(Base):
    __tablename__ = "focus_areas"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    category: Mapped[str] = mapped_column(Text, nullable=False)
    suggestion_key: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Strength -> Need -> Adaptation -> Intervention -> Follow-up (PLAN-ADJUSTMENTS B1)
    plan: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active", server_default="active")
    close_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 0002: Domain 15/16 follow-up date (plan.review_on is legacy text), the plan
    # period (observation cycle) and the Domain 13 need it came from
    # ({assessment_id, index}). At most 3 active per child: the service returns
    # 409 FOCUS_LIMIT; a deferred DB constraint trigger backs it up at COMMIT.
    follow_up_on: Mapped[date | None] = mapped_column(Date)
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teacher_assessments.id", ondelete="SET NULL"))
    source_need: Mapped[dict | None] = mapped_column(JSONB)


class GeneratedContent(Base):
    __tablename__ = "generated_content"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    focus_area_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("focus_areas.id", ondelete="SET NULL"))
    pack_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft", server_default="draft")
    shared_with_parent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    generation_input: Mapped[dict] = mapped_column(JSONB, nullable=False)
    ai_provider: Mapped[str] = mapped_column(Text, nullable=False)
    ai_model: Mapped[str | None] = mapped_column(Text)
    is_template: Mapped[bool] = mapped_column(Boolean, nullable=False)
    variant: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    video_status: Mapped[str | None] = mapped_column(Text)
    video_provider: Mapped[str | None] = mapped_column(Text)
    video_external_job_id: Mapped[str | None] = mapped_column(Text)
    video_url: Mapped[str | None] = mapped_column(Text)
    approved_by: Mapped[uuid.UUID | None] = _user_fk()
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()
    # 0002: soft delete of drafts (OQ-5); a CHECK allows it only while status = 'draft'.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = _user_fk()
    # 0004: the people of the child's life in this content, [{token, person_id, relation}]
    # (services/people.py). Never their names: the client puts those in for each token.
    people: Mapped[list] = _jsonb_list()


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    focus_area_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("focus_areas.id", ondelete="SET NULL"))
    # spec "activity_id"
    content_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("generated_content.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(Text, nullable=False, default="quick", server_default="quick")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    area: Mapped[str | None] = mapped_column(Text)
    context: Mapped[str | None] = mapped_column(Text)
    # NULL only allowed for source='content_feedback' (PLAN-ADJUSTMENTS B4).
    observation: Mapped[str | None] = mapped_column(Text)
    support_level: Mapped[str | None] = mapped_column(Text)
    what_helped: Mapped[dict | list | None] = mapped_column(JSONB)
    note: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSONB)
    client_request_id: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()
    # 0002: the AI domains (AI_DOMAIN_VALUES; CHECK + GIN index) and descriptive
    # attributes {frequency, duration_minutes, intensity} (never a score).
    domains: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default=text("'{}'::text[]"))
    attributes: Mapped[dict | None] = mapped_column(JSONB)


class ContentFeedback(Base):
    __tablename__ = "content_feedback"

    id: Mapped[uuid.UUID] = _pk()
    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("generated_content.id", ondelete="CASCADE"), nullable=False)
    child_id: Mapped[uuid.UUID] = _child_fk()
    result: Mapped[str] = mapped_column(Text, nullable=False)
    support_level: Mapped[str | None] = mapped_column(Text)
    observation: Mapped[str | None] = mapped_column(Text)
    what_helped: Mapped[dict | list | None] = mapped_column(JSONB)
    observation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("observations.id", ondelete="SET NULL"))
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()


class DevelopmentReview(Base):
    __tablename__ = "development_reviews"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    review_date: Mapped[date] = mapped_column(Date, nullable=False, server_default=func.current_date())
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    focus_review: Mapped[list] = _jsonb_list()
    baseline_validation: Mapped[list] = _jsonb_list()
    understanding: Mapped[dict] = mapped_column(JSONB, nullable=False)
    ai_suggested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()
    # 0002: the Domain 16 follow-up block and the AI suggestion the review used.
    follow_up: Mapped[dict | None] = mapped_column(JSONB)
    ai_suggestion_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_suggestions.id"))


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(Text, nullable=False)
    object_type: Mapped[str | None] = mapped_column(Text)
    object_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    child_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = _created()


# --------------------------------------------------------------------------- 0002: source documents


class AiSuggestion(Base):
    """What was sent to the AI (de-identified) and what came back. Only ``outcome``
    (pending -> accepted/edited/discarded), ``used_by_*`` and ``resolved_at`` may
    change, once; the row is otherwise immutable (DB trigger)."""

    __tablename__ = "ai_suggestions"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str | None] = mapped_column(Text)
    is_template: Mapped[bool] = mapped_column(Boolean, nullable=False)
    fallback_reason: Mapped[str | None] = mapped_column(Text)
    domains: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default=text("'{}'::text[]"))
    input: Mapped[dict] = mapped_column(JSONB, nullable=False)
    output: Mapped[dict] = mapped_column(JSONB, nullable=False)
    outcome: Mapped[str] = mapped_column(Text, nullable=False, default="pending", server_default="pending")
    used_by_type: Mapped[str | None] = mapped_column(Text)
    used_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RecordVersion(Base):
    """Append-only history: the FULL state of a profile section, observation,
    focus area or content row after each change (seq 1 = first known state).
    Write rows with ``app.services.history.record``."""

    __tablename__ = "record_versions"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    child_id: Mapped[uuid.UUID] = _child_fk()
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    # profile_section: '<perspective>:<section>', e.g. 'parent:health', 'teacher:bridge'
    entity_key: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    changed_by: Mapped[uuid.UUID | None] = _user_fk()
    changed_by_name: Mapped[str | None] = mapped_column(Text)
    changed_role: Mapped[str | None] = mapped_column(Text)
    reported_by: Mapped[str | None] = mapped_column(Text)
    via: Mapped[str] = mapped_column(Text, nullable=False)
    review_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("development_reviews.id"))
    ai_suggestion_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_suggestions.id"))
    created_at: Mapped[datetime] = _created()


class TeacherAssessment(Base):
    """One teacher full-observation cycle (header = observation model section A).
    At most one open and one initial cycle per child; a closed cycle is immutable."""

    __tablename__ = "teacher_assessments"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    kind: Mapped[str] = mapped_column(Text, nullable=False, default="initial", server_default="initial")
    previous_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("teacher_assessments.id"))
    filled_on: Mapped[date] = mapped_column(Date, nullable=False, server_default=func.current_date())
    period_from: Mapped[date | None] = mapped_column(Date)
    period_to: Mapped[date | None] = mapped_column(Date)
    period_note: Mapped[str | None] = mapped_column(Text)
    teacher_id: Mapped[uuid.UUID | None] = _user_fk()
    filled_by_text: Mapped[str | None] = mapped_column(Text)
    child_snapshot: Mapped[dict] = _jsonb_dict()
    # cache of the latest entry per domain: {<domain>: {status, entry_id, data, updated_by, updated_at}}
    domains: Mapped[dict] = _jsonb_dict()
    status: Mapped[str] = mapped_column(Text, nullable=False, default="open", server_default="open")
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()
    closed_by: Mapped[uuid.UUID | None] = _user_fk()
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TeacherAssessmentEntry(Base):
    """Append-only: every domain save is a new row holding the full domain document.
    Inserts only into an open cycle (the DB trigger locks the cycle row)."""

    __tablename__ = "teacher_assessment_entries"

    id: Mapped[uuid.UUID] = _pk()
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teacher_assessments.id", ondelete="CASCADE"), nullable=False)
    child_id: Mapped[uuid.UUID] = _child_fk()
    domain: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    entered_by: Mapped[uuid.UUID | None] = _user_fk()
    entered_by_name: Mapped[str | None] = mapped_column(Text)
    entered_role: Mapped[str] = mapped_column(Text, nullable=False)
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FunctionalSummary(Base):
    """Domain 17. Every edit inserts a new row (``supersedes_id``); the only allowed
    update is draft -> approved (with approved_by/approved_at)."""

    __tablename__ = "functional_summaries"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    supersedes_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("functional_summaries.id"))
    review_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("development_reviews.id"))
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("teacher_assessments.id"))
    general_description: Mapped[str | None] = mapped_column(Text)
    main_strengths: Mapped[dict] = _jsonb_dict()
    main_needs: Mapped[dict] = _jsonb_dict()
    adaptations: Mapped[str | None] = mapped_column(Text)
    follow_up_with_parents: Mapped[str | None] = mapped_column(Text)
    team_recommendations: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    ai_suggestion_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_suggestions.id"))
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft", server_default="draft")
    approved_by: Mapped[uuid.UUID | None] = _user_fk()
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()


class ReportExport(Base):
    """Append-only PDF export log. Never stores report content."""

    __tablename__ = "report_exports"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    report_type: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(Text, nullable=False)
    generated_by: Mapped[uuid.UUID | None] = _user_fk()
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    date_range: Mapped[Range[date] | None] = mapped_column(DATERANGE)
    # include_* flags, assessment_id; never content
    options: Mapped[dict] = _jsonb_dict()


# --------------------------------------------------------------------------- 0003: admin settings


class AppSetting(Base):
    """One admin settings section (general, ai, reports) as JSON. Read and written only
    through ``app.services.settings`` (typed defaults fill anything missing). The ai
    section may hold the Anthropic API key, which no API ever returns."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = _user_fk()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


# --------------------------------------------------------------------------- 0004: people in the child's life


class ChildPerson(Base):
    """Someone from the child's life (grandfather, sister, a friend, a pet) whom stories, games
    and videos may include. ``relation`` is a ``person_relations`` key, ``display_name`` what the
    child calls them. The AI only ever sees the relation as a placeholder token; the name and the
    photo stay in KidSphere (services/people.py)."""

    __tablename__ = "child_people"

    id: Mapped[uuid.UUID] = _pk()
    child_id: Mapped[uuid.UUID] = _child_fk()
    relation: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    photo_path: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()
