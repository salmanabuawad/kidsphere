"""Functional summaries (Domain 17, סיכום תפקודי קצר): request bodies.

POST /api/children/{id}/functional-summaries          ``SummaryIn``   (a new draft row)
POST /api/children/{id}/functional-summaries/suggest  ``SummarySuggestIn`` (optional body)
POST /api/functional-summaries/{sid}/approve          ``SummaryApproveIn`` (optional body)

Every save inserts a new row; an edit of an earlier version names it in
``supersedes_id``. ``source='ai_draft'`` needs the ``ai_suggestion_id`` of the
/suggest call it started from. ``follow_up_with_parents`` is teacher-written only
(the AI draft never has it).
"""
import uuid
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, model_validator

from app.schemas.common import Language, StrictModel


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


def OptText(max_length: int):  # noqa: N802 - reads like a type in field annotations
    return Annotated[Annotated[str, Field(max_length=max_length)] | None, BeforeValidator(_blank_to_none)]


class SummaryItem(StrictModel):
    """A main strength: a ``strengths`` vocabulary ``key`` or a ``custom`` text (exactly one)."""

    key: Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=80)] = None
    custom: Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=120)] = None

    @model_validator(mode="before")
    @classmethod
    def _from_string(cls, v):
        return {"key": v} if isinstance(v, str) else v

    @model_validator(mode="after")
    def _exactly_one(self):
        if (self.key is None) == (self.custom is None):
            raise ValueError("give either a key or a custom text")
        return self


class MainStrengths(StrictModel):
    items: Annotated[list[SummaryItem], Field(max_length=10)] = Field(default_factory=list)
    text: OptText(1000) = None


NeedText = Annotated[str, Field(min_length=1, max_length=300)]


class MainNeeds(StrictModel):
    """Areas for support (never "needs" or "deficits" in the UI)."""

    items: Annotated[list[NeedText], Field(max_length=10)] = Field(default_factory=list)
    text: OptText(1000) = None


SUMMARY_TEXT_FIELDS = ("general_description", "adaptations", "follow_up_with_parents", "team_recommendations")


class SummaryIn(StrictModel):
    supersedes_id: uuid.UUID | None = None
    review_id: uuid.UUID | None = None
    assessment_id: uuid.UUID | None = None
    general_description: OptText(4000) = None
    main_strengths: MainStrengths = Field(default_factory=MainStrengths)
    main_needs: MainNeeds = Field(default_factory=MainNeeds)
    adaptations: OptText(2000) = None
    follow_up_with_parents: OptText(1000) = None
    team_recommendations: OptText(1000) = None
    source: Literal["manual", "ai_draft"] = "manual"
    ai_suggestion_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _shape(self):
        if self.source == "ai_draft" and self.ai_suggestion_id is None:
            raise ValueError("an AI draft needs its ai_suggestion_id")
        empty = (not any(getattr(self, f) for f in SUMMARY_TEXT_FIELDS)
                 and not self.main_strengths.items and not self.main_strengths.text
                 and not self.main_needs.items and not self.main_needs.text)
        if empty:
            raise ValueError("write at least one part of the summary")
        return self


class SummarySuggestIn(StrictModel):
    """Optional body of /suggest: the language of the draft (default: the user's)."""

    language: Language | None = None


class SummaryApproveIn(StrictModel):
    """Optionally link the approved summary to the review or observation cycle it closes."""

    review_id: uuid.UUID | None = None
    assessment_id: uuid.UUID | None = None
