"""Class sessions: request bodies (services/class_sessions.py).

- ``SessionCreate``  POST /api/class-sessions  (a class, optionally a library item, the children who took part)
- ``ParticipantsIn``  PUT /api/class-sessions/{id}/children
- ``SessionNotesIn``  PUT /api/class-sessions/{id}/observations  (one entry per child: a support level and
  an optional short note; an entry with neither removes nothing and is skipped)
"""
import uuid
from datetime import date
from typing import Annotated

from pydantic import BeforeValidator, Field

from app.schemas.common import StrictModel, SupportLevel
from app.schemas.content import _blank_to_none

ChildIds = Annotated[list[uuid.UUID], Field(min_length=1, max_length=60)]
Note = Annotated[Annotated[str, Field(max_length=4000)] | None, BeforeValidator(_blank_to_none)]


class SessionCreate(StrictModel):
    class_id: uuid.UUID
    library_item_id: uuid.UUID | None = None
    # Defaults to the library item's title.
    title: Annotated[Annotated[str, Field(min_length=1, max_length=120)] | None, BeforeValidator(_blank_to_none)] = None
    # Defaults to today.
    held_on: date | None = None
    child_ids: ChildIds


class ParticipantsIn(StrictModel):
    child_ids: ChildIds


class SessionNote(StrictModel):
    child_id: uuid.UUID
    support_level: SupportLevel | None = None
    observation: Note = None


class SessionNotesIn(StrictModel):
    entries: Annotated[list[SessionNote], Field(min_length=1, max_length=60)]
