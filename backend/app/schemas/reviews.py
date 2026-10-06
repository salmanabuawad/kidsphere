"""Development reviews: request bodies (spec §23–25, PLAN-ADJUSTMENTS B3, B6, B12).

POST /api/children/{id}/development-reviews/suggest  ``SuggestIn`` (optional body)
POST /api/children/{id}/development-reviews          ``ReviewCreate``

Statuses and decisions are checked against the option lists in
app/data/options.json (``review_statuses``, ``review_decisions``,
``validation_statuses``) and app/data/lists/plan.json (``improvement_levels``,
``involvement_steps``). The teacher is in control: any status may be saved;
the service only *warns* when a status other than needs_more_observation rests
on fewer than 3 observations since the latest baseline (B6).

``follow_up`` is the Domain 16 block (``FollowUpIn``): reassessment date, overall
improvement, areas, what worked, what to change and the next step with the family
or the team (``involvement``). Involvement and the reassessment date are entered by
the teacher only: no AI schema has them, and AI suggestions never fill them.
"""
import uuid
from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field, model_validator

from app import vocab
from app.schemas.common import Language, StrictModel
from app.schemas.focus import Description, FocusCreate, FocusPlan, FollowUpOn, Title

REVIEW_STATUSES = ("improving", "some_improvement", "no_clear_change", "needs_more_observation", "no_longer_needed")
REVIEW_DECISIONS = ("keep", "pause", "close", "edit", "create")
VALIDATION_STATUSES = ("supported", "partially_supported", "needs_more_observation", "may_need_refinement")
BASELINE_LISTS = ("strengths", "interests", "what_helps", "support_needs", "focus")
NEEDS_MORE = "needs_more_observation"
# Domain 16 (lists/plan.json). The observation model's משמעותי / חלקי / ללא שינוי map onto
# the review statuses (docs/terminology.md §3).
IMPROVEMENT_LEVELS = ("significant", "partial", "no_change", "needs_more_observation")
IMPROVEMENT_TO_REVIEW_STATUS = {
    "significant": "improving",
    "partial": "some_improvement",
    "no_change": "no_clear_change",
    "needs_more_observation": NEEDS_MORE,
}
INVOLVEMENT_STEPS = ("none", "consultation", "joint_plan", "referral_as_needed")
# Lists a what_helps key may come from (the merged profile list draws on all of them).
WHAT_HELPS_LISTS = ("what_helps", "calming_helps", "transition_helps", "sensitivity_helps", "sad_helps")


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


def _option(list_name: str):
    def check(v):
        if v is None:
            return v
        try:
            known = vocab.is_valid(list_name, v)
        except KeyError:  # the option list itself is missing
            known = False
        if not known:
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
    follow_up_on: FollowUpOn = None


ImprovementLevel = Annotated[
    Literal["significant", "partial", "no_change", "needs_more_observation"],
    AfterValidator(_option("improvement_levels")),
]
InvolvementStep = Annotated[
    Literal["none", "consultation", "joint_plan", "referral_as_needed"],
    AfterValidator(_option("involvement_steps")),
]
ObservationDomain = Annotated[str, AfterValidator(_option("observation_domains"))]


class ImprovementIn(StrictModel):
    """האם חל שיפור? משמעותי / חלקי / ללא שינוי (+ needs more observation) and the elaboration."""

    level: ImprovementLevel | None = None
    note: OptText(1000) = None


class AreasIn(StrictModel):
    """באילו תחומים? The observation domains and/or goals concerned, plus words."""

    domains: Annotated[list[ObservationDomain], Field(max_length=13)] = Field(default_factory=list)
    focus_area_ids: Annotated[list[uuid.UUID], Field(max_length=13)] = Field(default_factory=list)
    text: OptText(500) = None


class InvolvementIn(StrictModel):
    """Parent / team involvement: teacher-entered only. ``note`` gets a wording warning, never a block."""

    key: InvolvementStep | None = None
    note: OptText(1000) = None


class FollowUpIn(StrictModel):
    """Domain 16, stored as ``development_reviews.follow_up``."""

    reassessment_on: FollowUpOn = None
    improvement: ImprovementIn | None = None
    areas: AreasIn | None = None
    what_worked: OptText(1000) = None
    what_to_change: OptText(1000) = None
    involvement: InvolvementIn | None = None

    def stored(self) -> dict | None:
        """The full block (every field present, empty ones null), or None when nothing was given."""
        imp = self.improvement or ImprovementIn()
        areas = self.areas or AreasIn()
        inv = self.involvement or InvolvementIn()
        data = {
            "reassessment_on": self.reassessment_on.isoformat() if self.reassessment_on else None,
            "improvement": {"level": imp.level, "note": imp.note},
            "areas": {
                "domains": list(dict.fromkeys(areas.domains)),
                "focus_area_ids": list(dict.fromkeys(str(i) for i in areas.focus_area_ids)),
                "text": areas.text,
            },
            "what_worked": self.what_worked,
            "what_to_change": self.what_to_change,
            "involvement": {"key": inv.key, "note": inv.note},
        }
        empty = (not data["reassessment_on"] and not any(data["improvement"].values())
                 and not any(data["areas"].values()) and not data["what_worked"] and not data["what_to_change"]
                 and not any(data["involvement"].values()))
        return None if empty else data


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
    follow_up: FollowUpIn | None = None
    ai_suggested: bool = False
    # The /suggest result this review started from (its outcome becomes accepted or edited).
    ai_suggestion_id: uuid.UUID | None = None

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
