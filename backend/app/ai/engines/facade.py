"""Typed engine objects on top of the orchestrator (they implement ``interfaces.*Engine``).

    ai = engines(db, user, context=ctx, child_uuid=child.id)
    result = ai.story.generate_story("Asking for help", topic="a little lion", language=LanguageSpec(language="he"))

Every method builds an ``EngineRequest`` and calls ``orchestrator.run``: validation, routing
to the configured provider, safety, tracing and the standard ``AIResult`` come with it.
"""
import uuid
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.ai.engines import orchestrator
from app.ai.engines.contracts import AIResult, EngineRequest, LanguageSpec
from app.models import User


@dataclass
class _Runner:
    db: Session
    user: User | None
    context: dict = field(default_factory=dict)
    child_uuid: uuid.UUID | None = None

    def __call__(self, engine: str, task: str, data: dict, language: LanguageSpec | None, options) -> AIResult:
        clean = {k: v for k, v in data.items() if v is not None}
        req = EngineRequest(engine=engine, task=task, input=clean, language=language or LanguageSpec(),
                            options=options or {})
        return orchestrator.run(self.db, self.user, req, context=self.context, child_uuid=self.child_uuid)


@dataclass
class _Engine:
    run: _Runner


class Reasoning(_Engine):
    def analyze(self, question, facts=None, *, child_id=None, language=None, options=None):
        return self.run("reasoning", "analyze", {"question": question, "facts": facts}, language, options)


class ChildUnderstanding(_Engine):
    def build_profile(self, sources, *, child_id=None, language=None, options=None):
        return self.run("child_understanding", "build_profile", {"sources": sources}, language, options)


class ObservationAnalysis(_Engine):
    def analyze(self, observations, *, child_id=None, task="analyze", language=None, options=None):
        return self.run("observation_analysis", task, {"observations": observations}, language, options)


class Recommendation(_Engine):
    def recommend(self, target, *, focus=None, count=3, child_id=None, language=None, options=None):
        return self.run("recommendation", "recommend", {"target": target, "focus": focus, "count": count}, language, options)


class ContentGeneration(_Engine):
    def generate(self, content_type, goal, *, game_type=None, child_id=None, language=None, options=None):
        return self.run("content_generation", "generate",
                        {"content_type": content_type, "goal": goal, "game_type": game_type}, language, options)


class Story(_Engine):
    def generate_story(self, goal, *, topic=None, length="short", difficulty="easy", characters=None, child_id=None,
                       language=None, options=None):
        return self.run("story", "generate", {"goal": goal, "topic": topic, "length": length, "difficulty": difficulty,
                                              "characters": characters or []}, language, options)


class Character(_Engine):
    def create_character(self, name_token, description, *, style=None, child_id=None, language=None, options=None):
        return self.run("character", "create", {"name_token": name_token, "description": description, "style": style},
                        language, options)


class ImageGeneration(_Engine):
    def generate_image(self, prompt, *, purpose="illustration", style=None, shape="square", characters=None,
                       child_id=None, language=None, options=None):
        return self.run("image_generation", "generate", {"prompt": prompt, "purpose": purpose, "style": style,
                                                         "shape": shape, "characters": characters or []},
                        language, options)


class VideoAnimator(_Engine):
    def animate(self, script, scenes, *, characters=None, narration=True, child_id=None, language=None, options=None):
        return self.run("video_animator", "animate", {"script": script, "scenes": scenes,
                                                      "characters": characters or [], "narration": narration},
                        language, options)


class Voice(_Engine):
    def speak(self, text, *, role="narrator", character=None, speed=1.0, child_id=None, language=None, options=None):
        return self.run("voice", "speak", {"text": text, "role": role, "character": character, "speed": speed},
                        language, options)


class SpeechRecognition(_Engine):
    def transcribe(self, audio_asset_id, *, speaker="teacher", language=None, options=None):
        return self.run("speech_recognition", "transcribe", {"audio_asset_id": audio_asset_id, "speaker": speaker},
                        language, options)


class Music(_Engine):
    def compose(self, purpose, mood, duration_seconds, *, lyrics=None, language=None, options=None):
        return self.run("music", "compose", {"purpose": purpose, "mood": mood, "duration_seconds": duration_seconds,
                                             "lyrics": lyrics}, language, options)


class SoundEffects(_Engine):
    def generate_effect(self, effect, *, duration_seconds=1.0, options=None):
        return self.run("sound_effects", "generate", {"effect": effect, "duration_seconds": duration_seconds}, None, options)


class Vision(_Engine):
    def describe(self, image_asset_id, question, *, language=None, options=None):
        return self.run("vision", "describe", {"image_asset_id": image_asset_id, "question": question}, language, options)


class Embedding(_Engine):
    def embed(self, texts, *, options=None):
        return self.run("embedding", "embed", {"texts": texts}, None, options)


class Classification(_Engine):
    def classify(self, items, taxonomy, *, multi_label=True, child_id=None, language=None, options=None):
        return self.run("classification", "classify", {"items": items, "taxonomy": taxonomy,
                                                       "multi_label": multi_label}, language, options)


class Translation(_Engine):
    def translate(self, text, target_language, *, source_language=None, options=None):
        return self.run("translation", "translate", {"text": text, "target_language": target_language,
                                                     "source_language": source_language},
                        LanguageSpec(language=target_language), options)


class SafetyModeration(_Engine):
    def moderate(self, content, *, audience="child", language=None, options=None):
        return self.run("safety_moderation", "moderate", {"content": content, "audience": audience}, language, options)


class Personalization(_Engine):
    def adapt(self, content, *, child_id=None, adapt_for=None, language=None, options=None):
        return self.run("personalization", "adapt", {"content": content, "adapt_for": adapt_for or ["interests"]},
                        language, options)


class ProgressAnalysis(_Engine):
    def analyze_progress(self, period_from, period_to, *, child_id=None, observations=None, activities=None,
                         language=None, options=None):
        return self.run("progress_analysis", "analyze", {"period_from": period_from, "period_to": period_to,
                                                         "observations": observations or [],
                                                         "activities": activities or []}, language, options)


class Orchestration(_Engine):
    def plan(self, goal, *, child_id=None, language=None, options=None):
        return self.run("orchestration", "plan", {"goal": goal}, language, options)


@dataclass
class Engines:
    reasoning: Reasoning
    child_understanding: ChildUnderstanding
    observation_analysis: ObservationAnalysis
    recommendation: Recommendation
    content_generation: ContentGeneration
    story: Story
    character: Character
    image_generation: ImageGeneration
    video_animator: VideoAnimator
    voice: Voice
    speech_recognition: SpeechRecognition
    music: Music
    sound_effects: SoundEffects
    vision: Vision
    embedding: Embedding
    classification: Classification
    translation: Translation
    safety_moderation: SafetyModeration
    personalization: Personalization
    progress_analysis: ProgressAnalysis
    orchestration: Orchestration


def engines(db: Session, user: User | None, *, context: dict | None = None, child_uuid: uuid.UUID | None = None) -> Engines:
    r = _Runner(db, user, context or {}, child_uuid)
    return Engines(**{name: cls(r) for name, cls in Engines.__annotations__.items()})
