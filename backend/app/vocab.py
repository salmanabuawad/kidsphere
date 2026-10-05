"""The shared vocabulary (app/data/options.json, path from settings.options_path).

File format::

    {"lists": {"<list>": [{"key": "...", "icon": "...", "category": "...",
                            "label": {"en": "...", "ar": "...", "he": "..."}}]},
     "banned_terms": {...}}

(Items with flat ``en``/``ar``/``he`` fields instead of ``label`` are read too.)
The file is loaded once per path and cached. Unknown list names raise KeyError
so typos fail loudly.
"""
import json
from functools import lru_cache
from pathlib import Path

from app.config import settings

LANGS = ("en", "ar", "he")


@lru_cache(maxsize=4)
def _load(path: str) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    lists = data.get("lists") or {}
    index = {name: {item["key"]: item for item in items} for name, items in lists.items()}
    return {"raw": data, "lists": lists, "index": index}


def _data() -> dict:
    return _load(str(settings.options_path))


def reload() -> None:
    _load.cache_clear()


def lists() -> dict[str, list[dict]]:
    """All lists, exactly as in the file (served by GET /api/options)."""
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
    return _data()["raw"].get("banned_terms") or {}
