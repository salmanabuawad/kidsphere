"""Application settings, read from the environment and backend/.env.

Use the module-level ``settings`` object everywhere (``from app.config import settings``).
Attribute names are the lower-case form of the environment variables.
"""
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://kidsphere_mvp@127.0.0.1:5432/kidsphere_mvp"
    cookie_secure: bool = True
    session_days: int = 7
    upload_dir: Path = Path("/var/www/kidsphere/uploads")
    default_locale: Literal["ar", "he", "en"] = "ar"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5-5"
    ai_effort: str = "medium"
    ai_timeout_seconds: int = 60
    video_provider: str = "none"
    # AI engines (app/ai/engines): run every engine that has no provider on the built-in mock
    # provider. For development and tests only; per-engine settings are AI_<ENGINE>_* variables.
    ai_mock_mode: bool = False
    serve_static_dir: str = ""
    log_level: str = "info"
    # Shown on the admin System card; else backend/VERSION (written by deploy.sh), else "unknown".
    app_version: str = ""
    options_path: Path = APP_DIR / "data" / "options.json"

    @field_validator("database_url")
    @classmethod
    def _use_psycopg3(cls, v: str) -> str:
        # Accept plain postgres URLs but always talk to PostgreSQL through psycopg 3.
        for prefix in ("postgresql://", "postgres://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v


settings = Settings()
