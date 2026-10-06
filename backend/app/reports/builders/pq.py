"""The parent questionnaire (R2, and the summary inside R1), driven by the
``parent_questionnaire`` registry: every question in source order, the stored
answer or "Not answered", per-section status and "Parent Input" provenance.

Rules:
- Only items whose storage is family data (``PP.*``, ``CH.*``, ``CL.*``, a derived
  age) are questions here. Record metadata (``PQM``) is the "About this
  questionnaire" block; the teacher's part (``TP.bridge``/``QB``) is ``quick_baseline``.
- Display rows (titles, headings, instructions, wildcard paths) are not questions.
  An item whose storage is a prefix of other items (a container such as
  ``PP.expectations.develop``) prints the keys its children do not cover, or only
  its label as a sub-heading.
- An item may keep parts of its answer next to its storage key: ``chips.field``
  (option chips) and ``field`` (its text) in the same section are printed too.
- Sensitivity ``health``/``medical`` prints only with ``include_health``; ``family``
  only with ``include_family``; the private question for the family only with
  ``include_private_notes``. The same applies to a whole registry section.
- Data that exists only in the earlier (legacy) keys is printed under "From the
  earlier form" (the registry's ``meta.legacy`` list, else ``LEGACY_FIELDS``) so
  nothing a family answered before 0002 disappears.
"""
from collections import Counter

from app import vocab
from app.reports import model as m
from app.reports.builders.registry import Registry, loc, storage_key
from app.reports.i18n import to_date
from app.reports.values import (
    WILDCARD,
    get_path,
    is_age_storage,
    item_lists,
    parse_storage,
    render_value,
    sources_tag,
)

NON_QUESTION_KINDS = frozenset({
    "heading", "section", "title", "display", "instruction", "intro", "helper", "principle", "option",
    "guidance", "rule", "format", "meta", "static", "text_block", "subgroup", "subheading", "group_heading",
    "record",
})
QUESTION_ROOTS = ("PP", "CH", "CL")
HEALTH = frozenset({"health", "medical"})
PRIVATE_STORAGE = ("QB.question_for_parent", "TP.bridge.question_for_parent")
EMPTY = (None, "", [], {})


def _sensitivity(entry: dict | None) -> str:
    value = (entry or {}).get("sensitivity")
    return value.strip().lower() if isinstance(value, str) else "none"


def gated(ctx, item: dict | None, section: dict | None = None) -> bool:
    """True when the item (or its section) must stay out of this export."""
    opts = ctx.opts
    for entry in (section, item):
        sens = _sensitivity(entry)
        if sens in HEALTH and not opts.include_health:
            return True
        if sens == "family" and not opts.include_family:
            return True
        if sens == "private" and not opts.include_private_notes:
            return True
    key = storage_key(item) if item else None
    return bool(key and key.startswith(PRIVATE_STORAGE) and not opts.include_private_notes)


def _status(ctx, perspective: dict, section_key: str | None, wording: str = "answers") -> dict:
    raw = (perspective.get("section_status") or {}).get(section_key) if section_key else None
    key = raw.get("status") if isinstance(raw, dict) else raw
    if key not in ("not_started", "in_progress", "sufficient", "review_later"):
        key = "not_started"
    label = ctx.label("section_statuses", key)
    if key == "sufficient" and wording == "answers":
        try:
            short = (vocab.item("section_statuses", "sufficient") or {}).get("short") or {}
            label = short.get(ctx.lang) or short.get("en") or label
        except KeyError:
            pass
    return {"key": key, "label": label}


def _last_stamp(perspective: dict, section_key: str | None) -> dict | None:
    stamps = (perspective.get("entered") or {}).get(section_key) if section_key else None
    if isinstance(stamps, list) and stamps and isinstance(stamps[-1], dict):
        return stamps[-1]
    return None


def parent_source(ctx, section_key: str | None) -> dict | None:
    return sources_tag(ctx, ("parent",), reported_by="parent", stamp=_last_stamp(ctx.parent_p, section_key))


# ---------------------------------------------------------------------------- answers


def _filled_on(ctx):
    q = ctx.parent_p.get("questionnaire") or {}
    return to_date(q.get("filled_at")) or to_date(q.get("submitted_at"))


def _is_age(item: dict) -> bool:
    return item.get("field") == "age" or is_age_storage(item.get("storage"))


def _child_value(ctx, column: str):
    child = ctx.child
    if column == "name":
        return ctx.display_name
    if column == "birth_date":
        return ctx.date(child.birth_date)
    if column in ("additional_languages", "main_language"):
        value = getattr(child, column, None)
        values = value if isinstance(value, list) else [value]
        return [ctx.label("languages", v) for v in values if isinstance(v, str)]
    return getattr(child, column, None)


def _merge(a: dict, b: dict) -> dict:
    texts = {c["text"] for c in a["chips"]}
    a["chips"] += [c for c in b["chips"] if c["text"] not in texts]
    a["lines"] += [line for line in b["lines"] if line not in a["lines"]]
    return a


def item_answer(ctx, item: dict, parsed, skip_keys=()) -> dict:
    not_answered = ctx.tr("markers.not_answered")
    if _is_age(item):
        return m.text_answer(ctx.age_text(_filled_on(ctx)), not_answered)
    if parsed is None:
        return m.answer(marker=not_answered)
    root, path = parsed
    if root == "CH":
        return render_value(ctx, _child_value(ctx, path[0]) if path else None, marker=not_answered)
    if root == "CL":
        value = getattr(ctx.klass, path[0], None) if ctx.klass is not None and path else None
        return render_value(ctx, value, marker=not_answered)
    sections = ctx.parent_p["sections"]
    section = sections.get(path[0]) if path else None
    if isinstance(section, dict) and len(path) > 1:
        skipped = section.get("not_answered")
        if isinstance(skipped, list) and path[1] in skipped:
            return m.answer(marker=not_answered)
    chips = item.get("chips") if isinstance(item.get("chips"), dict) else {}
    # An item without its own options names its list in "chips" (e.g. PQ-EMO-04 calming_helps).
    lists = item_lists(item) or ((chips["options"],) if isinstance(chips.get("options"), str) else ())
    a = render_value(ctx, get_path(sections, path), lists, skip_keys=skip_keys)
    # Parts kept next to the storage key: option chips ("chips": {field, options}) and the text ("field").
    if isinstance(section, dict) and len(path) == 2:
        chips_field = chips.get("field")
        if isinstance(chips_field, str) and chips_field != path[1]:
            lists = (chips["options"],) if isinstance(chips.get("options"), str) else item_lists(item)
            a = _merge(render_value(ctx, section.get(chips_field), lists), a)
        field = item.get("field")
        if isinstance(field, str) and "." not in field and field not in (path[1], chips_field):
            a = _merge(a, render_value(ctx, section.get(field), item_lists(item)))
    return a if m.has_content(a) else m.answer(marker=not_answered)


# ---------------------------------------------------------------------------- the questionnaire


def _questions(items: list) -> list:
    """[(item, parsed)] of the question rows (data roots, no wildcards, no display kinds)."""
    out = []
    for item in items:
        kind = str(item.get("kind") or "").lower()
        if kind in NON_QUESTION_KINDS:
            continue
        parsed = parse_storage(item.get("storage"))
        if parsed is None:
            if _is_age(item):
                out.append((item, None))
            continue
        root, path = parsed
        if root not in QUESTION_ROOTS or not path or WILDCARD in path:
            continue
        out.append((item, parsed))
    return out


def _children_keys(parsed, all_parsed) -> set:
    if parsed is None:
        return set()
    root, path = parsed
    keys = set()
    for other in all_parsed:
        if other is None or other is parsed:
            continue
        o_root, o_path = other
        if o_root == root and len(o_path) > len(path) and o_path[:len(path)] == path:
            keys.add(o_path[len(path)])
    return keys


def pp_section_key(section: dict, questions: list) -> str | None:
    if isinstance(section.get("data_section"), str) and section["data_section"]:
        return section["data_section"]
    keys = [p[1][0] for _, p in questions if p and p[0] == "PP" and p[1]]
    return Counter(keys).most_common(1)[0][0] if keys else None


def questionnaire_sections(ctx, *, summary: bool = False, registry: Registry | None = None) -> list[dict]:
    """[{key, title, pp_key, status, source, rows: [qa_item]}] in source order.
    ``summary`` drops unanswered questions and empty sections (R1)."""
    reg = registry or ctx.registry("parent_questionnaire")
    out = []
    for sec in reg.sections:
        if gated(ctx, None, sec):
            continue
        questions = _questions(reg.items_of(sec))
        if not questions:
            continue
        all_parsed = [p for _, p in questions]
        rows = []
        for item, parsed in questions:
            if gated(ctx, item, sec):
                continue
            label = Registry.label(item, ctx.lang)
            children = _children_keys(parsed, all_parsed)
            a = item_answer(ctx, item, parsed, skip_keys=children)
            if children and not m.has_content(a):
                if not summary:
                    rows.append(m.qa_item(label, m.answer(), heading=True))
                continue
            if summary and not m.has_content(a):
                continue
            rows.append(m.qa_item(label, a))
        if summary and not rows:
            continue
        pp_key = pp_section_key(sec, questions)
        out.append({
            "key": sec["key"],
            "title": Registry.label(sec, ctx.lang),
            "pp_key": pp_key,
            "status": _status(ctx, ctx.parent_p, pp_key),
            "source": parent_source(ctx, pp_key),
            "rows": rows,
        })
    return out


def about_block(ctx) -> dict | None:
    """'Filled on / entered by / meeting' facts (PQM + the entered stamps)."""
    pp = ctx.parent_p
    q = pp.get("questionnaire") or {}
    items = []
    status = q.get("status")
    if status in ("submitted", "draft"):
        text = ctx.tr(f"r2.status_{status}")
        when = to_date(q.get("submitted_at")) if status == "submitted" else None
        items.append({"k": ctx.tr("r2.status"), "v": f"{text} · {ctx.date(when)}" if when else text})
    filled = to_date(q.get("filled_at"))
    if filled:
        items.append({"k": ctx.tr("r2.filled_on"), "v": ctx.date(filled)})
    mode = q.get("entry_mode")
    if mode in ("self", "on_behalf", "meeting"):
        text = ctx.tr(f"r2.mode_{mode}")
        meeting = q.get("meeting") if isinstance(q.get("meeting"), dict) else {}
        if mode == "meeting" and to_date(meeting.get("date")):
            text = f"{text} · {ctx.date(meeting.get('date'))}"
        items.append({"k": ctx.tr("r2.entry_mode"), "v": text})
        attendees = meeting.get("attendees") if isinstance(meeting.get("attendees"), list) else []
        names = [ctx.option_label(("relations",), a) or str(a) for a in attendees if isinstance(a, str)]
        if names:
            items.append({"k": ctx.tr("r2.attendees"), "v": ", ".join(names)})
    staff = []
    for stamps in (pp.get("entered") or {}).values():
        for stamp in stamps if isinstance(stamps, list) else []:
            if isinstance(stamp, dict) and stamp.get("role") in ("admin", "teacher") and stamp.get("by_name"):
                if stamp["by_name"] not in staff:
                    staff.append(stamp["by_name"])
    if staff:
        items.append({"k": ctx.tr("r2.entered_by"), "v": ", ".join(staff)})
    if q.get("school_year"):
        items.append({"k": ctx.tr("r2.school_year"), "v": str(q["school_year"])})
    return m.kv(items)


# ---------------------------------------------------------------------------- earlier (legacy) answers

# Used when the registry has no meta.legacy list: (section.field, option lists, replaced by).
LEGACY_FIELDS = (
    ("who.describe_words", ("describe_words",), ()),
    ("who.appreciate", (), ()),
    ("who.strengths", ("strengths",), ("joy.special_ability",)),
    ("who.interests", ("interests",), ("who.interests_pq",)),
    ("who.motivators", ("motivators",), ("who.what_attracts",)),
    ("emotions.helps_when_sad", ("sad_helps",), ("emotions.when_sad_text",)),
    ("emotions.frustration_reactions", ("frustration_reactions",), ("emotions.frustration_pq",)),
    ("emotions.calming_helps", ("calming_helps",), ()),
    ("emotions.calming_notes", (), ()),
    ("emotions.transition_reaction", ("transition_reactions",), ("transitions.stopping_activity",)),
    ("emotions.transition_helps", ("transition_helps",), ("separation.what_helps_entry", "transitions.which_preparation")),
    ("emotions.morning_separation", ("morning_separation",), ("separation.morning",)),
    ("emotions.what_does_not_help", (), ("behaviour.what_does_not_work",)),
    ("social.social", ("social",), ("social.contact_pq",)),
    ("social.communication", ("communication",), ("communication.expresses_needs", "communication.tells_experiences")),
    ("social.comments", (), ()),
    ("independence.levels", ("independence_areas",), ("independence.levels_pq",)),
    ("independence.notes", (), ("independence.still_helping", "independence.routines_to_keep")),
    ("environment.items", ("sensitivities",), ("health.sensory",)),
    ("environment.notes", (), ()),
    ("priorities.parent_priorities", ("priority_categories",), ("expectations.develop",)),
    ("priorities.hope_child_feels", ("hope_child_feels",), ("expectations.hope_child_feels",)),
    ("priorities.one_thing_to_know", (), ("expectations.most_important",)),
    ("priorities.priorities_note", (), ()),
)
HEALTH_LEGACY = ("environment.",)


def _legacy_answer(ctx, field: str, value, lists) -> dict:
    if field.endswith(".levels") and isinstance(value, dict):
        lines = []
        for area, level in value.items():
            if isinstance(level, str) and level and level != "not_observed":
                lines.append(f"{ctx.label('independence_areas', area)}: {ctx.label('support_levels', level)}")
        return m.answer(lines=lines)
    if field.endswith(".items") and isinstance(value, list):
        lines = []
        for entry in value:
            name = ctx.item_text(entry, ("sensitivities",))
            if not name:
                continue
            parts = [name]
            if isinstance(entry, dict):
                if isinstance(entry.get("what_happens"), str) and entry["what_happens"].strip():
                    parts.append(entry["what_happens"].strip())
                helps = [ctx.item_text(h, ("sensitivity_helps", "what_helps")) for h in entry.get("what_helps") or []]
                helps = [h for h in helps if h]
                if helps:
                    parts.append(ctx.tr("legacy.helps") + ": " + ", ".join(helps))
            lines.append(" · ".join(parts))
        return m.answer(lines=lines)
    return render_value(ctx, value, lists)


def _legacy_defs(ctx, reg: Registry) -> list:
    """[(field, lists, replaced_by, label)] from the registry's meta.legacy, else the built-in table."""
    raw = reg.meta.get("legacy") if isinstance(reg.meta.get("legacy"), list) else None
    if raw:
        out = []
        for entry in raw:
            if not isinstance(entry, dict) or not isinstance(entry.get("field"), str):
                continue
            lists = item_lists(entry)
            replaced = tuple(x for x in entry.get("replaced_by") or () if isinstance(x, str))
            out.append((entry["field"], lists, replaced, loc(entry.get("label"), ctx.lang, "")))
        return out
    return [(f, lists, replaced, "") for f, lists, replaced in LEGACY_FIELDS]


def legacy_rows(ctx, which: str = "parent", registry: Registry | None = None) -> list:
    """qa items for answers kept only in the earlier keys. For the parent perspective a field
    is printed when the registry has no question for it and the keys that replace it are empty."""
    persp = ctx.parent_p if which == "parent" else ctx.teacher_p
    sections = persp["sections"]
    reg = registry or ctx.registry("parent_questionnaire")
    defs = _legacy_defs(ctx, reg) if which == "parent" else [(f, lists, (), "") for f, lists, _ in LEGACY_FIELDS]
    rows = []
    for field, lists, replaced, label in defs:
        if field.startswith(HEALTH_LEGACY) and not ctx.opts.include_health:
            continue
        value = get_path(sections, field.split("."))
        if value in EMPTY:
            continue
        if which == "parent":
            if f"PP.{field}" in reg.by_storage:
                continue
            if any(get_path(sections, path.split(".")) not in EMPTY for path in replaced):
                continue
        a = _legacy_answer(ctx, field, value, lists)
        if m.has_content(a):
            rows.append(m.qa_item(label or ctx.tr(f"legacy.{field}"), a))
    return rows


# ---------------------------------------------------------------------------- the teacher's part (quick baseline)

QB_FIELDS = (
    ("main_strengths", ("strengths", "interests")),
    ("remember", ()),
    ("calms_helps", ("calming_helps", "what_helps", "sensitivity_helps", "transition_helps", "sad_helps")),
    ("may_be_difficult", ()),
    ("first_area_to_observe", ("observation_domains",)),
    ("question_for_parent", ()),
)


def quick_baseline(ctx, registry: Registry | None = None) -> dict | None:
    """The Teacher Quick Baseline (bridge) as a section, or None when it is empty."""
    bridge = ctx.teacher_p["sections"].get("bridge")
    if not isinstance(bridge, dict) or not bridge:
        return None
    reg = registry or ctx.registry("parent_questionnaire")
    rows = []
    for field, lists in QB_FIELDS:
        if field == "question_for_parent" and not ctx.opts.include_private_notes:
            continue
        item = reg.by_storage.get(f"TP.bridge.{field}") or reg.by_storage.get(f"QB.{field}")
        label = Registry.label(item, ctx.lang) if item else ctx.tr(f"qb.{field}")
        a = render_value(ctx, bridge.get(field), tuple(lists) + (item_lists(item) if item else ()))
        if m.has_content(a):
            rows.append(m.qa_item(label, a))
    if not rows:
        return None
    stamp = _last_stamp(ctx.teacher_p, "bridge")
    text = ctx.tr("sources.teacher_observed")
    if stamp and stamp.get("by_name"):
        text += " · " + ctx.tr("sources.entered_by", name=stamp["by_name"])
    # The questionnaire's closing line for the teacher (PQ-TCH-08) introduces her first reading.
    motto = loc(reg.meta.get("motto"), ctx.lang) if reg.present else ""
    return m.section("quick_baseline", ctx.tr("qb.title"), [m.qa(rows)], source=m.tag("teacher_observed", text),
                     status=_status(ctx, ctx.teacher_p, "bridge", wording="observation"), intro=motto or None)
