"""Video provider abstraction (spec §15B, §31; ARCHITECTURE §8; PLAN-ADJUSTMENTS A7).

The AI only writes a video plan (VideoPlanOut: script, scenes, narration, visual
prompts). Turning it into a real video is a provider's job. Three functions,
called with a ``generated_content`` row of type ``video``:

    create_video_job(row) -> {"status", "provider", "external_job_id", "notice"}
    check_video_status(row) -> "script_ready" | "generating" | "ready" | "failed"
    get_video_url(row) -> str | None

``VIDEO_PROVIDER=none`` (the only provider today) is a placeholder: the row
keeps ``video_status='script_ready'`` and the job reports the
``provider_not_configured`` notice. Nothing ever blocks on a video and no
external call is made. A real provider later adds one branch here.

The caller commits (these functions only change the row).
"""
from app.config import settings
from app.models import GeneratedContent

PLACEHOLDER_PROVIDERS = ("", "none")
NOT_CONFIGURED = "provider_not_configured"


def provider_name() -> str:
    return (settings.video_provider or "none").strip().lower() or "none"


def create_video_job(row: GeneratedContent) -> dict:
    """Start (or, for the placeholder, pretend to start) making the video for an approved plan."""
    provider = provider_name()
    row.video_provider = provider
    if provider in PLACEHOLDER_PROVIDERS:
        row.video_status = "script_ready"
        row.video_external_job_id = None
        return {"status": row.video_status, "provider": provider, "external_job_id": None, "notice": NOT_CONFIGURED}
    # Unknown provider name: stay safe and keep the script ready.
    row.video_status = "script_ready"
    return {"status": row.video_status, "provider": provider, "external_job_id": None, "notice": NOT_CONFIGURED}


def check_video_status(row: GeneratedContent) -> str:
    return row.video_status or "script_ready"


def get_video_url(row: GeneratedContent) -> str | None:
    if row.video_status == "ready" and row.video_url:
        return row.video_url
    return None
