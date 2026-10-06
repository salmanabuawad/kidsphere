"""Provider-agnostic contracts of the AI engines: requests, results and every engine's input
and output shapes.

Nothing here names a vendor. A provider adapter (``providers/``) turns an ``EngineCall`` into
whatever its API needs and must hand back output that validates against the engine's output
model below; the orchestrator checks it (``validation.py``) before anyone sees it.

Shapes
    LanguageSpec     language (BCP 47 base: ar, he, en, ... more later), locale, direction
                     (rtl/ltr, derived when omitted), culture (optional free hint).
    EngineRequest    engine, task, input (the engine's input model), child_id (internal; the
                     provider never sees it), language, options.
    AIResult         success, engine, task, provider, model, request_id, status, output,
                     usage, error, validation, assets, created_at, finished_at.
    EngineError      code (ENGINE_NOT_CONFIGURED, PROVIDER_ERROR, ...), message (user-facing,
                     no data), retryable.

Child data: ``EngineCall.context`` is built only by ``app.ai.context.engine_child_context``:
a pseudonymous ``child_ref``, age in years, vocabulary labels, masked texts. Never a name,
birth date, photo, contact or free-text parent answer.

Games are structured definitions (``GameDefinition``) rendered by KidSphere's own game
engine. They carry no scoring: KidSphere never scores children.
"""
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

RTL_LANGUAGES = frozenset({"ar", "he", "fa", "ur", "yi"})

Status = Literal["succeeded", "failed", "not_configured", "rejected", "pending"]
OutputKind = Literal["structured", "text", "image", "video", "audio", "transcript", "embedding"]
AssetKind = Literal["image", "audio", "video", "document"]


def Text(max_length: int, min_length: int = 1):  # noqa: N802 - reads like a type
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


Key = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[a-z0-9_]{1,40}$")]


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------- request side


class LanguageSpec(_M):
    language: Annotated[str, StringConstraints(pattern=r"^[a-z]{2,3}$")] = "ar"
    locale: Annotated[str, StringConstraints(pattern=r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")] | None = None
    direction: Literal["rtl", "ltr"] | None = None
    culture: Text(80) | None = None

    @model_validator(mode="after")
    def _derive(self):
        if self.direction is None:
            self.direction = "rtl" if self.language in RTL_LANGUAGES else "ltr"
        if self.locale is None:
            self.locale = self.language
        return self


class EngineRequest(_M):
    engine: Key
    task: Key
    input: dict[str, Any] = Field(default_factory=dict)
    child_id: str | None = None
    language: LanguageSpec = Field(default_factory=LanguageSpec)
    options: dict[str, Any] = Field(default_factory=dict)
    # Pipelines: the request this one belongs to (for the trace).
    pipeline_id: str | None = None
    parent_request_id: str | None = None


class EngineCall(_M):
    """What a provider adapter receives: never the child's id or name."""

    engine: str
    task: str
    output_kind: OutputKind
    input: dict[str, Any]
    context: dict[str, Any] = Field(default_factory=dict)
    language: LanguageSpec
    options: dict[str, Any] = Field(default_factory=dict)
    instructions: str | None = None  # an active prompt template, when one exists
    model: str | None = None
    endpoint: str | None = None
    max_output: int | None = None
    timeout_seconds: int = 60


class ProviderBinary(_M):
    """A file an adapter produced (image, audio, video); stored by the orchestrator."""

    kind: AssetKind
    mime: Annotated[str, StringConstraints(pattern=r"^[a-z]+/[a-z0-9.+\-]+$")]
    data: bytes
    alt: Text(300) | None = None
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None


class Usage(_M):
    input_units: int = 0
    output_units: int = 0
    unit: Literal["tokens", "characters", "seconds", "images", "requests"] = "requests"
    cost_estimate: float = 0.0  # in the configured currency; adapters estimate, never bill


class ProviderResponse(_M):
    """What an adapter returns. ``state`` "pending" (+ ``job_id``) for long jobs (video)."""

    output: dict[str, Any] = Field(default_factory=dict)
    binaries: list[ProviderBinary] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)
    model: str | None = None
    provider_request_id: str | None = None
    state: Literal["done", "pending"] = "done"
    job_id: str | None = None


# --------------------------------------------------------------------------- result side


class EngineError(_M):
    code: str
    message: str
    retryable: bool = False


class AssetRef(_M):
    asset_id: str
    kind: AssetKind
    mime: str
    url: str
    alt: str | None = None
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None


class Validation(_M):
    schema_ok: bool = False
    safety_ok: bool = False
    issues: list[str] = Field(default_factory=list)
    sanitized: bool = False
    moderated_by_engine: bool = False


class AIResult(_M):
    success: bool
    engine: str
    task: str
    provider: str | None = None
    model: str | None = None
    request_id: str | None = None
    status: Status
    output: dict[str, Any] | None = None
    assets: list[AssetRef] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)
    error: EngineError | None = None
    validation: Validation | None = None
    fallback_used: bool = False
    created_at: datetime
    finished_at: datetime | None = None


# --------------------------------------------------------------------------- engine inputs


class ReasoningIn(_M):
    question: Text(2000)
    facts: list[Text(1000)] = Field(default_factory=list, max_length=50)


class SourceItem(_M):
    kind: Literal["questionnaire", "assessment", "observation"]
    text: Text(2000) | None = None
    keys: list[Key] = Field(default_factory=list, max_length=30)


class ChildUnderstandingIn(_M):
    sources: list[SourceItem] = Field(min_length=1, max_length=60)


class ObservationItem(_M):
    id: Text(64)
    observed_at: Text(40) | None = None
    text: Text(1000)
    domains: list[Key] = Field(default_factory=list, max_length=12)
    support_level: Key | None = None


class ObservationAnalysisIn(_M):
    observations: list[ObservationItem] = Field(min_length=1, max_length=100)


class RecommendationIn(_M):
    target: Literal["goals", "activities", "content", "next_steps"]
    focus: Text(300) | None = None
    count: int = Field(default=3, ge=1, le=5)


class ContentGenerationIn(_M):
    content_type: Literal["activity", "exercise", "material", "teacher_resource", "game"]
    goal: Text(300)
    game_type: Key | None = None
    duration_minutes: int | None = Field(default=None, ge=3, le=60)


class StoryIn(_M):
    goal: Text(300)
    topic: Text(200) | None = None
    length: Literal["short", "medium", "long"] = "short"
    difficulty: Literal["easy", "medium", "rich"] = "easy"
    characters: list[Key] = Field(default_factory=list, max_length=5)


class CharacterIn(_M):
    name_token: Key
    description: Text(500)
    style: Text(120) | None = None


class ImageIn(_M):
    prompt: Text(1000)
    purpose: Literal["illustration", "card", "material"] = "illustration"
    style: Text(120) | None = None
    shape: Literal["square", "landscape", "portrait"] = "square"
    characters: list[Key] = Field(default_factory=list, max_length=5)


class SceneIn(_M):
    narration: Text(600)
    visual_prompt: Text(600)
    duration_seconds: int = Field(default=8, ge=2, le=30)


class VideoIn(_M):
    script: Text(5000)
    scenes: list[SceneIn] = Field(min_length=1, max_length=12)
    characters: list[Key] = Field(default_factory=list, max_length=5)
    narration: bool = True


class VoiceIn(_M):
    text: Text(5000)
    role: Literal["narrator", "character"] = "narrator"
    character: Key | None = None
    speed: float = Field(default=1.0, ge=0.5, le=1.5)


class SpeechRecognitionIn(_M):
    audio_asset_id: Text(64)
    speaker: Literal["teacher", "child"] = "teacher"


class MusicIn(_M):
    purpose: Literal["background", "song", "story"]
    mood: Text(120)
    duration_seconds: int = Field(ge=5, le=180)
    lyrics: Text(2000) | None = None


class SoundEffectIn(_M):
    effect: Text(120)
    duration_seconds: float = Field(default=1.0, ge=0.2, le=10)


class VisionIn(_M):
    image_asset_id: Text(64)
    question: Text(500)


class EmbeddingIn(_M):
    texts: list[Text(2000)] = Field(min_length=1, max_length=64)


class ClassificationIn(_M):
    items: list[Text(1000)] = Field(min_length=1, max_length=50)
    taxonomy: Literal["observation_domains", "skills", "interests", "content_types"]
    multi_label: bool = True


class TranslationIn(_M):
    text: Text(5000)
    source_language: Annotated[str, StringConstraints(pattern=r"^[a-z]{2,3}$")] | None = None
    target_language: Annotated[str, StringConstraints(pattern=r"^[a-z]{2,3}$")]


class ModerationIn(_M):
    content: dict[str, Any] | Text(10000)
    audience: Literal["child", "teacher", "parent"] = "child"


class PersonalizationIn(_M):
    content: dict[str, Any]
    adapt_for: list[Literal["interests", "strengths", "what_helps", "language", "difficulty"]] = Field(
        default_factory=lambda: ["interests"], max_length=5)


class ProgressAnalysisIn(_M):
    period_from: Text(10)
    period_to: Text(10)
    observations: list[ObservationItem] = Field(default_factory=list, max_length=200)
    activities: list[Text(300)] = Field(default_factory=list, max_length=100)


class OrchestrationIn(_M):
    goal: Text(500)


# --------------------------------------------------------------------------- engine outputs (structured)


class Labelled(_M):
    key: Key | None = None
    label: Text(160)


class ReasoningOut(_M):
    answer: Text(4000)
    reasoning_steps: list[Text(600)] = Field(default_factory=list, max_length=12)


class ChildUnderstandingOut(_M):
    summary: Text(1500)
    strengths: list[Labelled] = Field(default_factory=list, max_length=10)
    interests: list[Labelled] = Field(default_factory=list, max_length=10)
    needs: list[Labelled] = Field(default_factory=list, max_length=6)
    learning_preferences: list[Labelled] = Field(default_factory=list, max_length=6)


class ObservationCategory(_M):
    observation_id: Text(64)
    domains: list[Key] = Field(max_length=12)


class ObservationAnalysisOut(_M):
    categories: list[ObservationCategory] = Field(default_factory=list, max_length=100)
    patterns: list[Text(300)] = Field(default_factory=list, max_length=5)
    changes: list[Text(300)] = Field(default_factory=list, max_length=5)


class RecommendationItem(_M):
    kind: Literal["goal", "activity", "content", "next_step"]
    title: Text(160)
    rationale: Text(400)


class RecommendationOut(_M):
    items: list[RecommendationItem] = Field(min_length=1, max_length=5)


class GameQuestion(_M):
    prompt: Text(200)
    choices: list[Labelled] = Field(min_length=2, max_length=4)
    preferred_choice: int | None = None  # never "wrong": the game gives gentle feedback

    @model_validator(mode="after")
    def _choice_in_range(self):
        if self.preferred_choice is not None and not 0 <= self.preferred_choice < len(self.choices):
            raise ValueError("preferred_choice must be the index of one of the choices")
        return self


class GameDefinition(_M):
    """A game KidSphere renders itself. No scoring (KidSphere never scores children)."""

    game_type: Key
    title: Text(120)
    instructions: Text(400)
    difficulty: Literal["easy", "medium", "rich"] = "easy"
    learning_goal: Text(300)
    questions: list[GameQuestion] = Field(default_factory=list, max_length=8)
    assets: list[Text(300)] = Field(default_factory=list, max_length=10)
    feedback: dict[Literal["preferred", "other", "finish"], Text(200)] = Field(default_factory=dict)
    adaptation_rules: list[Text(300)] = Field(default_factory=list, max_length=6)


class ContentGenerationOut(_M):
    content_type: Literal["activity", "exercise", "material", "teacher_resource", "game"]
    title: Text(120)
    body: dict[str, Any]
    game: GameDefinition | None = None

    @model_validator(mode="after")
    def _game_for_games(self):
        if self.content_type == "game" and self.game is None:
            raise ValueError("a game needs its game definition")
        return self


class StoryPage(_M):
    text: Text(600)
    illustration_prompt: Text(400) | None = None


class StoryOut(_M):
    title: Text(120)
    pages: list[StoryPage] = Field(min_length=2, max_length=12)
    questions: list[Text(200)] = Field(default_factory=list, max_length=4)
    reading_level: Literal["easy", "medium", "rich"] = "easy"


class CharacterOut(_M):
    name_token: Key
    description: Text(500)
    visual_traits: list[Text(120)] = Field(default_factory=list, max_length=10)
    voice_traits: list[Text(120)] = Field(default_factory=list, max_length=6)


class VisionOut(_M):
    description: Text(1000)
    tags: list[Key] = Field(default_factory=list, max_length=20)


class ClassificationResult(_M):
    item_index: int = Field(ge=0)
    labels: list[Key] = Field(max_length=10)


class ClassificationOut(_M):
    results: list[ClassificationResult] = Field(max_length=50)


class ModerationOut(_M):
    allowed: bool
    issues: list[Text(300)] = Field(default_factory=list, max_length=20)


class PersonalizationOut(_M):
    content: dict[str, Any]
    adaptations: list[Text(300)] = Field(default_factory=list, max_length=10)


class ProgressAnalysisOut(_M):
    insights: list[Text(400)] = Field(default_factory=list, max_length=8)
    trends: list[Text(300)] = Field(default_factory=list, max_length=8)
    suggestions: list[Text(300)] = Field(default_factory=list, max_length=8)


class PlanStep(_M):
    engine: Key
    task: Key
    reason: Text(300)


class OrchestrationOut(_M):
    plan: list[PlanStep] = Field(min_length=1, max_length=10)


# --------------------------------------------------------------------------- engine outputs (by kind)


class TextOut(_M):
    text: Text(10000)
    language: str | None = None


class TranscriptOut(_M):
    text: Text(10000, min_length=0)
    language: str | None = None


class EmbeddingOut(_M):
    dimensions: int = Field(ge=1, le=8192)
    vectors: list[list[float]] = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def _same_size(self):
        if any(len(v) != self.dimensions for v in self.vectors):
            raise ValueError("every vector must have the declared dimensions")
        return self


class MediaOut(_M):
    """Image, audio and video engines: what the files show (the files are the binaries)."""

    description: Text(500) | None = None
    scenes: int | None = None
