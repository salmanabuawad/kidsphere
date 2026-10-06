"""AI service: generate content, suggest a current understanding, draft a functional summary.

    generate(kind, ctx, *, client=None) -> GenerationResult
    validate_output(kind, data, template=None, include_video=False, ai=False, tokens=()) -> (content | None, issues)

    suggest_understanding_result(ctx, observations, focus_areas, baseline_items, *, client=None,
                                 child_names=(), classmate_names=(), adult_names=(), baseline_at=None,
                                 relevant_domains=None) -> UnderstandingResult      (no DB, writes nothing)
    suggest_understanding(db, child, user, ctx, observations, focus_areas, baseline_items, *, client=None,
                          classmate_names=None, adult_names=None, baseline_at=None)
        -> (UnderstandingResult, AiSuggestion)
        The same suggestion, with the AI domains of the period (teacher assessment +
        observations + focus areas) and ONE new ``ai_suggestions`` row (kind
        'understanding'; earlier pending ones of the child are discarded). Flushes; the
        caller commits. ``result.suggestion_id`` is the row id.
    draft_functional_summary(db, child, lang, user, *, client=None) -> (draft: dict, AiSuggestion)
        A de-identified Domain 17 draft built from the profile labels, the current
        understanding, the active focus areas, the observations since the latest baseline
        and the teacher assessment; ONE new ``ai_suggestions`` row (kind
        'functional_summary'). ``draft`` is ready for a functional_summaries row:
        {general_description, main_strengths {items [{key}|{custom}], text},
         main_needs {items [text], text}, adaptations, team_recommendations,
         possible_patterns [text], next_observation_questions [{domain, question}]}.
        It never has follow_up_with_parents, involvement, focus decisions or closing.
        Nothing is saved as a summary. Flushes; the caller commits.
    resolve_suggestion(db, suggestion_id, *, child_id, outcome, used_by_type=None, used_by_id=None)
        = app.ai.suggestions.resolve (one UPDATE pending -> accepted | edited | discarded).

Flow (PLAN-ADJUSTMENTS A3): Claude when an API key is set (or a client is
injected), otherwise the template provider. Claude output is validated with
Pydantic (+ semantic checks) and the AI safety check (``ai=True``: clinical,
deficit and referral wording in every field; COVERAGE-MATRIX §7.8); on any
failure or AIError the template provider is used and ``fallback_reason`` records
why (AI_TIMEOUT, AI_UNAVAILABLE, AI_REFUSAL, AI_MAX_TOKENS, AI_INVALID_OUTPUT,
AI_UNSAFE_OUTPUT). No repair round-trip.

De-identification (X-31, OQ-4): the analysis payloads (understanding, functional
summary) call the child ``[child]``; every free text is masked ([child], [friend],
[adult], [phone], [email]); the answer is restored locally (``[child]`` -> the
first or preferred name). Content generation keeps the first or preferred name.
The payload is stored as ``ai_suggestions.input`` whichever provider answered.

For any provider, the understanding enforces PLAN B6 on the server: a
focus_review or baseline_validation status other than needs_more_observation
needs >= 3 linked observations since the latest baseline, otherwise it is
downgraded to needs_more_observation.
"""
import logging
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import vocab
from app.ai import domains as ai_domains
from app.ai import gather, suggestions, template_provider
from app.ai.claude_provider import AIError, call_claude
from app.ai.context import (
    ADULT_TOKEN,
    CHILD_TOKEN,
    FRIEND_TOKEN,
    WHAT_HELPS_LISTS,
    AIContext,
    build_context,
    domain_blocks,
    mask_understanding_inputs,
    name_masker,
)
from app.ai.prompts import (
    FUNCTIONAL_SUMMARY_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    UNDERSTANDING_SYSTEM_PROMPT,
    functional_summary_payload,
    functional_summary_prompt,
    understanding_payload,
    understanding_prompt,
    user_prompt,
)
from app.ai.safety import check_content, child_facing_fields, placeholder_issues
from app.ai.schemas import (
    GAME_MODELS,
    KIND_MODELS,
    NEEDS_MORE,
    FocusReviewItem,
    FunctionalSummaryDraft,
    UnderstandingSuggestion,
    game_adapter,
    pack_model,
)
from app.errors import AppError
from app.services.settings import EffectiveAI, effective_ai
from app.models import AiSuggestion, Baseline, ChildProfile, FocusArea, Observation, User

log = logging.getLogger("app.ai")

KINDS = ("story", "real_world_activity", "digital_game", "video", "pack")
MIN_LINKED_OBSERVATIONS = 3
MAX_UNDERSTANDING_OBSERVATIONS = 40
MAX_SUMMARY_OBSERVATIONS = 40

# What the restored output says instead of the masks it may still carry (teacher-facing).
FRIEND_WORDS = {"en": "a friend", "ar": "صديق", "he": "חבר/ה"}
ADULT_WORDS = {"en": "an adult", "ar": "شخص بالغ", "he": "מבוגר/ת"}


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
    domains: list[str] = []
    suggestion_id: str | None = None


def _use_claude(client, cfg: EffectiveAI) -> bool:
    """Admin provider_mode "template" always wins; otherwise Claude when a client is injected
    or a key is set (a key saved in the admin settings, else .env)."""
    if cfg.provider_mode == "template":
        return False
    return client is not None or bool(cfg.api_key)


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


def validate_output(kind: str, data, template: str | None = None, include_video: bool = False, ai: bool = False,
                    tokens=()):
    """Return (content, issues). content is None when anything is wrong.

    issues start with "schema:" (shape/semantic problems) or "safety:" (wording).
    ``ai=True`` applies the AI-output wording rules (deficit and referral wording in every field).
    ``tokens``: the person placeholders the content may use (``{grandfather}``, ...; the context's cast);
    any other placeholder is a schema issue.
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
    issues += [f"schema: {i}" for i in placeholder_issues(content, tokens)]
    issues += [f"safety: {i}" for i in check_content(content, child_facing_fields(kind), ai=ai)]
    return (None, issues) if issues else (content, [])


def _title(kind: str, content: dict) -> str:
    return content["story"]["title"] if kind == "pack" else content["title"]


def _fallback_code(issues: list[str]) -> str:
    return "AI_INVALID_OUTPUT" if any(i.startswith("schema:") for i in issues) else "AI_UNSAFE_OUTPUT"


def generate(kind: str, ctx: AIContext, *, client=None) -> GenerationResult:
    if kind not in KINDS:
        raise ValueError(f"unknown kind {kind!r}")
    template = resolve_template(kind, ctx)
    tokens = {c.token for c in ctx.cast}
    fallback_reason = None
    cfg = effective_ai()
    if _use_claude(client, cfg):
        try:
            data = call_claude(kind, SYSTEM_PROMPT, user_prompt(kind, ctx, template),
                               provider_model(kind, template, ctx.include_video), client=client, config=cfg)
            content, issues = validate_output(kind, data, template, ctx.include_video, ai=True, tokens=tokens)
            if content is not None:
                return GenerationResult(title=_title(kind, content), content=content, provider="claude",
                                        model=cfg.model, is_template=False)
            fallback_reason = _fallback_code(issues)
            log.warning("ai output rejected op=%s reason=%s issues=%d first=%s", kind, fallback_reason, len(issues),
                        issues[0] if issues else "")
        except AIError as e:
            fallback_reason = e.code
        except Exception:  # never let a provider bug break generation
            log.exception("ai call failed op=%s", kind)
            fallback_reason = "AI_UNAVAILABLE"

    data = template_provider.generate(kind, ctx, template)
    content, issues = validate_output(kind, data, template, ctx.include_video, tokens=tokens)
    if content is None:
        log.error("template output invalid op=%s issues=%s", kind, issues[:5])
        raise AppError("AI_UNAVAILABLE", details={"issues": issues[:20]})
    log.info("ai generate op=%s provider=template model=%s fallback_reason=%s", kind,
             template_provider.TEMPLATE_MODEL, fallback_reason)
    return GenerationResult(title=_title(kind, content), content=content, provider="template",
                            model=template_provider.TEMPLATE_MODEL, is_template=True,
                            fallback_reason=fallback_reason)


# --------------------------------------------------------------------------- shared analysis helpers


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


def _normalise_observations(observations, mask, baseline_at) -> list[dict]:
    """Masked, minimised observations, oldest first: the observation text (or 'what I see') only,
    never the note or the other free texts; tagged with their AI domains."""
    out = []
    for o in observations or []:
        if not _since(_get(o, "observed_at"), baseline_at):
            continue
        text = _get(o, "observation") or _get(o, "text")
        if not text:
            details = _get(o, "details")
            text = details.get("what_i_see") if isinstance(details, dict) else None
        text = (mask(str(text or "").strip()) or "")[:300]
        fid = _get(o, "focus_area_id")
        observed = _get(o, "observed_at")
        out.append({
            "id": str(_get(o, "id")),
            "focus_area_id": str(fid) if fid is not None else None,
            "observed_at": observed.isoformat() if isinstance(observed, datetime) else observed,
            "context": _get(o, "context"),
            "support_level": _get(o, "support_level"),
            "domains": [d for d in (_get(o, "domains") or []) if d in ai_domains.AI_DOMAINS],
            "text": text,
        })
        _stage_e(out[-1], _get(o, "details"), o)
    out.sort(key=lambda x: str(x.get("observed_at") or ""))
    return out


def _stage_e(entry: dict, details, raw=None) -> None:
    """Adds the stage-E key ``changed`` (did_it_change) and the plan it applied
    (``plan_focus_area_id``) to an AI observation entry; never what_changed or documentation
    (OM-D14-10, X-38). An already minimised entry (app.ai.gather) carries them at the top level."""
    changed = details.get("did_it_change") if isinstance(details, dict) else _get(raw, "changed")
    if changed in gather.CHANGE_KEYS:
        entry["changed"] = changed
    ref = details.get("plan_ref") if isinstance(details, dict) else None
    plan_fid = ref.get("focus_area_id") if isinstance(ref, dict) else _get(raw, "plan_focus_area_id")
    if plan_fid:
        entry["plan_focus_area_id"] = str(plan_fid)


def _normalise_focus(focus_areas, with_plan: bool = False) -> list[dict]:
    out = []
    for f in focus_areas or []:
        item = {
            "id": str(_get(f, "id")),
            "category": _get(f, "category"),
            "suggestion_key": _get(f, "suggestion_key"),
            "title": _get(f, "title"),
            "description": _get(f, "description"),
        }
        if with_plan and isinstance(_get(f, "plan"), dict):
            item["plan"] = _get(f, "plan")
            if _get(f, "source_need"):
                item["source_need"] = True  # dropped (with plan.need) by mask_understanding_inputs
        out.append(item)
    return out


def _normalise_baseline(items) -> list[dict]:
    out = []
    for it in items or []:
        out.append({k: (str(v) if k == "key" and v is not None else v)
                    for k, v in {"list": _get(it, "list"), "key": _get(it, "key"), "custom": _get(it, "custom"),
                                 "label": _get(it, "label")}.items()})
    return out


def _is_independence_area(key) -> bool:
    try:
        return bool(key) and vocab.is_valid("independence_areas", key)
    except KeyError:
        return False


def filter_baseline_items(items: list[dict], relevant_domains=None) -> list[dict]:
    """What of the baseline may go to the AI (COVERAGE-MATRIX §7.2): never a sensitivity support
    need (parent-reported, e.g. certain_foods); independence levels only when the request concerns
    independence (``relevant_domains`` None = unknown: kept)."""
    out = []
    for it in items:
        if it.get("list") == "support_needs":
            if not _is_independence_area(it.get("key")):
                continue
            if relevant_domains is not None and "independence" not in set(relevant_domains):
                continue
        out.append(it)
    return out


def _restore_text(text: str, name: str, lang: str) -> str:
    return (text.replace(CHILD_TOKEN, name)
            .replace(FRIEND_TOKEN, FRIEND_WORDS.get(lang, FRIEND_WORDS["en"]))
            .replace(ADULT_TOKEN, ADULT_WORDS.get(lang, ADULT_WORDS["en"])))


def restore_names(value, name: str, lang: str):
    """The de-identified answer with the child's name put back (in place for models)."""
    if isinstance(value, str):
        return _restore_text(value, name, lang)
    if isinstance(value, list):
        for i, v in enumerate(value):
            value[i] = restore_names(v, name, lang)
        return value
    if isinstance(value, dict):
        for k, v in value.items():
            value[k] = restore_names(v, name, lang)
        return value
    if isinstance(value, BaseModel):
        for field in type(value).model_fields:
            setattr(value, field, restore_names(getattr(value, field), name, lang))
        return value
    return value


def _payload_domains(payload: dict) -> list[str]:
    found = set((payload.get("domains") or {}).keys())
    for o in payload.get("observations_since_baseline") or payload.get("observations") or []:
        found |= set(o.get("domains") or [])
    return [d for d in ai_domains.AI_DOMAINS if d in found]


def _analysis_context(db: Session, child_id, ctx: AIContext, observations, focus_areas, baseline_at):
    """(ctx with the domain blocks of the period, relevant domains)."""
    cache = gather.assessment_cache(db, child_id)
    tagged = {d for o in observations or [] if _since(_get(o, "observed_at"), baseline_at)
              for d in (_get(o, "domains") or [])}
    focus = [(_get(f, "category"), _get(f, "suggestion_key")) for f in focus_areas or []]
    relevant = ai_domains.analysis_domains(cache, tagged, focus)
    blocks = domain_blocks(ai_domains.assessment_blocks(cache, relevant))
    return ctx.model_copy(update={"domains": blocks}), relevant


# --------------------------------------------------------------------------- understanding


def _item_ref(it) -> tuple:
    key = _get(it, "key")
    if key:
        return (_get(it, "list"), "k:" + str(key))
    return (_get(it, "list"), "c:" + str(_get(it, "custom") or _get(it, "label") or "").strip().lower())


def _restore_baseline_texts(s: UnderstandingSuggestion, baseline: list[dict], ai_baseline: list[dict]) -> None:
    """Claude saw masked baseline texts; give the matching entries their original custom/label back,
    so the review screen can match them to its baseline items. Items that differ only in a masked
    name ("Builds with Noa", "Builds with Lina") share one masked text: they are given back in order."""
    originals: dict[tuple, list[dict]] = {}
    for o, m in zip(baseline, ai_baseline):
        originals.setdefault(_item_ref(m), []).append(o)
    for item in s.baseline_validation:
        queue = originals.get(_item_ref(item))
        if queue:
            original = queue.pop(0)
            item.custom = original.get("custom")
            item.label = original.get("label") or item.label


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


def _understanding(ctx: AIContext, observations, focus_areas, baseline_items, *, client=None, child_names=(),
                   classmate_names=(), adult_names=(), baseline_at=None, relevant_domains=None):
    """(UnderstandingResult, the de-identified payload)."""
    mask = name_masker([ctx.name, *(child_names or ())], classmate_names, adult_names)
    obs = _normalise_observations(observations, mask, baseline_at)
    focus = _normalise_focus(focus_areas)
    baseline = filter_baseline_items(_normalise_baseline(baseline_items), relevant_domains)
    ai_ctx, ai_focus, ai_baseline = mask_understanding_inputs(ctx, focus, baseline, mask)
    payload = understanding_payload(ai_ctx, obs[-MAX_UNDERSTANDING_OBSERVATIONS:], ai_focus, ai_baseline)
    fallback_reason = None
    suggestion = None
    provider, model = "template", template_provider.TEMPLATE_MODEL
    cfg = effective_ai()
    if _use_claude(client, cfg):
        try:
            data = call_claude("understanding", UNDERSTANDING_SYSTEM_PROMPT,
                               understanding_prompt(ai_ctx, [], [], [], payload=payload),
                               UnderstandingSuggestion, client=client, config=cfg)
            suggestion = UnderstandingSuggestion.model_validate(data)
            issues = check_content(suggestion, set(), ai=True)
            if issues:
                fallback_reason, suggestion = "AI_UNSAFE_OUTPUT", None
                log.warning("understanding rejected: unsafe issues=%d first=%s", len(issues), issues[0])
            else:
                _restore_baseline_texts(suggestion, baseline, ai_baseline)
                provider, model = "claude", cfg.model
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
    restore_names(suggestion, ctx.name, ctx.language)
    log.info("ai understanding provider=%s model=%s observations=%d fallback_reason=%s",
             provider, model, len(obs), fallback_reason)
    result = UnderstandingResult(suggestion=suggestion, provider=provider, model=model,
                                 is_template=provider == "template", fallback_reason=fallback_reason,
                                 domains=_payload_domains(payload))
    return result, payload


def suggest_understanding_result(ctx: AIContext, observations, focus_areas, baseline_items, *, client=None,
                                 child_names=(), classmate_names=(), adult_names=(),
                                 baseline_at=None, relevant_domains=None) -> UnderstandingResult:
    """``child_names``: the child's full and preferred names (``ctx.name`` is always masked too);
    ``classmate_names``: the other children; ``adult_names``: the child's parents and the teachers.
    All are masked in every free text sent to the AI. ``baseline_items`` must already leave out
    what may not reach the AI (parent-only custom entries); sensitivity support needs are dropped
    here, and independence ones unless ``relevant_domains`` includes independence (None: kept).
    Writes nothing."""
    result, _ = _understanding(ctx, observations, focus_areas, baseline_items, client=client,
                               child_names=child_names, classmate_names=classmate_names, adult_names=adult_names,
                               baseline_at=baseline_at, relevant_domains=relevant_domains)
    return result


def suggest_understanding(db: Session, child, user: User | None, ctx: AIContext, observations, focus_areas,
                          baseline_items, *, client=None, classmate_names=None, adult_names=None,
                          baseline_at=None) -> tuple[UnderstandingResult, AiSuggestion]:
    """The understanding suggestion with the period's AI domains, persisted as an ``ai_suggestions``
    row (contract with app/services/reviews.py). ``ctx`` is built with ``mask_free_text=False``."""
    if classmate_names is None:
        classmate_names = gather.classmate_names(db, child)
    if adult_names is None:
        adult_names = gather.adult_names(db, child)
    ctx, relevant = _analysis_context(db, child.id, ctx, observations, focus_areas, baseline_at)
    result, payload = _understanding(ctx, observations, focus_areas, baseline_items, client=client,
                                     child_names=[child.name, child.preferred_name],
                                     classmate_names=classmate_names, adult_names=adult_names,
                                     baseline_at=baseline_at, relevant_domains=relevant)
    row = suggestions.persist(db, child_id=child.id, kind="understanding", user=user, provider=result.provider,
                              model=result.model, is_template=result.is_template,
                              fallback_reason=result.fallback_reason, domains=result.domains, input=payload,
                              output=result.suggestion.model_dump(mode="json"))
    result.suggestion_id = str(row.id)
    return result, row


# --------------------------------------------------------------------------- functional summary (Domain 17)


def _sanitise_summary_keys(draft: FunctionalSummaryDraft) -> None:
    for item in draft.main_strengths.items:
        if item.key and not vocab.is_valid("strengths", item.key):
            item.custom, item.key = item.label[:120], None


def summary_fields(draft: FunctionalSummaryDraft) -> dict:
    """The draft in the shape of a functional_summaries row (+ patterns and next questions)."""
    data = draft.model_dump(mode="json")
    data["main_strengths"]["items"] = [{"key": i["key"]} if i.get("key") else {"custom": i["custom"]}
                                       for i in data["main_strengths"]["items"]]
    return data


def _latest_baseline(db: Session, child_id) -> Baseline | None:
    return db.scalars(select(Baseline).where(Baseline.child_id == child_id)
                      .order_by(Baseline.created_at.desc(), Baseline.id).limit(1)).first()


def draft_functional_summary(db: Session, child, lang: str, user: User | None, *,
                             client=None) -> tuple[dict, AiSuggestion]:
    """A de-identified functional-summary draft (contract with app/services/functional_summaries.py)."""
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).first()
    baseline = _latest_baseline(db, child.id)
    since = baseline.created_at if baseline is not None else None
    stmt = select(Observation).where(Observation.child_id == child.id)
    if since is not None:
        stmt = stmt.where(Observation.observed_at >= since)
    rows = list(reversed(db.scalars(stmt.order_by(Observation.observed_at.desc(), Observation.id.desc())
                                    .limit(MAX_SUMMARY_OBSERVATIONS)).all()))
    focus_rows = list(db.scalars(select(FocusArea).where(FocusArea.child_id == child.id, FocusArea.status == "active")
                                 .order_by(FocusArea.created_at, FocusArea.id)))
    classmates, adults = gather.classmate_names(db, child), gather.adult_names(db, child)

    ctx = build_context(child=child, profile=profile, mode=None, content_type="functional_summary", language=lang,
                        current_understanding=profile.current_understanding if profile else None,
                        mask_free_text=False)
    ctx, _relevant = _analysis_context(db, child.id, ctx, rows, focus_rows, since)
    mask = name_masker([ctx.name, child.name, child.preferred_name], classmates, adults)
    obs = _normalise_observations(rows, mask, since)
    focus = _normalise_focus(focus_rows, with_plan=True)
    ai_ctx, ai_focus, _ = mask_understanding_inputs(ctx, focus, [], mask)
    payload = functional_summary_payload(ai_ctx, obs, ai_focus)

    draft = None
    fallback_reason = None
    provider, model = "template", template_provider.TEMPLATE_MODEL
    cfg = effective_ai()
    if _use_claude(client, cfg):
        try:
            data = call_claude("functional_summary", FUNCTIONAL_SUMMARY_SYSTEM_PROMPT,
                               functional_summary_prompt(ai_ctx, payload), FunctionalSummaryDraft, client=client,
                               config=cfg)
            draft = FunctionalSummaryDraft.model_validate(data)
            issues = check_content(draft, set(), ai=True)
            if issues:
                fallback_reason, draft = "AI_UNSAFE_OUTPUT", None
                log.warning("functional summary rejected: unsafe issues=%d first=%s", len(issues), issues[0])
            else:
                provider, model = "claude", cfg.model
        except ValidationError as e:
            fallback_reason, draft = "AI_INVALID_OUTPUT", None
            log.warning("functional summary rejected: invalid issues=%s", _error_list(e)[:3])
        except AIError as e:
            fallback_reason = e.code
        except Exception:
            log.exception("functional summary call failed")
            fallback_reason = "AI_UNAVAILABLE"
    if draft is None:
        draft = FunctionalSummaryDraft.model_validate(template_provider.functional_summary(ctx, obs, focus))
    _sanitise_summary_keys(draft)
    restore_names(draft, ctx.name, lang)
    log.info("ai functional_summary provider=%s model=%s observations=%d fallback_reason=%s",
             provider, model, len(obs), fallback_reason)
    row = suggestions.persist(db, child_id=child.id, kind="functional_summary", user=user, provider=provider,
                              model=model, is_template=provider == "template", fallback_reason=fallback_reason,
                              domains=_payload_domains(payload), input=payload, output=draft.model_dump(mode="json"))
    return summary_fields(draft), row


resolve_suggestion = suggestions.resolve
