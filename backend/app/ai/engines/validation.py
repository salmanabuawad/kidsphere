"""Validate → sanitize → safety-check every provider response before anyone sees it.

    check(spec, response) -> (output | None, Validation)

1. Contract: the output must validate against the engine's output model; files must have
   the media type and size the engine's kind allows.
2. Sanitize: every string loses HTML tags and control characters (React renders text only,
   but a stored output is used in many places).
3. Safety (``app.ai.safety``, the same rules as all AI output): clinical and diagnostic
   terms, referral wording and URLs are refused everywhere; child-deficit wording, scores,
   points and percentages too (in every field of AI output; child-facing engines are
   checked as child-facing).

Raw provider output is never returned when any check fails: the result carries
INVALID_OUTPUT or UNSAFE_OUTPUT and no output.
"""
import re

from pydantic import ValidationError

from app.ai.engines.catalog import EngineSpec
from app.ai.engines.contracts import ProviderResponse, Validation
from app.ai.safety import find_unsafe_text

MAX_FILE_BYTES = 50 * 1024 * 1024
ALLOWED_MIME = {
    "image": {"image/png", "image/jpeg", "image/webp"},
    "audio": {"audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4"},
    "video": {"video/mp4", "video/webm"},
    "document": {"application/json"},
}
# Which file kinds each output kind may produce (a video job may also return its storyboard).
KIND_FILES = {"image": {"image"}, "audio": {"audio"}, "video": {"video", "document", "image"}}
_TAG = re.compile(r"<[^>]{0,500}>")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean(value):
    if isinstance(value, str):
        return _CTRL.sub("", _TAG.sub("", value))
    if isinstance(value, list):
        return [_clean(v) for v in value]
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    return value


def check(spec: EngineSpec, response: ProviderResponse) -> tuple[dict | None, Validation]:
    v = Validation()
    try:
        output = spec.output_model.model_validate(response.output).model_dump(mode="json") if spec.output_model else {}
    except ValidationError as e:
        v.issues = [f"schema: {'.'.join(str(p) for p in err.get('loc', ()))}: {err.get('msg')}" for err in e.errors()][:20]
        return None, v
    allowed = KIND_FILES.get(spec.output_kind, set())
    for b in response.binaries:
        if b.kind not in allowed or b.mime not in ALLOWED_MIME[b.kind] or len(b.data) > MAX_FILE_BYTES or not b.data:
            v.issues.append(f"schema: file {b.kind} {b.mime} is not allowed for this engine")
    if spec.output_kind in ("image", "audio") and not response.binaries:
        v.issues.append("schema: the engine returned no file")
    if v.issues:
        return None, v
    v.schema_ok = True

    cleaned = _clean(output)
    v.sanitized = cleaned != output
    texts = dict(cleaned)
    texts.pop("vectors", None)  # numbers only
    issues = find_unsafe_text(texts, child_facing=spec.child_facing, ai=True)
    issues += find_unsafe_text([b.alt for b in response.binaries if b.alt], child_facing=spec.child_facing, ai=True)
    if issues:
        v.issues = [f"safety: {i}" for i in issues][:20]
        return None, v
    v.safety_ok = True
    return cleaned, v
