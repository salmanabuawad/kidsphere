"""Admin settings (table ``app_settings``: one JSON value per section) and the system status.

Sections and their typed defaults (a missing or unreadable value falls back to its default):

    general  organization_name ("KidSphere", <=120), default_ui_language (ar|he|en; .env
             DEFAULT_LOCALE), default_content_language (ar|he|en|child; "child" = the
             child's main language)
    ai       provider_mode (claude|template), model (.env ANTHROPIC_MODEL), effort
             (low|medium|high; .env AI_EFFORT), api_key (write-only, see below)
    reports  header_title ("KidSphere", <=120), footer_note (optional, <=300; the
             non-clinical disclaimer is printed on every page regardless)

Nothing is cached: every reader asks the database (one primary-key lookup).

    public_settings(db) -> {general, ai, reports}      what GET /api/admin/settings returns
    update_section(db, user, section, body) -> same    PUT /api/admin/settings/{section}
    general(db) / reports(db)                          typed sections (defaults filled in)
    effective_ai(db=None) -> EffectiveAI               what the AI provider uses right now
    check_ai_connection(db, user, *, client=None) -> {ok, model, error_code}
    system_status(db) -> {...}                         GET /api/admin/system (read-only)

The Anthropic API key
- PUT ai accepts ``anthropic_api_key`` (loosely checked: starts with "sk-ant-") or
  ``clear: true``. The key is stored in ``app_settings.value`` only. No API returns
  it: the AI section reports ``key_set`` and ``key_last4`` instead. It is never
  logged and never put in audit metadata (``settings.update`` records the section
  and the field names only).
- Precedence: a key saved here overrides .env ANTHROPIC_API_KEY. provider_mode
  "template" forces the template provider even when a key exists.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.audit import audit
from app.config import BACKEND_DIR, settings
from app.db import SessionLocal
from app.errors import AppError
from app.models import AppSetting, Child, Class, User
from app.schemas.common import Language, StrictModel

log = logging.getLogger("app.settings")

SECTIONS = ("general", "ai", "reports")
EFFORTS = ("low", "medium", "high")
KEY_PREFIX = "sk-ant-"
MODEL_PATTERN = r"^claude-[a-z0-9][a-z0-9.\-]{0,98}$"
BACKUP_DIR = Path("/var/backups/kidsphere")
VERSION_FILE = BACKEND_DIR / "VERSION"
TEST_MAX_TOKENS = 256

ProviderMode = Literal["claude", "template"]
Effort = Literal["low", "medium", "high"]
ContentLanguage = Literal["ar", "he", "en", "child"]


# --------------------------------------------------------------------------- stored shapes (lenient)


class _Stored(BaseModel):
    """What may be in a stored value; unknown keys are ignored."""
    model_config = ConfigDict(extra="ignore")


class GeneralSettings(_Stored):
    organization_name: str = Field(default="KidSphere", min_length=1, max_length=120)
    default_ui_language: Language = Field(default_factory=lambda: settings.default_locale)
    default_content_language: ContentLanguage = "child"


class AiStored(_Stored):
    provider_mode: ProviderMode = "claude"
    model: str | None = Field(default=None, pattern=MODEL_PATTERN)
    effort: Effort | None = None
    api_key: str | None = None


class ReportsSettings(_Stored):
    header_title: str = Field(default="KidSphere", min_length=1, max_length=120)
    footer_note: str | None = Field(default=None, max_length=300)


# --------------------------------------------------------------------------- request bodies (strict)


class GeneralIn(StrictModel):
    organization_name: str | None = Field(default=None, min_length=1, max_length=120)
    default_ui_language: Language | None = None
    default_content_language: ContentLanguage | None = None


class AiIn(StrictModel):
    provider_mode: ProviderMode | None = None
    model: str | None = Field(default=None, pattern=MODEL_PATTERN)
    effort: Effort | None = None
    anthropic_api_key: str | None = Field(default=None, max_length=300)
    clear: bool = False

    @field_validator("anthropic_api_key")
    @classmethod
    def _key(cls, v):
        # Never echo the value in a message.
        if v is None:
            return v
        if not v.startswith(KEY_PREFIX) or len(v) < len(KEY_PREFIX) + 8 or any(c.isspace() for c in v):
            raise ValueError(f"the key must start with {KEY_PREFIX}")
        return v


class ReportsIn(StrictModel):
    header_title: str | None = Field(default=None, min_length=1, max_length=120)
    footer_note: str | None = Field(default=None, max_length=300)


INPUT_MODELS = {"general": GeneralIn, "ai": AiIn, "reports": ReportsIn}
STORED_MODELS = {"general": GeneralSettings, "ai": AiStored, "reports": ReportsSettings}


# --------------------------------------------------------------------------- reading


def _stored(db: Session, key: str) -> dict:
    row = db.get(AppSetting, key)
    return dict(row.value) if row is not None and isinstance(row.value, dict) else {}


def _typed(model, value: dict):
    """The stored value as ``model``; a field that does not validate falls back to its default."""
    try:
        return model.model_validate(value)
    except ValidationError as e:
        bad = {str(err["loc"][0]) for err in e.errors() if err.get("loc")}
        log.warning("app_settings: ignoring invalid stored fields %s", sorted(bad))
        return model.model_validate({k: v for k, v in value.items() if k not in bad})


def general(db: Session) -> GeneralSettings:
    return _typed(GeneralSettings, _stored(db, "general"))


def reports(db: Session) -> ReportsSettings:
    return _typed(ReportsSettings, _stored(db, "reports"))


def _ai(db: Session) -> AiStored:
    return _typed(AiStored, _stored(db, "ai"))


@dataclass(frozen=True)
class EffectiveAI:
    """What the AI provider uses right now. ``mode`` is "claude" only when provider_mode is
    claude and a key exists (saved here, else .env). Never log ``api_key``."""
    mode: Literal["claude", "template"]
    provider_mode: ProviderMode
    api_key: str
    key_source: Literal["settings", "env"] | None
    model: str
    effort: str

    def __repr__(self) -> str:  # keeps the key out of any accidental log line
        return (f"EffectiveAI(mode={self.mode!r}, provider_mode={self.provider_mode!r}, "
                f"key_source={self.key_source!r}, model={self.model!r}, effort={self.effort!r})")


def _effective(ai: AiStored) -> EffectiveAI:
    if ai.api_key:
        key, source = ai.api_key, "settings"
    elif settings.anthropic_api_key:
        key, source = settings.anthropic_api_key, "env"
    else:
        key, source = "", None
    mode = "claude" if ai.provider_mode == "claude" and key else "template"
    return EffectiveAI(mode=mode, provider_mode=ai.provider_mode, api_key=key, key_source=source,
                       model=ai.model or settings.anthropic_model, effort=ai.effort or settings.ai_effort)


def effective_ai(db: Session | None = None) -> EffectiveAI:
    """The effective AI configuration. Without ``db`` a short session of its own is used; if
    the settings cannot be read, the .env values apply."""
    if db is not None:
        return _effective(_ai(db))
    try:
        with SessionLocal() as own:
            return _effective(_ai(own))
    except Exception as e:  # never let a settings read break generation
        log.warning("app_settings unavailable (%s); using the .env AI settings", type(e).__name__)
        return _effective(AiStored())


# --------------------------------------------------------------------------- API shapes


def _ai_out(ai: AiStored) -> dict:
    eff = _effective(ai)
    return {
        "provider_mode": ai.provider_mode,
        "model": eff.model,
        "effort": eff.effort,
        "key_set": bool(ai.api_key),
        "key_last4": ai.api_key[-4:] if ai.api_key else None,
        "env_key_set": bool(settings.anthropic_api_key),
        "effective_mode": eff.mode,
    }


def public_settings(db: Session) -> dict:
    """Every section with defaults filled in. The AI key itself is never included."""
    return {
        "general": general(db).model_dump(mode="json"),
        "ai": _ai_out(_ai(db)),
        "reports": reports(db).model_dump(mode="json"),
    }


# --------------------------------------------------------------------------- writing


def _validate(section: str, body) -> BaseModel:
    if not isinstance(body, dict):
        raise AppError("VALIDATION", details=[{"path": "", "message": "expected an object"}])
    try:
        return INPUT_MODELS[section].model_validate(body)
    except ValidationError as e:
        # Messages only (never the input values: the AI section may carry the key).
        raise AppError("VALIDATION", details=[
            {"path": ".".join(str(p) for p in err.get("loc", ())), "message": err.get("msg", "invalid")}
            for err in e.errors()
        ]) from None


def update_section(db: Session, user: User, section: str, body) -> dict:
    if section not in SECTIONS:
        raise AppError("NOT_FOUND")
    data = _validate(section, body)
    changes = data.model_dump(exclude_unset=True)
    current = _stored(db, section)
    new = dict(current)
    fields: list[str] = []
    if section == "ai":
        if changes.pop("clear", False):
            changes.pop("anthropic_api_key", None)
            if new.pop("api_key", None) is not None:
                fields.append("anthropic_api_key")
        key = changes.pop("anthropic_api_key", None)
        if key:
            new["api_key"] = key
            fields.append("anthropic_api_key")
    for name, value in changes.items():
        if section == "reports" and name == "footer_note" and not value:
            value = None
        if value is None and name != "footer_note":
            continue
        if new.get(name) != value:
            new[name] = value
            fields.append(name)

    if fields:
        row = db.get(AppSetting, section)
        if row is None:
            db.add(AppSetting(key=section, value=new, updated_by=user.id))
        else:
            row.value = new  # a new dict: JSONB changes are tracked by assignment
            row.updated_by = user.id
            row.updated_at = datetime.now(timezone.utc)
        audit(db, user, "settings.update", "settings", None, section=section, fields=sorted(set(fields)))
        db.commit()
    return public_settings(db)


# --------------------------------------------------------------------------- AI connection test


def _error_code(e: Exception) -> str:
    import anthropic

    if isinstance(e, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
        return "AI_AUTH"
    if isinstance(e, anthropic.NotFoundError):
        return "AI_MODEL_NOT_FOUND"
    if isinstance(e, anthropic.APITimeoutError):
        return "AI_TIMEOUT"
    if isinstance(e, anthropic.BadRequestError):
        return "AI_BAD_REQUEST"
    return "AI_UNAVAILABLE"


def check_ai_connection(db: Session, user: User, *, client=None) -> dict:
    """ONE minimal Messages call with the effective key and model (whatever provider_mode
    says), so an admin can check a key before switching to Claude. The prompt is a fixed
    word: no child data is ever sent. The key and the response text are never logged."""
    from app.ai import claude_provider

    eff = effective_ai(db)
    if not eff.api_key and client is None:
        return {"ok": False, "model": eff.model, "error_code": "AI_NO_KEY"}
    error_code = None
    try:
        client = client or claude_provider.make_client(eff.api_key)
        client.messages.create(
            model=eff.model,
            max_tokens=TEST_MAX_TOKENS,
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": "Reply with the single word: ok"}],
        )
    except Exception as e:
        error_code = _error_code(e)
    log.info("ai connection test model=%s key_source=%s ok=%s error=%s", eff.model, eff.key_source,
             error_code is None, error_code)
    audit(db, user, "settings.ai_test", "settings", None, ok=error_code is None, error_code=error_code)
    db.commit()
    return {"ok": error_code is None, "model": eff.model, "error_code": error_code}


# --------------------------------------------------------------------------- system status (read-only)


def app_version() -> str:
    if settings.app_version:
        return settings.app_version
    try:
        value = VERSION_FILE.read_text(encoding="utf-8").strip()
        return value[:64] or "unknown"
    except OSError:
        return "unknown"


def _last_backup() -> str | None:
    try:
        newest = max((p.stat().st_mtime for p in BACKUP_DIR.glob("nightly-*.dump")), default=None)
    except OSError:
        return None
    if newest is None:
        return None
    return datetime.fromtimestamp(newest, tz=timezone.utc).isoformat()


def system_status(db: Session) -> dict:
    try:
        revision = db.scalar(text("SELECT version_num FROM alembic_version LIMIT 1"))
    except Exception:
        db.rollback()
        revision = None
    eff = effective_ai(db)
    return {
        "app_version": app_version(),
        "alembic_revision": revision,
        "last_backup_at": _last_backup(),
        "ai": {"effective_mode": eff.mode, "provider_mode": eff.provider_mode, "model": eff.model,
               "key_source": eff.key_source},
        "counts": {
            "users": db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True))) or 0,
            "classes": db.scalar(select(func.count()).select_from(Class)) or 0,
            "children": db.scalar(select(func.count()).select_from(Child).where(Child.archived_at.is_(None))) or 0,
        },
    }


def default_ui_language(db: Session) -> str:
    return general(db).default_ui_language


def default_content_language(db: Session) -> str | None:
    """The admin's default content language, or None for "the child's main language"."""
    value = general(db).default_content_language
    return None if value == "child" else value

