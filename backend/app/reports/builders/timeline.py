"""R6 Timeline Report (X-46): every dated event in the range (default: since the
first baseline), oldest first and grouped by month, each with a type label and a
source tag (app/reports/builders/events.py).
"""
from app.reports import model as m
from app.reports.builders import events
from app.reports.builders.registry import text_for
from app.reports.i18n import to_date


def build(ctx) -> dict:
    baselines = ctx.baselines()
    first = to_date(baselines[0].created_at) if baselines else None
    date_from, date_to = ctx.range(default_from=first)
    found, truncated = events.collect(ctx, date_from, date_to)
    # The loop the events follow (observation model, Domain 14 cycle row).
    blocks = [m.para(text_for(ctx, "observation_model", "cycle"), muted=True),
              m.timeline(events.groups(ctx, found)) or m.para(ctx.tr("tl.none"), muted=True)]
    if truncated:
        blocks.insert(1, m.para(ctx.tr("tl.truncated"), muted=True))
    sections = [m.section("timeline", ctx.tr("sections.timeline"), blocks, intro=ctx.range_text(date_from, date_to))]
    return {"sections": sections, "range": (date_from, date_to)}
