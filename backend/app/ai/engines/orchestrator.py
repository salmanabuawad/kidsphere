"""The AI orchestrator: the only way KidSphere runs an AI engine.

    run(db, user, request, *, context=None) -> AIResult
    poll(db, user, request_id) -> AIResult            (long jobs: video)
    result_of(db, row) -> AIResult                    (a stored request as a result)

For every request:
  1. Input: the engine exists, the task is one of its tasks, the input validates against the
     engine's input model (else status "rejected", INVALID_INPUT / UNKNOWN_ENGINE / ...).
  2. Configuration (``config.resolve``): no provider → "not_configured" ENGINE_NOT_CONFIGURED;
     switched off → ENGINE_DISABLED; unknown adapter → PROVIDER_NOT_AVAILABLE; adapter that
     needs a secret without one → CREDENTIALS_MISSING; the day's estimated cost at its
     limit → COST_LIMIT_REACHED. None of these crash anything: they are results.
  3. Execution: the adapter gets an ``EngineCall`` (minimised context, never the child's id
     or name), the active prompt template, model, endpoint, timeout and output limit.
     Retryable failures are retried ``max_retries`` times, then the fallback provider runs.
  4. Validation (``validation.check``): contract, sanitize, safety. For a child-facing
     engine, the Safety & Moderation engine also reviews the output when it is configured.
     Raw output never passes a failed check (INVALID_OUTPUT, UNSAFE_OUTPUT, MODERATION_REJECTED).
  5. Trace: one ``ai_requests`` row (minimised input + context, its hash and version,
     provider, model, output, validation, usage, estimated cost, attempts, duration, error)
     and its ``ai_request_events``; produced files become ``ai_assets``. One log line per
     request with codes and numbers only.

Never fake output: when nothing can answer, the result says so (``success`` false, an
``error``), and the user can retry. The caller commits.
"""
import hashlib
import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.engines import assets, config, providers, validation
from app.ai.engines.catalog import ENGINES, EngineSpec
from app.ai.engines.contracts import AIResult, EngineCall, EngineError, EngineRequest, ProviderResponse, Usage, Validation
from app.ai.engines.interfaces import ProviderError
from app.models import AiAsset, AiPromptTemplate, AiRequest, AiRequestEvent, User

log = logging.getLogger("app.ai.engines")

MESSAGES = {
    "UNKNOWN_ENGINE": "This AI engine does not exist.",
    "UNSUPPORTED_TASK": "This engine does not do that task.",
    "INVALID_INPUT": "The request is not complete or has the wrong shape.",
    "ENGINE_NOT_CONFIGURED": "This AI engine is not set up yet. An administrator can configure it.",
    "ENGINE_DISABLED": "This AI engine is switched off.",
    "PROVIDER_NOT_AVAILABLE": "The provider configured for this engine is not available.",
    "PROVIDER_UNSUPPORTED_OUTPUT": "The configured provider cannot produce this kind of result.",
    "CREDENTIALS_MISSING": "The credentials for this engine are not set on the server.",
    "COST_LIMIT_REACHED": "This engine reached today's cost limit. Try again tomorrow.",
    "PROVIDER_ERROR": "The AI provider did not answer. Please try again.",
    "PROVIDER_TIMEOUT": "The AI provider took too long. Please try again.",
    "INVALID_OUTPUT": "The AI answer was not usable, so it was not shown. Please try again.",
    "UNSAFE_OUTPUT": "The AI answer did not pass the safety check, so it was not shown.",
    "MODERATION_REJECTED": "The safety review did not approve this result, so it was not shown.",
    "JOB_NOT_FOUND": "This request is not waiting for a result.",
}
CONFIG_STATUS = {"ENGINE_NOT_CONFIGURED": "not_configured", "ENGINE_DISABLED": "not_configured"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _error(code: str, *, retryable: bool = False) -> EngineError:
    return EngineError(code=code, message=MESSAGES.get(code, MESSAGES["PROVIDER_ERROR"]), retryable=retryable)


def _hash(data) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def _event(db: Session, row: AiRequest, kind: str, **detail) -> None:
    db.add(AiRequestEvent(request_id=row.id, kind=kind, detail={k: v for k, v in detail.items() if v is not None}))


def result_of(db: Session, row: AiRequest) -> AIResult:
    files = db.scalars(select(AiAsset).where(AiAsset.request_id == row.id).order_by(AiAsset.created_at)).all()
    err = _error(row.error_code, retryable=row.retryable) if row.error_code else None
    return AIResult(
        success=row.status == "succeeded", engine=row.engine, task=row.task, provider=row.provider, model=row.model,
        request_id=str(row.id), status=row.status, output=row.output, assets=[assets.ref(f) for f in files],
        usage=Usage(**{k: v for k, v in (row.usage or {}).items() if k in Usage.model_fields}),
        error=err, validation=Validation(**row.validation) if row.validation else None,
        fallback_used=row.fallback_used, created_at=row.created_at or _now(), finished_at=row.finished_at,
    )


def _template(db: Session, engine: str, task: str, language: str) -> AiPromptTemplate | None:
    return db.scalars(
        select(AiPromptTemplate).where(AiPromptTemplate.engine == engine, AiPromptTemplate.task == task,
                                       AiPromptTemplate.language == language, AiPromptTemplate.active.is_(True))
        .order_by(AiPromptTemplate.version.desc()).limit(1)
    ).first()


def _spent_today(db: Session, engine: str) -> float:
    start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    return float(db.scalar(select(func.coalesce(func.sum(AiRequest.cost_estimate), 0))
                           .where(AiRequest.engine == engine, AiRequest.created_at >= start)) or 0)


def _finish(db: Session, row: AiRequest, started: float, *, status: str, error: EngineError | None = None,
            output: dict | None = None, valid: Validation | None = None) -> None:
    row.status = status
    row.error_code = error.code if error else None
    row.error_message = error.message if error else None
    row.retryable = bool(error and error.retryable)
    row.output = output
    row.validation = valid.model_dump() if valid else None
    row.duration_ms = int((time.monotonic() - started) * 1000)
    row.finished_at = _now() if status != "pending" else None
    _event(db, row, status, code=row.error_code, duration_ms=row.duration_ms)
    db.flush()
    log.info("ai engine=%s task=%s provider=%s model=%s status=%s error=%s attempts=%s duration_ms=%s",
             row.engine, row.task, row.provider, row.model, status, row.error_code, row.attempts, row.duration_ms)


def _call(spec: EngineSpec, req: EngineRequest, cfg: config.EngineConfig, data: dict, context: dict,
          template: AiPromptTemplate | None) -> EngineCall:
    return EngineCall(engine=spec.key, task=req.task, output_kind=spec.output_kind, input=data, context=context,
                      language=req.language, options=req.options, instructions=template.body if template else None,
                      model=cfg.model, endpoint=cfg.endpoint, max_output=cfg.max_output,
                      timeout_seconds=cfg.timeout_seconds)


def _attempt(db: Session, row: AiRequest, adapter, call: EngineCall, cfg: config.EngineConfig,
             job_id: str | None = None) -> tuple[ProviderResponse | None, EngineError | None]:
    """Run the adapter with retries. Returns (response, None) or (None, error)."""
    last: EngineError | None = None
    for n in range(cfg.max_retries + 1):
        row.attempts += 1
        _event(db, row, "attempt", n=row.attempts, provider=cfg.provider)
        try:
            response = adapter.poll(job_id, call, cfg.secret()) if job_id else adapter.invoke(call, cfg.secret())
            return response, None
        except ProviderError as e:
            code = e.code if e.code in MESSAGES else ("PROVIDER_TIMEOUT" if "TIMEOUT" in e.code else "PROVIDER_ERROR")
            last = _error(code, retryable=e.retryable)
            _event(db, row, "provider_error", code=e.code, retryable=e.retryable)
            if not e.retryable:
                break
        except Exception as e:  # an adapter bug must never take KidSphere down
            log.warning("ai adapter %s raised %s", cfg.provider, type(e).__name__)
            last = _error("PROVIDER_ERROR", retryable=True)
            _event(db, row, "provider_error", code="EXCEPTION", exception=type(e).__name__)
    return None, last


def _finalize(db: Session, user: User | None, row: AiRequest, spec: EngineSpec, response: ProviderResponse,
              cfg: config.EngineConfig, started: float, call: EngineCall) -> None:
    row.model = response.model or cfg.model
    row.provider_request_id = response.provider_request_id
    if response.state == "pending":
        row.job_id = response.job_id
        _finish(db, row, started, status="pending")
        return
    output, valid = validation.check(spec, response)
    usage = response.usage
    if not usage.cost_estimate and cfg.unit_cost:
        usage = usage.model_copy(update={"cost_estimate": (usage.input_units + usage.output_units) * cfg.unit_cost})
    row.usage = usage.model_dump()
    row.cost_estimate = usage.cost_estimate
    if output is None:
        code = "UNSAFE_OUTPUT" if any(i.startswith("safety:") for i in valid.issues) else "INVALID_OUTPUT"
        _finish(db, row, started, status="failed", error=_error(code, retryable=code == "INVALID_OUTPUT"), valid=valid)
        return
    if spec.child_facing and spec.key != "safety_moderation":
        verdict = _moderate(db, user, row, output, call)
        if verdict is False:
            valid.issues.append("moderation: not approved")
            _finish(db, row, started, status="failed", error=_error("MODERATION_REJECTED"), valid=valid)
            return
        valid.moderated_by_engine = verdict is True
    for b in response.binaries:
        assets.save(db, request_id=row.id, child_id=row.child_id, binary=b)
    _finish(db, row, started, status="succeeded", output=output, valid=valid)


def _moderate(db: Session, user: User | None, row: AiRequest, output: dict, call: EngineCall) -> bool | None:
    """The Safety & Moderation engine's verdict on a child-facing output, when that engine is
    configured (None when it is not: the built-in safety check already ran)."""
    cfg = config.resolve(db, "safety_moderation")
    if not cfg.configured or not cfg.enabled:
        return None
    result = run(db, user, EngineRequest(engine="safety_moderation", task="moderate", language=call.language,
                                         input={"content": output, "audience": "child"},
                                         pipeline_id=str(row.pipeline_id) if row.pipeline_id else None,
                                         parent_request_id=str(row.id)))
    if not result.success:
        return False  # a review that could not run never approves
    return bool((result.output or {}).get("allowed"))


def run(db: Session, user: User | None, req: EngineRequest, *, context: dict | None = None,
        child_uuid: uuid.UUID | None = None) -> AIResult:
    """Run one engine request. ``context`` is the minimised child context (from
    ``app.ai.context.engine_child_context``) and ``child_uuid`` the internal id for the trace;
    access to the child is the caller's job."""
    started = time.monotonic()
    created = _now()
    spec = ENGINES.get(req.engine)
    if spec is None:
        return AIResult(success=False, engine=req.engine, task=req.task, status="rejected",
                        error=_error("UNKNOWN_ENGINE"), created_at=created, finished_at=_now())
    context = context or {}
    row = AiRequest(engine=spec.key, task=req.task, status="pending", language=req.language.language,
                    child_id=child_uuid, user_id=user.id if user else None, input={}, input_hash="",
                    pipeline_id=uuid.UUID(req.pipeline_id) if req.pipeline_id else None,
                    parent_request_id=uuid.UUID(req.parent_request_id) if req.parent_request_id else None,
                    context_version=_hash(context)[:16] if context else None)
    db.add(row)

    if req.task not in spec.tasks:
        row.input_hash = _hash(req.input)
        db.flush()
        _finish(db, row, started, status="rejected", error=_error("UNSUPPORTED_TASK"))
        return result_of(db, row)
    try:
        data = spec.input_model.model_validate(req.input).model_dump(mode="json")
    except ValidationError as e:
        row.input_hash = _hash(req.input)
        db.flush()
        valid = Validation(issues=[f"input: {'.'.join(str(p) for p in err.get('loc', ()))}: {err.get('msg')}"
                                   for err in e.errors()][:20])
        _finish(db, row, started, status="rejected", error=_error("INVALID_INPUT"), valid=valid)
        return result_of(db, row)
    row.input = {"input": data, "context": context, "language": req.language.model_dump(), "options": req.options}
    row.input_hash = _hash(row.input)
    db.flush()
    _event(db, row, "started", engine=spec.key, task=req.task)

    cfg = config.resolve(db, spec.key)
    row.provider, row.model = cfg.provider, cfg.model
    code = None
    if not cfg.configured:
        code = "ENGINE_NOT_CONFIGURED"
    elif not cfg.enabled:
        code = "ENGINE_DISABLED"
    elif cfg.daily_cost_limit is not None and _spent_today(db, spec.key) >= cfg.daily_cost_limit:
        code = "COST_LIMIT_REACHED"
    adapter = providers.get(cfg.provider) if code is None else None
    if code is None and adapter is None:
        code = "PROVIDER_NOT_AVAILABLE"
    elif code is None and spec.output_kind not in adapter.output_kinds:
        code = "PROVIDER_UNSUPPORTED_OUTPUT"
    elif code is None and getattr(adapter, "needs_secret", False) and not cfg.secret():
        code = "CREDENTIALS_MISSING"
    if code:
        _finish(db, row, started, status=CONFIG_STATUS.get(code, "failed"), error=_error(code))
        return result_of(db, row)

    template = _template(db, spec.key, req.task, req.language.language)
    row.template_id = template.id if template else None
    call = _call(spec, req, cfg, data, context, template)
    response, error = _attempt(db, row, adapter, call, cfg)
    fallback = cfg.for_fallback()
    if response is None and error and error.retryable and fallback is not None:
        fb_adapter = providers.get(fallback.provider)
        if fb_adapter is not None and spec.output_kind in fb_adapter.output_kinds:
            _event(db, row, "fallback", provider=fallback.provider)
            row.provider, row.model, row.fallback_used = fallback.provider, fallback.model, True
            response, error = _attempt(db, row, fb_adapter, _call(spec, req, fallback, data, context, template),
                                       fallback)
            cfg = fallback
    if response is None:
        _finish(db, row, started, status="failed", error=error or _error("PROVIDER_ERROR", retryable=True))
        return result_of(db, row)
    _finalize(db, user, row, spec, response, cfg, started, call)
    return result_of(db, row)


def poll(db: Session, user: User | None, row: AiRequest) -> AIResult:
    """Check a pending long job once (never waits). Access to the row is the caller's job."""
    if row.status != "pending" or not row.job_id:
        return result_of(db, row)
    spec = ENGINES[row.engine]
    cfg = config.resolve(db, row.engine)
    if row.fallback_used and cfg.fallback_provider:
        cfg = cfg.for_fallback() or cfg
    adapter = providers.get(row.provider)
    started = time.monotonic()
    if adapter is None:
        _finish(db, row, started, status="failed", error=_error("PROVIDER_NOT_AVAILABLE"))
        return result_of(db, row)
    stored = row.input or {}
    req = EngineRequest(engine=row.engine, task=row.task, input=stored.get("input") or {},
                        language=stored.get("language") or {"language": row.language}, options=stored.get("options") or {})
    call = _call(spec, req, cfg, req.input, stored.get("context") or {}, None)
    _event(db, row, "polled")
    response, error = _attempt(db, row, adapter, call, cfg, job_id=row.job_id)
    if response is None:
        if error and error.retryable:
            db.flush()
            return result_of(db, row)  # still pending: try again later
        _finish(db, row, started, status="failed", error=error)
        return result_of(db, row)
    _finalize(db, user, row, spec, response, cfg, started, call)
    return result_of(db, row)


def recent_window(days: int = 30) -> datetime:
    return _now() - timedelta(days=days)
