"""All 14 tables as SQLAlchemy 2 models.

The schema itself is created by the hand-written Alembic revision
``migrations/versions/0001_initial.py``; these models must mirror it
(tests/test_migrations.py checks that every column exists in both).

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
from sqlalchemy.dialects.postgresql import JSONB, UUID
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
