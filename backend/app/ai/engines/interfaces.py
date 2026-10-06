"""Interfaces: what the application calls (one per engine) and what a provider implements.

The application only ever talks to engine interfaces (``ReasoningEngine.analyze``,
``StoryEngine.generate_story``, ``VideoAnimatorEngine.animate``, ...). ``facade.engines(db,
user)`` returns objects that implement them on top of the orchestrator, so every call is
validated, traced, safety-checked and routed to whatever provider is configured.

A provider adapter implements ``ProviderAdapter``. It is the only code that knows a vendor's
API, endpoint format or credential header; it receives an ``EngineCall`` (never a child's id
or name) and the resolved secret, and returns a ``ProviderResponse`` that must validate
against the engine's contract.
"""
from typing import Any, Protocol, runtime_checkable

from app.ai.engines.contracts import AIResult, EngineCall, LanguageSpec, OutputKind, ProviderResponse


class ProviderError(Exception):
    """An adapter failure. ``retryable`` failures (timeouts, rate limits, 5xx) are retried and
    then sent to the fallback provider; others (bad request, auth) are not."""

    def __init__(self, code: str, message: str = "", *, retryable: bool = False):
        self.code = code
        self.message = message or code
        self.retryable = retryable
        super().__init__(f"{code}: {self.message}")


@runtime_checkable
class ProviderAdapter(Protocol):
    name: str
    output_kinds: frozenset[OutputKind]

    def invoke(self, call: EngineCall, secret: str | None) -> ProviderResponse: ...

    def poll(self, job_id: str, call: EngineCall, secret: str | None) -> ProviderResponse: ...


# --------------------------------------------------------------------------- engine interfaces

Opts = dict[str, Any] | None


class ReasoningEngine(Protocol):
    def analyze(self, question: str, facts: list[str] | None = None, *, child_id: str | None = None,
                language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class ChildUnderstandingEngine(Protocol):
    def build_profile(self, sources: list[dict], *, child_id: str, language: LanguageSpec | None = None,
                      options: Opts = None) -> AIResult: ...


class ObservationAnalysisEngine(Protocol):
    def analyze(self, observations: list[dict], *, child_id: str | None = None, task: str = "analyze",
                language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class RecommendationEngine(Protocol):
    def recommend(self, target: str, *, focus: str | None = None, count: int = 3, child_id: str | None = None,
                  language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class ContentGenerationEngine(Protocol):
    def generate(self, content_type: str, goal: str, *, game_type: str | None = None, child_id: str | None = None,
                 language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class StoryEngine(Protocol):
    def generate_story(self, goal: str, *, topic: str | None = None, length: str = "short", difficulty: str = "easy",
                       characters: list[str] | None = None, child_id: str | None = None,
                       language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class CharacterEngine(Protocol):
    def create_character(self, name_token: str, description: str, *, style: str | None = None,
                         child_id: str | None = None, language: LanguageSpec | None = None,
                         options: Opts = None) -> AIResult: ...


class ImageGenerationEngine(Protocol):
    def generate_image(self, prompt: str, *, purpose: str = "illustration", style: str | None = None,
                       shape: str = "square", characters: list[str] | None = None, child_id: str | None = None,
                       language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class VideoAnimatorEngine(Protocol):
    def animate(self, script: str, scenes: list[dict], *, characters: list[str] | None = None, narration: bool = True,
                child_id: str | None = None, language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class VoiceEngine(Protocol):
    def speak(self, text: str, *, role: str = "narrator", character: str | None = None, speed: float = 1.0,
              child_id: str | None = None, language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class SpeechRecognitionEngine(Protocol):
    def transcribe(self, audio_asset_id: str, *, speaker: str = "teacher", language: LanguageSpec | None = None,
                   options: Opts = None) -> AIResult: ...


class MusicEngine(Protocol):
    def compose(self, purpose: str, mood: str, duration_seconds: int, *, lyrics: str | None = None,
                language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class SoundEffectsEngine(Protocol):
    def generate_effect(self, effect: str, *, duration_seconds: float = 1.0, options: Opts = None) -> AIResult: ...


class VisionEngine(Protocol):
    def describe(self, image_asset_id: str, question: str, *, language: LanguageSpec | None = None,
                 options: Opts = None) -> AIResult: ...


class EmbeddingEngine(Protocol):
    def embed(self, texts: list[str], *, options: Opts = None) -> AIResult: ...


class ClassificationEngine(Protocol):
    def classify(self, items: list[str], taxonomy: str, *, multi_label: bool = True, child_id: str | None = None,
                 language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class TranslationEngine(Protocol):
    def translate(self, text: str, target_language: str, *, source_language: str | None = None,
                  options: Opts = None) -> AIResult: ...


class SafetyModerationEngine(Protocol):
    def moderate(self, content: dict | str, *, audience: str = "child", language: LanguageSpec | None = None,
                 options: Opts = None) -> AIResult: ...


class PersonalizationEngine(Protocol):
    def adapt(self, content: dict, *, child_id: str, adapt_for: list[str] | None = None,
              language: LanguageSpec | None = None, options: Opts = None) -> AIResult: ...


class ProgressAnalysisEngine(Protocol):
    def analyze_progress(self, period_from: str, period_to: str, *, child_id: str, observations: list[dict] | None = None,
                         activities: list[str] | None = None, language: LanguageSpec | None = None,
                         options: Opts = None) -> AIResult: ...


class OrchestrationEngine(Protocol):
    def plan(self, goal: str, *, child_id: str | None = None, language: LanguageSpec | None = None,
             options: Opts = None) -> AIResult: ...
