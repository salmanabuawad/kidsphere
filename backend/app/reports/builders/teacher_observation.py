"""R3 Teacher Observation Report (X-43): the cycle (observation model section A:
cycle, period, teacher, filled by), the observation principles, the teacher's
first reading, the 13 domains with their status (tables per domain kind, then the
domain fields), the structured observations (Domain 14, A–E) of the period and the
latest approved functional summary. ``assessment_id`` picks the cycle; by default
the open cycle, else the latest.
"""
from app.reports import model as m
from app.reports.builders import om, pq, shared
from app.reports.builders.registry import section_heading


def build(ctx) -> dict:
    assessment = ctx.assessment()
    sections = [
        m.section("cycle", ctx.tr("r3.cycle_title"),
                  [om.cycle_facts(ctx, assessment) or m.para(ctx.tr("r3.no_cycle"), muted=True)],
                  source=m.tag("teacher_observed", ctx.tr("sources.teacher_observed"))),
    ]
    about = om.model_section(ctx)
    if about:
        sections.append(about)
    sections.append(
        m.section("principles", ctx.tr("r3.principles_title"), [om.principles_block(ctx)], intro=ctx.tr("r3.not_a_test")))
    qb = pq.quick_baseline(ctx)
    if qb:
        sections.append(qb)
    sections += om.domain_sections(ctx, assessment, summary=False)
    date_from, date_to = om.cycle_range(ctx, assessment)
    rows = ctx.observations(date_from, date_to, structured_only=True)
    sections.append(m.section("structured", section_heading(ctx, "observe_understand_act", "r3.d14_title"),
                              [om.structured_observations(ctx, rows) or m.para(ctx.tr("obs.none"), muted=True)],
                              intro=ctx.range_text(date_from, date_to)))
    summary = shared.functional_summary_section(ctx)
    if summary:
        sections.append(summary)
    footer = ctx.registry("observation_model").meta_text("footer", ctx.lang)
    return {"sections": sections, "range": (date_from, date_to), "footer_note": footer}
