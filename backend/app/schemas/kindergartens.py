"""Kindergarten themes: request body (services/kindergartens.py).

- ``ThemeIn``  PUT /api/kindergartens/theme  (admin; ``theme`` None clears it)
"""
from typing import Annotated

from pydantic import Field

from app.schemas.common import StrictModel


class ThemeIn(StrictModel):
    kindergarten: Annotated[str, Field(min_length=1, max_length=120)]
    theme: Annotated[str, Field(pattern=r"^[a-z0-9_]{1,40}$")] | None = None
