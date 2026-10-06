"""The teacher observation (R3, and the summary inside R1), driven by the
``observation_model`` registry and the latest entry of each domain
(teacher_assessment_entries; the shapes of COVERAGE-MATRIX §3.3.5).

- Item domains (D1–D7, D10): a table What we looked at / How much support was
  needed? / Notes. Unrated items print "Not observed yet" (R3) or are left out (R1).
- D8 independence: Daily task / Independent / Needs help / Notes; any support level
  other than independent prints as "Needs help" (OQ-8), always as a word chip.
- D9 environment: In the environment / What happens / What helps. No levels, no score.
- D11 day map: Part of the day / What goes well / What is still hard / Support needed / What helps.
- D12 strengths (ordered) and D13 areas to focus on (≤3 need cards).
- Domain fields (``TA.<d>.fields.*``) follow as questions; "Strengths seen here" chips.
Row order and labels come from the registry; data keys the registry does not know
are appended, so nothing stored is dropped.
"""
from app import vocab
from app.models import ASSESSMENT_DOMAIN_VALUES
from app.reports import model as m
from app.reports.builders.registry import Registry, label_for, text_for
from app.reports.values import (
    WILDCARD,
    YES_NO_LISTS,
    item_lists,
    level_answer,
    parse_storage,
    render_value,
)

ITEM_DOMAINS = ("emotional", "social", "language", "executive_function", "play", "gross_motor", "fine_motor",
                "cognitive")
D8_AREAS = ("eating", "drinking", "toilet", "washing_hands", "dressing", "shoes", "organizing_belongings",
            "keeping_belongings")
D9_STIMULI = ("noise", "touch", "textures", "dirt", "light", "smells", "movement", "crowded_spaces",
              "creative_activities")
D11_STAGES = ("arrival", "free_play", "group_time", "structured_activity", "yard", "meal", "art", "transition",
              "end_of_day")
D11_COLUMNS = ("succeeds", "difficult", "support_needed", "what_helps")
NEED_FIELDS = ("seeing", "how_often", "situations", "what_seems_harder", "already_tried", "what_helped")
HELP_LISTS = ("what_helps", "calming_helps", "sensitivity_helps", "transition_helps")


class DomainIndex:
    """Registry rows per assessment domain."""

    def __init__(self, reg: Registry):
        self.reg = reg
        self.d = {d: {"items": [], "fields": [], "stages": [], "columns": {}, "needs": {}, "subgroups": {}}
                  for d in ASSESSMENT_DOMAIN_VALUES}
        for item in reg.items:
            subgroup = item.get("subgroup")
            kind = str(item.get("kind") or "").lower()
            parsed = parse_storage(item.get("storage"))
            domain = item.get("domain") if item.get("domain") in self.d else None
            if parsed and parsed[0] == "TA" and parsed[1] and parsed[1][0] in self.d:
                domain = parsed[1][0]
            if domain is None:
                continue
            if kind in ("subgroup", "subheading", "heading") and isinstance(subgroup, str):
                self.d[domain]["subgroups"][subgroup] = item
                continue
            if not parsed or parsed[0] != "TA":
                continue
            rest = parsed[1][1:]
            entry = self.d[domain]
            if domain == "strengths":
                if rest[:1] == ["fields"] and len(rest) >= 2:
                    entry["fields"].append((rest[1], item))
                continue
            if domain == "priority_needs":
                if len(rest) >= 3 and rest[0] == "needs" and rest[1] == WILDCARD:
                    entry["needs"].setdefault(rest[2], item)
                continue
            if rest[:1] == ["items"] and len(rest) == 2 and rest[1] != WILDCARD:
                entry["items"].append((rest[1], item))
            elif rest[:1] == ["fields"] and len(rest) >= 2 and rest[1] != WILDCARD:
                if all(rest[1] != k for k, _ in entry["fields"]):
                    entry["fields"].append((rest[1], item))
            elif rest[:1] == ["stages"] and len(rest) == 2 and rest[1] != WILDCARD:
                entry["stages"].append((rest[1], item))
            elif rest[:1] == ["stages"] and len(rest) >= 3 and rest[1] == WILDCARD:
                entry["columns"].setdefault(rest[2], item)

    def title(self, ctx, domain: str) -> str:
        section = self.reg.section_of(domain)
        if section:
            return Registry.label(section, ctx.lang)
        return ctx.label("observation_domains", domain)


def _data(entry) -> dict:
    return entry.data if entry is not None and isinstance(entry.data, dict) else {}


def _entry_source(ctx, entry):
    if entry is None:
        return None
    text = ctx.tr("sources.teacher_observed")
    if entry.entered_by_name:
        text += " · " + ctx.tr("sources.entered_by_on", name=entry.entered_by_name, date=ctx.date(entry.entered_at))
    return m.tag("teacher_observed", text)


def _label(ctx, item, fallback_key, fallback_list=None) -> str:
    """Registry label, else the option label, else the report messages, else the key."""
    if item:
        return Registry.label(item, ctx.lang)
    if fallback_list:
        found = ctx.option_label((fallback_list,), fallback_key)
        if found:
            return found
        return ctx.fallback_label(fallback_list, str(fallback_key))
    return ctx.fallback_label("om_items", str(fallback_key))


def _ordered(registry_rows, data_keys, default=()):
    """Registry order, then the defaults, then any other stored key."""
    keys = [k for k, _ in registry_rows]
    for key in [*default, *data_keys]:
        if key not in keys:
            keys.append(key)
    lookup = dict(registry_rows)
    return [(k, lookup.get(k)) for k in keys]


def format_columns(ctx, domain: str, fallback: list) -> list:
    """Table headers from the registry's format row of the domain ("Item / How much support was
    needed? / Notes"; the Domain 1 row serves every rated item domain), else ``fallback``."""
    reg = ctx.registry("observation_model")
    item = reg.find("format", storage=f"TA.{domain}.items")
    if item is None and domain in ITEM_DOMAINS:
        item = next((reg.find("format", storage=f"TA.{d}.items") for d in ITEM_DOMAINS
                     if reg.find("format", storage=f"TA.{d}.items")), None)
    if item is not None:
        parts = [p.strip() for p in Registry.label(item, ctx.lang).split(" / ")]
        if len(parts) == len(fallback) and all(parts):
            return parts
    return fallback


def _items_table(ctx, idx, domain, data, summary):
    stored = data.get("items") if isinstance(data.get("items"), dict) else {}
    rows, last_group = [], None
    for key, item in _ordered(idx.d[domain]["items"], stored.keys()):
        value = stored.get(key) if isinstance(stored.get(key), dict) else {}
        level, note = value.get("level"), value.get("note")
        if summary and (not level or level == "not_observed") and not (isinstance(note, str) and note.strip()):
            continue
        group = item.get("subgroup") if item else None
        if group and group != last_group:
            sub = idx.d[domain]["subgroups"].get(group)
            rows.append(m.sub_row(Registry.label(sub, ctx.lang) if sub else ctx.fallback_label("om_subgroups", group)))
            last_group = group
        level_cell = level_answer(ctx, level, None)
        notes = []
        if isinstance(note, str) and note.strip():
            notes.append(note.strip())
        seen = ctx.option_label(("observation_contexts",), value.get("seen_in"))
        if seen:
            notes.append(ctx.tr("r3.seen_in", place=seen))
        rows.append(m.row([m.text_answer(_label(ctx, item, key)), level_cell, m.answer(lines=notes)]))
    columns = format_columns(ctx, domain, [ctx.tr("r3.col_item"), ctx.tr("r3.col_support"), ctx.tr("r3.col_notes")])
    return m.table(columns, rows, kind="levels", widths=["44%", "24%", "32%"])


def _parent_independence(ctx) -> dict:
    """{area: answer} of what the family said (PP.independence.levels_pq + help_amount; PQ-IND-02..09)."""
    if not ctx.opts.include_parent:
        return {}
    section = (ctx.parent_p.get("sections") or {}).get("independence")
    section = section if isinstance(section, dict) else {}
    levels = section.get("levels_pq") if isinstance(section.get("levels_pq"), dict) else {}
    amounts = section.get("help_amount") if isinstance(section.get("help_amount"), dict) else {}
    out = {}
    for area, level in levels.items():
        if not isinstance(level, str) or not level:
            continue
        chips = [m.chip(ctx.label("pq_independence_levels", level))]
        amount = amounts.get(area)
        if isinstance(amount, str) and amount:
            chips.append(m.chip(ctx.label("pq_help_amount", amount)))
        out[area] = m.answer(chips=chips)
    return out


def _independence_table(ctx, idx, data, summary):
    stored = data.get("items") if isinstance(data.get("items"), dict) else {}
    parent = _parent_independence(ctx)
    rows = []
    for key, item in _ordered(idx.d["independence"]["items"], [*stored.keys(), *parent.keys()], D8_AREAS):
        value = stored.get(key) if isinstance(stored.get(key), dict) else {}
        level, note = value.get("level"), value.get("note")
        observed = isinstance(level, str) and level not in ("", "not_observed")
        if summary and not observed and key not in parent:
            continue
        independent = m.answer(chips=[m.chip(ctx.tr("r3.independent"), "leaf")]) if level == "independent" else m.answer()
        needs = m.answer(chips=[m.chip(ctx.tr("r3.needs_help"), "sky")]) if observed and level != "independent" else m.answer()
        notes = m.text_answer(note) if isinstance(note, str) and note.strip() else m.answer()
        if not observed:
            notes = m.answer(lines=notes["lines"], marker=ctx.tr("markers.not_observed"))
        label = _label(ctx, item, key, "independence_areas")
        cells = [m.text_answer(label), independent, needs, notes]
        if parent:
            cells.append(parent.get(key) or m.answer())
        rows.append(m.row(cells))
    columns = format_columns(ctx, "independence", [ctx.tr("r3.col_task"), ctx.tr("r3.independent"),
                                                   ctx.tr("r3.needs_help"), ctx.tr("r3.col_notes")])
    if parent:  # the family's own answer next to the teacher's (R3§8 "Parent said")
        return m.table([*columns, ctx.tr("sources.parent_said")], rows, kind="independence",
                       widths=["24%", "15%", "15%", "26%", "20%"])
    return m.table(columns, rows, kind="independence", widths=["30%", "18%", "18%", "34%"])


def _sensory_table(ctx, idx, data, summary):
    stored = data.get("items") if isinstance(data.get("items"), dict) else {}
    rows = []
    for key, item in _ordered(idx.d["sensory"]["items"], stored.keys(), D9_STIMULI):
        value = stored.get(key) if isinstance(stored.get(key), dict) else {}
        effect = value.get("effect")
        observed = isinstance(effect, str) and effect not in ("", "not_observed")
        text = value.get("reaction_text")
        if summary and not observed and not (isinstance(text, str) and text.strip()):
            continue
        happens = []
        if observed:
            happens.append(m.chip(ctx.label("sensory_effects", effect), "neutral"))
        lines = [text.strip()] if isinstance(text, str) and text.strip() else []
        what = m.answer(chips=happens, lines=lines) if happens or lines else m.answer(marker=ctx.tr("markers.not_observed"))
        helps = render_value(ctx, value.get("helps"), HELP_LISTS)
        rows.append(m.row([m.text_answer(_label(ctx, item, key, "sensitivities")), what, helps]))
    return m.table([ctx.tr("r3.col_stimulus"), ctx.tr("r3.col_happens"), ctx.tr("r3.col_helps")], rows,
                   kind="sensory", widths=["30%", "38%", "32%"])


def _parent_sensory_note(ctx) -> dict | None:
    """Under the D9 table: what the family said about sensitivities (PQ-HLT-03, a health answer:
    only with include_health and include_parent)."""
    if not (ctx.opts.include_health and ctx.opts.include_parent):
        return None
    health = (ctx.parent_p.get("sections") or {}).get("health")
    value = health.get("sensory") if isinstance(health, dict) else None
    answer = render_value(ctx, value, ("sensitivities",))
    if not m.has_content(answer):
        return None
    item = ctx.registry("parent_questionnaire").by_storage.get("PP.health.sensory")
    question = Registry.label(item, ctx.lang) if item else ctx.tr("sources.parent_said")
    return m.qa([m.qa_item(question, answer, source=m.tag("parent_said", ctx.tr("sources.parent_said")))])


def _day_map_table(ctx, idx, data, summary):
    stored = data.get("stages") if isinstance(data.get("stages"), dict) else {}
    columns = idx.d["daily_routine"]["columns"]
    headers = [ctx.tr("r3.col_stage")] + [
        Registry.label(columns[c], ctx.lang) if c in columns else ctx.tr(f"r3.col_{c}") for c in D11_COLUMNS]
    rows = []
    for key, item in _ordered(idx.d["daily_routine"]["stages"], stored.keys(), D11_STAGES):
        value = stored.get(key) if isinstance(stored.get(key), dict) else {}
        cells = [render_value(ctx, value.get(c), HELP_LISTS) for c in D11_COLUMNS]
        if summary and not any(m.has_content(c) for c in cells):
            continue
        if not any(m.has_content(c) for c in cells):
            cells[0] = m.answer(marker=ctx.tr("markers.not_observed"))
        rows.append(m.row([m.text_answer(_label(ctx, item, key, "observation_contexts"))] + cells))
    return m.table(headers, rows, kind="day_map", widths=["16%", "21%", "21%", "21%", "21%"])


def _strengths_block(ctx, data):
    items = data.get("items") if isinstance(data.get("items"), list) else []
    texts = []
    for entry in items[:5]:
        if not isinstance(entry, dict):
            continue
        lists = ("interests", "strengths") if entry.get("list") == "interests" else ("strengths", "interests")
        name = ctx.item_text(entry, lists)
        if not name:
            continue
        note = entry.get("note")
        texts.append(f"{name}: {note.strip()}" if isinstance(note, str) and note.strip() else name)
    return m.bullet_list(texts, ordered=True)


def _needs_block(ctx, idx, data, focus_titles):
    needs = data.get("needs") if isinstance(data.get("needs"), list) else []
    labels = idx.d["priority_needs"]["needs"]
    out = []
    for need in needs[:3]:
        if not isinstance(need, dict):
            continue
        area = need.get("area")
        title = ctx.option_label(("need_areas",), area) or (ctx.fallback_label("need_areas", area) if area else "")
        parts = []
        for field in NEED_FIELDS:
            a = render_value(ctx, need.get(field), HELP_LISTS + ("observation_contexts",))
            if m.has_content(a):
                label = Registry.label(labels[field], ctx.lang) if field in labels else ctx.tr(f"r3.need_{field}")
                parts.append({"k": label, "v": a})
        focus = focus_titles.get(str(need.get("focus_area_id"))) if need.get("focus_area_id") else None
        if focus:
            parts.append({"k": ctx.tr("r3.need_focus"), "v": m.text_answer(focus)})
        out.append({"title": title or ctx.tr("r3.need_untitled"), "meta": None, "answer": None, "source": None,
                    "parts": parts})
    return m.entries(out)


def _fields_block(ctx, idx, domain, data, summary):
    stored = data.get("fields") if isinstance(data.get("fields"), dict) else {}
    rows = []
    for key, item in _ordered(idx.d[domain]["fields"], stored.keys()):
        lists = (item_lists(item) if item else ()) + YES_NO_LISTS + HELP_LISTS + ("interests", "strengths",
                                                                                 "observation_contexts")
        a = render_value(ctx, stored.get(key), lists, marker=None if summary else ctx.tr("markers.not_observed"))
        if summary and not m.has_content(a):
            continue
        label = Registry.label(item, ctx.lang) if item else ctx.fallback_label("om_fields", key)
        rows.append(m.qa_item(label, a))
    return m.qa(rows)


def domain_section(ctx, idx: DomainIndex, domain: str, entry, *, summary: bool, focus_titles: dict) -> dict | None:
    data = _data(entry)
    if summary and not data:
        return None
    status_key = entry.status if entry is not None else "not_started"
    status = {"key": status_key, "label": ctx.label("section_statuses", status_key)}
    blocks = []
    if domain == "cognitive":
        blocks.append(m.para(ctx.tr("r3.play_not_test"), muted=True))
    if domain in ITEM_DOMAINS:
        blocks.append(_items_table(ctx, idx, domain, data, summary))
    elif domain == "independence":
        blocks.append(_independence_table(ctx, idx, data, summary))
    elif domain == "sensory":
        blocks.append(m.para(ctx.tr("r3.no_score"), muted=True) if not summary else None)
        blocks.append(_sensory_table(ctx, idx, data, summary))
        blocks.append(_parent_sensory_note(ctx))
    elif domain == "daily_routine":
        blocks.append(_day_map_table(ctx, idx, data, summary))
    elif domain == "strengths":
        if not summary:
            blocks.append(m.para(text_for(ctx, "observation_model", "rule", "r3.strengths_guidance", domain=domain),
                                 muted=True))
        blocks.append(_strengths_block(ctx, data))
    elif domain == "priority_needs":
        if not summary:
            blocks.append(m.para(text_for(ctx, "observation_model", "rule", domain=domain), muted=True))
        blocks.append(_needs_block(ctx, idx, data, focus_titles))
    blocks.append(_fields_block(ctx, idx, domain, data, summary))
    here = data.get("strengths_here")
    if here:
        a = render_value(ctx, here, ("strengths", "interests"))
        if m.has_content(a):
            blocks.append(m.qa([m.qa_item(ctx.tr("r3.strengths_here"), a)]))
    if data.get("carried_from"):
        blocks.append(m.para(ctx.tr("r3.carried_from"), muted=True))
    blocks = [b for b in blocks if b]
    if not data and not summary and not any(b["type"] == "table" for b in blocks):
        # R3 prints every domain of the source in full (its rows say "Not observed yet"); a domain
        # without a table says it once.
        blocks.append(m.para(ctx.tr("markers.not_observed"), muted=True))
    if summary and not any(b["type"] != "para" for b in blocks):
        return None
    return m.section(f"domain-{domain}", idx.title(ctx, domain), blocks, source=_entry_source(ctx, entry),
                     status=status)


def domain_sections(ctx, assessment, *, summary: bool = False) -> list:
    idx = DomainIndex(ctx.registry("observation_model"))
    entries = ctx.latest_entries(assessment)
    focus_titles = {str(f.id): f.title for f in ctx.focus_areas()}
    out = []
    for domain in ASSESSMENT_DOMAIN_VALUES:
        sec = domain_section(ctx, idx, domain, entries.get(domain), summary=summary, focus_titles=focus_titles)
        if sec:
            out.append(sec)
    return out


# ---------------------------------------------------------------------------- cycle header and principles


def cycle_facts(ctx, assessment) -> dict | None:
    if assessment is None:
        return None
    snap = assessment.child_snapshot if isinstance(assessment.child_snapshot, dict) else {}
    age = snap.get("age_at_fill") if isinstance(snap.get("age_at_fill"), dict) else None
    age_text = ctx.tr.age(int(age.get("years") or 0), int(age.get("months") or 0)) if age else ctx.age_text(
        assessment.filled_on)
    kind = ctx.tr(f"r3.kind_{assessment.kind}") if assessment.kind in ("initial", "reassessment") else assessment.kind
    status = ctx.tr("r3.cycle_open") if assessment.status == "open" else ctx.tr(
        "r3.cycle_closed", date=ctx.date(assessment.closed_at))
    period = ""
    if assessment.period_from or assessment.period_to:
        period = ctx.range_text(assessment.period_from, assessment.period_to)
    teacher = ctx.user_name(assessment.teacher_id) or snap.get("teacher_name")
    filled_by = assessment.filled_by_text or ctx.user_name(assessment.created_by)
    def k(storage: str, fallback_key: str) -> str:  # section A labels come from the registry rows
        return label_for(ctx, "observation_model", storage, fallback_key)

    items = [
        {"k": k("TAH.child_snapshot.name", "header.child"),
         "v": snap.get("preferred_name") or snap.get("name") or ctx.display_name},
        {"k": ctx.tr("r3.age_at_fill"), "v": age_text},  # not just "Age": the header shows the age today
        {"k": k("TAH.child_snapshot.birth_date", "header.birth_date"),
         "v": ctx.date(snap.get("birth_date") or ctx.child.birth_date)},
        {"k": k("TAH.child_snapshot.kindergarten", "header.kindergarten"),
         "v": snap.get("kindergarten") or (ctx.klass.kindergarten if ctx.klass else "")},
        {"k": ctx.tr("r3.cycle"), "v": f"{kind} · {status}"},
        {"k": k("TAH.filled_on", "r3.filled_on"), "v": ctx.date(assessment.filled_on)},
        {"k": k("TAH.period_from", "header.period"), "v": period},
        {"k": ctx.tr("r3.period_note"), "v": assessment.period_note or ""},
        {"k": k("TAH.teacher_id", "r3.teacher"), "v": teacher or ""},
        {"k": k("TAH.filled_by_text", "r3.filled_by"), "v": filled_by or ""},
    ]
    return m.kv(items)


def model_section(ctx) -> dict | None:
    """R3 "about this observation": the model's title (source line), subtitle, purpose, the guiding
    questions and sequence (closing principles) and how the tables read (registry meta / rows)."""
    reg = ctx.registry("observation_model")
    if not reg.present:
        return None
    title = reg.meta_text("title", ctx.lang)
    blocks = [m.para(reg.meta_text("subtitle", ctx.lang)), m.para(reg.meta_text("purpose", ctx.lang)),
              m.para(reg.meta_text("motto", ctx.lang)), m.para(reg.meta_text("sequence", ctx.lang)),
              m.para(text_for(ctx, "observation_model", "format", storage="TA.items.level"), muted=True)]
    blocks = [b for b in blocks if b]
    if not title or not blocks:
        return None
    return m.section("model", title, blocks)


def principles_block(ctx) -> dict | None:
    try:
        texts = [vocab.label("observation_principles", k, ctx.lang) for k in vocab.keys("observation_principles")]
    except KeyError:
        texts = []
    if not texts:
        texts = list(ctx.tr.raw("r3.principles") or [])
    return m.bullet_list(texts)


# ---------------------------------------------------------------------------- structured observations (Domain 14)


D14_STORAGE = {
    "a": "OBS.details.what_i_see",
    "b": "OBS.details.when_detail",
    "c": "OBS.details.needs",
    "d": "OBS.details.what_we_did",
    "e": "OBS.details.did_it_change",
    "doc": "OBS.details.documentation",
}


def d14_label(ctx, key: str) -> str:
    return label_for(ctx, "observation_model", D14_STORAGE[key], f"r3.d14_{key}")


def _when_label(ctx, field: str) -> str:
    return label_for(ctx, "observation_model", f"OBS.details.when_detail.{field}", f"r3.when_{field}")


def _d14_parts(ctx, obs, focus_title=None) -> list:
    """[{id, k, v}] for the A–E stages of one structured observation (id: a, b, c, d, e, doc)."""
    details = obs.details if isinstance(obs.details, dict) else {}
    parts = []

    def add(key, value, lists=()):
        a = render_value(ctx, value, lists)
        if m.has_content(a):
            parts.append({"id": key, "k": d14_label(ctx, key), "v": a})

    add("a", details.get("what_i_see") or obs.observation)
    when = details.get("when_detail") if isinstance(details.get("when_detail"), dict) else None
    if when:
        when_lines = []
        for field in ("time", "activity", "activity_text", "with_whom", "before_event", "after_event"):
            value = when.get(field)
            if not isinstance(value, str) or not value.strip():
                continue
            if field == "activity":
                value = ctx.option_label(("observation_contexts",), value) or value
            when_lines.append(f"{m.lead(_when_label(ctx, field))} {value.strip()}")
        if when_lines:
            parts.append({"id": "b", "k": d14_label(ctx, "b"), "v": m.answer(lines=when_lines)})
    else:
        add("b", details.get("when"))
    add("c", details.get("needs") or details.get("what_needed"), HELP_LISTS)
    d_answer = render_value(ctx, details.get("what_we_did"))
    if focus_title:
        d_answer["lines"].append(ctx.tr("r3.linked_focus", title=focus_title))
    if m.has_content(d_answer):
        parts.append({"id": "d", "k": d14_label(ctx, "d"), "v": d_answer})
    change = details.get("did_it_change")
    e_lines = []
    if change in ("yes", "partly", "no"):
        e_lines.append(ctx.tr(f"r3.change_{change}"))
    if isinstance(details.get("what_changed"), str) and details["what_changed"].strip():
        item = ctx.registry("observation_model").by_storage.get("OBS.details.what_changed")
        text = details["what_changed"].strip()
        e_lines.append(f"{m.lead(Registry.label(item, ctx.lang))} {text}" if item else text)
    if e_lines:
        parts.append({"id": "e", "k": d14_label(ctx, "e"), "v": m.answer(lines=e_lines)})
    add("doc", details.get("documentation"))
    return parts


def structured_observations(ctx, rows) -> dict | None:
    items = []
    for r in rows:
        obs = r["obs"]
        if not isinstance(obs.details, dict) or not obs.details:
            continue
        context = ctx.option_label(("observation_contexts",), obs.context)
        title = context or ctx.tr("r3.observation")
        items.append({"title": title, "meta": ctx.date(obs.observed_at), "answer": None,
                      "source": m.tag("teacher_observed", ctx.tr("sources.teacher_observed")),
                      "parts": _d14_parts(ctx, obs, r.get("focus_title"))})
    return m.entries(items)


def cycle_range(ctx, assessment):
    """The structured-observation range for R3: the request range, else the cycle period."""
    if ctx.opts.date_from or ctx.opts.date_to:
        return ctx.opts.date_from, ctx.opts.date_to
    if assessment is not None and (assessment.period_from or assessment.period_to):
        return assessment.period_from, assessment.period_to
    return None, None
