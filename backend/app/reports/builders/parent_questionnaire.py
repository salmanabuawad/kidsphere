"""R2 Parent Questionnaire (X-42): the "About this questionnaire" block (filled on,
entered by, meeting), then every registry section in source order with every
question ("Not answered" where empty; option labels as in the source), the
answers kept only in the earlier form, and the teacher's first reading (quick
baseline) as the closing part. Health (ח) and Q41 only with their include flags.
"""
from app.reports import model as m
from app.reports.builders import pq
from app.reports.builders.registry import Registry, loc


def build(ctx) -> dict:
    reg = ctx.registry("parent_questionnaire")
    # The registry's own wording for who fills it in (PQ-META-02) and its purpose (PQ-META-03).
    record = reg.find("record", storage="PQM")
    audience = Registry.label(record, ctx.lang) if record else ""
    purpose = reg.meta_text("purpose", ctx.lang) if reg.present else ""
    sections = [m.section("about", ctx.tr("r2.about"),
                          [m.para(audience, muted=True),
                           pq.about_block(ctx) or m.para(ctx.tr("r2.not_started"), muted=True)],
                          intro=purpose or ctx.tr("r2.intro"))]
    for sec in pq.questionnaire_sections(ctx, registry=reg):
        sections.append(m.section(f"pq-{sec['key']}", sec["title"], [m.qa(sec["rows"])], source=sec["source"],
                                  status=sec["status"]))
    legacy = pq.legacy_rows(ctx, "parent", registry=reg)
    if legacy:
        sections.append(m.section("earlier", ctx.tr("legacy.title"),
                                  [m.para(ctx.tr("legacy.intro"), muted=True), m.qa(legacy)],
                                  source=m.tag("parent_said", ctx.tr("sources.parent_said"))))
    qb = pq.quick_baseline(ctx, registry=reg)
    if qb:
        sections.append(qb)
    subtitle = loc(reg.meta.get("title"), ctx.lang) if reg.present else ""
    return {"sections": sections, "subtitle": subtitle, "range": (None, None)}
