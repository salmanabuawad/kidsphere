"""R4 Current Development Report (X-44): the teacher-approved understanding (with
approver and date) and the latest approved functional summary → strengths,
interests, what helps → the active focus (≤ 3) → recent observations (default:
since the last review) → activities and how they went → progress in words (the
latest review: statuses, never scores) → next steps (reassessment date,
involvement, follow-up dates).
"""
from app.reports import model as m
from app.reports.builders import shared
from app.reports.builders.registry import section_heading
from app.reports.i18n import to_date


def _next_steps(ctx, last_review) -> list:
    rows = []
    cu = ctx.profile.current_understanding if ctx.profile is not None else None
    if isinstance(cu, dict) and isinstance(cu.get("next_steps"), str) and cu["next_steps"].strip():
        rows.append(m.qa_item(ctx.tr("understanding.next_steps"), m.text_answer(cu["next_steps"])))
    if last_review is not None:
        for part in shared.follow_up_parts(ctx, last_review.follow_up):
            if part["id"] in ("reassessment_on", "involvement", "involvement_note"):
                rows.append(m.qa_item(part["k"], part["v"]))
    dates = [f"{fa.title}: {shared.follow_up_text(ctx, fa)}" for fa in shared.active_focus(ctx)
             if shared.follow_up_text(ctx, fa)]
    if dates:
        rows.append(m.qa_item(ctx.tr("plan.follow_up"), m.answer(lines=dates)))
    return rows


def build(ctx) -> dict:
    reviews = ctx.reviews()
    last = reviews[-1] if reviews else None
    date_from = ctx.opts.date_from or (to_date(last.review_date) if last else None)
    date_to = ctx.opts.date_to
    sections = [m.section("understanding", ctx.tr("sections.understanding"), shared.understanding_blocks(ctx))]
    summary = shared.functional_summary_section(ctx)
    if summary:
        sections.append(summary)
    sections.append(shared.lists_section(ctx))
    sections.append(m.section("focus", ctx.tr("sections.focus"),
                              [shared.plan_table(ctx, shared.active_focus(ctx)) or m.para(ctx.tr("plan.none"), muted=True)]))
    rows = ctx.observations(date_from, date_to)
    sections.append(m.section("recent", ctx.tr("sections.recent_observations"),
                              [shared.observation_table(ctx, rows, with_details=False)
                               or m.para(ctx.tr("obs.none"), muted=True)],
                              intro=ctx.range_text(date_from, date_to)))
    sections.append(m.section("activities", ctx.tr("sections.activities"),
                              [shared.activity_entries(ctx, ctx.content(date_from, date_to))
                               or m.para(ctx.tr("activities.none"), muted=True)]))
    sections.append(m.section("progress", section_heading(ctx, "follow_up", "sections.progress"),
                              [shared.reviews_entries(ctx, [last]) if last else m.para(ctx.tr("review.none"), muted=True)]))
    sections.append(m.section("next", ctx.tr("sections.next"),
                              [m.qa(_next_steps(ctx, last)) or m.para(ctx.tr("markers.nothing_yet"), muted=True)]))
    return {"sections": sections, "range": (date_from, date_to)}
