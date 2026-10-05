"""Shared Pydantic building blocks.

Request bodies extend ``StrictModel``: unknown fields are rejected (400
VALIDATION) and strings are stripped. The ``Literal`` types mirror the DB
CHECK constraints (see the ``*_VALUES`` tuples in app/models.py).
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict

Role = Literal["admin", "teacher", "parent"]
Language = Literal["ar", "he", "en"]
Gender = Literal["girl", "boy", "unspecified"]
SupportLevel = Literal["independent", "some_support", "significant_support", "not_observed"]
FocusStatus = Literal["active", "paused", "completed"]
Mode = Literal["strength_builder", "growth_support"]
ContentType = Literal["story", "video", "digital_game", "real_world_activity"]
ContentStatus = Literal["draft", "approved", "completed", "archived"]
FeedbackResult = Literal["worked_well", "partly", "did_not_work"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
