"""Wording safety for AI output, template output and teacher edits.

Rules (docs/terminology.md, "How banned_terms is matched"):
- Lowercase the text, remove every ``allow_phrases`` entry (all languages), then
  substring-search every term of all three languages.
- ``clinical`` terms are banned in every string field (teacher_note, summaries too).
- ``child_deficit`` terms are banned in child-facing fields, and in EVERY field of
  AI output (``ai=True``: teacher-facing AI text too; COVERAGE-MATRIX §7.8, X-30).
- ``ai_only`` terms (referral and professional-evaluation wording) are banned in
  every field of AI output (``ai=True``) and never checked on teacher input: the
  teacher may choose the follow-up option ``referral_as_needed`` herself (OQ-2).
- URLs are rejected everywhere.
- ``/\\d+\\s*%|\\bscore\\b|\\bpoints\\b/i`` is rejected in child-facing text and in
  every field of AI output.

``ai=True`` is for what the AI provider wrote (Claude output). Teacher edits and
teacher input use the default ``ai=False``.

Public functions:
    text_issues(text, child_facing, ai=False) -> list[str]
    find_unsafe_text(data, child_facing, ai=False) -> list[str]
        Every string inside ``data`` (str, list or dict, nested) is checked;
        ``child_facing`` decides whether the child-facing rules apply.
    check_content(obj, child_facing_fields, ai=False) -> list[str]
        ``obj`` is a model or a dict. A string is child-facing when its dotted
        path (list indices dropped, e.g. ``story.questions``) equals or starts
        with one of ``child_facing_fields``. Issues are prefixed with the path.
    child_facing_fields(kind, template=None) -> set[str]
        The child-facing paths for an output kind.
    placeholder_issues(data, allowed) -> list[str]
        Person placeholders ({grandfather}) in ``data`` that are not in ``allowed``.
"""
import re

from pydantic import BaseModel

from app import vocab

URL_RE = re.compile(
    r"(https?://|www\.|\b[a-z0-9-]+\.(com|org|net|io|co|il|me|app|ly|info|edu|gov|ai)\b)", re.IGNORECASE
)
NUMERIC_RE = re.compile(r"\d+\s*%|\bscore\b|\bpoints\b", re.IGNORECASE)


def _flat(group: dict) -> list[str]:
    out: list[str] = []
    for terms in (group or {}).values():
        out.extend(t.lower() for t in terms)
    return sorted(set(out), key=len, reverse=True)


def _term_lists() -> tuple[list[str], list[str], list[str], list[str]]:
    banned = vocab.banned_terms()
    return (_flat(banned.get("clinical")), _flat(banned.get("child_deficit")), _flat(banned.get("ai_only")),
            _flat(banned.get("allow_phrases")))


def text_issues(text: str, child_facing: bool, ai: bool = False) -> list[str]:
    """Issues for one string (no path prefix)."""
    clinical, deficit, ai_only, allow = _term_lists()
    issues: list[str] = []
    cleaned = text.lower()
    for phrase in allow:
        cleaned = cleaned.replace(phrase, " ")
    for term in clinical:
        if term in cleaned:
            issues.append(f'uses the clinical term "{term}"')
    if child_facing or ai:
        for term in deficit:
            if term in cleaned:
                issues.append(f'{"child-facing" if child_facing else "AI"} text uses "{term}"')
        if NUMERIC_RE.search(text):
            issues.append(f'{"child-facing" if child_facing else "AI"} text uses a score, points or a percentage')
    if ai:
        for term in ai_only:
            if term in cleaned:
                issues.append(f'AI text uses the referral or evaluation wording "{term}"')
    if URL_RE.search(text):
        issues.append("contains a link or web address")
    return issues


def _strings(data, path: tuple = ()):
    if isinstance(data, str):
        yield path, data
    elif isinstance(data, dict):
        for k, v in data.items():
            yield from _strings(v, path + (str(k),))
    elif isinstance(data, (list, tuple)):
        for v in data:
            yield from _strings(v, path)


def _dedupe(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def find_unsafe_text(data, child_facing: bool, ai: bool = False) -> list[str]:
    issues: list[str] = []
    for path, s in _strings(data):
        prefix = f"{'.'.join(path)}: " if path else ""
        issues.extend(prefix + i for i in text_issues(s, child_facing, ai))
    return _dedupe(issues)


def check_content(obj, child_facing_fields, ai: bool = False) -> list[str]:
    data = obj.model_dump(mode="json") if isinstance(obj, BaseModel) else obj
    prefixes = set(child_facing_fields or ())
    issues: list[str] = []
    for path, s in _strings(data):
        dotted = ".".join(path)
        child = any(dotted == p or dotted.startswith(p + ".") for p in prefixes)
        issues.extend(f"{dotted}: {i}" for i in text_issues(s, child, ai))
    return _dedupe(issues)


# A person placeholder in content: {relation} or {relation_N} (services/people.py). The client puts
# the display name in its place; any other placeholder would show as raw text to a child.
PLACEHOLDER_RE = re.compile(r"\{([a-z][a-z0-9_]{0,40})\}")


def placeholder_issues(data, allowed=()) -> list[str]:
    """Placeholders in ``data`` (any nested str/list/dict) that are not one of the ``allowed`` tokens
    (``{grandfather}``, ...)."""
    found = {"{" + m + "}" for _, s in _strings(data) for m in PLACEHOLDER_RE.findall(s)}
    return [f"unknown person placeholder {t}" for t in sorted(found - set(allowed or ()))]


_STORY = {"title", "story", "questions", "illustrations"}
_ACTIVITY = {"title", "instructions", "materials"}
_VIDEO = {"title", "script", "scenes.narration"}
_GAME = {"title", "intro", "rounds", "pairs", "items", "categories", "steps", "closing_prompt"}


def child_facing_fields(kind: str, template: str | None = None) -> set[str]:
    if kind == "story":
        return set(_STORY)
    if kind == "real_world_activity":
        return set(_ACTIVITY)
    if kind == "digital_game":
        return set(_GAME)
    if kind == "video":
        return set(_VIDEO)
    if kind == "pack":
        out = {"discussion_prompts"}
        for sub, fields in (("story", _STORY), ("activity", _ACTIVITY), ("game", _GAME), ("video", _VIDEO)):
            out |= {f"{sub}.{f}" for f in fields}
        return out
    return set()  # understanding, functional_summary and anything teacher-only
