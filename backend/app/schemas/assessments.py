"""Teacher full observation (observation model, sections א and D1–D13): request bodies.

One observation cycle = one ``teacher_assessments`` row (header = section א). Each
save of a domain appends a full domain document to ``teacher_assessment_entries``
(never overwritten); the latest one is cached in ``teacher_assessments.domains``.

Domain documents (COVERAGE-MATRIX §3.3.5). Every key is optional; an item that is
not sent is "not observed yet" and is not stored:

- emotional, social, language, executive_function, play, gross_motor, fine_motor, cognitive::

      {items: {<item_key>: {level: support_levels key, note ≤500, seen_in?: observation_contexts key,
                            observation_ids?: [uuid]}},
       fields: {…per domain, below…},
       strengths_here?: [strengths key | {custom}]}

  fields: emotional what_makes_it_harder{text, contexts[]}, what_helps_calm{items[calming_helps], text};
  social main_observation{text, observation_ids[]}; language language_examples{text};
  executive_function attention_span{by_context[{context, approx_minutes 1–90, note}], text};
  play preferred_play{items[interests], text}; gross_motor avoids_physical_activity (yes|no),
  avoidance_details; fine_motor strengths{items[strengths], text}, support_area_text; cognitive: none.
  The curiosity item (cognitive.curiosity_exploration) is note-first: its level is optional.
- independence: ``{items: {<area>: {level, note ≤300}}}`` (8 areas; the UI offers
  Independent / Needs help (= some_support) first, "More" adds the other two levels).
- sensory: ``{items: {<stimulus>: {effect: sensory_effects key, reaction_text ≤500, helps[what_helps]}},
  fields: {when_too_much_text ≤1000, what_helps_regulate{helps[what_helps], text}}}``. There is
  no level here (never a score): a ``level`` key is rejected.
- daily_routine: ``{stages: {<stage>: {succeeds, difficult, support_needed{helps, text},
  what_helps{helps, text}, observation_ids[]}}}`` for the 9 day stages (observation_contexts).
- strengths: ``{items: [≤5 {list: strengths|interests, key | custom, note ≤300, observation_ids[]}],
  fields: {prominent_interests{items[interests], text ≤500}}}``. Fewer than 3 only warns.
- priority_needs: ``{needs: [≤3 {area: need_areas key, seeing, how_often, situations{contexts[], text},
  what_seems_harder, already_tried, what_helped{helps, text}, focus_area_id?}]}``; areas are unique.

Every document may carry ``carried_from: {assessment_id, entry_id, filled_on}`` (set by a
reassessment that copies the earlier cycle forward). Option lists are validated against
app.vocab; choice lists accept a key string, ``{"key"}`` or ``{"custom"}`` and are stored
as ``{"key"}`` / ``{"custom"}``. Item keys mirror app/data/source/observation_model.json
(tests/test_assessments.py checks both directions).
"""
import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field, ValidationError, create_model, model_validator

from app import vocab
from app.errors import AppError
from app.models import ASSESSMENT_DOMAIN_VALUES
from app.schemas.common import StrictModel, SupportLevel

AssessmentDomain = Literal[
    "emotional", "social", "language", "executive_function", "play", "gross_motor", "fine_motor",
    "independence", "sensory", "cognitive", "daily_routine", "strengths", "priority_needs",
]
SectionStatus = Literal["not_started", "in_progress", "sufficient", "review_later"]
AssessmentKind = Literal["initial", "reassessment"]

DOMAINS: tuple[str, ...] = ASSESSMENT_DOMAIN_VALUES

# Indicator rows per item domain, in source order (registry kind "level_item").
DOMAIN_ITEMS: dict[str, tuple[str, ...]] = {
    "emotional": (
        "recognizes_basic_emotions", "expresses_feelings_appropriately", "calms_after_frustration",
        "copes_with_separation", "accepts_routine_change", "asks_for_help", "feels_secure",
    ),
    "social": (
        "initiates_contact", "joins_existing_play", "shares_play_and_objects", "waits_for_turn",
        "accepts_boundaries", "resolves_conflict_with_support", "shows_empathy", "joins_group_play",
        "connects_with_different_children",
    ),
    "language": (
        "follows_simple_instructions", "follows_multi_step_instructions", "understands_questions",
        "understands_basic_concepts", "uses_range_of_words", "combines_sentences", "tells_about_experience",
        "describes_event_or_picture", "asks_questions", "expresses_needs_in_words", "listens_to_others",
        "holds_short_conversation", "waits_turn_in_conversation", "adjusts_speech_to_situation",
    ),
    "executive_function": (
        "listens_to_story", "takes_part_in_group_time", "completes_activity", "persists_in_task",
        "understands_what_is_asked", "starts_task", "finishes_task", "organizes_materials",
        "moves_between_activities", "accepts_change", "tries_another_way", "copes_with_mistakes",
    ),
    "play": (
        "chooses_activity", "plays_independently", "persists_in_play", "imaginative_play", "role_play",
        "imitates_everyday_life", "parallel_play", "leads_shared_play", "accepts_others_ideas",
    ),
    "gross_motor": (
        "walking_running", "two_foot_jump", "one_foot_hop", "stairs", "balance", "climbing",
        "throwing_catching", "movement_games",
    ),
    "fine_motor": (
        "tool_grip", "free_drawing", "copying_shapes", "colouring", "cutting", "gluing", "threading",
        "block_building", "puzzles", "bilateral_coordination",
    ),
    "independence": (
        "eating", "drinking", "toilet", "washing_hands", "dressing", "shoes", "organizing_belongings",
        "keeping_belongings",
    ),
    "cognitive": (
        "matching_sorting", "colours", "shapes", "size_concepts", "quantity_concepts", "sequencing", "memory",
        "picture_object_matching", "cause_effect", "simple_problem_solving", "curiosity_exploration",
    ),
}
ITEM_DOMAINS = ("emotional", "social", "language", "executive_function", "play", "gross_motor", "fine_motor",
                "cognitive")
SENSORY_STIMULI = ("noise", "touch", "textures", "dirt", "light", "smells", "movement", "crowded_spaces",
                   "creative_activities")
DAY_STAGES = ("arrival", "free_play", "group_time", "structured_activity", "yard", "meal", "art", "transition",
              "end_of_day")
# Domain fields per domain (registry kind "field").
DOMAIN_FIELDS: dict[str, tuple[str, ...]] = {
    "emotional": ("what_makes_it_harder", "what_helps_calm"),
    "social": ("main_observation",),
    "language": ("language_examples",),
    "executive_function": ("attention_span",),
    "play": ("preferred_play",),
    "gross_motor": ("avoids_physical_activity", "avoidance_details"),
    "fine_motor": ("strengths", "support_area_text"),
    "cognitive": (),
    "sensory": ("when_too_much_text", "what_helps_regulate"),
    "strengths": ("prominent_interests",),
}
NEED_FIELDS = ("seeing", "how_often", "situations", "what_seems_harder", "already_tried", "what_helped")
STAGE_FIELDS = ("succeeds", "difficult", "support_needed", "what_helps")
MAX_STRENGTHS = 5
MAX_NEEDS = 3
CUSTOM_MAX = 120
MAX_OBSERVATION_IDS = 20
# Option lists an applied "what helps" key may come from (merged what_helps items carry their list).
WHAT_HELPS_LISTS = ("what_helps", "calming_helps", "transition_helps", "sad_helps", "sensitivity_helps")


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


def _text(max_length: int):
    return Annotated[Annotated[str, Field(max_length=max_length)] | None, BeforeValidator(_blank_to_none)]


def _key_of(list_name: str):
    def check(v):
        if v is not None and not vocab.is_valid(list_name, v):
            raise ValueError(f"unknown {list_name} key {v!r}")
        return v

    return check


Text200 = _text(200)
Text300 = _text(300)
Text500 = _text(500)
Text1000 = _text(1000)
Text2000 = _text(2000)
ContextKey = Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_key_of("observation_contexts"))]
ObservationIds = Annotated[list[uuid.UUID] | None, Field(max_length=MAX_OBSERVATION_IDS)]


def _unique(values):
    if values is None:
        return None
    return list(dict.fromkeys(values))


Contexts = Annotated[list[Annotated[str, AfterValidator(_key_of("observation_contexts"))]] | None,
                     Field(max_length=10), AfterValidator(_unique)]


class Choice(StrictModel):
    """One option of a list: a vocabulary ``key`` or a ``custom`` text (exactly one)."""

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

    def ident(self) -> tuple[str, str]:
        return ("k", self.key) if self.key else ("c", self.custom.casefold())


def _choices(list_name: str, max_items: int = 20):
    def check(items):
        if items is None:
            return None
        out, seen = [], set()
        for item in items:
            if item.key is not None and not vocab.is_valid(list_name, item.key):
                raise ValueError(f"unknown {list_name} key {item.key!r}")
            if item.ident() not in seen:
                seen.add(item.ident())
                out.append(item)
        return out

    return Annotated[list[Choice] | None, Field(max_length=max_items), AfterValidator(check)]


WhatHelps = _choices("what_helps")


# --------------------------------------------------------------------------- shared parts


class CarriedFrom(StrictModel):
    assessment_id: uuid.UUID
    entry_id: uuid.UUID | None = None
    filled_on: date | None = None


class ItemRating(StrictModel):
    """One indicator row: How much support was needed? (+ a note)."""

    level: SupportLevel | None = None
    note: Text500 = None
    seen_in: ContextKey = None
    observation_ids: ObservationIds = None


class IndependenceRating(StrictModel):
    level: SupportLevel | None = None
    note: Text300 = None


class ContextsText(StrictModel):
    text: Text1000 = None
    contexts: Contexts = None


class HelpsText(StrictModel):
    helps: WhatHelps = None
    text: Text1000 = None


class HelpsShortText(StrictModel):
    helps: WhatHelps = None
    text: Text500 = None


def _items_model(name: str, keys: tuple[str, ...], rating) -> type[StrictModel]:
    return create_model(name, __base__=StrictModel, **{k: (rating | None, None) for k in keys})


# --------------------------------------------------------------------------- domain fields


class CalmHelps(StrictModel):
    items: _choices("calming_helps") = None
    text: Text1000 = None


class EmotionalFields(StrictModel):
    what_makes_it_harder: ContextsText | None = None
    what_helps_calm: CalmHelps | None = None


class MainObservation(StrictModel):
    text: Text2000 = None
    observation_ids: ObservationIds = None


class SocialFields(StrictModel):
    main_observation: MainObservation | None = None


class LanguageExamples(StrictModel):
    text: Text2000 = None


class LanguageFields(StrictModel):
    language_examples: LanguageExamples | None = None


class AttentionContext(StrictModel):
    """About how long the child stays with it in one situation (a description, never a score)."""

    context: Annotated[str, AfterValidator(_key_of("observation_contexts"))]
    approx_minutes: Annotated[int, Field(ge=1, le=90)] | None = None
    note: Text300 = None


class AttentionSpan(StrictModel):
    by_context: Annotated[list[AttentionContext] | None, Field(max_length=10)] = None
    text: Text1000 = None


class ExecutiveFunctionFields(StrictModel):
    attention_span: AttentionSpan | None = None


class PreferredPlay(StrictModel):
    items: _choices("interests") = None
    text: Text1000 = None


class PlayFields(StrictModel):
    preferred_play: PreferredPlay | None = None


class GrossMotorFields(StrictModel):
    avoids_physical_activity: Annotated[Literal["yes", "no"] | None, BeforeValidator(_blank_to_none)] = None
    avoidance_details: Text1000 = None


class FineMotorStrengths(StrictModel):
    items: _choices("strengths") = None
    text: Text1000 = None


class FineMotorFields(StrictModel):
    strengths: FineMotorStrengths | None = None
    support_area_text: Text1000 = None


class CognitiveFields(StrictModel):
    pass


def _item_domain(name: str, domain: str, fields_model) -> type[StrictModel]:
    items = _items_model(f"{name}Items", DOMAIN_ITEMS[domain], ItemRating)
    return create_model(
        name,
        __base__=StrictModel,
        items=(items | None, None),
        fields=(fields_model | None, None),
        strengths_here=(_choices("strengths", 10), None),
        carried_from=(CarriedFrom | None, None),
    )


EmotionalDomain = _item_domain("EmotionalDomain", "emotional", EmotionalFields)
SocialDomain = _item_domain("SocialDomain", "social", SocialFields)
LanguageDomain = _item_domain("LanguageDomain", "language", LanguageFields)
ExecutiveFunctionDomain = _item_domain("ExecutiveFunctionDomain", "executive_function", ExecutiveFunctionFields)
PlayDomain = _item_domain("PlayDomain", "play", PlayFields)
GrossMotorDomain = _item_domain("GrossMotorDomain", "gross_motor", GrossMotorFields)
FineMotorDomain = _item_domain("FineMotorDomain", "fine_motor", FineMotorFields)
CognitiveDomain = _item_domain("CognitiveDomain", "cognitive", CognitiveFields)


class IndependenceDomain(StrictModel):
    items: _items_model("IndependenceItems", DOMAIN_ITEMS["independence"], IndependenceRating) | None = None
    carried_from: CarriedFrom | None = None


# --------------------------------------------------------------------------- D9 sensory (no level, no score)


class SensoryRating(StrictModel):
    effect: Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_key_of("sensory_effects"))] = None
    reaction_text: Text500 = None
    helps: WhatHelps = None


class SensoryFields(StrictModel):
    when_too_much_text: Text1000 = None
    what_helps_regulate: HelpsText | None = None


class SensoryDomain(StrictModel):
    items: _items_model("SensoryItems", SENSORY_STIMULI, SensoryRating) | None = None
    fields: SensoryFields | None = None
    carried_from: CarriedFrom | None = None


# --------------------------------------------------------------------------- D11 day map


class DayStage(StrictModel):
    succeeds: Text500 = None
    difficult: Text500 = None
    support_needed: HelpsShortText | None = None
    what_helps: HelpsShortText | None = None
    observation_ids: ObservationIds = None


class DailyRoutineDomain(StrictModel):
    stages: _items_model("DayStages", DAY_STAGES, DayStage) | None = None
    carried_from: CarriedFrom | None = None


# --------------------------------------------------------------------------- D12 strengths


class StrengthSlot(StrictModel):
    """One ordered strength: a strengths or interests key, or a custom text."""

    list: Literal["strengths", "interests"] = "strengths"
    key: str | None = Field(default=None, max_length=80)
    custom: str | None = Field(default=None, max_length=CUSTOM_MAX)
    note: Text300 = None
    observation_ids: ObservationIds = None

    @model_validator(mode="after")
    def _check(self):
        if self.custom is not None and not self.custom.strip():
            self.custom = None
        if self.key is not None and self.custom is not None:
            raise ValueError("give either a key or a custom text")
        if self.key is not None and not vocab.is_valid(self.list, self.key):
            raise ValueError(f"unknown {self.list} key {self.key!r}")
        return self

    def empty(self) -> bool:
        return self.key is None and self.custom is None


class ProminentInterests(StrictModel):
    items: _choices("interests") = None
    text: Text500 = None


class StrengthsFields(StrictModel):
    prominent_interests: ProminentInterests | None = None


StrengthSlots = Annotated[list[StrengthSlot] | None, Field(max_length=10)]


class StrengthsDomain(StrictModel):
    items: StrengthSlots = None
    fields: StrengthsFields | None = None
    carried_from: CarriedFrom | None = None

    @model_validator(mode="after")
    def _slots(self):
        if self.items is not None:
            self.items = [s for s in self.items if not s.empty()]
            if len(self.items) > MAX_STRENGTHS:
                raise ValueError(f"at most {MAX_STRENGTHS} strengths")
        return self


# --------------------------------------------------------------------------- D13 priority needs


class NeedSituations(StrictModel):
    contexts: Contexts = None
    text: Text500 = None


class PriorityNeed(StrictModel):
    """One area to focus on next (never a diagnosis); a Current Focus candidate."""

    area: Annotated[str, AfterValidator(_key_of("need_areas"))]
    seeing: Text1000 = None
    how_often: Text300 = None
    situations: NeedSituations | None = None
    what_seems_harder: Text500 = None
    already_tried: Text500 = None
    what_helped: HelpsShortText | None = None
    focus_area_id: uuid.UUID | None = None


class PriorityNeedsDomain(StrictModel):
    needs: Annotated[list[PriorityNeed] | None, Field(max_length=MAX_NEEDS)] = None
    carried_from: CarriedFrom | None = None

    @model_validator(mode="after")
    def _unique_areas(self):
        areas = [n.area for n in self.needs or []]
        if len(areas) != len(set(areas)):
            raise ValueError("each area can be marked once")
        return self


DOMAIN_MODELS: dict[str, type[StrictModel]] = {
    "emotional": EmotionalDomain,
    "social": SocialDomain,
    "language": LanguageDomain,
    "executive_function": ExecutiveFunctionDomain,
    "play": PlayDomain,
    "gross_motor": GrossMotorDomain,
    "fine_motor": FineMotorDomain,
    "independence": IndependenceDomain,
    "sensory": SensoryDomain,
    "cognitive": CognitiveDomain,
    "daily_routine": DailyRoutineDomain,
    "strengths": StrengthsDomain,
    "priority_needs": PriorityNeedsDomain,
}
assert set(DOMAIN_MODELS) == set(DOMAINS)


def prune(value):
    """Drop None, blank strings and empty lists/objects, recursively (an unrated item is not stored)."""
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            v = prune(v)
            if v is not None and v != "" and v != [] and v != {}:
                out[k] = v
        return out
    if isinstance(value, list):
        out = []
        for v in value:
            v = prune(v)
            if v is not None and v != "" and v != [] and v != {}:
                out.append(v)
        return out
    return value


def _error_details(exc: ValidationError) -> list[dict]:
    return [{"path": ".".join(["data", *(str(p) for p in err.get("loc", ()))]), "message": err.get("msg", "invalid")}
            for err in exc.errors()]


def validate_domain(domain: str, data) -> dict:
    """The stored document for one domain, or 400 VALIDATION (details carry ``data.<path>``)."""
    model = DOMAIN_MODELS[domain]
    if data is None:
        data = {}
    try:
        parsed = model.model_validate(data)
    except ValidationError as exc:
        raise AppError("VALIDATION", details=_error_details(exc)) from None
    return prune(parsed.model_dump(mode="json", exclude_none=True))


# --------------------------------------------------------------------------- request bodies


class DomainPut(StrictModel):
    """PUT /api/teacher-assessments/{aid}/domains/{domain}: appends one entry."""

    status: SectionStatus = "in_progress"
    data: dict = Field(default_factory=dict)


def _check_period(period_from: date | None, period_to: date | None) -> None:
    if period_from is not None and period_to is not None and period_from > period_to:
        raise ValueError("period_from must be on or before period_to")


class AssessmentCreate(StrictModel):
    """POST /api/children/{id}/teacher-assessments (one open cycle per child).

    ``kind`` defaults to initial for the first cycle and reassessment afterwards.
    ``copy_forward`` copies the latest domain documents of the previous cycle as
    in_progress entries tagged ``carried_from``."""

    kind: AssessmentKind | None = None
    filled_on: date | None = None
    period_from: date | None = None
    period_to: date | None = None
    period_note: Text500 = None
    teacher_id: uuid.UUID | None = None
    filled_by_text: Text200 = None
    copy_forward: bool = False

    @model_validator(mode="after")
    def _period(self):
        _check_period(self.period_from, self.period_to)
        return self


HEADER_FIELDS = ("filled_on", "period_from", "period_to", "period_note", "teacher_id", "filled_by_text")


class AssessmentHeaderPatch(StrictModel):
    """PATCH /api/teacher-assessments/{aid}: only the fields that are sent change (open cycles only)."""

    filled_on: date | None = None
    period_from: date | None = None
    period_to: date | None = None
    period_note: Text500 = None
    teacher_id: uuid.UUID | None = None
    filled_by_text: Text200 = None


class ApplyItem(StrictModel):
    """One item to add to a profile list; ``list`` names the option list of a what_helps key."""

    key: str | None = Field(default=None, max_length=80)
    custom: str | None = Field(default=None, max_length=CUSTOM_MAX)
    list: str | None = Field(default=None, max_length=40)

    @model_validator(mode="before")
    @classmethod
    def _from_string(cls, v):
        return {"key": v} if isinstance(v, str) else v

    @model_validator(mode="after")
    def _exactly_one(self):
        if self.custom is not None and not self.custom.strip():
            self.custom = None
        if (self.key is None) == (self.custom is None):
            raise ValueError("give either a key or a custom text")
        return self


ApplyItems = Annotated[list[ApplyItem], Field(min_length=1, max_length=10)]


class AssessmentApply(StrictModel):
    """POST /api/teacher-assessments/{aid}/apply: add teacher-observed items to the profile
    lists (source ``observation``, ``via: {assessment_id, domain}``)."""

    list: Literal["strengths", "interests", "what_helps"]
    domain: AssessmentDomain
    items: ApplyItems

    @model_validator(mode="after")
    def _keys(self):
        for item in self.items:
            if self.list == "what_helps":
                option_list = item.list or "what_helps"
                if option_list not in WHAT_HELPS_LISTS:
                    raise ValueError(f"unknown what_helps list {option_list!r}")
                item.list = option_list if item.key is not None else None
            else:
                if item.list not in (None, self.list):
                    raise ValueError(f"an item of {self.list} cannot come from {item.list!r}")
                option_list = self.list
                item.list = None
            if item.key is not None and not vocab.is_valid(option_list, item.key):
                raise ValueError(f"unknown {option_list} key {item.key!r}")
        return self


class NeedFocus(StrictModel):
    """POST /api/teacher-assessments/{aid}/needs/{i}/focus. The title defaults to the
    area's label; the area "behaviour" needs a concrete title."""

    title: Text200 = None
    category: Annotated[str | None, BeforeValidator(_blank_to_none),
                        AfterValidator(_key_of("priority_categories"))] = None
