"""R1 Full Child Report (COVERAGE-MATRIX §6.4, X-41).

"In the family's words" (heart message) → basics → parent questionnaire summary
(``include_parent``) → teacher's first reading + teacher observation by domain
(``include_teacher_observations``) → original and latest baseline → strengths /
interests / what helps with their sources → current focus and plans, goals closed
in the range → observation history (range) → activities and their feedback (range) →
development reviews with follow-up (range) → latest approved functional summary →
timeline (``include_timeline``).
Health, family context and private teacher notes appear only with their flags.
"""
from app.reports import model as m
from app.reports.builders import events, om, pq, shared
from app.reports.i18n import to_date


def build(ctx) -> dict:
    o = ctx.opts
    date_from, date_to = ctx.range()
    sections = []

    if o.include_parent:
        heart = shared.heart_callout(ctx)
        if heart:
            sections.append(m.section("heart", ctx.tr("heart.section"), [heart]))
    # The observation model's motto (OM-D99-01): the order this report follows.
    motto = ctx.registry("observation_model").meta_text("motto", ctx.lang)
    sections.append(m.section("basics", ctx.tr("sections.basics"),
                              [shared.basics(ctx), m.para(motto, muted=True) if motto else None]))

    if o.include_parent:
        blocks = []
        for sec in pq.questionnaire_sections(ctx, summary=True):
            blocks.append(m.heading(sec["title"], sec["status"]))
            blocks.append(m.qa(sec["rows"]))
        legacy = pq.legacy_rows(ctx, "parent")
        if legacy:
            blocks += [m.heading(ctx.tr("legacy.title")), m.qa(legacy)]
        if not blocks:
            blocks = [m.para(ctx.tr("r2.nothing_answered"), muted=True)]
        sections.append(m.section("parent", ctx.tr("sections.parent_summary"), blocks,
                                  source=m.tag("parent_said", ctx.tr("sources.parent_said"))))

    if o.include_teacher_observations:
        qb = pq.quick_baseline(ctx)
        if qb:
            sections.append(qb)
        assessment = ctx.assessment()
        if assessment is not None:
            sections.append(m.section("cycle", ctx.tr("sections.teacher_observation"), [om.cycle_facts(ctx, assessment)],
                                      source=m.tag("teacher_observed", ctx.tr("sources.teacher_observed"))))
            sections += om.domain_sections(ctx, assessment, summary=True)
        teacher_legacy = pq.legacy_rows(ctx, "teacher")
        if teacher_legacy:
            sections.append(m.section("teacher_profile", ctx.tr("sections.teacher_profile"), [m.qa(teacher_legacy)],
                                      source=m.tag("teacher_observed", ctx.tr("sources.teacher_observed"))))

    baselines = shared.baselines_section(ctx)
    if baselines:
        sections.append(baselines)
    sections.append(shared.lists_section(ctx))

    focus_blocks = [shared.plan_table(ctx, shared.active_focus(ctx)) or m.para(ctx.tr("plan.none"), muted=True)]
    closed = shared.closed_focus_entries(ctx, date_from, date_to)
    if closed:
        focus_blocks += [m.heading(ctx.tr("plan.closed")), closed]
    sections.append(m.section("focus", ctx.tr("sections.focus"), focus_blocks))

    rows = ctx.observations(date_from, date_to)
    sections.append(m.section("observations", ctx.tr("sections.observations"),
                              [shared.observation_table(ctx, rows) or m.para(ctx.tr("obs.none"), muted=True)],
                              intro=ctx.range_text(date_from, date_to)))

    # Activities and how they went (X-15, X-16, X-60), also without the timeline.
    sections.append(m.section("activities", ctx.tr("sections.activities"),
                              [shared.activity_entries(ctx, ctx.content(date_from, date_to))
                               or m.para(ctx.tr("activities.none"), muted=True)],
                              intro=ctx.range_text(date_from, date_to)))

    reviews = [r for r in ctx.reviews()
               if (not date_from or to_date(r.review_date) >= date_from) and (not date_to or to_date(r.review_date) <= date_to)]
    sections.append(m.section("reviews", ctx.tr("sections.reviews"),
                              [shared.reviews_entries(ctx, reviews) or m.para(ctx.tr("review.none"), muted=True)]))

    summary = shared.functional_summary_section(ctx)
    if summary:
        sections.append(summary)

    if o.include_timeline:
        found, truncated = events.collect(ctx, date_from, date_to, observations=False)
        blocks = [m.timeline(events.groups(ctx, found)) or m.para(ctx.tr("tl.none"), muted=True)]
        if truncated:
            blocks.insert(0, m.para(ctx.tr("tl.truncated"), muted=True))
        sections.append(m.section("timeline", ctx.tr("sections.timeline"), blocks))
    return {"sections": sections, "range": (date_from, date_to)}
