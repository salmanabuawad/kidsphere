"""Development reviews: request bodies (spec §23–25, PLAN-ADJUSTMENTS B3, B6, B12).

POST /api/children/{id}/development-reviews/suggest  ``SuggestIn`` (optional body)
POST /api/children/{id}/development-reviews          ``ReviewCreate``

Statuses and decisions are checked against the option lists in
app/data/options.json (``review_statuses``, ``review_decisions``,
``validation_statuses``). The teacher is in control: any status may be saved;
the service only *warns* when a status other than needs_more_observation rests
on fewer than 3 observations since the latest baseline (B6).
"""
import uuid
from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field, model_validator

from app import vocab
from app.schemas.common import Language, StrictModel
from app.schemas.focus import Description, FocusCreate, FocusPlan, Title

REVIEW_STATUSES = ("improving", "some_improvement", "no_clear_change", "needs_more_observation", "no_longer_needed")
REVIEW_DECISIONS = ("keep", "pause", "close", "edit", "create")
VALIDATION_STATUSES = ("supported", "partially_supported", "needs_more_observation", "may_need_refinement")
BASELINE_LISTS = ("strengths", "interests", "what_helps", "support_needs", "focus")
NEEDS_MORE = "needs_more_observation"
# Lists a what_helps key may come from (the merged profile list draws on all of them).
WHAT_HELPS_LISTS = ("what_helps", "calming_helps", "transition_helps", "sensitivity_helps", "sad_helps")


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


def _option(list_name: str):
    def check(v):
        if v is not None and not vocab.is_valid(list_name, v):
            raise ValueError(f"unknown {list_name} key {v!r}")
        return v

    return check


def OptText(max_length: int):  # noqa: N802 - reads like a type in field annotations
    return Annotated[Annotated[str, Field(max_length=max_length)] | None, BeforeValidator(_blank_to_none)]


ReviewStatus = Annotated[
    Literal["improving", "some_improvement", "no_clear_change", "needs_more_observation", "no_longer_needed"],
    AfterValidator(_option("review_statuses")),
]
ReviewDecision = Annotated[Literal["keep", "pause", "close", "edit", "create"], AfterValidator(_option("review_decisions"))]
ValidationStatus = Annotated[
    Literal["supported", "partially_supported", "needs_more_observation", "may_need_refinement"],
    AfterValidator(_option("validation_statuses")),
]
BaselineList = Literal["strengths", "interests", "what_helps", "support_needs", "focus"]
SupportText = Annotated[str, Field(min_length=1, max_length=300)]


class SuggestIn(StrictModel):
    """Optional body of /suggest: the language of the suggested wording (default: the user's)."""

    language: Language | None = None


class ReviewItem(StrictModel):
    """A strength / interest / what-helps entry of the approved understanding:
    a vocabulary ``key`` or a ``custom`` text (exactly one). ``list`` optionally
    names the option list of a what_helps key (calming_helps, ...)."""

    key: Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=80)] = None
    custom: Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=120)] = None
    list: Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=40)] = None

    @model_validator(mode="before")
    @classmethod
    def _from_string(cls, v):
        return {"key": v} if isinstance(v, str) else v

    @model_validator(mode="after")
    def _exactly_one(self):
        if (self.key is None) == (self.custom is None):
            raise ValueError("give either a key or a custom text")
        return self


class UnderstandingIn(StrictModel):
    """The teacher-approved current understanding. ``summary`` defaults to the review summary."""

    summary: OptText(4000) = None
    strengths: list[ReviewItem] = Field(default_factory=list, max_length=20)
    interests: list[ReviewItem] = Field(default_factory=list, max_length=20)
    what_helps: list[ReviewItem] = Field(default_factory=list, max_length=20)
    areas_for_support: list[SupportText] = Field(default_factory=list, max_length=10)
    adaptations: OptText(2000) = None
    next_steps: OptText(2000) = None


class BaselineValidationIn(StrictModel):
    """One initial assumption checked against what was observed since the baseline."""

    list: BaselineList
    key: Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=80)] = None
    custom: Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=120)] = None
    label: Annotated[str, Field(min_length=1, max_length=160)]
    status: ValidationStatus
    note: OptText(400) = None
    observation_ids: Annotated[list[uuid.UUID], Field(max_length=50)] = Field(default_factory=lambda: [])


class FocusEdit(StrictModel):
    """Only the fields that are sent change (``description: null`` clears it)."""

    title: Title = None
    description: Description = None
    plan: FocusPlan | None = None


class FocusReviewIn(StrictModel):
    """One focus area in the review.

    - keep / pause / close / edit name an existing ``focus_area_id`` and need a ``status``.
      ``keep`` on a paused or completed focus makes it active again (subject to the 3-active limit).
    - edit needs ``edit`` with at least one field.
    - create needs ``create`` (as POST /focus-areas); ``focus_area_id`` and ``status`` are not used.
    """

    focus_area_id: uuid.UUID | None = None
    status: ReviewStatus | None = None
    decision: ReviewDecision
    what_worked: OptText(1000) = None
    what_to_change: OptText(1000) = None
    note: OptText(1000) = None
    edit: FocusEdit | None = None
    create: FocusCreate | None = None

    @model_validator(mode="after")
    def _shape(self):
        if self.decision == "create":
            if self.create is None:
                raise ValueError("a new focus needs 'create'")
            if self.edit is not None:
                raise ValueError("'edit' is only used with the edit decision")
            return self
        if self.focus_area_id is None:
            raise ValueError("focus_area_id is required")
        if self.status is None:
            raise ValueError("status is required")
        if self.create is not None:
            raise ValueError("'create' is only used with the create decision")
        if self.decision == "edit":
            if self.edit is None or not self.edit.model_fields_set:
                raise ValueError("an edit needs at least one changed field")
        elif self.edit is not None:
            raise ValueError("'edit' is only used with the edit decision")
        return self


class ReviewCreate(StrictModel):
    """POST /api/children/{id}/development-reviews: the teacher-approved review.

    ``summary`` and ``understanding.summary`` default to each other; at least one is required.
    """

    review_date: date | None = None
    summary: OptText(4000) = None
    understanding: UnderstandingIn
    baseline_validation: list[BaselineValidationIn] = Field(default_factory=list, max_length=60)
    focus_review: list[FocusReviewIn] = Field(default_factory=list, max_length=13)
    ai_suggested: bool = False

    @model_validator(mode="after")
    def _summaries(self):
        if self.summary is None and self.understanding.summary is None:
            raise ValueError("a summary is required")
        if self.summary is None:
            self.summary = self.understanding.summary
        if self.understanding.summary is None:
            self.understanding.summary = self.summary
        if self.review_date is not None and self.review_date > date.today() + timedelta(days=1):
            raise ValueError("the review date cannot be in the future")
        return self
