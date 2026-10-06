"""One builder per report type: ``build(ctx) -> {"sections": [...], "range": (from, to), ...}``.

Builders read only the database (through ``app.reports.context.ReportContext``)
and the static registries; they never import the AI package (app/ai) and never write.
"""
from app.reports.builders import (
    current_development,
    full,
    intervention_plan,
    parent_questionnaire,
    teacher_observation,
    timeline,
)

BUILDERS = {
    "full": full.build,
    "parent_questionnaire": parent_questionnaire.build,
    "teacher_observation": teacher_observation.build,
    "current_development": current_development.build,
    "intervention_plan": intervention_plan.build,
    "timeline": timeline.build,
}
