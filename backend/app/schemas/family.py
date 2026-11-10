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
