"""Focus areas (Current Focus = the goals of the short plan, Domain 15): request bodies.

``plan`` carries the professional framework Strength → Need → Adaptation →
Intervention ("What we will do") → Follow-up (PLAN-ADJUSTMENTS B1). Every plan
field is optional text; ``success_looks_like`` ("How we will know it helps") is
descriptive, never a count. The plan columns of Domain 15 are: goal = ``title``,
method = ``plan.what_we_will_do``, frequency = ``plan.frequency``, responsible =
``plan.who``, success indicator = ``plan.success_looks_like`` and the follow-up
date = ``follow_up_on`` (a DATE column; ``plan.review_on`` is the legacy free-text
field: it is kept, but a new or changed value must be an ISO date, see
app.services.focus_areas.check_review_on).

``assessment_id`` is the plan period: the teacher-observation cycle the goal
belongs to ("2–3 goals per period").
"""
import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field, model_validator

from app import vocab
from app.schemas.common import FocusStatus, StrictModel


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


def _category(v: str | None):
    if v is not None and not vocab.is_valid("priority_categories", v):
        raise ValueError(f"unknown category {v!r}")
    return v


def _suggestion(v: str | None):
    if v is not None and not vocab.is_valid("focus_suggestions", v):
        raise ValueError(f"unknown focus suggestion {v!r}")
    return v


def _follow_up(v: date | None):
    if v is not None and not (date(2000, 1, 1) <= v <= date(2100, 12, 31)):
        raise ValueError("the follow-up date is out of range")
    return v


PlanText = Annotated[Annotated[str, Field(max_length=1000)] | None, BeforeValidator(_blank_to_none)]
Category = Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_category)]
SuggestionKey = Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_suggestion)]
Title = Annotated[Annotated[str, Field(max_length=200)] | None, BeforeValidator(_blank_to_none)]
Description = Annotated[Annotated[str, Field(max_length=2000)] | None, BeforeValidator(_blank_to_none)]
FollowUpOn = Annotated[date | None, BeforeValidator(_blank_to_none), AfterValidator(_follow_up)]

PLAN_FIELDS = ("strength_used", "need", "adaptation", "what_we_will_do", "frequency", "who", "review_on", "success_looks_like")


class FocusPlan(StrictModel):
    strength_used: PlanText = None
    need: PlanText = None
    adaptation: PlanText = None
    what_we_will_do: PlanText = None
    frequency: Annotated[Annotated[str, Field(max_length=200)] | None, BeforeValidator(_blank_to_none)] = None
    who: Annotated[Annotated[str, Field(max_length=200)] | None, BeforeValidator(_blank_to_none)] = None
    # Legacy free text (kept read-only); new values must be YYYY-MM-DD. Use ``follow_up_on``.
    review_on: Annotated[Annotated[str, Field(max_length=40)] | None, BeforeValidator(_blank_to_none)] = None
    success_looks_like: PlanText = None

    def stored(self) -> dict | None:
        data = self.model_dump(exclude_none=True)
        return data or None


class FocusCreate(StrictModel):
    """POST /api/children/{id}/focus-areas. ``category`` may be omitted when a
    ``suggestion_key`` is given (it is taken from the suggestion); ``title`` may be
    omitted for a suggestion (its label in the user's language is used).
    ``assessment_id`` defaults to the child's open observation cycle."""

    category: Category = None
    suggestion_key: SuggestionKey = None
    title: Title = None
    description: Description = None
    plan: FocusPlan | None = None
    follow_up_on: FollowUpOn = None
    assessment_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _needs(self):
        if self.category is None and self.suggestion_key is None:
            raise ValueError("give a category or a suggestion_key")
        if self.title is None and self.suggestion_key is None:
            raise ValueError("give a title or a suggestion_key")
        return self


class FocusUpdate(StrictModel):
    """PUT /api/focus-areas/{id}: only the fields that are sent change
    (``follow_up_on: null`` / ``assessment_id: null`` clear them).
    Setting ``status`` to active again is subject to the 3-active limit."""

    category: Category = None
    suggestion_key: SuggestionKey = None
    title: Title = None
    description: Description = None
    plan: FocusPlan | None = None
    status: FocusStatus | None = None
    follow_up_on: FollowUpOn = None
    assessment_id: uuid.UUID | None = None


class FocusClose(StrictModel):
    status: Literal["completed", "paused"] = "completed"
    close_reason: Annotated[Annotated[str, Field(max_length=1000)] | None, BeforeValidator(_blank_to_none)] = None
