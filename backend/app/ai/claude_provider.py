"""The Claude provider: one Messages API call with JSON-schema structured output.

    call_claude(op, system, prompt, output_model, *, client=None) -> dict

- Client: ``anthropic.Anthropic(api_key, timeout=settings.ai_timeout_seconds, max_retries=1)``.
- Request: ``messages.create(model=settings.anthropic_model, max_tokens=16000,
  system=..., messages=[user], output_config={"effort": settings.ai_effort,
  "format": {"type": "json_schema", "schema": anthropic.transform_schema(Model)}})``.
  No ``thinking`` (Opus 5.5 always thinks adaptively; effort controls depth),
  no temperature. ``messages.parse`` is not used because it validates inside
  the SDK before ``stop_reason`` can be checked; validation happens in
  service.py instead.
- ``stop_reason`` "refusal" / "max_tokens" / "model_context_window_exceeded"
  and unparsable JSON are failures.
- SDK errors are mapped most-specific first to ``AIError(code)`` with codes
  AI_TIMEOUT, AI_UNAVAILABLE, AI_REFUSAL, AI_MAX_TOKENS, AI_INVALID_OUTPUT.
- One info log line per call (op, model, duration_ms, ok, stop_reason, usage);
  prompt text is never logged.
- ``client`` is injectable (tests pass a fake with ``.messages.create``).
"""
import json
import logging
import time

import anthropic

from app.config import settings

log = logging.getLogger("app.ai")

MAX_TOKENS = 16000


class AIError(Exception):
    def __init__(self, code: str, message: str = ""):
        self.code = code
        self.message = message or code
        super().__init__(f"{code}: {self.message}")


def make_client():
    return anthropic.Anthropic(
        api_key=settings.anthropic_api_key,
        timeout=settings.ai_timeout_seconds,
        max_retries=1,
    )


def request_params(system: str, prompt: str, output_model) -> dict:
    return {
        "model": settings.anthropic_model,
        "max_tokens": MAX_TOKENS,
        "system": system,
        "messages": [{"role": "user", "content": prompt}],
        "output_config": {
            "effort": settings.ai_effort,
            "format": {"type": "json_schema", "schema": anthropic.transform_schema(output_model)},
        },
    }


def _usage(response) -> dict:
    usage = getattr(response, "usage", None)
    if usage is None:
        return {}
    return {k: getattr(usage, k, None) for k in ("input_tokens", "output_tokens", "cache_read_input_tokens")
            if getattr(usage, k, None) is not None}


def call_claude(op: str, system: str, prompt: str, output_model, *, client=None) -> dict:
    """Return the parsed JSON object, or raise AIError."""
    client = client or make_client()
    params = request_params(system, prompt, output_model)
    started = time.monotonic()
    response = None
    error: AIError | None = None
    try:
        response = client.messages.create(**params)
    except anthropic.APITimeoutError as e:
        error = AIError("AI_TIMEOUT", type(e).__name__)
    except anthropic.RateLimitError as e:
        error = AIError("AI_UNAVAILABLE", type(e).__name__)
    except anthropic.APIStatusError as e:
        error = AIError("AI_UNAVAILABLE", f"{type(e).__name__} {getattr(e, 'status_code', '')}".strip())
    except anthropic.APIConnectionError as e:
        error = AIError("AI_UNAVAILABLE", type(e).__name__)
    except anthropic.AnthropicError as e:
        error = AIError("AI_UNAVAILABLE", type(e).__name__)

    data = None
    stop_reason = getattr(response, "stop_reason", None) if response is not None else None
    if error is None:
        if stop_reason == "refusal":
            error = AIError("AI_REFUSAL", "the model declined the request")
        elif stop_reason in ("max_tokens", "model_context_window_exceeded"):
            error = AIError("AI_MAX_TOKENS", f"stop_reason {stop_reason}")
        else:
            text = next((b.text for b in (response.content or []) if getattr(b, "type", None) == "text"), None)
            try:
                data = json.loads(text) if text else None
            except (TypeError, ValueError):
                data = None
            if not isinstance(data, dict):
                error = AIError("AI_INVALID_OUTPUT", "the response was not a JSON object")

    log.info(
        "ai call op=%s provider=claude model=%s duration_ms=%d ok=%s stop_reason=%s error=%s usage=%s",
        op,
        params["model"],
        int((time.monotonic() - started) * 1000),
        error is None,
        stop_reason,
        error.code if error else None,
        _usage(response) if response is not None else {},
    )
    if error is not None:
        raise error
    return data
