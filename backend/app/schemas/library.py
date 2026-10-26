"""Content library: request bodies (services/library.py).

- ``AssignIn``  POST /api/library/items/{id}/assign  (children in the user's scope; ``use_child_name``
  replaces the item's ``hero`` with each child's name)
- ``CollectionCreate`` / ``CollectionUpdate``  POST /api/admin/library/collections, PUT …/{id}
- ``ItemCreate`` / ``ItemUpdate``  POST /api/admin/library/items, PUT …/{id}  (``content`` is
  validated against the type's output model plus the safety check in the service)
"""
import uuid
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field

from app.schemas.common import ContentType, Language, Mode, StrictModel
from app.schemas.content import OptionalKey, _blank_to_none

LibraryStatus = Literal["draft", "published", "archived"]
Audience = Literal["child", "group"]

Title = Annotated[str, Field(min_length=1, max_length=120)]
Description = Annotated[Annotated[str, Field(max_length=500)] | None, BeforeValidator(_blank_to_none)]
Ages = Annotated[Annotated[str, Field(max_length=80)] | None, BeforeValidator(_blank_to_none)]
Hero = Annotated[Annotated[str, Field(max_length=40)] | None, BeforeValidator(_blank_to_none)]
SortOrder = Annotated[int, Field(ge=0, le=10000)]
# goals: [{key}|{custom}] (focus_suggestions); suits: [{list, key}|{custom}]; checked in the service.
Tags = Annotated[list[dict], Field(max_length=8)]


class AssignIn(StrictModel):
    child_ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=50)]
    use_child_name: bool = True


class CollectionCreate(StrictModel):
    title: Title
    description: Description = None
    ages: Ages = None
    sort_order: SortOrder = 0


class CollectionUpdate(StrictModel):
    title: Title | None = None
    description: Description = None
    ages: Ages = None
    sort_order: SortOrder | None = None
    status: LibraryStatus | None = None


class ItemCreate(StrictModel):
    collection_id: uuid.UUID
    content_type: ContentType
    language: Language
    content: dict
    hero: Hero = None
    audience: Audience = "child"
    mode: Mode = "strength_builder"
    target_strength: OptionalKey = None
    goals: Tags = []
    suits: Tags = []
    sort_order: SortOrder = 0


class ItemUpdate(StrictModel):
    collection_id: uuid.UUID | None = None
    language: Language | None = None
    content: dict | None = None
    hero: Hero = None
    audience: Audience | None = None
    mode: Mode | None = None
    target_strength: OptionalKey = None
    goals: Tags | None = None
    suits: Tags | None = None
    sort_order: SortOrder | None = None
    status: LibraryStatus | None = None


class MediaDetails(StrictModel):
    alt: Annotated[str, Field(max_length=300)] | None = None
    credit: Annotated[str, Field(max_length=300)] | None = None
