"""Building blocks shared by several reports: basics, merged lists with sources,
baselines, plans (Domain 15), observations, activities, reviews with follow-up
(Domain 16), the approved functional summary (Domain 17), the current
understanding and the timeline entries.

Only teacher-approved AI text is ever printed, labelled "AI-assisted draft,
approved by {name} on {date}"; drafts and pending AI suggestions are never read.
"""
from datetime import date

from app.reports import model as m
from app.reports.i18n import to_date
from app.reports.builders.registry import Registry, label_for
from app.reports.values import approved_tag, render_value, sources_tag

PLAN_WIDTHS = ["19%", "21%", "13%", "13%", "20%", "14%"]
OBS_WIDTHS = ["12%", "14%", "38%", "18%", "18%"]  # the support chip needs room (never split)
HELP_LISTS = ("what_helps", "calming_helps", "sensitivity_helps", "transition_helps", "sad_helps")


def basics(ctx) -> dict:
    child, klass, o = ctx.child, ctx.klass, ctx.opts
    languages = [child.main_language, *[x for x in (child.additional_languages or []) if x != child.main_language]]
    items = [
        {"k": ctx.tr("header.child"), "v": child.name},
        {"k": ctx.tr("header.preferred_name"), "v": child.preferred_name if child.preferred_name != child.name else ""},
        {"k": ctx.tr("header.birth_date"), "v": ctx.date(child.birth_date)},
        {"k": ctx.tr("header.age"), "v": ctx.age_text()},
        {"k": ctx.tr("header.class"), "v": klass.name if klass else ""},
        {"k": ctx.tr("header.kindergarten"), "v": klass.kindergarten if klass else ""},
        {"k": ctx.tr("header.languages"), "v": ", ".join(ctx.label("languages", x) for x in languages if x)},
        {"k": ctx.tr("header.parent_name"), "v": child.parent_name or ""},
    ]
    if o.include_family:
        items.append({"k": ctx.tr("header.parent_contact"), "v": child.parent_contact or ""})
    return m.kv(items)


# ---------------------------------------------------------------------------- strengths, interests, what helps

LIST_OPTIONS = {
    "strengths": ("strengths", "strength_targets"),
    "interests": ("interests",),
    "what_helps": HELP_LISTS,
}


def merged_list_chips(ctx, name: str) -> dict | None:
    items = []
    for entry in ctx.merged_list(name):
        if not isinstance(entry, dict) and not isinstance(entry, str):
            continue
        lists = (entry.get("list"),) + LIST_OPTIONS[name] if isinstance(entry, dict) and entry.get("list") else LIST_OPTIONS[name]
        text = ctx.item_text(entry, tuple(x for x in lists if x))
        if not text:
            continue
        sources = entry.get("sources") if isinstance(entry, dict) else ()
        star = isinstance(entry, dict) and entry.get("main") is True
        items.append({"text": text, "tone": "sun" if star else "neutral", "tag": sources_tag(ctx, sources or ()),
                      "note": ctx.tr("lists.main") if star else None})
    items.sort(key=lambda i: 0 if i["note"] else 1)
    return m.chips(items)


def lists_section(ctx, names=("strengths", "interests", "what_helps")) -> dict:
    blocks = []
    for name in names:
        block = merged_list_chips(ctx, name)
        blocks.append({"type": "heading", "text": ctx.tr(f"lists.{name}"), "status": None})
        blocks.append(block or m.para(ctx.tr("markers.nothing_yet"), muted=True))
    return m.section("lists", ctx.tr("sections.lists"), blocks)


# ---------------------------------------------------------------------------- baselines


def _baseline_items(ctx, data: dict, name: str) -> list:
    out = []
    for entry in data.get(name) or []:
        text = ctx.item_text(entry, LIST_OPTIONS.get(name, (name,)))
        if text:
            out.append(text)
    return out


def baseline_blocks(ctx, row, title: str) -> list:
    data = row.baseline_data if isinstance(row.baseline_data, dict) else {}
    by = data.get("created_by_name") or ctx.user_name(row.created_by)
    blocks = [{"type": "heading", "text": title, "status": None},
              m.para(ctx.tr("baseline.created", date=ctx.date(row.created_at), name=by or ctx.tr("markers.someone")),
                     muted=True)]
    rows = []
    for name in ("strengths", "interests", "what_helps"):
        texts = _baseline_items(ctx, data, name)
        if texts:
            rows.append(m.qa_item(ctx.tr(f"lists.{name}"), m.answer(chips=[m.chip(t) for t in texts])))
    focus = [f.get("title") for f in data.get("focus_areas") or [] if isinstance(f, dict) and f.get("title")]
    if focus:
        rows.append(m.qa_item(ctx.tr("baseline.focus"), m.answer(lines=focus)))
    support = data.get("support_needs") if isinstance(data.get("support_needs"), dict) else {}
    levels = []
    for entry in support.get("independence") or []:
        if isinstance(entry, dict) and entry.get("area") and entry.get("level"):
            levels.append(f"{ctx.label('independence_areas', entry['area'])}: {ctx.label('support_levels', entry['level'])}")
    if levels:
        rows.append(m.qa_item(ctx.tr("baseline.independence"), m.answer(lines=levels)))
    blocks.append(m.qa(rows) or m.para(ctx.tr("markers.nothing_yet"), muted=True))
    return blocks


def baselines_section(ctx) -> dict | None:
    rows = ctx.baselines()
    if not rows:
        return None
    blocks = baseline_blocks(ctx, rows[0], ctx.tr("baseline.original"))
    if len(rows) > 1:
        blocks += baseline_blocks(ctx, rows[-1], ctx.tr("baseline.latest"))
    return m.section("baselines", ctx.tr("sections.baselines"), blocks,
                     source=m.tag("teacher_observed", ctx.tr("sources.teacher_observed")))


# ---------------------------------------------------------------------------- plan (Domain 15)


PLAN_COLUMN_STORAGE = (  # Domain 15 columns: registry label (observation_model) else the report message
    ("goal", "FA.title"),
    ("method", "FA.plan.what_we_will_do"),
    ("frequency", "FA.plan.frequency"),
    ("who", "FA.plan.who"),
    ("success", "FA.plan.success_looks_like"),
    ("follow_up", "FA.follow_up_on"),
)


def plan_columns(ctx) -> list:
    return [label_for(ctx, "observation_model", storage, f"plan.{key}") for key, storage in PLAN_COLUMN_STORAGE]


def _plan(fa) -> dict:
    return fa.plan if isinstance(fa.plan, dict) else {}


def follow_up_text(ctx, fa) -> str:
    if fa.follow_up_on:
        return ctx.date(fa.follow_up_on)
    review_on = _plan(fa).get("review_on")
    d = to_date(review_on) if isinstance(review_on, str) else None
    return ctx.date(d) if d else (review_on.strip() if isinstance(review_on, str) else "")


def plan_rows(ctx, focus_areas) -> list:
    rows = []
    for fa in focus_areas:
        plan = _plan(fa)
        goal = m.answer(lines=[fa.title], chips=[m.chip(ctx.label("priority_categories", fa.category))] if fa.category else [])
        if fa.description:
            goal["lines"].append(fa.description)
        cells = [goal] + [m.text_answer(plan.get(k)) for k in ("what_we_will_do", "frequency", "who",
                                                              "success_looks_like")]
        cells.append(m.text_answer(follow_up_text(ctx, fa)))
        rows.append(m.row(cells))
        detail = m.detail_row([{"k": ctx.tr(f"plan.{k}"), "v": m.text_answer(plan.get(k))}
                               for k in ("strength_used", "need", "adaptation")])
        if detail:
            rows.append(detail)
    return rows


def plan_table(ctx, focus_areas) -> dict | None:
    return m.table(plan_columns(ctx), plan_rows(ctx, focus_areas), kind="plan", widths=PLAN_WIDTHS)


def active_focus(ctx) -> list:
    return [f for f in ctx.focus_areas() if f.status == "active"]


def closed_focus_entries(ctx, date_from: date | None, date_to: date | None) -> dict | None:
    items = []
    for fa in ctx.focus_areas():
        if fa.status == "active" or fa.closed_at is None:
            continue
        closed = to_date(fa.closed_at)
        if (date_from and closed < date_from) or (date_to and closed > date_to):
            continue
        status = ctx.label("focus_statuses", fa.status)
        items.append({"title": fa.title, "meta": ctx.date(fa.closed_at), "source": None,
                      "answer": m.answer(chips=[m.chip(status, "leaf" if fa.status == "completed" else "muted")],
                                         lines=[fa.close_reason] if fa.close_reason else []),
                      "parts": []})
    return m.entries(items)


# ---------------------------------------------------------------------------- observations


def observation_columns(ctx) -> list:
    return [ctx.tr(f"obs.{k}") for k in ("date", "where", "what", "support", "helped")]


def observation_texts(obs) -> list[str]:
    """The observation text and the structured "what I see" (D14 stage A) when it says more."""
    out = []
    details = obs.details if isinstance(obs.details, dict) else {}
    for text in (obs.observation, details.get("what_i_see")):
        if isinstance(text, str) and text.strip() and text.strip() not in out:
            out.append(text.strip())
    return out


def observation_rows(ctx, rows, with_details: bool = True) -> list:
    out = []
    for r in rows:
        obs = r["obs"]
        what = m.answer()
        for text in observation_texts(obs):
            what["lines"].append(text)
        if obs.source == "content_feedback" and r.get("content_title"):
            line = ctx.tr("obs.feedback_on", title=r["content_title"])
            if r.get("result"):
                line += " · " + ctx.label("content_results", r["result"])
            what["lines"].append(line)
        if r.get("focus_title"):
            what["lines"].append(ctx.tr("obs.focus", title=r["focus_title"]))
        details = obs.details if isinstance(obs.details, dict) else {}
        if not with_details and isinstance(details.get("what_we_did"), str) and details["what_we_did"].strip():
            # The intervention (D14 stage D, OM-D14-09) even without the A–E detail rows (R4).
            from app.reports.builders.om import d14_label

            what["lines"].append(f"{m.lead(d14_label(ctx, 'd'))} {details['what_we_did'].strip()}")
        if not m.has_content(what):
            what = m.answer(marker=ctx.tr("markers.no_text"))
        support = m.answer()
        if obs.support_level and obs.support_level != "not_observed":
            support = m.answer(chips=[m.chip(ctx.label("support_levels", obs.support_level))])
        place = ctx.option_label(("observation_contexts",), obs.context) or ""
        out.append(m.row([m.text_answer(ctx.date(obs.observed_at)), m.text_answer(place), what, support,
                          render_value(ctx, obs.what_helped, HELP_LISTS)]))
        if with_details and isinstance(obs.details, dict) and obs.details:
            from app.reports.builders.om import _d14_parts

            parts = [p for p in _d14_parts(ctx, obs) if p["id"] != "a"]
            detail = m.detail_row(parts)
            if detail:
                out.append(detail)
    return out


def observation_table(ctx, rows, with_details: bool = True) -> dict | None:
    return m.table(observation_columns(ctx), observation_rows(ctx, rows, with_details), kind="observations",
                   widths=OBS_WIDTHS)


# ---------------------------------------------------------------------------- activities


def activity_entries(ctx, content_rows) -> dict | None:
    feedback = ctx.feedback_for([c.id for c in content_rows])
    focus = {f.id: f.title for f in ctx.focus_areas()}
    items = []
    for c in content_rows:
        chips = [m.chip(ctx.label("content_types", c.content_type)), m.chip(ctx.label("modes", c.mode))]
        lines = []
        if c.focus_area_id and focus.get(c.focus_area_id):
            lines.append(ctx.tr("obs.focus", title=focus[c.focus_area_id]))
        for fb in feedback.get(c.id, []):
            line = f"{ctx.date(fb.created_at)} · {ctx.label('content_results', fb.result)}"
            if fb.support_level and fb.support_level != "not_observed":
                line += " · " + ctx.label("support_levels", fb.support_level)
            lines.append(line)
        if not feedback.get(c.id):
            lines.append(ctx.tr("activities.no_feedback"))
        items.append({"title": c.title, "meta": ctx.date(c.approved_at), "answer": m.answer(chips=chips, lines=lines),
                      "source": m.tag("teacher_approved", ctx.tr("activities.approved")), "parts": []})
    return m.entries(items)


# ---------------------------------------------------------------------------- reviews and follow-up (Domain 16)


def _review_ai(review) -> bool:
    return bool(review.ai_suggested or review.ai_suggestion_id)


FOLLOW_UP_STORAGE = {
    "reassessment_on": "DR.follow_up.reassessment_on",
    "improvement": "DR.follow_up.improvement.level",
    "areas": "DR.follow_up.areas",
    "what_worked": "DR.follow_up.what_worked",
    "what_to_change": "DR.follow_up.what_to_change",
    "involvement": "DR.follow_up.involvement.key",
}


def _fu_label(ctx, key: str) -> str:
    return label_for(ctx, "observation_model", FOLLOW_UP_STORAGE[key], f"review.{key}")


def follow_up_parts(ctx, follow_up) -> list:
    """[{id, k, v}] of a review's Domain 16 block (ids: the FOLLOW_UP_STORAGE keys)."""
    if not isinstance(follow_up, dict):
        return []
    parts = []
    if to_date(follow_up.get("reassessment_on")):
        when = m.text_answer(ctx.date(follow_up["reassessment_on"]))
        parts.append({"id": "reassessment_on", "k": _fu_label(ctx, "reassessment_on"), "v": when})
    improvement = follow_up.get("improvement") if isinstance(follow_up.get("improvement"), dict) else {}
    if improvement:
        chips = []
        if improvement.get("level"):
            label = ctx.option_label(("improvement_levels", "review_statuses"), improvement["level"]) or ctx.fallback_label(
                "improvement_levels", improvement["level"])
            chips.append(m.chip(label))
        note = improvement.get("note") if isinstance(improvement.get("note"), str) else None
        note_item = _note_item(ctx, "DR.follow_up.improvement.note")
        a = m.answer(chips=chips, lines=[note] if note and not note_item else [])
        if m.has_content(a):
            parts.append({"id": "improvement", "k": _fu_label(ctx, "improvement"), "v": a})
        if note and note_item:
            parts.append({"id": "improvement_note", "k": Registry.label(note_item, ctx.lang), "v": m.text_answer(note)})
    areas = follow_up.get("areas") if isinstance(follow_up.get("areas"), dict) else {}
    if areas:
        focus = {str(f.id): f.title for f in ctx.focus_areas()}
        a = render_value(ctx, {"domains": areas.get("domains"), "text": areas.get("text")})
        for fid in areas.get("focus_area_ids") or []:
            if focus.get(str(fid)):
                a["lines"].append(focus[str(fid)])
        if m.has_content(a):
            parts.append({"id": "areas", "k": _fu_label(ctx, "areas"), "v": a})
    for key in ("what_worked", "what_to_change"):
        if isinstance(follow_up.get(key), str) and follow_up[key].strip():
            parts.append({"id": key, "k": _fu_label(ctx, key), "v": m.text_answer(follow_up[key])})
    involvement = follow_up.get("involvement") if isinstance(follow_up.get("involvement"), dict) else {}
    if involvement.get("key") or involvement.get("note"):
        chips = []
        if involvement.get("key"):
            label = ctx.option_label(("involvement_steps", "share_next_step"), involvement["key"]) or ctx.fallback_label(
                "involvement_steps", involvement["key"])
            chips.append(m.chip(label))
        note = involvement.get("note") if isinstance(involvement.get("note"), str) else None
        note_item = _note_item(ctx, "DR.follow_up.involvement.note")
        a = m.answer(chips=chips, lines=[note] if note and not note_item else [])
        if m.has_content(a):
            parts.append({"id": "involvement", "k": _fu_label(ctx, "involvement"), "v": a})
        if note and note_item:
            parts.append({"id": "involvement_note", "k": Registry.label(note_item, ctx.lang), "v": m.text_answer(note)})
    return parts


def _note_item(ctx, storage: str):
    """The registry row of a follow-up note: printed as its own labelled part when it exists."""
    return ctx.registry("observation_model").by_storage.get(storage)


def review_entry(ctx, review) -> dict:
    parts = []
    focus_rows = []
    for fr in review.focus_review or []:
        if not isinstance(fr, dict):
            continue
        chips = [m.chip(ctx.label("review_statuses", fr["status"]))] if fr.get("status") else []
        lines = [f"{ctx.tr(f'review.{k}')}: {fr[k].strip()}" for k in ("what_worked", "what_to_change", "note")
                 if isinstance(fr.get(k), str) and fr[k].strip()]
        focus_rows.append(m.answer(chips=chips, lines=[fr.get("title") or ""] + lines))
    for a in focus_rows:
        parts.append({"k": ctx.tr("review.focus"), "v": a})
    parts += follow_up_parts(ctx, review.follow_up)
    name = ctx.user_name(review.created_by)
    source = approved_tag(ctx, ai=_review_ai(review), name=name, when=review.created_at)
    return {"title": ctx.tr("review.title"), "meta": ctx.date(review.review_date), "source": source,
            "answer": m.text_answer(review.summary), "parts": parts}


def reviews_entries(ctx, reviews) -> dict | None:
    return m.entries([review_entry(ctx, r) for r in reviews])


# ---------------------------------------------------------------------------- understanding and summary


def understanding_blocks(ctx) -> list:
    cu = ctx.profile.current_understanding if ctx.profile is not None else None
    if not isinstance(cu, dict) or not cu:
        return [m.para(ctx.tr("understanding.none"), muted=True)]
    if cu.get("source") == "review":
        review = next((r for r in ctx.reviews() if str(r.id) == str(cu.get("review_id"))), None)
        ai = _review_ai(review) if review is not None else False
        source = approved_tag(ctx, ai=ai, name=cu.get("approved_by_name"), when=cu.get("approved_at"))
    else:
        source = m.tag("teacher_observed", ctx.tr("sources.teacher_observed"))
    rows = []
    if isinstance(cu.get("summary"), str) and cu["summary"].strip():
        rows.append(m.qa_item(ctx.tr("understanding.summary"), m.text_answer(cu["summary"]), source=source))
    for key, lists in (("strengths", LIST_OPTIONS["strengths"]), ("interests", LIST_OPTIONS["interests"]),
                       ("what_helps", HELP_LISTS), ("areas_for_support", ("priority_categories",)),
                       ("adaptations", ()), ("next_steps", ())):
        a = render_value(ctx, cu.get(key), lists)
        if m.has_content(a):
            rows.append(m.qa_item(ctx.tr(f"understanding.{key}"), a))
    return [m.qa(rows)]


SUMMARY_FIELDS = (
    ("general_description", ()),
    ("main_strengths", ("strengths", "interests")),
    ("main_needs", ("priority_categories",)),
    ("adaptations", ()),
    ("follow_up_with_parents", ()),
    ("team_recommendations", ()),
)


def functional_summary_section(ctx) -> dict | None:
    rows = ctx.approved_summaries()
    if not rows:
        return None
    fs = rows[-1]
    source = approved_tag(ctx, ai=fs.source == "ai_draft", name=ctx.user_name(fs.approved_by), when=fs.approved_at)
    items = []
    for key, lists in SUMMARY_FIELDS:
        a = render_value(ctx, getattr(fs, key, None), lists)
        if m.has_content(a):
            items.append(m.qa_item(label_for(ctx, "observation_model", f"FS.{key}", f"summary.{key}"), a))
    return m.section("functional_summary", ctx.tr("sections.functional_summary"), [m.qa(items)], source=source)


def heart_callout(ctx) -> dict | None:
    heart = ctx.parent_p["sections"].get("heart")
    message = heart.get("message") if isinstance(heart, dict) else None
    if not isinstance(message, str) or not message.strip():
        return None
    from app.reports.builders.pq import parent_source

    return m.callout(ctx.tr("heart.title"), message.strip(), source=parent_source(ctx, "heart"))


def family_hopes_rows(ctx) -> list:
    sections = ctx.parent_p["sections"]
    expectations = sections.get("expectations") if isinstance(sections.get("expectations"), dict) else {}
    rows = []
    develop = expectations.get("develop") if isinstance(expectations.get("develop"), dict) else {}
    lines = []
    for key in ("emotional", "social", "language", "motor", "independence"):
        value = develop.get(key)
        text = value.get("text") if isinstance(value, dict) else value
        if isinstance(text, str) and text.strip():
            lines.append(f"{ctx.label('priority_categories', key)}: {text.strip()}")
    other = develop.get("other") if isinstance(develop.get("other"), dict) else {}
    if isinstance(other.get("text"), str) and other["text"].strip():
        area = other.get("area") if isinstance(other.get("area"), str) else ""
        lines.append(f"{area.strip() or ctx.tr('hopes.other_area')}: {other['text'].strip()}")
    if lines:
        rows.append(m.qa_item(ctx.tr("hopes.develop"), m.answer(lines=lines)))
    feels = render_value(ctx, expectations.get("hope_child_feels"), ("hope_child_feels",))
    if m.has_content(feels):
        rows.append(m.qa_item(ctx.tr("hopes.feels"), feels))
    if not rows:
        priorities = sections.get("priorities") if isinstance(sections.get("priorities"), dict) else {}
        legacy = render_value(ctx, priorities.get("parent_priorities"), ("priority_categories",))
        if isinstance(priorities.get("priorities_note"), str) and priorities["priorities_note"].strip():
            legacy["lines"].append(priorities["priorities_note"].strip())
        if m.has_content(legacy):
            rows.append(m.qa_item(ctx.tr("hopes.develop"), legacy))
        feels = render_value(ctx, priorities.get("hope_child_feels"), ("hope_child_feels",))
        if m.has_content(feels):
            rows.append(m.qa_item(ctx.tr("hopes.feels"), feels))
    return rows
