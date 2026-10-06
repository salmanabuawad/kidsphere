"""Registry storage paths and stored answers → printable answers.

Storage paths use the COVERAGE-MATRIX §0.2 codes, e.g. ``PP.joy.likes_at_home``,
``PP.who.interests_pq{selected,other}``, ``QB.main_strengths``,
``TA.social.items.initiates_contact``, ``TA.priority_needs.needs[i].seeing``.
``parse_storage`` keeps the dotted part and drops annotations (``{…}``, ``(…)``,
anything after a space); ``[n]`` becomes an index and ``[i]``/``[…]``/``<s>`` a
wildcard ``"*"``.

``render_value`` turns any stored answer into ``model.answer``: option keys become
labels (chips) through the item's option lists, texts become lines, nested
``{value, text}`` / ``{selected, other}`` / ``{items, text}`` shapes are flattened.
Unknown structured keys are skipped, unknown strings are printed, so a new
registry item never needs a report change and nothing typed is silently lost.

    sources_tag(ctx, sources) / provenance_tags(ctx, labels)   PDF source labels
"""
import re

from app import provenance
from app.reports import model as m
from app.reports.i18n import to_date
from app.reports.render import iso

DATA_ROOTS = ("PP", "PQM", "PSS", "QB", "TP", "CH", "CL", "TA", "TAH", "OBS", "FA", "DR", "FS")
WILDCARD = "*"
_TOKEN = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|<[^>]*>")

# Keys that are bookkeeping, never shown.
INTERNAL_KEYS = frozenset({
    "observation_ids", "entry_id", "based_on", "carried_from", "version_seq", "focus_area_id", "focus_area_ids",
    "plan_ref", "migrated", "by", "at", "derived", "main", "list", "id", "ids", "seq", "mode", "updated_at",
    "updated_by", "entered", "source", "sources", "added_by", "added_at", "not_answered", "status_by", "status_at",
    "clarified_at", "assessment_id", "index",
})
# Keys whose value is an option key (or a list of them), with the lists to try.
KEY_LISTS = {
    "level": ("support_levels",),
    "effect": ("sensory_effects",),
    "frequency": ("observation_frequency",),
    "intensity": ("observation_intensity",),
    "domain": ("observation_domains", "ai_domains"),
    "domains": ("observation_domains", "ai_domains"),
    "area": ("need_areas", "priority_categories"),
    "activity": ("observation_contexts",),
    "context": ("observation_contexts",),
    "contexts": ("observation_contexts",),
    "helps": ("what_helps", "calming_helps", "sensitivity_helps", "transition_helps", "sad_helps"),
    "languages": ("languages",),
    "flags": ("health_food_flags",),
    "strength_keys": ("strengths",),
    "attendees": ("relations",),
    "relation": ("relations",),
    "key": ("involvement_steps", "improvement_levels"),
}
# Keys printed as plain text lines, in this order.
TEXT_KEYS = ("text", "seeing", "how_often", "what_seems_harder", "already_tried", "reaction_text", "succeeds",
             "difficult", "note", "outcome_note", "other_text", "activity_text", "time", "with_whom",
             "before_event", "after_event", "approx_minutes")
YES_NO_LISTS = ("yes_no_sometimes", "yes_no", "pq_degree")
# Lists used to name an unknown nested key (e.g. expectations.develop.emotional).
KEY_NAME_LISTS = ("priority_categories", "observation_domains", "independence_areas", "observation_contexts",
                  "sensitivities")


def _balanced(head: str) -> str:
    """Cut at a "[" or "<" that is not closed (e.g. "QB.main_strengths[exactly 3 when …]")."""
    for opener, closer in (("[", "]"), ("<", ">")):
        pos = 0
        while (start := head.find(opener, pos)) != -1:
            end = head.find(closer, start)
            if end == -1:
                head = head[:start]
                break
            pos = end + 1
    return head.rstrip(".")


def parse_storage(storage) -> tuple[str, list] | None:
    """('PP', ['joy', 'likes_at_home']) or None for registry text, derived values or prose."""
    if not isinstance(storage, str):
        return None
    text = storage.replace("*", "").strip()
    match = re.match(r"[A-Za-z_][A-Za-z0-9_.\[\]<>…≤\-]*", text)
    if not match:
        return None
    head = _balanced(match.group(0))
    parts: list = []
    for token in _TOKEN.findall(head):
        if token.startswith("["):
            inner = token[1:-1]
            parts.append(int(inner) if inner.isdigit() else WILDCARD)
        elif token.startswith("<"):
            parts.append(WILDCARD)
        else:
            parts.append(token)
    if not parts or parts[0] not in DATA_ROOTS:
        return None
    return parts[0], parts[1:]


def is_age_storage(storage) -> bool:
    return isinstance(storage, str) and storage.strip().lower().startswith("derived") and "age" in storage.lower()


def get_path(obj, parts):
    for part in parts:
        if part == WILDCARD:
            return obj
        if isinstance(obj, dict):
            obj = obj.get(part)
        elif isinstance(obj, list) and isinstance(part, int):
            obj = obj[part] if 0 <= part < len(obj) else None
        else:
            return None
        if obj is None:
            return None
    return obj


def item_lists(item: dict) -> tuple:
    raw = item.get("options") if isinstance(item, dict) else None
    if isinstance(raw, str) and raw.strip():
        return (raw.strip(),)
    if isinstance(raw, (list, tuple)):
        return tuple(x for x in raw if isinstance(x, str) and x)
    if isinstance(raw, dict) and isinstance(raw.get("list"), str):
        return (raw["list"],)
    return ()


def _blank(value) -> bool:
    return value is None or value == "" or value == [] or value == {}


class _Builder:
    def __init__(self, ctx, lists, skip_keys=()):
        self.ctx = ctx
        self.lists = tuple(lists or ())
        self.skip = frozenset(skip_keys)
        self.chips: list = []
        self.lines: list = []

    def chip(self, text, tone="neutral"):
        if text and all(c["text"] != text for c in self.chips):
            self.chips.append(m.chip(text, tone))

    def line(self, text):
        if isinstance(text, str) and text.strip():
            self.lines.append(text.strip())

    def scalar(self, value, lists, prefix=""):
        if isinstance(value, bool):
            self.chip(self.ctx.yes_no(value))
            return
        if isinstance(value, (int, float)):
            self.line(f"{prefix}{value}")
            return
        if not isinstance(value, str) or not value.strip():
            return
        label = self.ctx.option_label(lists, value) if lists else None
        if label:
            tone = m.LEVEL_TONES.get(value, "neutral") if "support_levels" in lists else "neutral"
            self.chip(f"{prefix}{label}" if prefix else label, tone)
            return
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}([T ][0-9:.+\-Z]*)?", value.strip()):
            self.line(f"{prefix}{self.ctx.date(value)}")
            return
        self.line(f"{prefix}{value}")

    def vocab_item(self, value: dict, lists):
        label = None
        if value.get("key"):
            label = self.ctx.option_label(lists, value["key"]) or self.ctx.fallback_label(
                lists[0] if lists else "", value["key"])
        elif isinstance(value.get("custom"), str):
            label = value["custom"].strip()
        note = value.get("note") if isinstance(value.get("note"), str) else ""
        if label and note.strip():
            self.line(f"{m.lead(label)} {note.strip()}")
        elif label:
            self.chip(label)

    def add(self, value, lists, depth=0):
        if _blank(value) or depth > 6:
            return
        if isinstance(value, list):
            for item in value:
                self.add(item, lists, depth + 1)
            return
        if not isinstance(value, dict):
            self.scalar(value, lists)
            return
        if ("key" in value or "custom" in value) and not ({"value", "selected", "items"} & value.keys()):
            self.vocab_item(value, lists or KEY_LISTS["key"])
            return
        if isinstance(value.get("name"), str) and value["name"].strip():
            # "<name> (<relation label>)": the name is isolated so the line takes the document's
            # direction (first strong character outside isolates), never the name's.
            rel = self.ctx.option_label(KEY_LISTS["relation"], value.get("relation")) or value.get("relation")
            name = iso(value["name"].strip())
            self.line(f"{name} ({rel})" if rel else name)
            return
        done = set(self.skip) | {"name", "relation"}
        if "value" in value and "value" not in self.skip:
            self.scalar(value["value"], tuple(lists) + YES_NO_LISTS)
            done.add("value")
        for key in ("selected", "items", "keys", "values"):
            if key in value and key not in self.skip:
                self.add(value[key], lists, depth + 1)
                done.add(key)
        for key, key_lists in KEY_LISTS.items():
            if key in value and key not in done and key not in ("key",):
                self.add(value[key], key_lists + tuple(lists), depth + 1)
                done.add(key)
        if "status" in value and "status" not in self.skip and isinstance(value["status"], str):
            msg = f"markers.status_{value['status']}"
            if self.ctx.tr.has(msg):
                self.chip(self.ctx.tr(msg))
            done.add("status")
        for key in TEXT_KEYS:
            if key in value and key not in done:
                if isinstance(value[key], (str, int, float)) and not isinstance(value[key], bool):
                    self.line(str(value[key]))
                else:
                    self.add(value[key], lists, depth + 1)
                done.add(key)
        for key in ("other", "other_text"):
            if key in value and key not in done and isinstance(value[key], str) and value[key].strip():
                self.line(self.ctx.tr("markers.other", text=value[key].strip()))
                done.add(key)
        for key in ("date", "reassessment_on", "filled_at", "submitted_at"):
            if key in value and key not in done:
                d = to_date(value[key])
                if d:
                    self.line(self.ctx.date(d))
                done.add(key)
        for key, nested in value.items():
            if key in done or key in INTERNAL_KEYS or _blank(nested):
                continue
            name = self.ctx.option_label(tuple(lists) + KEY_NAME_LISTS, key)
            if isinstance(nested, str):
                label = self.ctx.option_label(lists, nested) if lists else None
                if label:
                    self.chip(f"{m.lead(name)} {label}" if name else label)
                else:
                    self.line(f"{m.lead(name)} {nested.strip()}" if name else nested)
            elif isinstance(nested, dict) and name:
                inner = render_value(self.ctx, nested, lists)
                parts = [c["text"] for c in inner["chips"]] + inner["lines"]
                if parts:
                    self.line(f"{m.lead(name)} " + " · ".join(parts))
            else:
                self.add(nested, lists, depth + 1)


def render_value(ctx, value, lists=(), skip_keys=(), marker=None) -> dict:
    """Any stored answer as ``model.answer`` (``marker`` when nothing printable is left)."""
    b = _Builder(ctx, lists, skip_keys)
    b.add(value, b.lists)
    if not b.chips and not b.lines:
        return m.answer(marker=marker)
    return m.answer(chips=b.chips, lines=b.lines)


def level_answer(ctx, level, note=None, marker_key="markers.not_observed") -> dict:
    chips = []
    if isinstance(level, str) and level and level != "not_observed":
        chips.append(m.chip(ctx.label("support_levels", level), m.LEVEL_TONES.get(level, "neutral")))
    lines = [note.strip()] if isinstance(note, str) and note.strip() else []
    if not chips and not lines:
        return m.answer(marker=ctx.tr(marker_key))
    if not chips:
        return m.answer(lines=lines, marker=ctx.tr(marker_key))
    return m.answer(chips=chips, lines=lines)


# ---------------------------------------------------------------------------- provenance → PDF labels


def provenance_tags(ctx, labels) -> list:
    return [m.tag(label, ctx.tr(f"sources.{label}")) for label in labels]


def sources_tag(ctx, sources=(), *, reported_by=None, approved=False, stamp=None) -> dict | None:
    """One source tag for the strongest provenance label (AI drafts are never printed unapproved)."""
    badges = provenance.badges(sources or (), stamp=stamp, reported_by=reported_by, approved=approved)
    labels = [b["label"] for b in badges if b["label"] != "ai_suggested"]
    if not labels:
        return None
    first = labels[0]
    text = " · ".join(ctx.tr(f"sources.{label}") for label in labels)
    entered = next((b for b in badges if b.get("entered_by")), None)
    if entered:
        text += " · " + ctx.tr("sources.entered_by", name=entered["entered_by"])
        if entered.get("mode") == "meeting":
            text += " · " + ctx.tr("sources.in_meeting")
    return m.tag(first, text)


def approved_tag(ctx, *, ai: bool, name, when) -> dict:
    """"Teacher-Approved Understanding · approved by …" or "AI-assisted draft, approved by … on …"."""
    name = name or ctx.tr("markers.someone")
    if ai:
        return m.tag("ai_suggested", ctx.tr("sources.ai_approved", name=name, date=ctx.date(when)))
    return m.tag("teacher_approved",
                 ctx.tr("sources.teacher_approved") + " · " + ctx.tr("sources.approved_by", name=name, date=ctx.date(when)))
