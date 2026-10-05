"""KidSphere AI core library (no routes).

Typical use from a router/service::

    from app.ai import build_context, generate

    ctx = build_context(child=child, profile=profile, mode="growth_support",
                        content_type="real_world_activity", language="en",
                        focus=focus_area, recent_observations=obs_rows,
                        classmate_names=names, current_understanding=profile.current_understanding)
    result = generate("real_world_activity", ctx)
    row = GeneratedContent(..., title=result.title, content=result.content,
                           generation_input=ctx.model_dump(mode="json"),
                           ai_provider=result.provider, ai_model=result.model,
                           is_template=result.is_template, variant=ctx.variant)
"""
from app.ai.claude_provider import AIError
from app.ai.context import AIContext, build_context, mask_names
from app.ai.safety import check_content, child_facing_fields, find_unsafe_text
from app.ai.schemas import (
    GAME_MODELS,
    GAME_TEMPLATES,
    ActivityOut,
    GameOut,
    PackOut,
    StoryOut,
    UnderstandingSuggestion,
    VideoPlanOut,
    game_adapter,
)
from app.ai.service import (
    KINDS,
    GenerationResult,
    UnderstandingResult,
    generate,
    suggest_understanding,
    suggest_understanding_result,
    validate_output,
)
from app.ai.template_provider import TEMPLATE_MODEL, pick_template

__all__ = [
    "AIContext",
    "AIError",
    "ActivityOut",
    "GAME_MODELS",
    "GAME_TEMPLATES",
    "GameOut",
    "GenerationResult",
    "KINDS",
    "PackOut",
    "StoryOut",
    "TEMPLATE_MODEL",
    "UnderstandingResult",
    "UnderstandingSuggestion",
    "VideoPlanOut",
    "build_context",
    "check_content",
    "child_facing_fields",
    "find_unsafe_text",
    "game_adapter",
    "generate",
    "mask_names",
    "pick_template",
    "suggest_understanding",
    "suggest_understanding_result",
    "validate_output",
]
