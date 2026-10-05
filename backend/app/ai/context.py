"""AIContext: the allow-listed, minimal input for every AI call.

``build_context`` takes plain inputs (ORM rows or dicts) and keeps only:
first/preferred name, age in years, language, gender (only when set, for ar/he
grammar), mode, content type, game template, at most 3 strength / interest /
what-helps labels, at most 3 avoid (sensitivity) keys, the focus area
(category, title, description, plan) or the target strength, at most 5 recent
observations (each <= 300 characters, with the child's name and every
classmate's name masked), the current understanding (summary, adaptations,
next_steps) when present, the regenerate instruction, the variant and
include_video.

Never included: birth date, surname, photo, parent name/contact, health,
free-text parent answers, perspectives.

``ctx.model_dump(mode="json")`` is what callers store as
``generated_content.generation_input``.
"""
import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app import vocab

CHILD_TOKEN = "[child]"
FRIEND_TOKEN = "[friend]"

MAX_LIST_ITEMS = 3
MAX_OBSERVATIONS = 5
MAX_OBSERVATION_CHARS = 300

# Lists a what_helps key may come from (the profile merges all of them).
WHAT_HELPS_LISTS = ("what_helps", "calming_helps", "transition_helps", "sensitivity_helps", "sad_helps")
STRENGTH_LISTS = ("strengths", "strength_targets")

Mode = Literal["strength_builder", "growth_support"]
ContentType = Literal["story", "video", "digital_game", "real_world_activity", "pack", "understanding"]
Template = Literal[
    "multiple_choice", "match_pairs", "sequence", "emotion_choice", "categorize", "what_happens_next", "story_builder"
]


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LabelItem(_M):
    key: str | None = None  # vocabulary key; None for a custom entry
    label: str


class FocusContext(_M):
    id: str | None = None
    category: str
    suggestion_key: str | None = None
    title: str
    description: str | None = None
    plan: dict | None = None


class UnderstandingContext(_M):
    summary: str | None = None
    adaptations: str | None = None
    next_steps: str | None = None


class AIContext(_M):
    mode: Mode | None = None
    content_type: ContentType
    template: Template | None = None
    language: Literal["ar", "he", "en"]
    name: str
    age_years: int | None = None
    gender: Literal["girl", "boy"] | None = None
    strengths: list[LabelItem] = Field(default_factory=list, max_length=MAX_LIST_ITEMS)
    interests: list[LabelItem] = Field(default_factory=list, max_length=MAX_LIST_ITEMS)
    what_helps: list[LabelItem] = Field(default_factory=list, max_length=MAX_LIST_ITEMS)
    avoid: list[str] = Field(default_factory=list, max_length=MAX_LIST_ITEMS)
    focus: FocusContext | None = None
    target_strength: LabelItem | None = None
    recent_observations: list[str] = Field(default_factory=list, max_length=MAX_OBSERVATIONS)
    current_understanding: UnderstandingContext | None = None
    instruction: str | None = None
    variant: int = 0
    include_video: bool = False


# --------------------------------------------------------------------------- helpers


def _get(obj, name: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _clip(text, limit: int) -> str | None:
    if text is None:
        return None
    text = re.sub(r"\s+", " ", str(text)).strip()
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def age_in_years(birth_date, today: date | None = None) -> int | None:
    if birth_date is None:
        return None
    if isinstance(birth_date, str):
        birth_date = date.fromisoformat(birth_date[:10])
    today = today or date.today()
    years = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    return max(years, 0)


def first_name(child) -> str:
    preferred = (_get(child, "preferred_name") or "").strip()
    if preferred:
        return preferred
    full = (_get(child, "name") or "").strip()
    return full.split()[0] if full else ""


def _name_variants(names) -> list[str]:
    out: set[str] = set()
    for n in names:
        n = (n or "").strip()
        if not n:
            continue
        out.add(n)
        out.update(part for part in n.split() if len(part) >= 2)
    return sorted(out, key=len, reverse=True)


# Hebrew and Arabic attach one-letter prefixes (ל, ו, ב... / و, ب, ل...); keep them.
_PREFIX = r"((?:[ובלמשכה]{1,3}|[وبلفك]{1,2})?)"


def _name_pattern(name: str) -> re.Pattern:
    if re.fullmatch(r"[A-Za-z][A-Za-z'\-]*", name):
        return re.compile(r"(?<![A-Za-z])()" + re.escape(name) + r"(?![A-Za-z])", re.IGNORECASE)
    return re.compile(r"(?<!\w)" + _PREFIX + re.escape(name) + r"(?!\w)")


def mask_names(text: str, child_names=(), classmate_names=()) -> str:
    """Replace the child's names with [child] and every classmate name with [friend]."""
    if not text:
        return text
    pairs = [(n, CHILD_TOKEN) for n in _name_variants(child_names)]
    child_set = {n for n, _ in pairs}
    pairs += [(n, FRIEND_TOKEN) for n in _name_variants(classmate_names) if n not in child_set]
    pairs.sort(key=lambda p: len(p[0]), reverse=True)
    for name, token in pairs:
        text = _name_pattern(name).sub(lambda m, t=token: m.group(1) + t, text)
    return text


def _label_for(lists: tuple[str, ...], key: str, lang: str) -> str | None:
    for list_name in lists:
        try:
            if vocab.is_valid(list_name, key):
                return vocab.label(list_name, key, lang)
        except KeyError:
            continue
    return None


def _label_items(items, lists: tuple[str, ...], lang: str, limit: int = MAX_LIST_ITEMS) -> list[LabelItem]:
    out: list[LabelItem] = []
    seen: set[str] = set()
    for it in items or []:
        if isinstance(it, str):
            it = {"key": it}
        key = _get(it, "key")
        custom = _get(it, "custom")
        if key:
            label = _label_for(lists, key, lang)
            if label is None:
                continue
            item = LabelItem(key=key, label=label)
        elif custom:
            item = LabelItem(key=None, label=_clip(custom, 80))
        else:
            continue
        ident = item.key or item.label.lower()
        if ident in seen:
            continue
        seen.add(ident)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def _observation_text(obs) -> str | None:
    if isinstance(obs, str):
        return obs
    return _get(obs, "observation") or _get(obs, "text") or _get(obs, "note")


# --------------------------------------------------------------------------- builder


def build_context(
    *,
    child,
    profile=None,
    mode: str | None,
    content_type: str,
    language: str,
    focus=None,
    target_strength: str | None = None,
    recent_observations=(),
    classmate_names=(),
    current_understanding: dict | None = None,
    template: str | None = None,
    instruction: str | None = None,
    variant: int = 0,
    include_video: bool = False,
    today: date | None = None,
) -> AIContext:
    """Build the allow-listed AIContext. ``child``/``profile``/``focus`` may be rows or dicts."""
    lang = language
    name = first_name(child)
    child_names = [_get(child, "name"), _get(child, "preferred_name")]
    classmates = [c for c in (classmate_names or []) if c]

    def mask(text):
        return mask_names(text, child_names, classmates) if text else text

    gender = _get(child, "gender")
    avoid = []
    for it in _get(profile, "sensitivities") or []:
        key = it if isinstance(it, str) else _get(it, "key")
        if key and vocab.is_valid("sensitivities", key) and key not in avoid:
            avoid.append(key)

    focus_ctx = None
    if focus is not None:
        plan = _get(focus, "plan") or None
        if isinstance(plan, dict):
            plan = {k: _clip(mask_names(str(v), (), classmates), 400) for k, v in plan.items() if v not in (None, "")}
        fid = _get(focus, "id")
        focus_ctx = FocusContext(
            id=str(fid) if fid is not None else None,
            category=_get(focus, "category") or "other",
            suggestion_key=_get(focus, "suggestion_key"),
            title=_clip(mask_names(_get(focus, "title") or "", (), classmates), 200) or "",
            description=_clip(mask_names(_get(focus, "description") or "", (), classmates), 500),
            plan=plan or None,
        )

    target = None
    if target_strength:
        target = LabelItem(key=target_strength, label=_label_for(STRENGTH_LISTS, target_strength, lang) or target_strength)

    observations: list[str] = []
    for obs in recent_observations or []:
        text = _observation_text(obs)
        text = _clip(mask(text), MAX_OBSERVATION_CHARS) if text else None
        if text:
            observations.append(text)
        if len(observations) >= MAX_OBSERVATIONS:
            break

    understanding = None
    if current_understanding:
        cu = {k: _clip(mask_names(str(_get(current_understanding, k) or ""), (), classmates), 1000)
              for k in ("summary", "adaptations", "next_steps")}
        if any(cu.values()):
            understanding = UnderstandingContext(**cu)

    return AIContext(
        mode=mode,
        content_type=content_type,
        template=template,
        language=lang,
        name=name,
        age_years=age_in_years(_get(child, "birth_date"), today),
        gender=gender if gender in ("girl", "boy") else None,
        strengths=_label_items(_get(profile, "strengths"), ("strengths",), lang),
        interests=_label_items(_get(profile, "interests"), ("interests",), lang),
        what_helps=_label_items(_get(profile, "what_helps"), WHAT_HELPS_LISTS, lang),
        avoid=avoid[:MAX_LIST_ITEMS],
        focus=focus_ctx,
        target_strength=target,
        recent_observations=observations,
        current_understanding=understanding,
        instruction=_clip(mask(instruction), 500) if instruction else None,
        variant=max(int(variant or 0), 0),
        include_video=bool(include_video),
    )
