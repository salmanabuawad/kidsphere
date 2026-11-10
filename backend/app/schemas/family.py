"""Family and home (migration 0010): request bodies.

- ``HomeReflectionIn``  POST /api/content/{id}/home-reflections  (parents, on content shared with them):
  only ``result`` is required (one tap); ``note`` is optional parent free text, shown to staff only and
  never sent to the AI; ``client_request_id`` makes a retry safe.
"""
from typing import Annotated

from pydantic import BeforeValidator, Field

from app.schemas.common import FeedbackResult, StrictModel
from app.schemas.observations import RequestId


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


Note = Annotated[Annotated[str, Field(max_length=1000)] | None, BeforeValidator(_blank_to_none)]


class HomeReflectionIn(StrictModel):
    result: FeedbackResult
    note: Note = None
    client_request_id: RequestId = None


# --------------------------------------------------------------------------- family programs (0012)

import datetime as _dt  # noqa: E402
import uuid as _uuid  # noqa: E402
from typing import Literal  # noqa: E402

from pydantic import model_validator  # noqa: E402

ProgramStatus = Literal["draft", "published", "archived"]
EnrolmentStatus = Literal["active", "completed", "stopped"]
WeekContentType = Literal["story", "home_activity", "digital_game", "real_world_activity", "video"]
MAX_WEEKS = 12


def _lang_text(max_length: int):
    class LangText(StrictModel):
        en: Annotated[str, Field(max_length=max_length)] | None = None
        ar: Annotated[str, Field(max_length=max_length)] | None = None
        he: Annotated[str, Field(max_length=max_length)] | None = None

        @model_validator(mode="after")
        def _one_language(self):
            if not any((v or "").strip() for v in (self.en, self.ar, self.he)):
                raise ValueError("write it in at least one language")
            return self

    return LangText


Title = _lang_text(120)
Description = _lang_text(600)
Topic = _lang_text(120)
Lesson = _lang_text(1200)
TryAtHome = _lang_text(600)
Question = _lang_text(200)


class WeekIn(StrictModel):
    content_type: WeekContentType = "home_activity"
    topic: Topic
    lesson: Lesson
    try_at_home: TryAtHome
    reflection: Question


class ProgramCreate(StrictModel):
    title: Title
    description: Description | None = None
    weeks: Annotated[list[WeekIn], Field(min_length=1, max_length=MAX_WEEKS)]
    status: ProgramStatus = "draft"


class ProgramUpdate(StrictModel):
    title: Title | None = None
    description: Description | None = None
    weeks: Annotated[list[WeekIn], Field(min_length=1, max_length=MAX_WEEKS)] | None = None
    status: ProgramStatus | None = None


class EnrolIn(StrictModel):
    program_id: _uuid.UUID
    started_on: _dt.date | None = None


class EnrolmentUpdate(StrictModel):
    status: EnrolmentStatus


class WeekReflectionIn(StrictModel):
    week: Annotated[int, Field(ge=1, le=MAX_WEEKS)]
    result: FeedbackResult | None = None
    note: Note = None


class CopilotAsk(StrictModel):
    child_id: _uuid.UUID
    question: Annotated[str, Field(max_length=500)] | None = None
    topic: Annotated[str, Field(max_length=60)] | None = None
    language: Literal["en", "ar", "he"] | None = None


class RoutineStep(StrictModel):
    emoji: Annotated[str, Field(min_length=1, max_length=16)]
    label: Annotated[str, Field(min_length=1, max_length=60)]


class RoutineIn(StrictModel):
    title: Annotated[str, Field(min_length=1, max_length=80)]
    steps: Annotated[list[RoutineStep], Field(min_length=2, max_length=12)]


class QuestionnaireIn(StrictModel):
    kind: Literal["baseline", "end"]
    answers: dict[Annotated[str, Field(max_length=40)], Annotated[str, Field(max_length=40)]]
