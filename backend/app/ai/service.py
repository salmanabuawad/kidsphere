"""AI service: generate content and suggest a current understanding.

    generate(kind, ctx, *, client=None) -> GenerationResult
    suggest_understanding(ctx, observations, focus_areas, baseline_items, *, client=None,
                          classmate_names=(), baseline_at=None) -> UnderstandingSuggestion
    suggest_understanding_result(...same...) -> UnderstandingResult (adds provider info)
    validate_output(kind, data, template=None, include_video=False) -> (content | None, issues)

Flow (PLAN-ADJUSTMENTS A3): Claude when an API key is set (or a client is
injected), otherwise the template provider. Claude output is validated with
Pydantic (+ semantic checks) and the safety check; on any failure or AIError the
template provider is used and ``fallback_reason`` records why (AI_TIMEOUT,
AI_UNAVAILABLE, AI_REFUSAL, AI_MAX_TOKENS, AI_INVALID_OUTPUT, AI_UNSAFE_OUTPUT).
No repair round-trip.

For any provider, suggest_understanding enforces PLAN B6 on the server: a
focus_review or baseline_validation status other than needs_more_observation
needs >= 3 linked observations since the latest baseline, otherwise it is
downgraded to needs_more_observation.
"""
import logging
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ValidationError

from app import vocab
from app.ai import template_provider
from app.ai.claude_provider import AIError, call_claude
from app.ai.context import WHAT_HELPS_LISTS, AIContext, mask_names
from app.ai.prompts import SYSTEM_PROMPT, UNDERSTANDING_SYSTEM_PROMPT, understanding_prompt, user_prompt
from app.ai.safety import check_content, child_facing_fields
from app.ai.schemas import (
    GAME_MODELS,
    KIND_MODELS,
    NEEDS_MORE,
    FocusReviewItem,
    UnderstandingSuggestion,
    game_adapter,
    pack_model,
)
from app.config import settings
from app.errors import AppError

log = logging.getLogger("app.ai")

KINDS = ("story", "real_world_activity", "digital_game", "video", "pack")
MIN_LINKED_OBSERVATIONS = 3
MAX_UNDERSTANDING_OBSERVATIONS = 40


class GenerationResult(BaseModel):
    title: str
    content: dict
    provider: Literal["claude", "template"]
    model: str | None
    is_template: bool
    fallback_reason: str | None = None


class UnderstandingResult(BaseModel):
    suggestion: UnderstandingSuggestion
    provider: Literal["claude", "template"]
    model: str | None
    is_template: bool
    fallback_reason: str | None = None


def _use_claude(client) -> bool:
    return client is not None or bool(settings.anthropic_api_key)


def resolve_template(kind: str, ctx: AIContext) -> str | None:
    if kind in ("digital_game", "pack"):
        return ctx.template or template_provider.pick_template(ctx)
    return None


def provider_model(kind: str, template: str | None = None, include_video: bool = False):
    """The Pydantic model whose schema is sent to Claude for this kind."""
    if kind == "digital_game":
        return GAME_MODELS[template or "multiple_choice"]
    if kind == "pack":
        return pack_model(template or "multiple_choice", include_video)
    return KIND_MODELS[kind]


def _error_list(e: ValidationError) -> list[str]:
    return [f"{'.'.join(str(p) for p in err.get('loc', ()))}: {err.get('msg')}" for err in e.errors()][:20]


def validate_output(kind: str, data, template: str | None = None, include_video: bool = False):
    """Return (content, issues). content is None when anything is wrong.

    issues start with "schema:" (shape/semantic problems) or "safety:" (wording).
    """
    if not isinstance(data, dict):
        return None, ["schema: output is not an object"]
    try:
        if kind == "digital_game":
            obj = game_adapter.validate_python(data)
        else:
            obj = KIND_MODELS[kind].model_validate(data)
    except ValidationError as e:
        return None, [f"schema: {m}" for m in _error_list(e)]
    content = obj.model_dump(mode="json")
    issues: list[str] = []
    if kind == "digital_game" and template and content.get("template") != template:
        issues.append(f"schema: template must be {template}")
    if kind == "pack":
        if template and content["game"]["template"] != template:
            issues.append(f"schema: pack game template must be {template}")
        if include_video and not content.get("video"):
            issues.append("schema: the pack must include a video plan")
        if not include_video:
            content["video"] = None
    issues += [f"safety: {i}" for i in check_content(content, child_facing_fields(kind))]
    return (None, issues) if issues else (content, [])


def _title(kind: str, content: dict) -> str:
    return content["story"]["title"] if kind == "pack" else content["title"]


def _fallback_code(issues: list[str]) -> str:
    return "AI_INVALID_OUTPUT" if any(i.startswith("schema:") for i in issues) else "AI_UNSAFE_OUTPUT"


def generate(kind: str, ctx: AIContext, *, client=None) -> GenerationResult:
    if kind not in KINDS:
        raise ValueError(f"unknown kind {kind!r}")
    template = resolve_template(kind, ctx)
    fallback_reason = None
    if _use_claude(client):
        try:
            data = call_claude(kind, SYSTEM_PROMPT, user_prompt(kind, ctx, template),
                               provider_model(kind, template, ctx.include_video), client=client)
            content, issues = validate_output(kind, data, template, ctx.include_video)
            if content is not None:
                return GenerationResult(title=_title(kind, content), content=content, provider="claude",
                                        model=settings.anthropic_model, is_template=False)
            fallback_reason = _fallback_code(issues)
            log.warning("ai output rejected op=%s reason=%s issues=%d first=%s", kind, fallback_reason, len(issues),
                        issues[0] if issues else "")
        except AIError as e:
            fallback_reason = e.code
        except Exception:  # never let a provider bug break generation
            log.exception("ai call failed op=%s", kind)
            fallback_reason = "AI_UNAVAILABLE"

    data = template_provider.generate(kind, ctx, template)
    content, issues = validate_output(kind, data, template, ctx.include_video)
    if content is None:
        log.error("template output invalid op=%s issues=%s", kind, issues[:5])
        raise AppError("AI_UNAVAILABLE", details={"issues": issues[:20]})
    log.info("ai generate op=%s provider=template model=%s fallback_reason=%s", kind,
             template_provider.TEMPLATE_MODEL, fallback_reason)
    return GenerationResult(title=_title(kind, content), content=content, provider="template",
                            model=template_provider.TEMPLATE_MODEL, is_template=True,
                            fallback_reason=fallback_reason)


# --------------------------------------------------------------------------- understanding


def _get(obj, name, default=None):
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _as_datetime(value):
    if value is None or isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _since(observed_at, baseline_at) -> bool:
    if baseline_at is None:
        return True
    a, b = _as_datetime(observed_at), _as_datetime(baseline_at)
    if a is None or b is None:
        return True
    if (a.tzinfo is None) != (b.tzinfo is None):
        a, b = a.replace(tzinfo=None), b.replace(tzinfo=None)
    return a >= b


def _normalise_observations(observations, ctx: AIContext, classmate_names, baseline_at) -> list[dict]:
    out = []
    for o in observations or []:
        if not _since(_get(o, "observed_at"), baseline_at):
            continue
        text = _get(o, "observation") or _get(o, "text") or ""
        note = _get(o, "note") or ""
        text = mask_names(f"{text} {note}".strip(), [ctx.name], classmate_names)[:300]
        fid = _get(o, "focus_area_id")
        observed = _get(o, "observed_at")
        out.append({
            "id": str(_get(o, "id")),
            "focus_area_id": str(fid) if fid is not None else None,
            "observed_at": observed.isoformat() if isinstance(observed, datetime) else observed,
            "context": _get(o, "context"),
            "support_level": _get(o, "support_level"),
            "text": text,
        })
    out.sort(key=lambda x: str(x.get("observed_at") or ""))
    return out


def _normalise_focus(focus_areas) -> list[dict]:
    return [{
        "id": str(_get(f, "id")),
        "category": _get(f, "category"),
        "title": _get(f, "title"),
        "description": _get(f, "description"),
    } for f in focus_areas or []]


def _normalise_baseline(items) -> list[dict]:
    out = []
    for it in items or []:
        out.append({k: (str(v) if k == "key" and v is not None else v)
                    for k, v in {"list": _get(it, "list"), "key": _get(it, "key"), "custom": _get(it, "custom"),
                                 "label": _get(it, "label")}.items()})
    return out


def _sanitise_profile_keys(s: UnderstandingSuggestion) -> None:
    """Unknown vocabulary keys become custom entries instead of failing the suggestion."""
    for field, lists in (("strengths", ("strengths",)), ("interests", ("interests",)), ("what_helps", WHAT_HELPS_LISTS)):
        for item in getattr(s, field):
            if item.key and not any(vocab.is_valid(name, item.key) for name in lists):
                item.custom, item.key = item.label[:120], None


def apply_evidence_rule(s: UnderstandingSuggestion, observations: list[dict], focus_areas: list[dict],
                        ctx: AIContext) -> UnderstandingSuggestion:
    """PLAN B6: no certainty from limited data, whatever the provider said."""
    ids = {o["id"] for o in observations}
    per_focus: dict[str, int] = {}
    for o in observations:
        if o.get("focus_area_id"):
            per_focus[o["focus_area_id"]] = per_focus.get(o["focus_area_id"], 0) + 1
    known = [f["id"] for f in focus_areas]
    reviews = [r for r in s.focus_review if r.focus_area_id in known]
    seen = {r.focus_area_id for r in reviews}
    for fid in known:
        if fid not in seen:
            reviews.append(FocusReviewItem(focus_area_id=fid, status=NEEDS_MORE,
                                           note=template_provider.frame_text("fr_few", ctx)))
    for r in reviews:
        if r.status != NEEDS_MORE and per_focus.get(r.focus_area_id, 0) < MIN_LINKED_OBSERVATIONS:
            r.status = NEEDS_MORE
            r.note = template_provider.frame_text("fr_few", ctx)
    s.focus_review = reviews
    for item in s.baseline_validation:
        item.observation_ids = [i for i in dict.fromkeys(item.observation_ids) if i in ids]
        if item.status != NEEDS_MORE and len(item.observation_ids) < MIN_LINKED_OBSERVATIONS:
            item.status = NEEDS_MORE
            item.note = template_provider.frame_text("bv_few", ctx)
    return s


def suggest_understanding_result(ctx: AIContext, observations, focus_areas, baseline_items, *, client=None,
                                 classmate_names=(), baseline_at=None) -> UnderstandingResult:
    obs = _normalise_observations(observations, ctx, classmate_names, baseline_at)
    focus = _normalise_focus(focus_areas)
    baseline = _normalise_baseline(baseline_items)
    fallback_reason = None
    suggestion = None
    provider, model = "template", template_provider.TEMPLATE_MODEL
    if _use_claude(client):
        try:
            data = call_claude("understanding", UNDERSTANDING_SYSTEM_PROMPT,
                               understanding_prompt(ctx, obs[-MAX_UNDERSTANDING_OBSERVATIONS:], focus, baseline),
                               UnderstandingSuggestion, client=client)
            suggestion = UnderstandingSuggestion.model_validate(data)
            issues = check_content(suggestion, set())
            if issues:
                fallback_reason, suggestion = "AI_UNSAFE_OUTPUT", None
                log.warning("understanding rejected: unsafe issues=%d first=%s", len(issues), issues[0])
            else:
                provider, model = "claude", settings.anthropic_model
        except ValidationError as e:
            fallback_reason, suggestion = "AI_INVALID_OUTPUT", None
            log.warning("understanding rejected: invalid issues=%s", _error_list(e)[:3])
        except AIError as e:
            fallback_reason = e.code
        except Exception:
            log.exception("understanding call failed")
            fallback_reason = "AI_UNAVAILABLE"
    if suggestion is None:
        suggestion = UnderstandingSuggestion.model_validate(
            template_provider.suggest_understanding(ctx, obs, focus, baseline))
    _sanitise_profile_keys(suggestion)
    apply_evidence_rule(suggestion, obs, focus, ctx)
    log.info("ai understanding provider=%s model=%s observations=%d fallback_reason=%s",
             provider, model, len(obs), fallback_reason)
    return UnderstandingResult(suggestion=suggestion, provider=provider, model=model,
                               is_template=provider == "template", fallback_reason=fallback_reason)


def suggest_understanding(ctx: AIContext, observations, focus_areas, baseline_items, *, client=None,
                          classmate_names=(), baseline_at=None) -> UnderstandingSuggestion:
    return suggest_understanding_result(ctx, observations, focus_areas, baseline_items, client=client,
                                        classmate_names=classmate_names, baseline_at=baseline_at).suggestion
