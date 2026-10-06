"""People in the child's life: request bodies (services/people.py).

- ``PersonCreate``  POST /api/children/{id}/people
- ``PersonUpdate``  PUT /api/people/{pid}  (only the fields sent change)

``relation`` is a ``person_relations`` key (checked against the vocabulary in the
service); ``display_name`` is what the child calls them ("Sido", "Mama", "Lulu").
"""
from typing import Annotated

from pydantic import Field

from app.schemas.common import StrictModel

RelationKey = Annotated[str, Field(pattern=r"^[a-z0-9_]{1,40}$")]
DisplayName = Annotated[str, Field(min_length=1, max_length=40)]


class PersonCreate(StrictModel):
    relation: RelationKey
    display_name: DisplayName


class PersonUpdate(StrictModel):
    relation: RelationKey | None = None
    display_name: DisplayName | None = None
