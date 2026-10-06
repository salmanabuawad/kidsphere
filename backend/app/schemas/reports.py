"""PDF report export request (POST /api/children/{id}/reports/pdf; COVERAGE-MATRIX §4.4).

``report_type`` is one of the six reports. ``language`` defaults to the user's
language. ``date_from``/``date_to`` limit the dated parts (observation history,
timeline, reviews; R3 defaults to the cycle period and R6 to "since the first
baseline"); from ≤ to and not in the future. The include flags shape R1 (and the
family hopes of R5, the questionnaire entry of R6). Health and medical answers,
the family context and private teacher notes are printed only when their flag is
set. ``assessment_id`` picks the teacher-observation cycle (R3, R5).
"""
import uuid
from datetime import date, timedelta
from typing import Literal

from pydantic import model_validator

from app.models import REPORT_TYPE_VALUES
from app.schemas.common import Language, StrictModel

ReportType = Literal[REPORT_TYPE_VALUES]

# Clock slack for "not in the future": the server runs on UTC, families and teachers do not.
FUTURE_SLACK = timedelta(days=1)


def today() -> date:
    """Today's date (a function so tests can pin it)."""
    return date.today()


class ReportRequest(StrictModel):
    report_type: ReportType
    language: Language | None = None
    date_from: date | None = None
    date_to: date | None = None
    include_parent: bool = True
    include_teacher_observations: bool = True
    include_timeline: bool = True
    include_health: bool = False
    include_family: bool = False
    include_private_notes: bool = False
    assessment_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _dates(self):
        latest = today() + FUTURE_SLACK
        for name in ("date_from", "date_to"):
            value = getattr(self, name)
            if value is not None and value > latest:
                raise ValueError(f"{name} cannot be in the future")
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must not be after date_to")
        return self

    def options(self) -> dict:
        """What report_exports.options stores: the flags and the cycle id, never content."""
        return {
            "include_parent": self.include_parent,
            "include_teacher_observations": self.include_teacher_observations,
            "include_timeline": self.include_timeline,
            "include_health": self.include_health,
            "include_family": self.include_family,
            "include_private_notes": self.include_private_notes,
            "assessment_id": str(self.assessment_id) if self.assessment_id else None,
            "language_requested": self.language,
        }
