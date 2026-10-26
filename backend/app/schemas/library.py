"""Content library: request bodies.

- ``AssignIn``  POST /api/library/{key}/assign  (children in the user's scope; ``use_child_name``
  replaces the library's hero name with each child's name)
"""
import uuid
from typing import Annotated

from pydantic import Field

from app.schemas.common import StrictModel


class AssignIn(StrictModel):
    child_ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=50)]
    use_child_name: bool = True
