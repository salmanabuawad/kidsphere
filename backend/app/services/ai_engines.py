"""AI engines for the API: access, the child context, running engines and pipelines, the
admin view of every engine (configuration without secrets, status, last success and error,
usage and estimated cost) and its overrides.

Access
    Running an engine or a pipeline, reading a request and its files: staff only. A request
    about a child needs the child in the user's scope (else 404); a request without a child
    is readable by its author and by admins. Engine administration: admins only.

Child data
    ``child_context`` builds the engine context through ``app.ai.context`` only: the masked,
    allow-listed AIContext without the name, with a pseudonymous ``child_ref``. The child's
    internal id stays on our side (the trace's ``child_id``); providers never see it.
"""
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.orm import Session

from app import access
from app.ai.context import build_context, engine_child_context
from app.ai.engines import config as engine_config
from app.ai.engines import orchestrator, pipelines, providers
from app.ai.engines.catalog import ENGINE_KEYS, ENGINES
from app.ai.engines.contracts import EngineRequest, LanguageSpec
from app.ai.gather import adult_names, classmate_names
from app.audit import audit
from app.config import settings
from app.errors import AppError
from app.models import AiAsset, AiEngineConfig, AiRequest, Child, ChildProfile, User
from app.schemas.ai_engines import EngineConfigIn, PipelineIn, RunIn
from app.services import uploads

REQUEST_LIST_MAX = 100


def _iso(v: datetime | None) -> str | None:
    return v.isoformat() if v is not None else None


# --------------------------------------------------------------------------- child context


def child_context(db: Session, user: User, child_id, language: str) -> tuple[dict, uuid.UUID]:
    child = access.get_child_or_404(db, user, child_id, write=True)
    profile = db.scalar(select(ChildProfile).where(ChildProfile.child_id == child.id))
    ctx = build_context(child=child, profile=profile, mode=None, content_type="understanding",
                        language=language if language in ("ar", "he", "en") else "en",
                        classmate_names=classmate_names(db, child), adult_names=adult_names(db, child),
                        current_understanding=profile.current_understanding if profile else None)
    return engine_child_context(ctx, child.id), child.id


def _language(lang: LanguageSpec | None, child: Child | None = None) -> LanguageSpec:
    if lang is not None:
        return lang
    return LanguageSpec(language=child.main_language if child is not None and child.main_language else "ar")


# --------------------------------------------------------------------------- running


def run_engine(db: Session, user: User, body: RunIn) -> dict:
    if not access.is_staff(user):
        raise AppError("FORBIDDEN")
    context, child_uuid = {}, None
    language = body.language
    if body.child_id is not None:
        child = access.get_child_or_404(db, user, body.child_id, write=True)
        language = _language(language, child)
        context, child_uuid = child_context(db, user, child.id, language.language)
    req = EngineRequest(engine=body.engine, task=body.task, input=body.input, language=_language(language),
                        options=body.options)
    result = orchestrator.run(db, user, req, context=context, child_uuid=child_uuid)
    db.commit()
    return result.model_dump(mode="json")


def run_pipeline(db: Session, user: User, name: str, body: PipelineIn) -> dict:
    if not access.is_staff(user):
        raise AppError("FORBIDDEN")
    if name not in pipelines.PIPELINES:
        raise AppError("NOT_FOUND")
    context, child_uuid = {}, None
    language = body.language
    if body.child_id is not None:
        child = access.get_child_or_404(db, user, body.child_id, write=True)
        language = _language(language, child)
        context, child_uuid = child_context(db, user, child.id, language.language)
    out = pipelines.run_pipeline(db, user, name, body.input, language=_language(language), context=context,
                                 child_uuid=child_uuid)
    db.commit()
    return out


def _request_or_404(db: Session, user: User, request_id) -> AiRequest:
    try:
        rid = uuid.UUID(str(request_id))
    except ValueError:
        raise AppError("NOT_FOUND") from None
    row = db.get(AiRequest, rid)
    if row is None or not access.is_staff(user):
        raise AppError("NOT_FOUND")
    if row.child_id is not None:
        access.get_child_or_404(db, user, row.child_id)  # 404 out of scope
    elif user.role != "admin" and row.user_id != user.id:
        raise AppError("NOT_FOUND")
    return row


def get_request(db: Session, user: User, request_id) -> dict:
    row = _request_or_404(db, user, request_id)
    result = orchestrator.poll(db, user, row)
    db.commit()
    return result.model_dump(mode="json")


def asset_file(db: Session, user: User, asset_id):
    try:
        aid = uuid.UUID(str(asset_id))
    except ValueError:
        raise AppError("NOT_FOUND") from None
    row = db.get(AiAsset, aid)
    if row is None:
        raise AppError("NOT_FOUND")
    _request_or_404(db, user, row.request_id)
    path = uploads.resolve_upload(row.path)
    if not path.is_file():
        raise AppError("NOT_FOUND")
    return path, row.mime


def available(db: Session, user: User) -> dict:
    """GET /api/ai/engines: which engines are ready (for the UI to offer or hide actions)."""
    if not access.is_staff(user):
        raise AppError("FORBIDDEN")
    out = []
    for key in ENGINE_KEYS:
        status = _status(engine_config.resolve(db, key))
        out.append({"engine": key, "output_kind": ENGINES[key].output_kind, "status": status,
                    "available": status in ("ready", "mock")})
    return {"engines": out}


# --------------------------------------------------------------------------- administration


def _status(cfg: engine_config.EngineConfig) -> str:
    """not_configured | disabled | provider_missing | credentials_missing | mock | ready."""
    if not cfg.configured:
        return "not_configured"
    if not cfg.enabled:
        return "disabled"
    adapter = providers.get(cfg.provider)
    if adapter is None:
        return "provider_missing"
    if getattr(adapter, "needs_secret", False) and not cfg.secret():
        return "credentials_missing"
    return "mock" if cfg.provider == "mock" else "ready"


def _config_out(cfg: engine_config.EngineConfig) -> dict:
    return {
        "enabled": cfg.enabled, "provider": cfg.provider, "model": cfg.model, "endpoint": cfg.endpoint,
        "credentials_ref": cfg.credentials_ref, "credentials_set": bool(cfg.secret()),
        "timeout_seconds": cfg.timeout_seconds, "max_retries": cfg.max_retries, "max_output": cfg.max_output,
        "daily_cost_limit": cfg.daily_cost_limit, "unit_cost": cfg.unit_cost, "safety_level": cfg.safety_level,
        "fallback_provider": cfg.fallback_provider, "fallback_model": cfg.fallback_model, "source": cfg.source,
    }


def admin_engines(db: Session) -> dict:
    since = orchestrator.recent_window(30)
    stats = {r.engine: r for r in db.execute(
        select(AiRequest.engine,
               func.count().label("requests"),
               func.count().filter(AiRequest.status == "succeeded").label("succeeded"),
               func.count().filter(AiRequest.status == "failed").label("failed"),
               func.coalesce(func.sum(AiRequest.cost_estimate), 0).label("cost"))
        .where(AiRequest.created_at >= since).group_by(AiRequest.engine)
    ).all()}
    last_ok = dict(db.execute(select(AiRequest.engine, func.max(AiRequest.finished_at))
                              .where(AiRequest.status == "succeeded").group_by(AiRequest.engine)).all())
    # The newest failure of each engine (PostgreSQL DISTINCT ON).
    errors = {e: {"code": code, "at": _iso(at)} for e, code, at in db.execute(
        select(AiRequest.engine, AiRequest.error_code, AiRequest.created_at)
        .where(AiRequest.status == "failed").ext(distinct_on(AiRequest.engine))
        .order_by(AiRequest.engine, AiRequest.created_at.desc())
    ).all()}
    out = []
    for key in ENGINE_KEYS:
        spec = ENGINES[key]
        cfg = engine_config.resolve(db, key)
        s = stats.get(key)
        out.append({
            "engine": key,
            "output_kind": spec.output_kind,
            "tasks": list(spec.tasks),
            "child_facing": spec.child_facing,
            "long_running": spec.long_running,
            "status": _status(cfg),
            "config": _config_out(cfg),
            "last_success_at": _iso(last_ok.get(key)),
            "last_error": errors.get(key),
            "usage_30d": {"requests": int(s.requests) if s else 0, "succeeded": int(s.succeeded) if s else 0,
                          "failed": int(s.failed) if s else 0},
            "cost_30d": round(float(s.cost), 6) if s else 0.0,
        })
    return {"engines": out, "providers": providers.names(), "mock_mode": settings.ai_mock_mode}


def update_engine(db: Session, admin: User, engine: str, body: EngineConfigIn) -> dict:
    if engine not in ENGINES:
        raise AppError("NOT_FOUND")
    sent = body.model_fields_set
    if not sent:
        raise AppError("VALIDATION", details=[{"path": "", "message": "Send at least one setting."}])
    row = db.get(AiEngineConfig, engine)
    if row is None:
        row = AiEngineConfig(engine=engine)
        db.add(row)
    changed = []
    for field in sorted(sent):
        value = getattr(body, field)
        if getattr(row, field) != value:
            setattr(row, field, value)
            changed.append(field)
    row.updated_by = admin.id
    row.updated_at = func.now()
    if changed:
        audit(db, admin, "ai_engine.update", "ai_engine", None, engine=engine, fields=changed)
    db.commit()
    return next(e for e in admin_engines(db)["engines"] if e["engine"] == engine)


def test_engine(db: Session, admin: User, engine: str) -> dict:
    """Run the engine's harmless sample request (no child data) through the orchestrator."""
    spec = ENGINES.get(engine)
    if spec is None:
        raise AppError("NOT_FOUND")
    task = spec.tasks[0]
    result = orchestrator.run(db, admin, EngineRequest(engine=engine, task=task, input=spec.sample,
                                                       language=LanguageSpec(language="en")))
    audit(db, admin, "ai_engine.test", "ai_engine", None, engine=engine, status=result.status,
          error_code=result.error.code if result.error else None)
    db.commit()
    return result.model_dump(mode="json")


def admin_requests(db: Session, engine: str | None = None, status: str | None = None, limit: int = 50) -> dict:
    stmt = select(AiRequest).order_by(AiRequest.created_at.desc()).limit(max(1, min(limit, REQUEST_LIST_MAX)))
    if engine:
        stmt = stmt.where(AiRequest.engine == engine)
    if status:
        stmt = stmt.where(AiRequest.status == status)
    rows = db.scalars(stmt).all()
    return {"requests": [{
        "id": str(r.id), "engine": r.engine, "task": r.task, "status": r.status, "provider": r.provider,
        "model": r.model, "fallback_used": r.fallback_used, "error_code": r.error_code, "attempts": r.attempts,
        "duration_ms": r.duration_ms, "cost_estimate": float(r.cost_estimate or 0), "language": r.language,
        "has_child": r.child_id is not None, "pipeline_id": str(r.pipeline_id) if r.pipeline_id else None,
        "created_at": _iso(r.created_at), "finished_at": _iso(r.finished_at),
    } for r in rows]}
