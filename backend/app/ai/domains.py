"""The 12 AI domains: relevance, registry policy and the minimised domain blocks
(COVERAGE-MATRIX §7.2-§7.3; X-26, X-28).

Relevance (pure):
    for_focus(category, suggestion_key=None) -> list[str]   content for a Current Focus
    for_strength(key) -> list[str]                           content for a target strength
    for_need_area(area) -> list[str]                         a Domain 13 need area
    analysis_domains(cache, observation_domains=(), focus_categories=()) -> list[str]
        understanding / functional summary: the domains that have data in the period
        (the teacher assessment, the observations' ``domains``) plus the domains of
        the active focus areas.
A content type has no domains of its own. Content generation sends only the blocks of
the domains its focus or strength concerns; nothing is sent for the other domains.

Registry policy: ``item_policy(assessment_domain, path)`` reads
``app/data/source/observation_model.json`` (``vocab.source_registry``). A teacher
observation value reaches the AI only when its registry entry has ``ai_policy``
``domain`` or ``label`` and a sensitivity outside ``DENY_SENSITIVITIES``. A value
the registry does not list (a new question) is excluded by default. While the
registry does not exist yet (``{}``), the matrix default applies: indicator levels,
independence levels, sensory effects, the day-map stages and help keys; texts and
notes never.

Blocks (pure, from the ``teacher_assessments.domains`` cache)::

    assessment_blocks(cache, relevant) -> {<ai_domain>: {"assessment": [{item, level?, effect?, helps?}],
                                                           "helps": [keys]}}
    teacher_avoid(cache) -> list[str]   sensitivity keys the teacher observed (D9 effect
                                        affects | sometimes); at most 3

Only vocabulary keys and levels leave this module: never notes, texts, names or
observation ids of the assessment. Observation texts are added by the caller
(app/ai/gather.py) and masked in app/ai/context.py.
"""
import re
from collections.abc import Iterable

from app import vocab
from app.models import AI_DOMAIN_VALUES, ASSESSMENT_DOMAIN_VALUES, SUPPORT_LEVEL_VALUES

AI_DOMAINS: tuple[str, ...] = AI_DOMAIN_VALUES
DENY_SENSITIVITIES = frozenset({"health", "medical", "family", "third_party"})
ALLOWED_POLICIES = frozenset({"domain", "label"})

MAX_DOMAIN_ITEMS = 15
MAX_DOMAIN_HELPS = 6
MAX_AVOID = 3

# Teacher-observation domains whose items are rated on the support scale.
ITEM_DOMAINS = ("emotional", "social", "language", "executive_function", "play", "gross_motor", "fine_motor",
                "cognitive", "independence")
# Language items D03-11..14 are about communication (COVERAGE-MATRIX §7.3).
COMMUNICATION_ITEMS = frozenset({"listens_to_others", "holds_short_conversation", "waits_turn_in_conversation",
                                 "adjusts_speech_to_situation"})
SENSORY_EFFECTS = ("affects", "sometimes", "no_visible_effect")
AVOID_EFFECTS = ("affects", "sometimes")
# D9 stimulus → sensitivities key when the registry has no maps_to.
SENSORY_TO_SENSITIVITY = {"light": "bright_lights", "smells": "strong_smells", "creative_activities": "messy_play"}
# Never an AI "avoid" key, whoever entered it (health; COVERAGE-MATRIX PQ-HLT-02).
NEVER_AVOID = frozenset({"certain_foods"})
HELP_LISTS = ("what_helps", "calming_helps", "transition_helps", "sensitivity_helps", "sad_helps")

FOCUS_CATEGORY_DOMAINS: dict[str, tuple[str, ...]] = {
    "emotional": ("emotional",),
    "social": ("social", "play"),
    "language": ("language", "communication"),
    "communication": ("communication", "language"),
    "independence": ("independence",),
    "attention": ("executive_function",),
    "motor": ("gross_motor", "fine_motor"),
    "learning": ("cognitive",),
    "transitions": ("daily_routine", "emotional"),
    "confidence": ("emotional", "social"),
    "other": (),
}
# A focus suggestion narrower than its category.
FOCUS_SUGGESTION_DOMAINS: dict[str, tuple[str, ...]] = {
    "using_scissors": ("fine_motor",),
    "dressing_independently": ("independence",),
    "listening_during_story_time": ("executive_function", "communication"),
    "following_two_step_instructions": ("language",),
    "telling_about_an_experience": ("language", "communication"),
    "asking_for_help": ("communication", "emotional"),
    "managing_transitions": ("daily_routine", "executive_function"),
    "separating_in_the_morning": ("emotional", "daily_routine"),
    "sorting_and_matching": ("cognitive",),
}
STRENGTH_DOMAINS: dict[str, tuple[str, ...]] = {
    "imagination": ("play", "cognitive"),
    "curiosity": ("cognitive",),
    "communication": ("communication", "language"),
    "vocabulary": ("language",),
    "memory": ("cognitive",),
    "creativity": ("play", "fine_motor"),
    "building": ("fine_motor", "play"),
    "drawing": ("fine_motor",),
    "music": ("play",),
    "movement": ("gross_motor",),
    "problem_solving": ("cognitive", "executive_function"),
    "independence": ("independence",),
    "empathy": ("social", "emotional"),
    "humor": ("social",),
    "persistence": ("executive_function",),
    "leadership": ("social", "play"),
    "observation": ("cognitive",),
    "social_connection": ("social",),
    "storytelling": ("language", "communication"),
    "confidence": ("emotional",),
    "language": ("language", "communication"),
}
NEED_AREA_DOMAINS: dict[str, tuple[str, ...]] = {
    "emotional": ("emotional",),
    "social": ("social",),
    "language": ("language",),
    "communication": ("communication",),
    "attention": ("executive_function",),
    "motor": ("gross_motor", "fine_motor"),
    "cognitive": ("cognitive",),
    "independence": ("independence",),
    "sensory": ("sensory",),
    "behaviour": ("emotional", "social"),
    "adapting_to_setting": ("daily_routine",),
}

_KEY = re.compile(r"^[a-z0-9_]{1,40}$")
_DOMAIN_ALT = "|".join(sorted(ASSESSMENT_DOMAIN_VALUES, key=len, reverse=True))
_STORAGE = re.compile(rf"(?:^|[.\s])({_DOMAIN_ALT})\.((?:items|fields|stages|needs)[\w.<>\[\]*]*)")


def is_key(value) -> bool:
    return isinstance(value, str) and bool(_KEY.match(value))


def _ordered(domains: Iterable[str]) -> list[str]:
    found = set(domains or ())
    return [d for d in AI_DOMAINS if d in found]


# --------------------------------------------------------------------------- relevance


def for_focus(category: str | None, suggestion_key: str | None = None) -> list[str]:
    if suggestion_key and suggestion_key in FOCUS_SUGGESTION_DOMAINS:
        return list(FOCUS_SUGGESTION_DOMAINS[suggestion_key])
    return list(FOCUS_CATEGORY_DOMAINS.get(category or "", ()))


def for_strength(key: str | None) -> list[str]:
    return list(STRENGTH_DOMAINS.get(key or "", ()))


def for_need_area(area: str | None) -> list[str]:
    return list(NEED_AREA_DOMAINS.get(area or "", ()))


# --------------------------------------------------------------------------- registry policy


def _normalise(path: str) -> str | None:
    """'TA.daily_routine.stages.<s>.support_needed{helps[], text} ≤500' -> 'daily_routine.stages.*.support_needed'."""
    match = _STORAGE.search(path or "")
    if not match:
        return None
    rest = re.sub(r"<[^>]*>", "*", match.group(2))
    rest = re.sub(r"\[[^\]]*\]", "", rest)
    return f"{match.group(1)}.{rest}".strip(".")


def _registry_index() -> dict[str, dict] | None:
    """storage path -> registry item; None while the observation-model registry does not exist."""
    registry = vocab.source_registry("observation_model")
    items = registry.get("items") if isinstance(registry, dict) else None
    if not items:
        return None
    index: dict[str, dict] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        storages = item.get("storage")
        for storage in storages if isinstance(storages, list) else [storages]:
            path = _normalise(storage) if isinstance(storage, str) else None
            if path:
                index.setdefault(path, item)
    return index or None  # no teacher-observation paths at all: treat as missing


def _policy_word(item: dict) -> str:
    return str(item.get("ai_policy") or "never").strip().split(" ")[0].lower()


def _default_ai_domain(domain: str, key: str | None) -> str | None:
    if domain == "language" and key in COMMUNICATION_ITEMS:
        return "communication"
    return domain if domain in AI_DOMAINS else None


# Paths the matrix marks 'domain' or 'label' (used only while the registry is missing).
_DEFAULT_ALLOWED = (
    re.compile(rf"^({'|'.join(ITEM_DOMAINS)})\.items\.[a-z0-9_]+$"),
    re.compile(r"^sensory\.items\.[a-z0-9_]+$"),
    re.compile(r"^emotional\.fields\.what_helps_calm$"),
    re.compile(r"^sensory\.fields\.what_helps_regulate$"),
    re.compile(r"^daily_routine\.stages\.[a-z0-9_]+(\.(support_needed|what_helps))?$"),
    re.compile(r"^priority_needs\.needs\.what_helped$"),
)


def item_policy(domain: str, path: str, index=False) -> tuple[bool, str | None]:
    """(allowed, ai_domain) for one value of a teacher-observation domain document.

    ``path`` is relative to the domain document, e.g. 'items.calms_after_frustration',
    'fields.what_helps_calm', 'stages.arrival.support_needed', 'needs.what_helped'.
    ``index`` may pass a prebuilt ``_registry_index()`` (False = build it here).
    """
    if index is False:
        index = _registry_index()
    parts = path.split(".")
    key = parts[1] if len(parts) > 1 and parts[0] in ("items", "stages") else None
    full = f"{domain}.{path}"
    if index is None:
        allowed = any(p.match(full) for p in _DEFAULT_ALLOWED)
        return allowed, _default_ai_domain(domain, key) if allowed else None
    candidates = [full]
    if key is not None:
        candidates.append(".".join([domain, parts[0], "*", *parts[2:]]))
    item = next((index[c] for c in candidates if c in index), None)
    if item is None:
        return False, None
    sensitivity = str(item.get("sensitivity") or "none").lower()
    if _policy_word(item) not in ALLOWED_POLICIES or sensitivity in DENY_SENSITIVITIES:
        return False, None
    ai_domain = item.get("ai_domain")
    if ai_domain not in AI_DOMAINS:
        ai_domain = _default_ai_domain(domain, key)
    return True, ai_domain


def _maps_to(index, path: str) -> str | None:
    if not index:
        return None
    item = index.get(path)
    value = item.get("maps_to") if isinstance(item, dict) else None
    if isinstance(value, dict):
        value = value.get("sensitivities") or next((v for v in value.values() if isinstance(v, str)), None)
    return value if isinstance(value, str) else None


# --------------------------------------------------------------------------- blocks


def help_keys(value) -> list[str]:
    """Vocabulary keys from {helps|items: [...]} / [...] (custom texts are dropped)."""
    if isinstance(value, dict):
        value = value.get("helps") if "helps" in value else value.get("items")
    out: list[str] = []
    for raw in value or []:
        key = raw.get("key") if isinstance(raw, dict) else raw
        if is_key(key) and key not in out and any(_valid(name, key) for name in HELP_LISTS):
            out.append(key)
    return out


def _valid(list_name: str, key: str) -> bool:
    try:
        return vocab.is_valid(list_name, key)
    except KeyError:
        return False


def _data(cache: dict, domain: str) -> dict:
    entry = (cache or {}).get(domain) if isinstance(cache, dict) else None
    data = entry.get("data") if isinstance(entry, dict) else None
    return data if isinstance(data, dict) else {}


class _Blocks:
    def __init__(self, relevant: Iterable[str]):
        self.relevant = set(relevant or ())
        self.out: dict[str, dict] = {}

    def _block(self, domain: str) -> dict | None:
        if domain not in self.relevant:
            return None
        return self.out.setdefault(domain, {"assessment": [], "helps": []})

    def item(self, domain: str | None, entry: dict) -> None:
        block = self._block(domain) if domain else None
        if block is not None and len(block["assessment"]) < MAX_DOMAIN_ITEMS:
            block["assessment"].append(entry)

    def helps(self, domain: str | None, keys: list[str]) -> None:
        block = self._block(domain) if domain else None
        if block is None:
            return
        for key in keys:
            if key not in block["helps"] and len(block["helps"]) < MAX_DOMAIN_HELPS:
                block["helps"].append(key)

    def result(self) -> dict[str, dict]:
        return {d: self.out[d] for d in AI_DOMAINS if d in self.out and (self.out[d]["assessment"] or self.out[d]["helps"])}


def _in_order(index, domain: str, part: str, values) -> list[tuple]:
    """``values.items()`` in the registry's question order (a JSONB document keeps no key order),
    then by key for anything the registry does not list (or while it is missing)."""
    if not isinstance(values, dict):
        return []

    def rank(key):
        item = (index or {}).get(f"{domain}.{part}.{key}") if is_key(key) else None
        order = item.get("order") if isinstance(item, dict) else None
        return (0, order, str(key)) if isinstance(order, (int, float)) else (1, 0, str(key))

    return sorted(values.items(), key=lambda kv: rank(kv[0]))


def assessment_blocks(cache: dict, relevant: Iterable[str]) -> dict[str, dict]:
    """The relevant domains' keys and levels from the latest teacher assessment (cache of
    ``teacher_assessments.domains``). Domains without data are left out."""
    blocks = _Blocks(relevant)
    if not blocks.relevant or not isinstance(cache, dict):
        return {}
    index = _registry_index()
    levels = set(SUPPORT_LEVEL_VALUES) - {"not_observed"}

    for domain in ITEM_DOMAINS:
        items = _data(cache, domain).get("items")
        for key, value in _in_order(index, domain, "items", items):
            if not is_key(key) or not isinstance(value, dict) or value.get("level") not in levels:
                continue
            allowed, ai_domain = item_policy(domain, f"items.{key}", index)
            if allowed:
                blocks.item(ai_domain, {"item": key, "level": value["level"]})

    calm = _data(cache, "emotional").get("fields")
    if isinstance(calm, dict) and item_policy("emotional", "fields.what_helps_calm", index)[0]:
        blocks.helps("emotional", help_keys(calm.get("what_helps_calm")))

    sensory = _data(cache, "sensory")
    items = sensory.get("items")
    for key, value in _in_order(index, "sensory", "items", items):
        if not is_key(key) or not isinstance(value, dict) or value.get("effect") not in SENSORY_EFFECTS:
            continue
        allowed, ai_domain = item_policy("sensory", f"items.{key}", index)
        if allowed:
            entry = {"item": key, "effect": value["effect"]}
            helps = help_keys(value.get("helps"))
            if helps:
                entry["helps"] = helps[:MAX_DOMAIN_HELPS]
            blocks.item(ai_domain or "sensory", entry)
    fields = sensory.get("fields")
    if isinstance(fields, dict) and item_policy("sensory", "fields.what_helps_regulate", index)[0]:
        blocks.helps("sensory", help_keys(fields.get("what_helps_regulate")))

    stages = _data(cache, "daily_routine").get("stages")
    for stage, value in _in_order(index, "daily_routine", "stages", stages):
        if not is_key(stage) or not isinstance(value, dict) or not item_policy("daily_routine", f"stages.{stage}", index)[0]:
            continue
        helps: list[str] = []
        for part in ("support_needed", "what_helps"):
            if item_policy("daily_routine", f"stages.{stage}.{part}", index)[0]:
                helps += [k for k in help_keys(value.get(part)) if k not in helps]
        if helps:
            blocks.item("daily_routine", {"item": stage, "helps": helps[:MAX_DOMAIN_HELPS]})
            blocks.helps("daily_routine", helps)

    needs = _data(cache, "priority_needs").get("needs")
    if isinstance(needs, list) and item_policy("priority_needs", "needs.what_helped", index)[0]:
        for need in needs[:3]:
            if isinstance(need, dict) and is_key(need.get("area")):
                for ai_domain in for_need_area(need["area"]):
                    blocks.helps(ai_domain, help_keys(need.get("what_helped")))
    return blocks.result()


def assessment_domains(cache: dict) -> list[str]:
    """The AI domains the teacher assessment has data for (any relevant value)."""
    return list(assessment_blocks(cache, AI_DOMAINS))


def analysis_domains(cache: dict, observation_domains: Iterable[str] = (), focus_categories: Iterable = ()) -> list[str]:
    """Analysis requests concern the domains with data in the period and the active focus areas."""
    found = set(assessment_domains(cache)) | {d for d in observation_domains or () if d in AI_DOMAINS}
    for category in focus_categories or ():
        if isinstance(category, tuple):
            found |= set(for_focus(*category))
        else:
            found |= set(for_focus(category))
    return _ordered(found)


def teacher_avoid(cache: dict) -> list[str]:
    """Sensitivity keys for the AI ``avoid`` list: ONLY what the teacher observed in Domain 9
    (effect affects or sometimes). Parent-reported sensitivities never become ``avoid``."""
    items = _data(cache, "sensory").get("items") if isinstance(cache, dict) else None
    if not isinstance(items, dict):
        return []
    index = _registry_index()
    out: list[str] = []
    for stimulus, value in _in_order(index, "sensory", "items", items):
        if not is_key(stimulus) or not isinstance(value, dict) or value.get("effect") not in AVOID_EFFECTS:
            continue
        if not item_policy("sensory", f"items.{stimulus}", index)[0]:
            continue
        key = _maps_to(index, f"sensory.items.{stimulus}") or SENSORY_TO_SENSITIVITY.get(stimulus, stimulus)
        if key in NEVER_AVOID or not _valid("sensitivities", key) or key in out:
            continue
        out.append(key)
        if len(out) >= MAX_AVOID:
            break
    return out
