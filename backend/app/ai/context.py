"""AIContext: the allow-listed, minimal input for every AI call.

``build_context`` takes plain inputs (ORM rows or dicts) and keeps only:
first/preferred name, age in years, language, gender (only when set, for ar/he
grammar), mode, content type, game template, at most 3 strength / interest /
what-helps labels, at most 3 avoid (sensitivity) keys, the focus area
(category, title, description, plan) or the target strength, at most 5 recent
observations (each <= 300 characters), the current understanding (summary,
adaptations, next_steps) when present, the regenerate instruction, the variant
and include_video.

Every free text in it (custom labels, the focus title, description and plan,
the observations, the current understanding, the instruction) is masked: the
child's names, including the surname, become [child], every other child of the
kindergarten [friend], and the child's parents and the teachers [adult].

Never included: birth date, surname, photo, parent name/contact, health,
free-text parent answers (a custom list entry is sent only once staff confirmed
it, see ``staff_confirmed``), perspectives.

``ctx.model_dump(mode="json")`` is what callers store as
``generated_content.generation_input``.

For a development-review suggestion, ``mask_understanding_inputs`` masks every
free text that goes to the AI (custom labels, the current understanding, focus
titles/descriptions/plans, baseline item texts) with the same names;
``app.ai.service`` masks the observation texts the same way.

Name matching (``name_masker``) tolerates the usual typing variants: case,
accents, Arabic hamza/alef, ta marbuta/ha, alef maqsura/ya, tashkeel and
tatweel, Hebrew niqqud and geresh, Hebrew and Arabic one-letter prefixes and
the Arabic لل elision. A name particle (bin, בן, عبد, de, ...) is masked only
together with the next word. Given names that are also common words (Will, May,
אור, نور) are masked wherever the word appears: an accepted trade-off.
"""
import functools
import re
import unicodedata
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app import vocab

CHILD_TOKEN = "[child]"
FRIEND_TOKEN = "[friend]"
ADULT_TOKEN = "[adult]"

# Sources of a merged-list entry that mean staff entered or confirmed it.
STAFF_SOURCES = frozenset({"teacher", "observation", "review"})

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


def staff_confirmed(item) -> bool:
    """A custom (free-text) list entry may reach the AI only when staff entered or confirmed it
    (sources teacher, observation or review): a parent's own wording is never sent."""
    return bool(STAFF_SOURCES & set(_get(item, "sources") or ()))


# --------------------------------------------------------------------------- name masking

# Spellings people type interchangeably for one letter (Arabic hamza/alef, alef maqsura/ya,
# ta marbuta/ha, kaf, waw with hamza; Hebrew geresh and apostrophes).
_FOLD_GROUPS = ("اأإآٱ", "يىیئ", "ةه", "كک", "وؤ", "'׳’`ʼ")
_CANON = {c: g[0] for g in _FOLD_GROUPS for c in g}
# Optional between and after letters (code point ranges): combining accents, Hebrew niqqud and
# cantillation, Arabic tashkeel and Quranic marks, tatweel, zero-width (non-)joiners, LRM/RLM.
_MARK_RANGES = ((0x0300, 0x036F), (0x0591, 0x05BD), (0x05BF, 0x05BF), (0x05C1, 0x05C2), (0x05C4, 0x05C5),
                (0x05C7, 0x05C7), (0x0610, 0x061A), (0x064B, 0x065F), (0x0670, 0x0670), (0x06D6, 0x06DC),
                (0x06DF, 0x06E4), (0x06E7, 0x06E8), (0x06EA, 0x06ED), (0x0640, 0x0640), (0x200C, 0x200F))
_MARKS = "[" + "".join(f"{chr(a)}-{chr(b)}" for a, b in _MARK_RANGES) + "]*"
_IGNORABLE = frozenset(map(chr, (0x0640, 0x200C, 0x200D, 0x200E, 0x200F)))  # tatweel, ZWNJ, ZWJ, LRM, RLM
_SEPARATORS = frozenset("-" + chr(0x05BE))  # hyphen, Hebrew maqaf: written like a space inside a name
_SEPARATOR_PATTERN = r"[\s\-" + chr(0x05BE) + "]+"
_KASRA = chr(0x0650)
# Hebrew and Arabic attach one-letter prefixes (ל, ו, ב... / و, ب, ل...); they are kept.
_PREFIX = rf"((?:(?:[ובלמשכה]{_MARKS}){{1,3}}|(?:[وبلفك]{_MARKS}){{1,2}})?)"
# A particle is masked only together with the next word (נועה בן דוד: not "בן" alone).
_PARTICLES = frozenset({"بن", "ابن", "بنت", "أبو", "ابو", "أم", "عبد", "آل", "בן", "בת", "אבו",
                        "abu", "bin", "ibn", "ben", "bat", "al", "el", "van", "von", "de", "da", "del"})
# These start compound given names (عبد الله, أبو بكر); any other particle that starts a name
# is itself the given name (Ben, Al, בן).
_LEADING_PARTICLES = frozenset({"عبد", "أبو", "ابو", "أم", "آل", "אבו"})


def _plain(text: str) -> str:
    """A comparison key: no marks, one spelling per letter group, case-folded, single spaces."""
    out = []
    for ch in unicodedata.normalize("NFD", text or ""):
        if unicodedata.combining(ch) or ch in _IGNORABLE:
            continue
        out.append(" " if ch.isspace() or ch in _SEPARATORS else _CANON.get(ch, ch))
    return " ".join("".join(out).casefold().split())


_PARTICLE_KEYS = frozenset(_plain(p) for p in _PARTICLES)
_LEADING_PARTICLE_KEYS = frozenset(_plain(p) for p in _LEADING_PARTICLES)


def first_name(child) -> str:
    """The preferred name, else the first word of the full name. A surname typed into the
    preferred name (the last word of the full name) is dropped."""
    full = (_get(child, "name") or "").split()
    surname = _plain(full[-1]) if len(full) > 1 else None
    preferred = [t for t in (_get(child, "preferred_name") or "").split() if _plain(t) != surname]
    return " ".join(preferred) if preferred else (full[0] if full else "")


def _is_particle(part: str, first: bool) -> bool:
    return _plain(part) in (_LEADING_PARTICLE_KEYS if first else _PARTICLE_KEYS)


def _name_variants(names) -> list[str]:
    """Each full name, plus each word of 2+ letters; a particle goes with the next word."""
    out: set[str] = set()
    for n in names:
        parts = (n or "").split()
        if not parts:
            continue
        out.add(" ".join(parts))
        i = 0
        while i < len(parts):
            if _is_particle(parts[i], i == 0):
                if i + 1 < len(parts):
                    out.add(f"{parts[i]} {parts[i + 1]}")
                i += 2
                continue
            if len(parts[i]) >= 2:
                out.add(parts[i])
            i += 1
    return sorted(out, key=lambda v: len(_plain(v)), reverse=True)


@functools.cache
def _composed() -> dict[str, frozenset]:
    """Precomposed letters by their base letter (e -> é, ë, ...; ا -> أ, إ, آ; Hebrew presentation forms)."""
    table: dict[str, set] = {}
    for start, end in ((0x00C0, 0x0250), (0x1E00, 0x1F00), (0x0620, 0x06D4), (0xFB1D, 0xFB50)):
        for cp in range(start, end):
            ch = chr(cp)
            d = unicodedata.normalize("NFD", ch)
            if len(d) > 1 and d[0] != ch:
                table.setdefault(d[0], set()).add(ch)
    return {k: frozenset(v) for k, v in table.items()}


@functools.cache
def _letter(ch: str) -> str:
    group = next((g for g in _FOLD_GROUPS if ch in g), ch)
    chars = set(group)
    for c in group:
        chars |= _composed().get(c, frozenset())
    if len(chars) == 1:
        return re.escape(ch)
    return "[" + "".join(re.escape(c) for c in sorted(chars)) + "]"


def _flex(name: str) -> str:
    """A pattern for ``name`` that tolerates the typing variants listed in the module doc."""
    parts = []
    for ch in unicodedata.normalize("NFD", name):
        if unicodedata.combining(ch) or ch in _IGNORABLE:
            continue
        parts.append(_SEPARATOR_PATTERN if ch.isspace() or ch in _SEPARATORS else _letter(ch))
    return _MARKS.join(parts) + _MARKS


def _compile(groups) -> tuple[re.Pattern | None, list[str]]:
    """One pattern for every name variant, longest first; ``tokens[m.lastindex - 2]`` is the
    token of the variant that matched (group 1 is the prefix)."""
    pairs: list[tuple[str, str]] = []
    taken: set[str] = set()
    for names, token in groups:  # the child before friends before adults on a shared variant
        for variant in _name_variants(n for n in names or () if n):
            key = _plain(variant)
            if key and key not in taken:
                taken.add(key)
                pairs.append((variant, token))
    if not pairs:
        return None, []
    pairs.sort(key=lambda p: len(_plain(p[0])), reverse=True)  # stable: keeps child, friend, adult order
    alternatives, tokens = [], []
    for variant, token in pairs:
        alternatives.append(f"({_flex(variant)})")
        tokens.append(token)
        bare = "".join(c for c in unicodedata.normalize("NFC", variant) if not unicodedata.combining(c))
        if bare[:2] in ("ال", "ٱل") and len(bare) > 2:
            # "for al-Abbas" is written للعباس: after the prefix ل, the article loses its alef.
            alternatives.append(f"((?:(?<=ل)|(?<=ل{_KASRA}))ل{_MARKS}{_flex(bare[2:])})")
            tokens.append(token)
    pattern = rf"(?<!\w){_PREFIX}(?:{'|'.join(alternatives)})(?!\w)"
    return re.compile(pattern, re.IGNORECASE), tokens


def name_masker(child_names=(), classmate_names=(), adult_names=()):
    """``mask(text)``: the child's names become [child], other children's names [friend] and the
    adults' names (parents, teachers) [adult]. The pattern is compiled once; None and blank text
    pass through."""
    pattern, tokens = _compile(((child_names, CHILD_TOKEN), (classmate_names, FRIEND_TOKEN),
                                (adult_names, ADULT_TOKEN)))

    def mask(text):
        if not text or pattern is None:
            return text
        return pattern.sub(lambda m: m.group(1) + tokens[m.lastindex - 2], text)

    return mask


def mask_names(text: str, child_names=(), classmate_names=(), adult_names=()) -> str:
    """Replace the child's names with [child], other children's with [friend] and adults' with [adult]."""
    return name_masker(child_names, classmate_names, adult_names)(text)


def _masked_label_items(items: list[LabelItem], mask) -> list[LabelItem]:
    # Vocabulary labels are not free text; only custom entries (key None) are masked.
    return [it if it.key else LabelItem(key=None, label=_clip(mask(it.label), 80) or "-") for it in items]


def mask_understanding_inputs(ctx: AIContext, focus_areas: list[dict], baseline_items: list[dict], mask):
    """Masked copies of the development-review suggestion inputs that are sent to the AI.

    Every free text gets the child's names as [child], other children's names as
    [friend] and the adults' names as [adult] (``mask`` is a :func:`name_masker`):
    the custom profile labels and the current understanding in ``ctx``,
    the focus titles, descriptions and plans, and the baseline items' custom
    texts and non-vocabulary labels (custom entries and focus titles).
    Returns ``(ctx, focus_areas, baseline_items)``; the inputs are not changed.
    """
    cu = ctx.current_understanding
    ai_ctx = ctx.model_copy(update={
        "strengths": _masked_label_items(ctx.strengths, mask),
        "interests": _masked_label_items(ctx.interests, mask),
        "what_helps": _masked_label_items(ctx.what_helps, mask),
        "current_understanding": UnderstandingContext(
            **{k: _clip(mask(getattr(cu, k)), 1000) for k in ("summary", "adaptations", "next_steps")}
        ) if cu else None,
    })
    focus = []
    for f in focus_areas or []:
        item = {**f, "title": _clip(mask(f.get("title")), 200), "description": _clip(mask(f.get("description")), 500)}
        if isinstance(f.get("plan"), dict):
            item["plan"] = {k: _clip(mask(str(v)), 400) for k, v in f["plan"].items() if v not in (None, "")} or None
        focus.append(item)
    baseline = []
    for it in baseline_items or []:
        item = dict(it)
        if it.get("custom"):
            item["custom"] = _clip(mask(it["custom"]), 120)
        if it.get("custom") or it.get("list") == "focus" or not it.get("key"):
            item["label"] = _clip(mask(it.get("label")), 160) or "-"
        baseline.append(item)
    return ai_ctx, focus, baseline


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
        elif custom and staff_confirmed(it):
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
    adult_names=(),
    current_understanding: dict | None = None,
    template: str | None = None,
    instruction: str | None = None,
    variant: int = 0,
    include_video: bool = False,
    today: date | None = None,
    mask_free_text: bool = True,
) -> AIContext:
    """Build the allow-listed AIContext. ``child``/``profile``/``focus`` may be rows or dicts.

    ``classmate_names``: the other children whose names may appear (masked as [friend]);
    ``adult_names``: the child's parents and the teachers (masked as [adult], like the child's
    own ``parent_name``).
    ``mask_free_text=False`` keeps the free texts as typed. Only the development-review
    suggestion uses it: ``app.ai.service`` masks every free text with
    ``mask_understanding_inputs`` right before the AI call, and the template provider and the
    review screen need the teacher's own wording.
    """
    lang = language
    name = first_name(child)
    child_names = [name, _get(child, "name"), _get(child, "preferred_name")]
    adults = [_get(child, "parent_name"), *(adult_names or ())]
    mask = name_masker(child_names, classmate_names, adults) if mask_free_text else (lambda text: text)

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
            plan = {k: _clip(mask(str(v)), 400) for k, v in plan.items() if v not in (None, "")}
        fid = _get(focus, "id")
        focus_ctx = FocusContext(
            id=str(fid) if fid is not None else None,
            category=_get(focus, "category") or "other",
            suggestion_key=_get(focus, "suggestion_key"),
            title=_clip(mask(_get(focus, "title") or ""), 200) or "",
            description=_clip(mask(_get(focus, "description") or ""), 500),
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
        cu = {k: _clip(mask(str(_get(current_understanding, k) or "")), 1000)
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
        strengths=_masked_label_items(_label_items(_get(profile, "strengths"), ("strengths",), lang), mask),
        interests=_masked_label_items(_label_items(_get(profile, "interests"), ("interests",), lang), mask),
        what_helps=_masked_label_items(_label_items(_get(profile, "what_helps"), WHAT_HELPS_LISTS, lang), mask),
        avoid=avoid[:MAX_LIST_ITEMS],
        focus=focus_ctx,
        target_strength=target,
        recent_observations=observations,
        current_understanding=understanding,
        instruction=_clip(mask(instruction), 500) if instruction else None,
        variant=max(int(variant or 0), 0),
        include_video=bool(include_video),
    )
