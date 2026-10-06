"""Timeline events for R6 (and the compact timeline in R1), oldest first:
baselines → plans (opened / changed / closed / reopened) → activities →
observations → reviews → approved updates (functional summaries, closed
observation cycles), plus the family questionnaire being sent.

Plan changes come from ``record_versions`` (entity focus_area), so a goal that was
closed, reopened and closed again shows both closures. Goals without versions fall
back to ``focus_areas.closed_at``. Each event carries a type label and, where it
helps, a source tag. Counts, scores and percentages are never produced.
"""
from datetime import date, datetime, time

from app.reports import model as m
from app.reports.builders import shared
from app.reports.context import MAX_ROWS
from app.reports.i18n import LOCAL_TZ, to_date
from app.reports.values import approved_tag

TONES = {
    "baseline": "navy", "questionnaire": "sky", "focus_opened": "sun", "plan_changed": "sun",
    "focus_closed": "sun", "focus_paused": "sun", "focus_reopened": "sun", "content": "teal",
    "observation": "leaf", "feedback": "leaf", "review": "navy", "summary": "navy",
    "assessment_started": "leaf", "assessment_closed": "leaf",
}


def _at(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=LOCAL_TZ)
    d = to_date(value)
    return datetime.combine(d, time(12, 0), tzinfo=LOCAL_TZ) if d else None


def _event(ctx, kind, at, title=None, answer=None, source=None, type_key=None) -> dict | None:
    when = _at(at)
    if when is None:
        return None
    return {"kind": kind, "at": when, "day": to_date(when), "type": ctx.tr(f"tl.{type_key or kind}"),
            "title": title, "answer": answer, "source": source, "tone": TONES.get(kind, "neutral")}


def _focus_events(ctx) -> list:
    out = []
    by_entity: dict = {}
    for v in ctx.focus_versions():
        by_entity.setdefault(v.entity_id, []).append(v)
    for fa in ctx.focus_areas():
        local = [_event(ctx, "focus_opened", fa.created_at, fa.title)]
        prev = None
        for v in by_entity.get(fa.id, []):
            data = v.data if isinstance(v.data, dict) else {}
            if prev is None:
                prev = data
                continue
            before, after = prev.get("status"), data.get("status")
            title = data.get("title") or fa.title
            if before == "active" and after in ("paused", "completed"):
                kind = "focus_closed" if after == "completed" else "focus_paused"
                reason = data.get("close_reason")
                local.append(_event(ctx, kind, v.created_at, title, m.text_answer(reason) if reason else None))
            elif before in ("paused", "completed") and after == "active":
                local.append(_event(ctx, "focus_reopened", v.created_at, title))
            else:
                local.append(_event(ctx, "plan_changed", v.created_at, title))
            prev = data
        closed = any(e and e["kind"] in ("focus_closed", "focus_paused") for e in local)
        if fa.closed_at and fa.status in ("paused", "completed") and not closed:
            kind = "focus_closed" if fa.status == "completed" else "focus_paused"
            local.append(_event(ctx, kind, fa.closed_at, fa.title,
                                m.text_answer(fa.close_reason) if fa.close_reason else None))
        out += local
    return out


def collect(ctx, date_from: date | None, date_to: date | None, *, observations: bool = True) -> tuple[list, bool]:
    """(events oldest first, truncated). Truncation keeps the newest MAX_ROWS events."""
    o = ctx.opts
    events = []
    for i, b in enumerate(ctx.baselines()):
        events.append(_event(ctx, "baseline", b.created_at, None, type_key="baseline_original" if i == 0 else "baseline"))
    if o.include_parent:
        q = ctx.parent_p.get("questionnaire") or {}
        if q.get("status") == "submitted" and q.get("submitted_at"):
            events.append(_event(ctx, "questionnaire", q.get("submitted_at"), None,
                                 source=m.tag("parent_said", ctx.tr("sources.parent_said"))))
    events += _focus_events(ctx)
    for c in ctx.content(date_from, date_to):
        events.append(_event(ctx, "content", c.approved_at, c.title,
                             m.answer(chips=[m.chip(ctx.label("content_types", c.content_type))])))
    if observations:
        for r in ctx.observations(date_from, date_to):
            obs = r["obs"]
            if obs.source == "content_feedback":
                chips = [m.chip(ctx.label("content_results", r["result"]))] if r.get("result") else []
                lines = [obs.observation] if obs.observation else []
                events.append(_event(ctx, "feedback", obs.observed_at, r.get("content_title"),
                                     m.answer(chips=chips, lines=lines),
                                     source=m.tag("teacher_observed", ctx.tr("sources.teacher_observed"))))
            else:
                lines = shared.observation_texts(obs)
                chips = []
                if obs.support_level and obs.support_level != "not_observed":
                    chips.append(m.chip(ctx.label("support_levels", obs.support_level)))
                # Stage E "did anything change" (OM-D14-10): the loop's result on the timeline.
                change = obs.details.get("did_it_change") if isinstance(obs.details, dict) else None
                if change in ("yes", "partly", "no"):
                    chips.append(m.chip(ctx.tr("tl.changed", value=ctx.tr(f"r3.change_{change}"))))
                events.append(_event(ctx, "observation", obs.observed_at, r.get("focus_title"),
                                     m.answer(chips=chips, lines=lines),
                                     source=m.tag("teacher_observed", ctx.tr("sources.teacher_observed"))))
    for r in ctx.reviews():
        ai = bool(r.ai_suggested or r.ai_suggestion_id)
        events.append(_event(ctx, "review", r.created_at, None, m.text_answer(r.summary),
                             source=approved_tag(ctx, ai=ai, name=ctx.user_name(r.created_by), when=r.created_at)))
    for fs in ctx.approved_summaries():
        events.append(_event(ctx, "summary", fs.approved_at, None, m.text_answer(fs.general_description),
                             source=approved_tag(ctx, ai=fs.source == "ai_draft", name=ctx.user_name(fs.approved_by),
                                                 when=fs.approved_at)))
    if o.include_teacher_observations:
        for a in ctx.assessments():
            kind_label = ctx.tr(f"r3.kind_{a.kind}") if a.kind in ("initial", "reassessment") else None
            events.append(_event(ctx, "assessment_started", a.filled_on, kind_label))
            if a.status == "closed" and a.closed_at:
                events.append(_event(ctx, "assessment_closed", a.closed_at, kind_label))
    events = [e for e in events if e is not None]
    events = [e for e in events if (not date_from or e["day"] >= date_from) and (not date_to or e["day"] <= date_to)]
    events.sort(key=lambda e: e["at"])
    truncated = len(events) > MAX_ROWS
    return events[-MAX_ROWS:], truncated


def groups(ctx, events: list) -> list:
    out = []
    for e in events:
        title = ctx.tr.month(e["day"].year, e["day"].month)
        if not out or out[-1]["title"] != title:
            out.append({"title": title, "items": []})
        out[-1]["items"].append({"date": ctx.date(e["day"]), "type": e["type"], "title": e["title"],
                                 "answer": e["answer"], "source": e["source"], "tone": e["tone"]})
    return out
