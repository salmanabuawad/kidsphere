"""Generated content and feedback: request bodies (spec §14–20, PLAN-ADJUSTMENTS B4, B8, B9).

- ``GenerateIn``  POST /api/children/{id}/content/generate  (``people``: up to 3 child_people ids)
- ``ContentUpdate``  PUT /api/content/{id}  (``title`` and/or the whole ``content`` object;
  the content is validated against the type's output model plus the safety check
  in the service, not here)
- ``RegenerateIn``  POST /api/content/{id}/regenerate
- ``ShareIn``  POST /api/content/{id}/share
- ``FeedbackIn``  POST /api/content/{id}/feedback  (only ``result`` is required:
  a 2-tap feedback is valid; the optional ``client_request_id`` makes a retry safe)
"""
import uuid
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field

from app.schemas.common import FeedbackResult, Language, Mode, StrictModel, SupportLevel
from app.schemas.observations import HelpItem, RequestId, _check_helps

GenerateType = Literal["story", "video", "digital_game", "real_world_activity", "pack"]
GameTemplate = Literal[
    "multiple_choice", "match_pairs", "sequence", "emotion_choice", "categorize", "what_happens_next", "story_builder"
]


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


OptionalKey = Annotated[Annotated[str, Field(max_length=40)] | None, BeforeValidator(_blank_to_none)]
Instruction = Annotated[Annotated[str, Field(max_length=500)] | None, BeforeValidator(_blank_to_none)]
FeedbackText = Annotated[Annotated[str, Field(max_length=4000)] | None, BeforeValidator(_blank_to_none)]


class GenerateIn(StrictModel):
    mode: Mode
    content_type: GenerateType
    # Digital game template (digital_game and pack only); chosen automatically when omitted.
    template: GameTemplate | None = None
    # growth_support: required, one of the child's ACTIVE focus areas.
    focus_area_id: uuid.UUID | None = None
    # strength_builder: required, a profile strength key or a strength_targets key (PLAN B8).
    target_strength: OptionalKey = None
    # Default: the child's main language when it is ar/he/en, else the user's language.
    language: Language | None = None
    # pack only: a video plan is generated only when explicitly requested.
    include_video: bool = False
    # People of the child's life to include (child_people ids of THIS child, at most 3, no repeats).
    # The AI sees only a placeholder token and the relation of each (services/people.py).
    people: Annotated[list[uuid.UUID], Field(max_length=3)] = []


class ContentUpdate(StrictModel):
    title: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    content: dict | None = None


class RegenerateIn(StrictModel):
    instruction: Instruction = None


class ShareIn(StrictModel):
    shared: bool


class FeedbackIn(StrictModel):
    result: FeedbackResult
    support_level: SupportLevel | None = None
    observation: FeedbackText = None
    what_helped: Annotated[list[HelpItem] | None, Field(max_length=20), AfterValidator(_check_helps)] = None
    # Idempotency key (1-100 characters), stored on the mirrored observation: a retry with the
    # same id returns the feedback saved the first time (200) instead of saving a second one.
    client_request_id: RequestId = None
