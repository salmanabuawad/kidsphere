"""Pydantic v2 output models for everything the AI layer produces.

Every model forbids extra keys and carries length limits. The same models
validate Claude output, template output and (later) teacher edits. Semantic
checks (answer index in range, categories exist, unique items) live in
``model_validator``s so a single ``Model.model_validate(data)`` covers them.

Kinds and their models:
    story                -> StoryOut
    real_world_activity  -> ActivityOut
    digital_game         -> one of GAME_MODELS (discriminated on ``template``; ``GameOut``)
    video                -> VideoPlanOut
    pack                 -> PackOut (story with exactly 3 questions, activity, game,
                            3 discussion prompts, optional video)
    understanding        -> UnderstandingSuggestion
"""
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter, create_model, model_validator


def Text(max_length: int):  # noqa: N802 - reads like a type in field annotations
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)]


Emoji = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=16)]
Key = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[a-z0-9_]{1,40}$")]

GAME_TEMPLATES = (
    "multiple_choice",
    "match_pairs",
    "sequence",
    "emotion_choice",
    "categorize",
    "what_happens_next",
    "story_builder",
)
VALIDATION_STATUSES = ("supported", "partially_supported", "needs_more_observation", "may_need_refinement")
REVIEW_STATUSES = ("improving", "some_improvement", "no_clear_change", "needs_more_observation", "no_longer_needed")
BASELINE_LISTS = ("strengths", "interests", "what_helps", "support_needs", "focus")
NEEDS_MORE = "needs_more_observation"


class Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _unique(labels: list[str], what: str) -> None:
    seen = [s.strip().lower() for s in labels]
    if len(set(seen)) != len(seen):
        raise ValueError(f"{what} must be unique")


# --------------------------------------------------------------------------- story / activity


class StoryOut(Out):
    title: Text(120)
    goal: Text(300)
    story: list[Text(600)] = Field(min_length=2, max_length=6)
    questions: list[Text(200)] = Field(min_length=2, max_length=4)
    teacher_note: Text(800)
    illustrations: list[Emoji] | None = Field(default=None, max_length=6)

    @model_validator(mode="after")
    def _illustrations_per_paragraph(self):
        # One emoji per paragraph; extra emoji are dropped rather than failing the story.
        if self.illustrations is not None:
            self.illustrations = self.illustrations[: len(self.story)]
        return self


class ActivityOut(Out):
    title: Text(120)
    goal: Text(300)
    duration_minutes: int = Field(ge=3, le=60)
    materials: list[Text(120)] = Field(max_length=10)
    instructions: list[Text(400)] = Field(min_length=2, max_length=10)
    what_to_observe: list[Text(300)] = Field(min_length=1, max_length=6)
    adaptation: Text(600)


# --------------------------------------------------------------------------- games


class Choice(Out):
    label: Text(80)
    emoji: Emoji | None = None


class Round(Out):
    question: Text(200)
    choices: list[Choice] = Field(min_length=2, max_length=4)
    correct_or_preferred_answer: int | None = None
    explanation: Text(300)

    @model_validator(mode="after")
    def _answer_in_range(self):
        _unique([c.label for c in self.choices], "choice labels")
        a = self.correct_or_preferred_answer
        if a is not None and not 0 <= a < len(self.choices):
            raise ValueError("correct_or_preferred_answer must be the index of one of the choices")
        return self


class _ChoiceGame(Out):
    title: Text(120)
    intro: Text(300) | None = None
    rounds: list[Round] = Field(min_length=1, max_length=5)


class MultipleChoiceGame(_ChoiceGame):
    template: Literal["multiple_choice"]


class EmotionChoiceGame(_ChoiceGame):
    template: Literal["emotion_choice"]


class WhatHappensNextGame(_ChoiceGame):
    template: Literal["what_happens_next"]


class Pair(Out):
    left: Choice
    right: Choice


class MatchPairsGame(Out):
    template: Literal["match_pairs"]
    title: Text(120)
    intro: Text(300) | None = None
    pairs: list[Pair] = Field(min_length=2, max_length=6)

    @model_validator(mode="after")
    def _unique_sides(self):
        _unique([p.left.label for p in self.pairs], "left labels")
        _unique([p.right.label for p in self.pairs], "right labels")
        return self


class SequenceGame(Out):
    """``items`` are in the correct order; the player shuffles them."""

    template: Literal["sequence"]
    title: Text(120)
    intro: Text(300) | None = None
    items: list[Choice] = Field(min_length=3, max_length=6)

    @model_validator(mode="after")
    def _unique_items(self):
        _unique([i.label for i in self.items], "items")
        return self


class Category(Out):
    key: Key
    label: Text(60)
    emoji: Emoji | None = None


class CategorizeItem(Out):
    label: Text(80)
    emoji: Emoji | None = None
    category: Key


class CategorizeGame(Out):
    template: Literal["categorize"]
    title: Text(120)
    intro: Text(300) | None = None
    categories: list[Category] = Field(min_length=2, max_length=3)
    items: list[CategorizeItem] = Field(min_length=4, max_length=8)

    @model_validator(mode="after")
    def _categories_exist(self):
        keys = [c.key for c in self.categories]
        _unique(keys, "category keys")
        _unique([c.label for c in self.categories], "category labels")
        _unique([i.label for i in self.items], "items")
        unknown = {i.category for i in self.items} - set(keys)
        if unknown:
            raise ValueError(f"items use unknown categories: {sorted(unknown)}")
        empty = set(keys) - {i.category for i in self.items}
        if empty:
            raise ValueError(f"every category needs at least one item: {sorted(empty)}")
        return self


class StoryStep(Out):
    prompt: Text(200)
    choices: list[Choice] = Field(min_length=2, max_length=4)

    @model_validator(mode="after")
    def _unique_choices(self):
        _unique([c.label for c in self.choices], "choice labels")
        return self


class StoryBuilderGame(Out):
    """Choices have no correct answer; the child tells the story at the end."""

    template: Literal["story_builder"]
    title: Text(120)
    intro: Text(300) | None = None
    steps: list[StoryStep] = Field(min_length=3, max_length=5)
    closing_prompt: Text(200)


GAME_MODELS: dict[str, type[Out]] = {
    "multiple_choice": MultipleChoiceGame,
    "match_pairs": MatchPairsGame,
    "sequence": SequenceGame,
    "emotion_choice": EmotionChoiceGame,
    "categorize": CategorizeGame,
    "what_happens_next": WhatHappensNextGame,
    "story_builder": StoryBuilderGame,
}

GameOut = Annotated[
    Union[
        MultipleChoiceGame,
        MatchPairsGame,
        SequenceGame,
        EmotionChoiceGame,
        CategorizeGame,
        WhatHappensNextGame,
        StoryBuilderGame,
    ],
    Field(discriminator="template"),
]
game_adapter: TypeAdapter = TypeAdapter(GameOut)


# --------------------------------------------------------------------------- video / pack


class VideoScene(Out):
    description: Text(300)
    narration: Text(400)
    visual_prompt: Text(300)


class VideoPlanOut(Out):
    title: Text(120)
    learning_goal: Text(300)
    script: Text(2500)
    scenes: list[VideoScene] = Field(min_length=2, max_length=8)
    duration_seconds: int = Field(ge=30, le=90)


class PackOut(Out):
    story: StoryOut
    activity: ActivityOut
    game: GameOut
    discussion_prompts: list[Text(200)] = Field(min_length=3, max_length=3)
    video: VideoPlanOut | None = None

    @model_validator(mode="after")
    def _three_questions(self):
        if len(self.story.questions) != 3:
            raise ValueError("a pack story has exactly 3 questions")
        return self


def pack_model(template: str, include_video: bool = False) -> type[Out]:
    """A PackOut variant whose game is fixed to one template (smaller provider schema)."""
    fields: dict = {"game": (GAME_MODELS[template], ...)}
    if include_video:
        fields["video"] = (VideoPlanOut, ...)
    else:
        fields["video"] = (None, None)
    return create_model(f"PackOut_{template}{'_video' if include_video else ''}", __base__=PackOut, **fields)


# --------------------------------------------------------------------------- understanding


class ProfileItem(Out):
    """A strength/interest/what-helps entry: a vocabulary ``key`` or a ``custom`` text."""

    key: Key | None = None
    custom: Text(120) | None = None
    label: Text(120)
    note: Text(300) | None = None

    @model_validator(mode="after")
    def _key_or_custom(self):
        if (self.key is None) == (self.custom is None):
            raise ValueError("exactly one of key or custom is required")
        return self


class BaselineValidationItem(Out):
    list: Literal["strengths", "interests", "what_helps", "support_needs", "focus"]
    key: Text(80) | None = None
    custom: Text(120) | None = None
    label: Text(160)
    status: Literal["supported", "partially_supported", "needs_more_observation", "may_need_refinement"]
    note: Text(400)
    observation_ids: list[Text(64)] = Field(default_factory=list, max_length=50)


class FocusReviewItem(Out):
    focus_area_id: Text(64)
    status: Literal["improving", "some_improvement", "no_clear_change", "needs_more_observation", "no_longer_needed"]
    note: Text(400)


class UnderstandingSuggestion(Out):
    summary: Text(1500)
    strengths: list[ProfileItem] = Field(max_length=8)
    interests: list[ProfileItem] = Field(max_length=8)
    what_helps: list[ProfileItem] = Field(max_length=8)
    areas_for_support: list[Text(300)] = Field(max_length=6)
    adaptations: Text(800)
    next_steps: Text(800)
    baseline_validation: list[BaselineValidationItem] = Field(max_length=40)
    focus_review: list[FocusReviewItem] = Field(max_length=10)


# --------------------------------------------------------------------------- lookup

KIND_MODELS: dict[str, type[Out]] = {
    "story": StoryOut,
    "real_world_activity": ActivityOut,
    "video": VideoPlanOut,
    "pack": PackOut,
    "understanding": UnderstandingSuggestion,
}
