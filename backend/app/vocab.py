"""The shared vocabulary (app/data/options.json, path from settings.options_path),
plus the list fragments and the static source registries next to it.

options.json::

    {"lists": {"<list>": [{"key": "...", "icon": "...", "category": "...",
                            "label": {"en": "...", "ar": "...", "he": "..."},
                            "short": {...}}]},
     "banned_terms": {"clinical": {...}, "child_deficit": {...}, "ai_only": {...},
                      "allow_phrases": {...}}}

(Items with flat ``en``/``ar``/``he`` fields instead of ``label`` are read too.)

List fragments: every ``lists/*.json`` file in the same directory as options.json
holds ``{"lists": {...}}`` only. They are merged into the lists (file name order)
so parallel work packages add their own lists without editing options.json
(``lists/common.json`` holds section_statuses, provenance, ai_domains,
observation_domains, yes_no and yes_no_sometimes). A list name may be defined
once only: a fragment cannot redefine or extend a list (ValueError on load).

Source registries: ``source/*.json`` next to options.json (parent_questionnaire,
observation_model; COVERAGE-MATRIX §9 shape). ``source_model()`` returns
``{name: registry}`` and ``{}`` for a registry that does not exist yet.

Everything is loaded once per path and cached; ``reload()`` clears the caches.
Unknown list names raise KeyError so typos fail loudly. Treat returned data as
read-only.
"""
import json
from functools import lru_cache
from pathlib import Path

from app.config import settings

LANGS = ("en", "ar", "he")
SOURCE_REGISTRIES = ("parent_questionnaire", "observation_model")


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _fragments(options_path: Path) -> list[Path]:
    return sorted((options_path.parent / "lists").glob("*.json"))


@lru_cache(maxsize=4)
def _load(path: str) -> dict:
    options_path = Path(path)
    data = _read(options_path)
    lists = dict(data.get("lists") or {})
    for fragment in _fragments(options_path):
        extra = _read(fragment)
        if not isinstance(extra, dict) or set(extra) != {"lists"} or not isinstance(extra["lists"], dict):
            raise ValueError(f"lists/{fragment.name} must hold only {{\"lists\": {{...}}}}")
        for name, items in extra["lists"].items():
            if name in lists:
                raise ValueError(f"option list {name!r} is defined twice (again in lists/{fragment.name})")
            lists[name] = items
    index = {name: {item["key"]: item for item in items} for name, items in lists.items()}
    return {"raw": data, "lists": lists, "index": index}


def _data() -> dict:
    return _load(str(settings.options_path))


@lru_cache(maxsize=4)
def _source(directory: str) -> dict:
    out: dict = {name: {} for name in SOURCE_REGISTRIES}
    folder = Path(directory)
    if folder.is_dir():
        for path in sorted(folder.glob("*.json")):
            out[path.stem] = _read(path)
    return out


def reload() -> None:
    _load.cache_clear()
    _source.cache_clear()


def lists() -> dict[str, list[dict]]:
    """All lists: options.json first, then the fragments (served by GET /api/options)."""
    return _data()["lists"]


def _index(list_name: str) -> dict[str, dict]:
    index = _data()["index"]
    if list_name not in index:
        raise KeyError(f"unknown option list {list_name!r}")
    return index[list_name]


def keys(list_name: str) -> list[str]:
    return list(_index(list_name).keys())


def is_valid(list_name: str, key: str) -> bool:
    return key in _index(list_name)


def item(list_name: str, key: str) -> dict | None:
    return _index(list_name).get(key)


def label(list_name: str, key: str, lang: str = "en") -> str:
    """The label in ``lang``, falling back to English, then to the key itself."""
    found = _index(list_name).get(key)
    if found is None:
        return key
    labels = found.get("label") if isinstance(found.get("label"), dict) else found
    return labels.get(lang) or labels.get("en") or key


def banned_terms() -> dict:
    """The banned_terms groups of options.json: clinical, child_deficit, ai_only
    (AI output only; never applied to teacher input) and allow_phrases."""
    return _data()["raw"].get("banned_terms") or {}


def source_model() -> dict:
    """The static source registries ({"parent_questionnaire": {...}, "observation_model": {...}};
    ``{}`` for a registry that is not there yet). Served by GET /api/source-model."""
    return _source(str(Path(settings.options_path).parent / "source"))


def source_registry(name: str) -> dict:
    """One registry, ``{}`` when it does not exist (yet)."""
    return source_model().get(name) or {}
