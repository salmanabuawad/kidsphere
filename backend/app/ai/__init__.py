"""KidSphere AI core library (no routes).

Typical use from a router/service::

    from app.ai import build_context, generate

    ctx = build_context(child=child, profile=profile, mode="growth_support",
                        content_type="real_world_activity", language="en",
                        focus=focus_area, recent_observations=obs_rows,
                        classmate_names=names, current_understanding=profile.current_understanding,
                        avoid=teacher_avoid(cache), domains=blocks)
    result = generate("real_world_activity", ctx)
    row = GeneratedContent(..., title=result.title, content=result.content,
                           generation_input=ctx.model_dump(mode="json"),
                           ai_provider=result.provider, ai_model=result.model,
                           is_template=result.is_template, variant=ctx.variant)

Analysis (de-identified, persisted as ``ai_suggestions``)::

    result, row = suggest_understanding(db, child, user, ctx, observations, focus_rows, baseline_items, ...)
    draft, row = draft_functional_summary(db, child, lang, user)
    resolve_suggestion(db, row.id, child_id=child.id, outcome="accepted",
                       used_by_type="development_review", used_by_id=review.id)

Future content types (COVERAGE-MATRIX X-60; documented only, nothing is built yet):
    Audio stories and songs would become new ``content_type`` values (``audio_story``,
    ``song``) with their own output model, safety fields and template output in en/ar/he
    (like every kind in ``KINDS``), a placeholder ``app/services/audio_service.py`` shaped like
    ``video_service.py`` (an external job id, no audio generated in KidSphere) and a small
    provider registry next to ``claude_provider`` / ``template_provider``. They would use the
    same minimised AIContext (relevant domain blocks only, first or preferred name, ``avoid``
    from the teacher) and the same draft -> teacher approval flow. No schema change is made
    for them now.
"""
from app.ai.claude_provider import AIError
from app.ai.context import AIContext, build_context, mask_names
from app.ai.domains import for_focus, for_strength, teacher_avoid
from app.ai.safety import check_content, child_facing_fields, find_unsafe_text
from app.ai.schemas import (
    GAME_MODELS,
    GAME_TEMPLATES,
    ActivityOut,
    FunctionalSummaryDraft,
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
    draft_functional_summary,
    generate,
    resolve_suggestion,
    suggest_understanding,
    suggest_understanding_result,
    validate_output,
)
from app.ai.template_provider import TEMPLATE_MODEL, pick_template

__all__ = [
    "AIContext",
    "AIError",
    "ActivityOut",
    "FunctionalSummaryDraft",
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
    "draft_functional_summary",
    "find_unsafe_text",
    "for_focus",
    "for_strength",
    "game_adapter",
    "generate",
    "mask_names",
    "pick_template",
    "resolve_suggestion",
    "suggest_understanding",
    "suggest_understanding_result",
    "teacher_avoid",
    "validate_output",
]
