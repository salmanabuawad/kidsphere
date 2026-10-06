"""Quick and structured observations: request bodies (spec §21, observation model D14).

Only ``observation`` (what happened) is required. Everything else is optional:

- ``area`` is a ``priority_categories`` key, ``context`` an ``observation_contexts`` key.
- ``domains`` are AI domains (``ai_domains``, the 12 keys of app.models.AI_DOMAIN_VALUES):
  the history filters and the AI data minimisation use them.
- ``attributes`` = {frequency: observation_frequency key, duration_minutes 1–90,
  intensity: light|moderate|strong}: descriptive only, never a score.
- ``support_level`` uses the one support scale (independent | some_support |
  significant_support | not_observed); the UI shows the short labels
  Independent / With support / Difficult.
- ``what_helped`` is a list of ``what_helps`` keys or ``{"custom": "text"}``;
  it is stored as ``[{"key": k} | {"custom": text}]``.
- ``details`` holds the Observe → Understand → Act stages (D14):
  A ``what_i_see``; B ``when_detail`` {time, activity (observation_contexts), activity_text,
  with_whom, before_event, after_event}; C ``needs`` {helps[what_helps], text};
  D ``what_we_did`` + ``plan_ref`` {focus_area_id, version_seq}; E ``did_it_change``
  (yes|partly|no), ``what_changed``; and ``documentation``. The older free-text keys
  ``when`` and ``what_needed`` are still accepted (and kept) for earlier observations.
- ``client_request_id`` makes a repeat POST (double tap, retry) return the
  existing row instead of creating a second one.
"""
import uuid
from datetime import datetime
from typing import Annotated, Literal, get_args

from pydantic import AfterValidator, BeforeValidator, Field, field_validator

from app import vocab
from app.models import AI_DOMAIN_VALUES
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


def _text(max_length: int):
    return Annotated[Annotated[str, Field(max_length=max_length)] | None, BeforeValidator(_blank_to_none)]


ObservationText = Annotated[str, Field(min_length=1, max_length=4000)]
ShortText = _text(2000)
AreaKey = Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_key_of("priority_categories"))]
ContextKey = Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_key_of("observation_contexts"))]
RequestId = Annotated[Annotated[str, Field(max_length=100)] | None, BeforeValidator(_blank_to_none)]
AiDomain = Literal[
    "emotional", "social", "communication", "language", "executive_function", "play", "gross_motor",
    "fine_motor", "independence", "sensory", "cognitive", "daily_routine",
]
assert set(get_args(AiDomain)) == set(AI_DOMAIN_VALUES)
Intensity = Literal["light", "moderate", "strong"]


class CustomHelp(StrictModel):
    custom: Annotated[str, Field(min_length=1, max_length=200)]


class KeyHelp(StrictModel):
    key: Annotated[str, Field(min_length=1, max_length=100)]


HelpItem = Annotated[str, Field(max_length=100)] | CustomHelp
# Stage C also accepts the stored {"key"} form, so a stored document can be sent back as is.
AnyHelpItem = Annotated[str, Field(max_length=100)] | KeyHelp | CustomHelp


def normalize_helps(items: list | None) -> list[dict] | None:
    """Validated input list → stored ``[{key} | {custom}]`` (deduplicated, order kept)."""
    if items is None:
        return None
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for raw in items:
        if isinstance(raw, CustomHelp):
            entry = ("custom", raw.custom)
        elif isinstance(raw, KeyHelp):
            entry = ("key", raw.key)
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
        key = item.key if isinstance(item, KeyHelp) else item if isinstance(item, str) else None
        if key is not None and not vocab.is_valid("what_helps", key):
            raise ValueError(f"unknown what_helps key {key!r}")
    return v


class WhenDetail(StrictModel):
    """Stage B: when does it happen? (with_whom, before and after may name people; never sent to AI)."""

    time: _text(60) = None
    activity: ContextKey = None
    activity_text: _text(200) = None
    with_whom: _text(200) = None
    before_event: _text(200) = None
    after_event: _text(200) = None


class ObservationNeeds(StrictModel):
    """Stage C: what the child may need (what_helps chips + other)."""

    helps: Annotated[list[AnyHelpItem] | None, Field(max_length=12), AfterValidator(_check_helps)] = None
    text: _text(500) = None


class PlanRef(StrictModel):
    """Stage D: the Current Focus (plan goal) this step belongs to; ``version_seq`` is the
    plan version it followed (filled in by the server when it is not given)."""

    focus_area_id: uuid.UUID
    version_seq: Annotated[int, Field(ge=1)] | None = None


def prune(value):
    """Drop None, blank strings and empty lists/objects, recursively."""
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            v = prune(v)
            if v is not None and v != "" and v != [] and v != {}:
                out[k] = v
        return out
    if isinstance(value, list):
        return [p for p in (prune(v) for v in value) if p is not None and p != "" and p != [] and p != {}]
    return value


class ObservationDetails(StrictModel):
    """The observation model's stages A–E (D14): observe → understand → act."""

    what_i_see: ShortText = None
    when: ShortText = None
    when_detail: WhenDetail | None = None
    what_needed: ShortText = None
    needs: ObservationNeeds | None = None
    what_we_did: ShortText = None
    plan_ref: PlanRef | None = None
    did_it_change: Annotated[Literal["yes", "partly", "no"] | None, BeforeValidator(_blank_to_none)] = None
    what_changed: _text(1000) = None
    documentation: _text(2000) = None

    def stored(self) -> dict | None:
        data = self.model_dump(mode="json", exclude_none=True)
        if self.needs is not None and self.needs.helps is not None:
            data.setdefault("needs", {})["helps"] = normalize_helps(self.needs.helps)
        data = prune(data)
        return data or None


class ObservationAttributes(StrictModel):
    """How often / how long / how strongly: descriptive, never a score (principle 3)."""

    frequency: Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_key_of("observation_frequency"))] = None
    duration_minutes: Annotated[int, Field(ge=1, le=90)] | None = None
    intensity: Annotated[Intensity | None, BeforeValidator(_blank_to_none)] = None

    def stored(self) -> dict | None:
        data = self.model_dump(exclude_none=True)
        return data or None


def _unique(values):
    if values is None:
        return None
    return list(dict.fromkeys(values))


Domains = Annotated[list[AiDomain] | None, Field(max_length=len(AI_DOMAIN_VALUES)), AfterValidator(_unique)]


class _ObservationFields(StrictModel):
    observed_at: datetime | None = None
    focus_area_id: uuid.UUID | None = None
    area: AreaKey = None
    context: ContextKey = None
    support_level: SupportLevel | None = None
    what_helped: Annotated[list[HelpItem] | None, Field(max_length=20), AfterValidator(_check_helps)] = None
    note: ShortText = None
    details: ObservationDetails | None = None
    domains: Domains = None
    attributes: ObservationAttributes | None = None


class ObservationCreate(_ObservationFields):
    """POST /api/children/{id}/observations. Without ``domains`` they are derived from ``area``."""

    observation: ObservationText
    client_request_id: RequestId = None


class ObservationUpdate(_ObservationFields):
    """PUT /api/observations/{id}: only the fields that are sent change.
    ``observation`` cannot be cleared; ``domains: null`` or ``[]`` clears the domains."""

    observation: ObservationText | None = None

    @field_validator("observation")
    @classmethod
    def _not_null(cls, v):
        if v is None:
            raise ValueError("the observation text cannot be removed")
        return v
