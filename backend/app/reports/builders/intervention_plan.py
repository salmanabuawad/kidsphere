"""R5 Intervention Plan (X-45; titled "תוכנית עבודה אישית" / "خطة العمل الفردية", OQ-3):
the plan period and the "2–3 goals" guidance → one table Goal / What we will do /
How often / Who / How we will know it helps / Follow-up date (RTL column order in
he/ar) with strength / need / adaptation under each goal → the latest review's
follow-up (reassessment date, what worked, what to change) → the family's hopes
(Parent Input; ``include_parent``). With ``assessment_id`` the goals of that
period are listed; otherwise every active goal.
"""
from app.reports import model as m
from app.reports.builders import shared
from app.reports.builders.registry import section_heading, text_for


def build(ctx) -> dict:
    assessment = ctx.assessment() if ctx.opts.assessment_id else next(
        (a for a in reversed(ctx.assessments()) if a.status == "open"), None)
    goals = shared.active_focus(ctx)
    if ctx.opts.assessment_id:
        goals = [g for g in goals if g.assessment_id == ctx.opts.assessment_id]
    period = ""
    if assessment is not None and (assessment.period_from or assessment.period_to):
        period = ctx.range_text(assessment.period_from, assessment.period_to)
    sequence = ctx.registry("observation_model").meta_text("sequence", ctx.lang)
    period_blocks = [m.kv([{"k": ctx.tr("header.period"), "v": period}]) if period else None,
                     m.para(text_for(ctx, "observation_model", "rule", "r5.guidance", storage="FA.assessment_id"),
                            muted=True),
                     # Each goal reads Strength > Need > Adaptation > What we will do > Follow-up (OM-D99-02).
                     m.para(sequence, muted=True) if sequence else None]
    sections = [
        m.section("period", ctx.tr("r5.period_title"), period_blocks),
        m.section("goals", section_heading(ctx, "plan", "r5.goals_title"),
                  [shared.plan_table(ctx, goals) or m.para(ctx.tr("plan.none"), muted=True)],
                  source=m.tag("teacher_observed", ctx.tr("sources.teacher_observed"))),
    ]
    # The latest review's follow-up (Domain 16, OM-D16-01/05/06): when to look again, what
    # worked and what to change for the next plan.
    reviews = ctx.reviews()
    if reviews:
        parts = [p for p in shared.follow_up_parts(ctx, reviews[-1].follow_up)
                 if p["id"] in ("reassessment_on", "what_worked", "what_to_change")]
        if parts:
            sections.append(m.section("follow_up", section_heading(ctx, "follow_up", "sections.progress"),
                                      [m.qa([m.qa_item(p["k"], p["v"]) for p in parts])]))
    if ctx.opts.include_parent:
        rows = shared.family_hopes_rows(ctx)
        sections.append(m.section("hopes", ctx.tr("hopes.title"),
                                  [m.qa(rows) or m.para(ctx.tr("r2.nothing_answered"), muted=True)],
                                  source=m.tag("parent_said", ctx.tr("sources.parent_said")),
                                  intro=ctx.tr("hopes.intro")))
    return {"sections": sections, "range": (None, None), "period": period}
