"""Quick observations: request bodies (spec §21, observation model).

Only ``observation`` (what happened) is required. Everything else is optional:

- ``area`` is a ``priority_categories`` key, ``context`` an ``observation_contexts`` key.
- ``support_level`` uses the one support scale (independent | some_support |
  significant_support | not_observed); the UI shows the short labels
  Independent / With support / Difficult.
- ``what_helped`` is a list of ``what_helps`` keys or ``{"custom": "text"}``;
  it is stored as ``[{"key": k} | {"custom": text}]``.
- ``details`` holds the observation model's five optional stages.
- ``client_request_id`` makes a repeat POST (double tap, retry) return the
  existing row instead of creating a second one.
"""
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field, field_validator

from app import vocab
from app.schemas.common import StrictModel, SupportLevel


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


def _key_of(list_name: str):
    def check(v: str | None):
        if v is not None and not vocab.is_valid(list_name, v):
            raise ValueError(f"unknown {list_name} key {v!r}")
        return v

    return check


ObservationText = Annotated[str, Field(min_length=1, max_length=4000)]
ShortText = Annotated[Annotated[str, Field(max_length=2000)] | None, BeforeValidator(_blank_to_none)]
AreaKey = Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_key_of("priority_categories"))]
ContextKey = Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_key_of("observation_contexts"))]
RequestId = Annotated[Annotated[str, Field(max_length=100)] | None, BeforeValidator(_blank_to_none)]


class CustomHelp(StrictModel):
    custom: Annotated[str, Field(min_length=1, max_length=200)]


HelpItem = Annotated[str, Field(max_length=100)] | CustomHelp


class ObservationDetails(StrictModel):
    """The observation model's five stages: what I see → when → what was
    needed → what we did → did it change."""

    what_i_see: ShortText = None
    when: ShortText = None
    what_needed: ShortText = None
    what_we_did: ShortText = None
    did_it_change: Annotated[Literal["yes", "partly", "no"] | None, BeforeValidator(_blank_to_none)] = None

    def stored(self) -> dict | None:
        data = self.model_dump(exclude_none=True)
        return data or None


def normalize_helps(items: list | None) -> list[dict] | None:
    """Validated input list → stored ``[{key} | {custom}]`` (deduplicated, order kept)."""
    if items is None:
        return None
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for raw in items:
        if isinstance(raw, CustomHelp):
            entry = ("custom", raw.custom)
        else:
            entry = ("key", raw)
        if entry not in seen:
            seen.add(entry)
            out.append({entry[0]: entry[1]})
    return out or None


def _check_helps(v: list | None):
    if v is None:
        return v
    for item in v:
        if isinstance(item, str) and not vocab.is_valid("what_helps", item):
            raise ValueError(f"unknown what_helps key {item!r}")
    return v


class _ObservationFields(StrictModel):
    observed_at: datetime | None = None
    focus_area_id: uuid.UUID | None = None
    area: AreaKey = None
    context: ContextKey = None
    support_level: SupportLevel | None = None
    what_helped: Annotated[list[HelpItem] | None, Field(max_length=20), AfterValidator(_check_helps)] = None
    note: ShortText = None
    details: ObservationDetails | None = None


class ObservationCreate(_ObservationFields):
    """POST /api/children/{id}/observations."""

    observation: ObservationText
    client_request_id: RequestId = None


class ObservationUpdate(_ObservationFields):
    """PUT /api/observations/{id}: only the fields that are sent change.
    ``observation`` cannot be cleared."""

    observation: ObservationText | None = None

    @field_validator("observation")
    @classmethod
    def _not_null(cls, v):
        if v is None:
            raise ValueError("the observation text cannot be removed")
        return v
