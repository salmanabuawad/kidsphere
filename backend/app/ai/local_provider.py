"""The local AI provider: one chat-completions call to an OpenAI-compatible server (Ollama, vLLM,
llama.cpp server, LM Studio) with JSON-schema structured output.

    call_local(op, system, prompt, output_model, *, config=None, post=None) -> dict

- URL: ``<base_url>/chat/completions``. The base URL and model are the effective ones from
  ``app.services.settings.effective_ai()`` (Settings > AI, else .env LOCAL_AI_BASE_URL /
  LOCAL_AI_MODEL). An optional bearer key comes from .env LOCAL_AI_API_KEY only.
- Request: ``{model, messages: [system, user], temperature: 0.4, stream: false,
  response_format: {type: json_schema, json_schema: {name, strict: true, schema}}}``. Servers that
  ignore ``response_format`` still get the instruction to return JSON; the output is validated in
  service.py exactly like Claude output (Pydantic, semantic checks, safety), and anything wrong
  falls back to the templates.
- The prompt is the same pseudonymous one Claude gets: the child is [child]. Nothing is logged but
  one metadata line (op, model, duration, ok, error code). Prompt and answer text are never logged.
- Errors map to ``AIError``: AI_TIMEOUT, AI_UNAVAILABLE (connection, HTTP error), AI_MAX_TOKENS
  (finish_reason "length"), AI_INVALID_OUTPUT (no JSON object).
- ``post`` is injectable: tests pass ``post(url, payload, headers, timeout) -> dict``.
"""
import json
import logging
import socket
import time
import urllib.error
import urllib.request

from app.ai.claude_provider import AIError
from app.config import settings

log = logging.getLogger("app.ai")

TEMPERATURE = 0.4


def _post(url: str, payload: dict, headers: dict, timeout: int) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", **headers}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - the admin configures the URL
        return json.loads(resp.read().decode("utf-8"))


def endpoint(base_url: str) -> str:
    return base_url.rstrip("/") + "/chat/completions"


def _json_object(text):
    """The JSON object in the answer; tolerates a ```json fence some local models add."""
    if not isinstance(text, str):
        return None
    s = text.strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = s[s.find("{"):] if "{" in s else s
    start, end = s.find("{"), s.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        data = json.loads(s[start:end + 1])
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def request_payload(op: str, system: str, prompt: str, output_model, model: str) -> dict:
    schema = output_model.model_json_schema() if hasattr(output_model, "model_json_schema") else output_model
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system + "\n\nReturn only one JSON object that matches the schema."},
            {"role": "user", "content": prompt},
        ],
        "temperature": TEMPERATURE,
        "stream": False,
        "response_format": {"type": "json_schema", "json_schema": {"name": op, "strict": True, "schema": schema}},
    }


def call_local(op: str, system: str, prompt: str, output_model, *, config=None, post=None) -> dict:
    from app.services.settings import effective_ai

    cfg = config or effective_ai()
    if not cfg.local_base_url or not cfg.local_model:
        raise AIError("AI_UNAVAILABLE", "local AI is not configured")
    payload = request_payload(op, system, prompt, output_model, cfg.local_model)
    headers = {"Authorization": f"Bearer {settings.local_ai_api_key}"} if settings.local_ai_api_key else {}
    started = time.monotonic()
    error: AIError | None = None
    data = None
    finish = None
    try:
        body = (post or _post)(endpoint(cfg.local_base_url), payload, headers, settings.local_ai_timeout_seconds)
        choice = (body.get("choices") or [{}])[0] if isinstance(body, dict) else {}
        finish = choice.get("finish_reason")
        if finish == "length":
            error = AIError("AI_MAX_TOKENS", "finish_reason length")
        else:
            data = _json_object((choice.get("message") or {}).get("content"))
            if data is None:
                error = AIError("AI_INVALID_OUTPUT", "the response was not a JSON object")
    except (socket.timeout, TimeoutError):
        error = AIError("AI_TIMEOUT", "timeout")
    except urllib.error.HTTPError as e:
        error = AIError("AI_UNAVAILABLE", f"HTTP {e.code}")
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", None)
        error = AIError("AI_TIMEOUT" if isinstance(reason, (socket.timeout, TimeoutError)) else "AI_UNAVAILABLE",
                        type(reason).__name__ if reason is not None else "URLError")
    except (ValueError, OSError) as e:
        error = AIError("AI_UNAVAILABLE", type(e).__name__)
    log.info("ai call op=%s provider=local model=%s duration_ms=%d ok=%s finish=%s error=%s", op, cfg.local_model,
             int((time.monotonic() - started) * 1000), error is None, finish, error.code if error else None)
    if error is not None:
        raise error
    return data


def check_connection(cfg, *, post=None) -> str | None:
    """One tiny call with a fixed prompt (no child data). Returns None when it worked, else an error code."""
    if not cfg.local_base_url or not cfg.local_model:
        return "AI_NOT_CONFIGURED"
    schema = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False}
    try:
        call_local("connection_test", "You answer with JSON.", 'Return {"ok": true}.', schema, config=cfg, post=post)
    except AIError as e:
        return e.code
    return None
