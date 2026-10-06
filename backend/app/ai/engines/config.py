"""Centralized AI engine configuration: one independent configuration per engine.

Sources, highest first:
  1. ``ai_engine_configs`` (set by an admin; never holds a secret)
  2. environment variables ``AI_<ENGINE>_<SETTING>`` (backend/.env, loaded by systemd)
  3. defaults (no provider: the engine is not configured)

Settings per engine (``<ENGINE>`` = the engine key in capitals, e.g. ``AI_STORY_PROVIDER``):

    ENABLED            true/false (default: true once a provider is set)
    PROVIDER           an adapter name from ``providers.ADAPTERS`` (e.g. "mock")
    MODEL              passed to the adapter as is
    ENDPOINT           https URL, for adapters that need one
    CREDENTIALS_REF    the NAME of the environment variable holding the secret; it must start
                       with ``AI_CRED_`` (so an engine can never be pointed at DATABASE_URL)
    TIMEOUT_SECONDS    default 60 (5-600)
    MAX_RETRIES        default 1 (0-5), retryable failures only
    MAX_OUTPUT         adapter output limit (tokens, characters, seconds: the adapter's unit)
    DAILY_COST_LIMIT   estimated cost per day; beyond it requests return COST_LIMIT_REACHED
    UNIT_COST          estimate per usage unit when the adapter gives none (default 0)
    SAFETY_LEVEL       strict | standard (child-facing engines are always strict)
    FALLBACK_PROVIDER, FALLBACK_MODEL   used after the primary fails with a retryable error

``AI_MOCK_MODE=true`` (settings.ai_mock_mode) runs every engine WITHOUT a provider on the
built-in "mock" adapter. Secrets are read only at call time (``secret()``), never stored in
the database, returned by an API or logged.
"""
import os
import re
from dataclasses import dataclass, replace

from sqlalchemy.orm import Session

from app.ai.engines.catalog import ENGINES
from app.config import settings
from app.models import AiEngineConfig

CRED_PREFIX = "AI_CRED_"
CRED_RE = re.compile(r"^AI_CRED_[A-Z0-9_]{1,60}$")
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_\-]{0,39}$")
SAFETY_LEVELS = ("strict", "standard")
FIELDS = ("enabled", "provider", "model", "endpoint", "credentials_ref", "timeout_seconds", "max_retries",
          "max_output", "daily_cost_limit", "unit_cost", "safety_level", "fallback_provider", "fallback_model")


@dataclass(frozen=True)
class EngineConfig:
    engine: str
    enabled: bool
    provider: str | None
    model: str | None
    endpoint: str | None
    credentials_ref: str | None
    timeout_seconds: int
    max_retries: int
    max_output: int | None
    daily_cost_limit: float | None
    unit_cost: float
    safety_level: str
    fallback_provider: str | None
    fallback_model: str | None
    source: str  # "database", "environment", "mock_mode" or "default"

    @property
    def configured(self) -> bool:
        return bool(self.provider)

    def secret(self) -> str | None:
        """The credential, read from the environment variable named by ``credentials_ref``."""
        if not self.credentials_ref or not CRED_RE.match(self.credentials_ref):
            return None
        return os.environ.get(self.credentials_ref) or None

    def for_fallback(self) -> "EngineConfig | None":
        if not self.fallback_provider:
            return None
        return replace(self, provider=self.fallback_provider, model=self.fallback_model, fallback_provider=None,
                       fallback_model=None)


def _env(engine: str, name: str) -> str | None:
    value = os.environ.get(f"AI_{engine.upper()}_{name}")
    return value.strip() if value and value.strip() else None


def _bool(v: str | None) -> bool | None:
    if v is None:
        return None
    return v.strip().lower() in ("1", "true", "yes", "on")


def _int(v, lo: int, hi: int) -> int | None:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi else None


def _float(v) -> float | None:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n >= 0 else None


def _name(v) -> str | None:
    return v if isinstance(v, str) and NAME_RE.match(v) else None


def _url(v) -> str | None:
    return v if isinstance(v, str) and v.startswith("https://") and len(v) <= 500 and not any(c.isspace() for c in v) else None


def _ref(v) -> str | None:
    return v if isinstance(v, str) and CRED_RE.match(v) else None


def _text(v, n: int = 120) -> str | None:
    return v if isinstance(v, str) and 0 < len(v) <= n and not any(c in v for c in "\r\n\t") else None


def resolve(db: Session | None, engine: str) -> EngineConfig:
    """The effective configuration of one engine (environment, then the admin's overrides)."""
    spec = ENGINES[engine]
    raw = {
        "enabled": _bool(_env(engine, "ENABLED")),
        "provider": _env(engine, "PROVIDER"),
        "model": _env(engine, "MODEL"),
        "endpoint": _env(engine, "ENDPOINT"),
        "credentials_ref": _env(engine, "CREDENTIALS_REF"),
        "timeout_seconds": _env(engine, "TIMEOUT_SECONDS"),
        "max_retries": _env(engine, "MAX_RETRIES"),
        "max_output": _env(engine, "MAX_OUTPUT"),
        "daily_cost_limit": _env(engine, "DAILY_COST_LIMIT"),
        "unit_cost": _env(engine, "UNIT_COST"),
        "safety_level": _env(engine, "SAFETY_LEVEL"),
        "fallback_provider": _env(engine, "FALLBACK_PROVIDER"),
        "fallback_model": _env(engine, "FALLBACK_MODEL"),
    }
    source = "environment" if raw["provider"] else "default"
    row = db.get(AiEngineConfig, engine) if db is not None else None
    if row is not None:
        for f in FIELDS:
            value = getattr(row, f)
            if value is not None:
                raw[f] = value
        if row.provider:
            source = "database"
    provider = _name(raw["provider"])
    if provider is None and settings.ai_mock_mode:
        provider, source = "mock", "mock_mode"
    enabled = raw["enabled"] if isinstance(raw["enabled"], bool) else bool(provider)
    safety = raw["safety_level"] if raw["safety_level"] in SAFETY_LEVELS else "strict"
    if spec.child_facing:
        safety = "strict"
    return EngineConfig(
        engine=engine,
        enabled=enabled,
        provider=provider,
        model=_text(raw["model"]),
        endpoint=_url(raw["endpoint"]),
        credentials_ref=_ref(raw["credentials_ref"]),
        timeout_seconds=_int(raw["timeout_seconds"], 5, 600) or 60,
        max_retries=_int(raw["max_retries"], 0, 5) if _int(raw["max_retries"], 0, 5) is not None else 1,
        max_output=_int(raw["max_output"], 1, 1_000_000),
        daily_cost_limit=_float(raw["daily_cost_limit"]),
        unit_cost=_float(raw["unit_cost"]) or 0.0,
        safety_level=safety,
        fallback_provider=_name(raw["fallback_provider"]),
        fallback_model=_text(raw["fallback_model"]),
        source=source,
    )
