"""The 21 AI engines KidSphere knows. Engines are capabilities, never vendors.

Each ``EngineSpec`` says what the engine takes (``input_model``), what it must return
(``output_kind`` and, for structured engines, ``output_model``), the tasks it accepts,
whether its output can reach a child (``child_facing``: always safety-checked and, where
the teacher must approve, never shown before approval), whether it works as a long job
(``long_running``: video), and a harmless ``sample`` input the admin "Test" uses.
"""
from dataclasses import dataclass, field

from pydantic import BaseModel

from app.ai.engines import contracts as c


@dataclass(frozen=True)
class EngineSpec:
    key: str
    output_kind: c.OutputKind
    input_model: type[BaseModel]
    tasks: tuple[str, ...]
    output_model: type[BaseModel] | None = None
    child_facing: bool = False
    long_running: bool = False
    sample: dict = field(default_factory=dict)


_SAMPLE_OBS = [{"id": "o1", "text": "Built a tower with a friend and asked for a turn.", "domains": ["social", "play"]}]

ENGINES: dict[str, EngineSpec] = {e.key: e for e in (
    EngineSpec("reasoning", "structured", c.ReasoningIn, ("analyze", "decide"), c.ReasoningOut,
               sample={"question": "Which calm activity suits a morning circle?"}),
    EngineSpec("child_understanding", "structured", c.ChildUnderstandingIn, ("build_profile",), c.ChildUnderstandingOut,
               sample={"sources": [{"kind": "observation", "text": "Loves animals and tells long stories."}]}),
    EngineSpec("observation_analysis", "structured", c.ObservationAnalysisIn, ("analyze", "categorize", "changes"),
               c.ObservationAnalysisOut, sample={"observations": _SAMPLE_OBS}),
    EngineSpec("recommendation", "structured", c.RecommendationIn, ("recommend",), c.RecommendationOut,
               sample={"target": "activities", "focus": "Taking turns", "count": 2}),
    EngineSpec("content_generation", "structured", c.ContentGenerationIn, ("generate",), c.ContentGenerationOut,
               child_facing=True, sample={"content_type": "activity", "goal": "Taking turns in play"}),
    EngineSpec("story", "structured", c.StoryIn, ("generate", "adapt"), c.StoryOut, child_facing=True,
               sample={"goal": "Asking for help", "topic": "a little lion", "length": "short"}),
    EngineSpec("character", "structured", c.CharacterIn, ("create", "describe"), c.CharacterOut, child_facing=True,
               sample={"name_token": "lion", "description": "A friendly little lion who likes to build."}),
    EngineSpec("image_generation", "image", c.ImageIn, ("generate",), c.MediaOut, child_facing=True,
               sample={"prompt": "A friendly lion building a block tower, picture-book style"}),
    EngineSpec("video_animator", "video", c.VideoIn, ("animate",), c.MediaOut, child_facing=True, long_running=True,
               sample={"script": "The lion builds a tower.", "scenes": [
                   {"narration": "The lion builds a tower.", "visual_prompt": "a lion and blocks"}]}),
    EngineSpec("voice", "audio", c.VoiceIn, ("speak",), c.MediaOut, child_facing=True,
               sample={"text": "Hello, friends!"}),
    EngineSpec("speech_recognition", "transcript", c.SpeechRecognitionIn, ("transcribe",), c.TranscriptOut,
               sample={"audio_asset_id": "sample", "speaker": "teacher"}),
    EngineSpec("music", "audio", c.MusicIn, ("compose",), c.MediaOut, child_facing=True,
               sample={"purpose": "background", "mood": "calm", "duration_seconds": 10}),
    EngineSpec("sound_effects", "audio", c.SoundEffectIn, ("generate",), c.MediaOut, child_facing=True,
               sample={"effect": "soft chime"}),
    EngineSpec("vision", "structured", c.VisionIn, ("describe",), c.VisionOut,
               sample={"image_asset_id": "sample", "question": "What is in the picture?"}),
    EngineSpec("embedding", "embedding", c.EmbeddingIn, ("embed",), c.EmbeddingOut,
               sample={"texts": ["building with blocks"]}),
    EngineSpec("classification", "structured", c.ClassificationIn, ("classify",), c.ClassificationOut,
               sample={"items": ["Shared the blocks with a friend."], "taxonomy": "observation_domains"}),
    EngineSpec("translation", "text", c.TranslationIn, ("translate",), c.TextOut, child_facing=True,
               sample={"text": "Well done!", "target_language": "he"}),
    EngineSpec("safety_moderation", "structured", c.ModerationIn, ("moderate",), c.ModerationOut,
               sample={"content": "A happy story about sharing.", "audience": "child"}),
    EngineSpec("personalization", "structured", c.PersonalizationIn, ("adapt",), c.PersonalizationOut, child_facing=True,
               sample={"content": {"title": "Build together"}, "adapt_for": ["interests"]}),
    EngineSpec("progress_analysis", "structured", c.ProgressAnalysisIn, ("analyze",), c.ProgressAnalysisOut,
               sample={"period_from": "2026-09-01", "period_to": "2026-10-01", "observations": _SAMPLE_OBS}),
    EngineSpec("orchestration", "structured", c.OrchestrationIn, ("plan",), c.OrchestrationOut,
               sample={"goal": "Create an activity for the current goal"}),
)}

ENGINE_KEYS = tuple(ENGINES)


def spec(key: str) -> EngineSpec | None:
    return ENGINES.get(key)
