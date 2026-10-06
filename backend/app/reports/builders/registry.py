"""The static source registries (app/data/source/*.json, COVERAGE-MATRIX §9 shape),
normalised for the builders: sections sorted by ``order``, items sorted by section
order then item order (the same rule as frontend/src/lib/sourceModel.ts).

    reg = load("parent_questionnaire")
    reg.sections                      [{"key", "id", "order", "label", ...}]
    reg.items_of(section)             items of one section, in order
    reg.label(entry, lang)            label in lang, then en, then key/id (never source_he)
    reg.by_storage                    {"PP.joy.likes_at_home": item, ...} (annotations stripped)
"""
from dataclasses import dataclass, field

from app import vocab
from app.reports.values import parse_storage

BIG = 10**9


def _num(value) -> float:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else BIG


def loc(label, lang: str, fallback: str = "") -> str:
    if isinstance(label, dict):
        for key in (lang, "en", "ar", "he"):
            value = label.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    if isinstance(label, str) and label.strip():
        return label.strip()
    return fallback


def storage_key(item: dict) -> str | None:
    parsed = parse_storage(item.get("storage"))
    if not parsed:
        return None
    root, path = parsed
    return ".".join([root, *(str(p) for p in path)])


@dataclass
class Registry:
    name: str
    meta: dict = field(default_factory=dict)
    sections: list = field(default_factory=list)
    items: list = field(default_factory=list)
    by_storage: dict = field(default_factory=dict)

    @property
    def present(self) -> bool:
        return bool(self.items)

    def items_of(self, section: dict) -> list:
        keys = {section.get("key"), section.get("id")} - {None, ""}
        return [i for i in self.items if i.get("section") in keys]

    def section_of(self, key: str) -> dict | None:
        return next((s for s in self.sections if key in (s.get("key"), s.get("id"))), None)

    def find(self, kind: str, storage: str | None = None, domain: str | None = None) -> dict | None:
        """The first item of ``kind`` (optionally with exactly this storage text and domain)."""
        for item in self.items:
            if item.get("kind") != kind:
                continue
            if storage is not None and str(item.get("storage") or "").strip() != storage:
                continue
            if domain is not None and item.get("domain") != domain:
                continue
            return item
        return None

    def meta_text(self, key: str, lang: str) -> str:
        return loc(self.meta.get(key), lang, "")

    @staticmethod
    def label(entry: dict | None, lang: str) -> str:
        if not entry:
            return ""
        return loc(entry.get("label"), lang, str(entry.get("key") or entry.get("id") or ""))


def label_for(ctx, name: str, storage: str, fallback_key: str) -> str:
    """The registry label of the item stored at ``storage`` (e.g. "FS.adaptations"), else the report message."""
    item = ctx.registry(name).by_storage.get(storage)
    return Registry.label(item, ctx.lang) if item else ctx.tr(fallback_key)


def text_for(ctx, name: str, kind: str, fallback_key: str | None = None, *, storage: str | None = None,
             domain: str | None = None) -> str:
    """The label of a static registry row (a heading, rule, cycle or format row), else the report
    message ``fallback_key`` (else ""), so the PDF prints the registry wording where it has one."""
    item = ctx.registry(name).find(kind, storage=storage, domain=domain)
    if item:
        return Registry.label(item, ctx.lang)
    return ctx.tr(fallback_key) if fallback_key else ""


def section_heading(ctx, section_key: str, fallback_key: str) -> str:
    """The observation-model heading row of a section (e.g. "plan" → "Short individual plan")."""
    return text_for(ctx, "observation_model", "heading", fallback_key,
                    storage=f"REG observation_model.sections.{section_key}")


def load(name: str) -> Registry:
    raw = vocab.source_registry(name)
    if not isinstance(raw, dict):
        return Registry(name)
    sections = []
    for s in raw.get("sections") or []:
        if isinstance(s, dict) and (s.get("key") or s.get("id")):
            s = dict(s)
            s["key"] = str(s.get("key") or s.get("id"))
            s["id"] = str(s.get("id") or s.get("key"))
            sections.append(s)
    sections.sort(key=lambda s: _num(s.get("order")))
    rank: dict = {}
    for i, s in enumerate(sections):
        rank.setdefault(s["key"], i)
        rank.setdefault(s["id"], i)
    items = [dict(i) for i in raw.get("items") or [] if isinstance(i, dict) and i.get("id")]
    for item in items:
        item["section"] = str(item.get("section") or "")
    items.sort(key=lambda i: (rank.get(i["section"], BIG), _num(i.get("order"))))
    by_storage = {}
    for item in items:
        key = storage_key(item)
        if key and key not in by_storage:
            by_storage[key] = item
    meta = raw.get("meta") if isinstance(raw.get("meta"), dict) else {}
    return Registry(name, meta, sections, items, by_storage)
