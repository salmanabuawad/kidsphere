"""AI engines: request bodies (services/ai_engines.py).

- ``RunIn``             POST /api/ai/run
- ``PipelineIn``        POST /api/ai/pipelines/{name}
- ``EngineConfigIn``    PUT /api/admin/ai/engines/{engine}  (only the fields sent change; null clears)
"""
import uuid
from typing import Annotated, Any, Literal

from pydantic import Field

from app.ai.engines.contracts import LanguageSpec
from app.schemas.common import StrictModel

Name = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9_\-]{0,39}$")]
Short = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[^\r\n\t]+$")]


class RunIn(StrictModel):
    engine: Annotated[str, Field(pattern=r"^[a-z_]{2,40}$")]
    task: Annotated[str, Field(pattern=r"^[a-z_]{2,40}$")]
    input: dict[str, Any] = Field(default_factory=dict)
    child_id: uuid.UUID | None = None
    language: LanguageSpec | None = None
    options: dict[str, Any] = Field(default_factory=dict)


class PipelineIn(StrictModel):
    child_id: uuid.UUID | None = None
    language: LanguageSpec | None = None
    input: dict[str, Any] = Field(default_factory=dict)


class EngineConfigIn(StrictModel):
    enabled: bool | None = None
    provider: Name | None = None
    model: Short | None = None
    endpoint: Annotated[str, Field(max_length=500, pattern=r"^https://\S+$")] | None = None
    credentials_ref: Annotated[str, Field(pattern=r"^AI_CRED_[A-Z0-9_]{1,60}$")] | None = None
    timeout_seconds: Annotated[int, Field(ge=5, le=600)] | None = None
    max_retries: Annotated[int, Field(ge=0, le=5)] | None = None
    max_output: Annotated[int, Field(ge=1, le=1_000_000)] | None = None
    daily_cost_limit: Annotated[float, Field(ge=0, le=1_000_000)] | None = None
    unit_cost: Annotated[float, Field(ge=0, le=1_000)] | None = None
    safety_level: Literal["strict", "standard"] | None = None
    fallback_provider: Name | None = None
    fallback_model: Short | None = None
