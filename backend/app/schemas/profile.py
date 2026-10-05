"""Profile sections written by the wizard (PATCH /api/children/{id}/profile).

Every section is validated against the shared vocabulary (app/data/options.json).
Option values are stored as keys; where the spec allows free text an item may be
``{"custom": "text"}`` instead. Input items may be given as a plain key string,
``{"key": "..."}`` or ``{"custom": "..."}``; they are stored as objects.

Sections (ARCHITECTURE §4; ``basic`` is WP-05's PUT /api/children/{id}):

- who:          describe_words, strengths, interests, motivators (items), appreciate (text)
- emotions:     helps_when_sad, frustration_reactions, calming_helps, transition_helps (items),
                transition_reaction, morning_separation (single key), calming_notes,
                what_does_not_help (text)
- social:       social, communication (keys), comments (text)
- independence: levels {independence_area: support_level}, notes (text)
- environment:  items [{key|custom, what_happens?, what_helps[items]}], notes (text)
- priorities:   parent_priorities, hope_child_feels (keys), priorities_note, one_thing_to_know (text)
"""
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field, ValidationError, model_validator

from app import vocab
from app.errors import AppError
from app.schemas.common import StrictModel, SupportLevel

Perspective = Literal["parent", "teacher"]
SectionName = Literal["who", "emotions", "social", "independence", "environment", "priorities"]
SECTIONS: tuple[str, ...] = ("who", "emotions", "social", "independence", "environment", "priorities")

CUSTOM_MAX = 120
TEXT_MAX = 2000


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


Text = Annotated[Annotated[str, Field(max_length=TEXT_MAX)] | None, BeforeValidator(_blank_to_none)]


class ItemIn(StrictModel):
    """One option: a vocabulary ``key`` or a ``custom`` text (exactly one)."""

    key: str | None = Field(default=None, max_length=80)
    custom: str | None = Field(default=None, max_length=CUSTOM_MAX)

    @model_validator(mode="before")
    @classmethod
    def _from_string(cls, v):
        return {"key": v} if isinstance(v, str) else v

    @model_validator(mode="after")
    def _exactly_one(self):
        if self.custom is not None and not self.custom:
            self.custom = None
        if (self.key is None) == (self.custom is None):
            raise ValueError("give either a key or a custom text")
        return self


def ident(item) -> tuple[str, str] | None:
    """Identity of a stored/input item: ("k", key) or ("c", casefolded custom)."""
    if isinstance(item, str):
        return ("k", item)
    if isinstance(item, dict):
        if item.get("key"):
            return ("k", item["key"])
        if item.get("custom"):
            return ("c", str(item["custom"]).strip().casefold())
        return None
    key = getattr(item, "key", None)
    if key:
        return ("k", key)
    custom = getattr(item, "custom", None)
    return ("c", custom.strip().casefold()) if custom else None


def _check_items(list_name: str, custom: bool):
    def check(items: list):
        out, seen = [], set()
        for item in items:
            if item.key is not None and not vocab.is_valid(list_name, item.key):
                raise ValueError(f"unknown option {item.key!r} for {list_name}")
            if item.custom is not None and not custom:
                raise ValueError(f"{list_name} does not accept custom entries")
            i = ident(item)
            if i not in seen:
                seen.add(i)
                out.append(item)
        return out

    return check


def Items(list_name: str, custom: bool = True, max_items: int = 20):
    return Annotated[list[ItemIn], Field(default_factory=list, max_length=max_items), AfterValidator(_check_items(list_name, custom))]


def _check_keys(list_name: str):
    def check(keys: list[str]):
        out = []
        for k in keys:
            if not vocab.is_valid(list_name, k):
                raise ValueError(f"unknown option {k!r} for {list_name}")
            if k not in out:
                out.append(k)
        return out

    return check


def Keys(list_name: str, max_items: int = 20):
    return Annotated[list[str], Field(default_factory=list, max_length=max_items), AfterValidator(_check_keys(list_name))]


def _check_key(list_name: str):
    def check(k: str | None):
        if k is not None and not vocab.is_valid(list_name, k):
            raise ValueError(f"unknown option {k!r} for {list_name}")
        return k

    return check


def Key(list_name: str):
    return Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_check_key(list_name))]


class WhoSection(StrictModel):
    describe_words: Items("describe_words", max_items=8)
    strengths: Items("strengths")
    interests: Items("interests")
    motivators: Items("motivators")
    appreciate: Text = None


class EmotionsSection(StrictModel):
    helps_when_sad: Items("sad_helps")
    frustration_reactions: Items("frustration_reactions")
    calming_helps: Items("calming_helps")
    calming_notes: Text = None
    transition_reaction: Key("transition_reactions") = None
    transition_helps: Items("transition_helps")
    morning_separation: Key("morning_separation") = None
    what_does_not_help: Text = None


class SocialSection(StrictModel):
    social: Keys("social")
    communication: Keys("communication")
    comments: Text = None


def _check_levels(levels: dict[str, SupportLevel]):
    for area in levels:
        if not vocab.is_valid("independence_areas", area):
            raise ValueError(f"unknown independence area {area!r}")
    return levels


class IndependenceSection(StrictModel):
    levels: Annotated[dict[str, SupportLevel], Field(default_factory=dict), AfterValidator(_check_levels)]
    notes: Text = None


class SensitivityIn(ItemIn):
    what_happens: str | None = Field(default=None, max_length=500)
    what_helps: Items("sensitivity_helps", max_items=10)

    @model_validator(mode="after")
    def _clean(self):
        if self.what_happens is not None and not self.what_happens:
            self.what_happens = None
        return self


def _check_sensitivities(items: list[SensitivityIn]):
    out, seen = [], set()
    for item in items:
        if item.key is not None and not vocab.is_valid("sensitivities", item.key):
            raise ValueError(f"unknown option {item.key!r} for sensitivities")
        i = ident(item)
        if i not in seen:
            seen.add(i)
            out.append(item)
    return out


class EnvironmentSection(StrictModel):
    items: Annotated[list[SensitivityIn], Field(default_factory=list, max_length=20), AfterValidator(_check_sensitivities)]
    notes: Text = None


class PrioritiesSection(StrictModel):
    parent_priorities: Keys("priority_categories")
    priorities_note: Text = None
    hope_child_feels: Keys("hope_child_feels")
    one_thing_to_know: Text = None


SECTION_MODELS: dict[str, type[StrictModel]] = {
    "who": WhoSection,
    "emotions": EmotionsSection,
    "social": SocialSection,
    "independence": IndependenceSection,
    "environment": EnvironmentSection,
    "priorities": PrioritiesSection,
}


def validate_section(section: str, data) -> dict:
    """Validate ``data`` for ``section`` and return the JSON to store (None values dropped).

    Raises 400 VALIDATION with ``details=[{path: "data.<field>", message}]``.
    """
    model = SECTION_MODELS[section]
    try:
        parsed = model.model_validate(data if data is not None else {})
    except ValidationError as exc:
        details = [
            {"path": ".".join(["data", *(str(p) for p in err.get("loc", ()))]), "message": err.get("msg", "invalid")}
            for err in exc.errors()
        ]
        raise AppError("VALIDATION", details=details) from None
    return parsed.model_dump(mode="json", exclude_none=True)


class ProfilePatch(StrictModel):
    """PATCH /api/children/{id}/profile.

    ``perspective`` defaults to the caller's own (parent → parent, staff → teacher).
    ``section``+``data`` replace that section of the perspective; both may be omitted
    to only save ``wizard_step`` ("Save & finish later"). ``complete`` marks the
    caller's wizard as completed.
    """

    perspective: Perspective | None = None
    section: SectionName | None = None
    data: dict | None = None
    wizard_step: int | None = Field(default=None, ge=1, le=8)
    complete: bool = False

    @model_validator(mode="after")
    def _section_and_data(self):
        if self.data is not None and self.section is None:
            raise ValueError("data needs a section")
        return self
