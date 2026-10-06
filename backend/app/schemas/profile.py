"""Profile sections written by the wizard and the parent questionnaire
(PATCH /api/children/{id}/profile).

Every section is validated against the shared vocabulary (app/data/options.json
plus app/data/lists/*.json). Option values are stored as keys; where the source
allows free text an item may be ``{"custom": "text"}`` instead. Input items may be
given as a plain key string, ``{"key": "..."}`` or ``{"custom": "..."}``; they are
stored as objects. Only the fields the client sent are stored (``exclude_unset``),
so a section never grows empty keys it did not have.

Sections shared by both perspectives (the 0001 wizard; ARCHITECTURE §4):

- who:          describe_words, strengths, interests†, motivators (items), appreciate (text)
                + parent questionnaire: parents[{name, relation}], interests_pq{selected, other},
                what_attracts (text)
- emotions:     helps_when_sad, frustration_reactions†, calming_helps, transition_helps† (items),
                transition_reaction†, morning_separation† (single key), calming_notes,
                what_does_not_help (text)
                + when_sad_text, frustration_pq{selected, other}, new_situations,
                overwhelming_situations{value, text}, overwhelm_teacher_should_know
- social:       social†, communication† (keys), comments (text)
                + contact_pq{selected, other}, conflict_reaction,
                significant_friends{value, text}, what_helps_socially
- independence: levels† {independence_area: support_level}, notes (text)
                + levels_pq{area: independent|needs_help}, help_amount{area: a_little|a_lot},
                still_helping, routines_to_keep
- environment:  items† [{key|custom, what_happens?, what_helps[items]}], notes (text)
- priorities:   parent_priorities†, hope_child_feels† (keys), priorities_note, one_thing_to_know† (text)

Parent questionnaire sections (parent perspective only; COVERAGE-MATRIX §3.3.1):
joy, separation, communication, health, behaviour, transitions, expectations,
partnership, heart. Teacher Quick Baseline (teacher perspective only, staff): bridge.

† = legacy projection key. In the parent perspective it is recomputed from the
canonical questionnaire answers (app/services/questionnaire_projection.py); once the
replacing answer exists, a value sent by the client is ignored (PARENT_LEGACY_KEYS).
The teacher perspective writes them directly.

Every section may carry ``not_answered``: names of its own fields the family chose
to skip (X-02). Free-text answers are up to 4000 characters.
"""
from datetime import date as DateType, datetime
from typing import Annotated, ClassVar, Literal

from pydantic import AfterValidator, BeforeValidator, Field, ValidationError, field_validator, model_validator

from app import vocab
from app.errors import AppError
from app.schemas.common import StrictModel, SupportLevel

Perspective = Literal["parent", "teacher"]
SectionStatus = Literal["not_started", "in_progress", "sufficient", "review_later"]
EntryMode = Literal["self", "on_behalf", "meeting"]

# The 0001 wizard sections, written by both perspectives.
LEGACY_SECTIONS: tuple[str, ...] = ("who", "emotions", "social", "independence", "environment", "priorities")
# Parent questionnaire sections that only the parent perspective has.
PARENT_SECTIONS: tuple[str, ...] = (
    "joy", "separation", "communication", "health", "behaviour", "transitions", "expectations", "partnership", "heart",
)
# Teacher Quick Baseline (the "teacher's part" after the questionnaire): staff only.
TEACHER_SECTIONS: tuple[str, ...] = ("bridge",)
SECTIONS: tuple[str, ...] = LEGACY_SECTIONS + PARENT_SECTIONS + TEACHER_SECTIONS
SectionName = Literal[
    "who", "emotions", "social", "independence", "environment", "priorities",
    "joy", "separation", "communication", "health", "behaviour", "transitions", "expectations", "partnership", "heart",
    "bridge",
]

# Legacy keys of the parent perspective → the questionnaire answers that replace them
# (the same pairs as meta.legacy in app/data/source/parent_questionnaire.json). Once one
# of the replacements is answered, the server owns the legacy key: it keeps the stored
# value (then the projection updates it) and ignores what a client sends. Before that,
# an older client (or the demo seed) may still write it. A legacy key the client leaves
# out is always kept: earlier-form answers are never dropped by omission.
PARENT_LEGACY_KEYS: dict[str, dict[str, tuple[str, ...]]] = {
    "who": {"interests": ("who.interests_pq",), "motivators": ("who.what_attracts",)},
    "emotions": {
        "frustration_reactions": ("emotions.frustration_pq",),
        "morning_separation": ("separation.morning",),
        "transition_reaction": ("transitions.stopping_activity",),
        "transition_helps": ("separation.what_helps_entry", "transitions.which_preparation"),
        "what_does_not_help": ("behaviour.what_does_not_work",),
    },
    "social": {
        "social": ("social.contact_pq",),
        "communication": ("communication.expresses_needs", "communication.tells_experiences"),
        "comments": (),
    },
    "independence": {
        "levels": ("independence.levels_pq",),
        "notes": ("independence.still_helping", "independence.routines_to_keep"),
    },
    "environment": {"items": ("health.sensory",), "notes": ()},
    "priorities": {
        "parent_priorities": ("expectations.develop",),
        "hope_child_feels": ("expectations.hope_child_feels",),
        "one_thing_to_know": ("expectations.most_important",),
        "priorities_note": (),
    },
}

CUSTOM_MAX = 120
TEXT_MAX = 4000
OTHER_MAX = 500
NOTE_MAX = 300
PIQ_AREAS: tuple[str, ...] = (
    "eating", "drinking", "toilet", "washing_hands", "dressing", "shoes", "tidying_toys", "keeping_belongings",
)


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


Text = Annotated[Annotated[str, Field(max_length=TEXT_MAX)] | None, BeforeValidator(_blank_to_none)]
OtherText = Annotated[Annotated[str, Field(max_length=OTHER_MAX)] | None, BeforeValidator(_blank_to_none)]
NoteText = Annotated[Annotated[str, Field(max_length=NOTE_MAX)] | None, BeforeValidator(_blank_to_none)]


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


def has_value(v) -> bool:
    """True for an answer: a non-empty string, list or dict with an answer inside, a number or a bool."""
    if v is None:
        return False
    if isinstance(v, str):
        return bool(v.strip())
    if isinstance(v, (list, tuple)):
        return any(has_value(x) for x in v)
    if isinstance(v, dict):
        return any(has_value(x) for k, x in v.items() if k != "not_answered")
    return True


class SectionModel(StrictModel):
    """Base of every profile section: ``not_answered`` lists the section's own fields
    that were skipped. A field that has an answer is never listed as skipped."""

    not_answered: Annotated[list[str], Field(default_factory=list, max_length=60)]

    @model_validator(mode="after")
    def _check_not_answered(self):
        if "not_answered" not in self.model_fields_set:
            return self
        fields = set(type(self).model_fields) - {"not_answered"}
        out = []
        for name in self.not_answered:
            if name not in fields:
                raise ValueError(f"not_answered: {name!r} is not a field of this section")
            if name not in out and not has_value(getattr(self, name)):
                out.append(name)
        self.not_answered = out
        return self


# --------------------------------------------------------------------------- shared shapes


class ChoiceOther(StrictModel):
    """Options from one list plus an optional "other" text ({selected, other}).
    When the list has an ``other`` key, writing an other text also selects it."""

    LIST: ClassVar[str] = ""
    selected: Annotated[list[str], Field(default_factory=list, max_length=20)]
    other: OtherText = None

    @field_validator("selected")
    @classmethod
    def _keys(cls, keys: list[str]) -> list[str]:
        return _check_keys(cls.LIST)(keys)

    @model_validator(mode="after")
    def _other_selected(self):
        if self.other and vocab.is_valid(self.LIST, "other") and "other" not in self.selected:
            self.selected = [*self.selected, "other"]
        return self


class InterestsPQ(ChoiceOther):
    LIST = "pq_interests"


class FrustrationPQ(ChoiceOther):
    LIST = "pq_frustration_reactions"


class SocialContactPQ(ChoiceOther):
    LIST = "pq_social_contact"


class ExpressNeedsPQ(ChoiceOther):
    LIST = "pq_express_needs"


class HopeChildFeels(ChoiceOther):
    LIST = "hope_child_feels"


class ContactChannels(ChoiceOther):
    LIST = "contact_preferences"


class YesNoText(StrictModel):
    """A yes/no question with a follow-up text ({value, text})."""

    value: Key("yes_no") = None
    text: Text = None


class SpecialAbility(YesNoText):
    """Q7: yes/no, the parent's words and optional strength keys (merged into the strengths list)."""

    strength_keys: Keys("strengths", max_items=10)


class TextKeys(StrictModel):
    """A free-text answer with optional option chips ({text, keys})."""

    LIST: ClassVar[str] = ""
    text: Text = None
    keys: Annotated[list[str], Field(default_factory=list, max_length=20)]

    @field_validator("keys")
    @classmethod
    def _keys(cls, keys: list[str]) -> list[str]:
        return _check_keys(cls.LIST)(keys)


class EntryHelps(TextKeys):
    LIST = "transition_helps"


class SensoryAnswer(TextKeys):
    LIST = "sensitivities"


class FoodAnswer(StrictModel):
    text: Text = None
    flags: Keys("health_food_flags", max_items=5)


class StopActivity(StrictModel):
    """Q34: several reactions may be chosen; "easily" is exclusive."""

    selected: Keys("pq_stop_activity", max_items=5)

    @model_validator(mode="after")
    def _exclusive(self):
        if "easily" in self.selected and len(self.selected) > 1:
            raise ValueError('"easily" cannot be combined with another reaction')
        return self


class ParentName(StrictModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    relation: Key("relations") = None


class HomeLanguage(StrictModel):
    """Q22: another language at home: yes/no, which (language keys) and a free name."""

    value: Key("yes_no") = None
    languages: Keys("languages", max_items=8)
    other_text: OtherText = None


PQLevel = Literal["independent", "needs_help"]
HelpAmount = Literal["a_little", "a_lot"]


class IndependenceLevelsPQ(StrictModel):
    """The 8 rows of the questionnaire's independence table (Independent / Needs help)."""

    eating: PQLevel | None = None
    drinking: PQLevel | None = None
    toilet: PQLevel | None = None
    washing_hands: PQLevel | None = None
    dressing: PQLevel | None = None
    shoes: PQLevel | None = None
    tidying_toys: PQLevel | None = None
    keeping_belongings: PQLevel | None = None


class HelpAmounts(StrictModel):
    """Optional "a little / a lot" next to Needs help (keeps the binary meaning)."""

    eating: HelpAmount | None = None
    drinking: HelpAmount | None = None
    toilet: HelpAmount | None = None
    washing_hands: HelpAmount | None = None
    dressing: HelpAmount | None = None
    shoes: HelpAmount | None = None
    tidying_toys: HelpAmount | None = None
    keeping_belongings: HelpAmount | None = None


class DevelopText(StrictModel):
    text: Text = None


class DevelopOther(StrictModel):
    area: OtherText = None
    text: Text = None


class Develop(StrictModel):
    """Q38: what the family hopes the child develops this year, one box per area."""

    emotional: DevelopText | None = None
    social: DevelopText | None = None
    language: DevelopText | None = None
    motor: DevelopText | None = None
    independence: DevelopText | None = None
    other: DevelopOther | None = None


# --------------------------------------------------------------------------- 0001 sections (+ new keys)


class WhoSection(SectionModel):
    describe_words: Items("describe_words", max_items=8)
    strengths: Items("strengths")
    interests: Items("interests")
    motivators: Items("motivators")
    appreciate: Text = None
    parents: Annotated[list[ParentName], Field(default_factory=list, max_length=4)]
    interests_pq: InterestsPQ | None = None
    what_attracts: Text = None


class EmotionsSection(SectionModel):
    helps_when_sad: Items("sad_helps")
    frustration_reactions: Items("frustration_reactions")
    calming_helps: Items("calming_helps")
    calming_notes: Text = None
    transition_reaction: Key("transition_reactions") = None
    transition_helps: Items("transition_helps")
    morning_separation: Key("morning_separation") = None
    what_does_not_help: Text = None
    when_sad_text: Text = None
    frustration_pq: FrustrationPQ | None = None
    new_situations: Text = None
    overwhelming_situations: YesNoText | None = None
    overwhelm_teacher_should_know: Text = None


class SocialSection(SectionModel):
    social: Keys("social")
    communication: Keys("communication")
    comments: Text = None
    contact_pq: SocialContactPQ | None = None
    conflict_reaction: Text = None
    significant_friends: YesNoText | None = None
    what_helps_socially: Text = None


def _check_levels(levels: dict[str, SupportLevel]):
    for area in levels:
        if not vocab.is_valid("independence_areas", area):
            raise ValueError(f"unknown independence area {area!r}")
    return levels


class IndependenceSection(SectionModel):
    levels: Annotated[dict[str, SupportLevel], Field(default_factory=dict), AfterValidator(_check_levels)]
    notes: Text = None
    levels_pq: IndependenceLevelsPQ | None = None
    help_amount: HelpAmounts | None = None
    still_helping: Text = None
    routines_to_keep: Text = None


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


class EnvironmentSection(SectionModel):
    items: Annotated[list[SensitivityIn], Field(default_factory=list, max_length=20), AfterValidator(_check_sensitivities)]
    notes: Text = None


class PrioritiesSection(SectionModel):
    parent_priorities: Keys("priority_categories")
    priorities_note: Text = None
    hope_child_feels: Keys("hope_child_feels")
    one_thing_to_know: Text = None


# --------------------------------------------------------------------------- parent questionnaire sections


class JoySection(SectionModel):
    happy_safe_successful: Text = None
    likes_at_home: Text = None
    persists_at: YesNoText | None = None
    special_ability: SpecialAbility | None = None


class SeparationSection(SectionModel):
    morning: Key("pq_morning_separation") = None
    what_helps_entry: EntryHelps | None = None
    transition_object: YesNoText | None = None


class CommunicationSection(SectionModel):
    expresses_needs: ExpressNeedsPQ | None = None
    tells_experiences: Key("pq_degree") = None
    home_language: HomeLanguage | None = None
    teacher_should_know: Text = None


class HealthSection(SectionModel):
    """Sleep, eating and health: stays inside KidSphere, never sent to AI (OQ-1)."""

    sleep: Text = None
    food: FoodAnswer | None = None
    sensory: SensoryAnswer | None = None
    medical: YesNoText | None = None


class BehaviourSection(SectionModel):
    boundaries_at_home: Text = None
    what_works: Text = None
    what_does_not_work: Text = None
    helps_cooperation: Text = None


class WhichPreparation(TextKeys):
    LIST = "transition_helps"


class TransitionsSection(SectionModel):
    stopping_activity: StopActivity | None = None
    preparation_helps: Key("yes_no_sometimes") = None
    which_preparation: WhichPreparation | None = None


class ExpectationsSection(SectionModel):
    most_important: Text = None
    hope_child_feels: HopeChildFeels | None = None
    develop: Develop | None = None


class PartnershipSection(SectionModel):
    contact_channels: ContactChannels | None = None
    communication_matters: Text = None
    family_context: Text = None


class HeartSection(SectionModel):
    message: Text = None


# --------------------------------------------------------------------------- Teacher Quick Baseline (bridge)


class StrengthSlot(ItemIn):
    """One of the 3 main strengths: a strengths key or a custom text, with a short note."""

    note: NoteText = None

    @model_validator(mode="after")
    def _known(self):
        if self.key is not None and not vocab.is_valid("strengths", self.key):
            raise ValueError(f"unknown option {self.key!r} for strengths")
        return self


class RememberLine(StrictModel):
    text: Annotated[str, Field(min_length=1, max_length=NOTE_MAX)]


BRIDGE_HELP_LISTS = ("calming_helps", "what_helps")


class BridgeHelp(ItemIn):
    """A calming_helps or what_helps key (``list`` says which) or a custom text."""

    list: Literal["calming_helps", "what_helps"] | None = None

    @model_validator(mode="after")
    def _known(self):
        if self.key is None:
            self.list = None
            return self
        if self.list is not None:
            if not vocab.is_valid(self.list, self.key):
                raise ValueError(f"unknown option {self.key!r} for {self.list}")
            return self
        for name in BRIDGE_HELP_LISTS:
            if vocab.is_valid(name, self.key):
                self.list = name
                return self
        raise ValueError(f"unknown option {self.key!r} for calming_helps / what_helps")


class CalmsHelps(StrictModel):
    items: Annotated[list[BridgeHelp], Field(default_factory=list, max_length=12)]
    text: Text = None

    @field_validator("items")
    @classmethod
    def _dedupe(cls, items: list[BridgeHelp]) -> list[BridgeHelp]:
        out, seen = [], set()
        for it in items:
            if ident(it) not in seen:
                seen.add(ident(it))
                out.append(it)
        return out


class FirstArea(StrictModel):
    domain: Key("observation_domains") = None
    note: OtherText = None


class QuestionForParent(StrictModel):
    text: Annotated[Annotated[str, Field(max_length=1000)] | None, BeforeValidator(_blank_to_none)] = None
    status: Literal["open", "clarified"] = "open"
    clarified_at: datetime | None = None
    outcome_note: Annotated[Annotated[str, Field(max_length=1000)] | None, BeforeValidator(_blank_to_none)] = None


class BasedOn(StrictModel):
    """Which version of the family's answers the teacher read (set by the server on save)."""

    parent_version_seq: int | None = None
    parent_version_id: int | None = None
    questionnaire_status: str | None = None
    read_at: datetime | None = None


class BridgeSection(SectionModel):
    main_strengths: Annotated[list[StrengthSlot], Field(default_factory=list, max_length=3)]
    remember: Annotated[list[RememberLine], Field(default_factory=list, max_length=3)]
    calms_helps: CalmsHelps | None = None
    may_be_difficult: Text = None
    first_area_to_observe: FirstArea | None = None
    question_for_parent: QuestionForParent | None = None
    based_on: BasedOn | None = None

    @field_validator("main_strengths")
    @classmethod
    def _distinct(cls, items: list[StrengthSlot]) -> list[StrengthSlot]:
        seen = set()
        for it in items:
            if ident(it) in seen:
                raise ValueError("the main strengths must be different")
            seen.add(ident(it))
        return items


SECTION_MODELS: dict[str, type[SectionModel]] = {
    "who": WhoSection,
    "emotions": EmotionsSection,
    "social": SocialSection,
    "independence": IndependenceSection,
    "environment": EnvironmentSection,
    "priorities": PrioritiesSection,
    "joy": JoySection,
    "separation": SeparationSection,
    "communication": CommunicationSection,
    "health": HealthSection,
    "behaviour": BehaviourSection,
    "transitions": TransitionsSection,
    "expectations": ExpectationsSection,
    "partnership": PartnershipSection,
    "heart": HeartSection,
    "bridge": BridgeSection,
}


def validate_section(section: str, data) -> dict:
    """Validate ``data`` for ``section`` and return the JSON to store: the fields the
    client sent, normalized, without None values.

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
    return parsed.model_dump(mode="json", exclude_none=True, exclude_unset=True)


# --------------------------------------------------------------------------- questionnaire record (PQM)


class MeetingIn(StrictModel):
    """Fill in together with the family: when, and who came (relations keys)."""

    date: DateType | None = None
    attendees: Keys("relations", max_items=6)


class QuestionnaireIn(StrictModel):
    """Record metadata of the parent questionnaire (``parent_perspective.questionnaire``).

    ``entry_mode`` is how this save was made: the family themselves (``self``), staff
    for them (``on_behalf``) or together at a meeting (``meeting``). ``submit`` sends
    the questionnaire to the kindergarten (draft → submitted).
    """

    filled_at: DateType | None = None
    school_year: Annotated[str, Field(max_length=20)] | None = None
    entry_mode: EntryMode | None = None
    meeting: MeetingIn | None = None
    submit: bool = False


class QuestionnaireRecord(StrictModel):
    """The stored shape of PQM (documentation and storage-path resolution; written by
    app/services/profiles.py, never validated from client input)."""

    status: Literal["draft", "submitted"] = "draft"
    filled_at: DateType | None = None
    submitted_at: datetime | None = None
    resubmitted_at: datetime | None = None
    submitted_by: str | None = None
    submitted_by_name: str | None = None
    school_year: str | None = None
    entry_mode: EntryMode | None = None
    meeting: MeetingIn | None = None
    migrated: bool | None = None


class ProfilePatch(StrictModel):
    """PATCH /api/children/{id}/profile.

    ``perspective`` defaults to the caller's own (parent → parent, staff → teacher).
    ``section``+``data`` replace that section of the perspective (the parent
    perspective keeps its legacy keys; see the module docstring). ``section`` with
    only ``status`` changes the section status. ``questionnaire`` changes the parent
    questionnaire record (and ``submit`` sends it). ``wizard_step`` alone is
    "Save & finish later"; ``complete`` marks the caller's wizard as completed
    (the legacy flag; sending the questionnaire is ``questionnaire.submit``).
    """

    perspective: Perspective | None = None
    section: SectionName | None = None
    data: dict | None = None
    status: SectionStatus | None = None
    questionnaire: QuestionnaireIn | None = None
    wizard_step: int | None = Field(default=None, ge=1, le=10)
    complete: bool = False

    @model_validator(mode="after")
    def _section_and_data(self):
        if self.data is not None and self.section is None:
            raise ValueError("data needs a section")
        if self.status is not None and self.section is None:
            raise ValueError("status needs a section")
        return self
