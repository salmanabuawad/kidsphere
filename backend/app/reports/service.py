"""PDF export of a child report (X-40..X-57; COVERAGE-MATRIX §4.4, §6).

    export_pdf(db, user, child_id, body: ReportRequest) -> (pdf_bytes, filename)
        1. permission: staff in scope only (parents and out-of-scope ids get 404, OQ-7);
        2. query + report model: the builder of ``body.report_type`` (DB + registries only);
        3. HTML → PDF in memory under the render lock (503 REPORT_BUSY when it stays taken);
        4. one ``report_exports`` row (type, language, range, options; never content) and
           one audit row ``report.export``, committed together after the PDF exists.
        Any failure in 2–3 is logged without content and raised as 500 REPORT_FAILED; no
        export row and no audit row are written then.

    list_exports(db, user, child_id) -> {"exports": [...]}   the export log, newest first

This module never imports the AI package (app/ai): reports print stored, teacher-approved data only.
"""
import logging
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.orm import Session

from app import access
from app.audit import audit
from app.errors import AppError
from app.models import Child, Class, ReportExport, TeacherAssessment, User
from app.reports.builders import BUILDERS
from app.reports.context import ReportContext
from app.reports.i18n import LANGS, LOCAL_TZ, direction
from app.reports.render import ReportBusy, render_pdf
from app.schemas.reports import ReportRequest

log = logging.getLogger("app.reports")

EXPORT_LOG_LIMIT = 50


def staff_child(db: Session, user: User, child_id, lock: bool = False) -> Child:
    """The child for staff in scope; parents (and anyone out of scope) get 404."""
    if not access.is_staff(user):
        raise AppError("NOT_FOUND", "Child not found.")
    return access.get_child_or_404(db, user, child_id, write=True, lock=lock)


def _local_today() -> date:
    return datetime.now(timezone.utc).astimezone(LOCAL_TZ).date()


def _check_assessment(db: Session, child: Child, assessment_id) -> None:
    if assessment_id is None:
        return
    found = db.scalar(select(TeacherAssessment.id).where(TeacherAssessment.id == assessment_id,
                                                         TeacherAssessment.child_id == child.id))
    if found is None:
        raise AppError("VALIDATION", details=[{"path": "assessment_id",
                                               "message": "This observation cycle does not belong to the child."}])


def labels(ctx) -> dict:
    tr = ctx.tr
    return {
        "report_label": tr("report_label"),
        "child": tr("header.child"),
        "age": tr("header.age"),
        "kindergarten": tr("header.kindergarten"),
        "report_date": tr("header.report_date"),
        "prepared_by": tr("header.prepared_by"),
        "period": tr("header.period"),
        "disclaimer": tr("footer.disclaimer"),
        "nothing_yet": tr("markers.nothing_yet"),
    }


def build_model(ctx: ReportContext) -> dict:
    report_type = ctx.request.report_type
    built = BUILDERS[report_type](ctx)
    date_from, date_to = built.get("range") or (None, None)
    range_text = ""
    if report_type in ("full", "timeline", "teacher_observation", "current_development") and (date_from or date_to):
        range_text = ctx.range_text(date_from, date_to)
    if report_type == "intervention_plan" and built.get("period"):
        range_text = built["period"]
    child = ctx.child
    meta = {
        "report_type": report_type,
        "lang": ctx.lang,
        "dir": direction(ctx.lang),
        "title": ctx.tr(f"types.{report_type}"),
        "subtitle": built.get("subtitle") or "",
        "child": {
            "name": ctx.display_name,
            "age": ctx.age_text(),
            "kindergarten": ctx.klass.kindergarten if ctx.klass is not None else ctx.tr("markers.no_kindergarten"),
        },
        "report_date": ctx.date(ctx.today),
        "prepared_by": ctx.user.name,
        "range_text": range_text,
        "note": ctx.tr("header.confidential"),
        # A report-specific running-footer line (R3: the observation model's footer).
        "footer_note": built.get("footer_note") or "",
        "labels": labels(ctx),
        "child_id": str(child.id),
    }
    return {"meta": meta, "sections": built["sections"]}


def _filename(report_type: str, today: date) -> str:
    return f"kidsphere-{report_type.replace('_', '-')}-{today.isoformat()}.pdf"


def _date_range(body: ReportRequest) -> Range | None:
    if body.date_from is None and body.date_to is None:
        return None
    return Range(body.date_from, body.date_to, bounds="[]")


def export_pdf(db: Session, user: User, child_id, body: ReportRequest) -> tuple[bytes, str]:
    child = staff_child(db, user, child_id)
    _check_assessment(db, child, body.assessment_id)
    lang = body.language or (user.language if user.language in LANGS else "en")
    klass = db.get(Class, child.class_id) if child.class_id else None
    today = _local_today()
    ctx = ReportContext(db, user, child, klass, body, lang, today)
    try:
        model = build_model(ctx)
    except AppError:
        raise
    except Exception:
        log.exception("report model failed: type=%s lang=%s child=%s", body.report_type, lang, child.id)
        db.rollback()
        raise AppError("REPORT_FAILED") from None
    # End the read transaction before the (slow) render; the export row is written after it.
    db.rollback()
    try:
        pdf = render_pdf(model)
    except ReportBusy:
        raise AppError("REPORT_BUSY") from None
    except Exception:
        log.exception("report render failed: type=%s lang=%s child=%s", body.report_type, lang, child.id)
        raise AppError("REPORT_FAILED") from None

    row = ReportExport(
        id=uuid.uuid4(),
        child_id=child.id,
        report_type=body.report_type,
        language=lang,
        generated_by=user.id,
        date_range=_date_range(body),
        options=body.options(),
    )
    db.add(row)
    audit(db, user, "report.export", "report_export", row.id, child_id=child.id, report_type=body.report_type,
          language=lang, include_health=body.include_health, include_family=body.include_family,
          include_private_notes=body.include_private_notes,
          assessment_id=str(body.assessment_id) if body.assessment_id else None)
    db.commit()
    return pdf, _filename(body.report_type, today)


def _iso(value) -> str | None:
    return value.isoformat() if value is not None else None


def list_exports(db: Session, user: User, child_id) -> dict:
    child = staff_child(db, user, child_id)
    rows = db.execute(
        select(ReportExport, User.name)
        .outerjoin(User, User.id == ReportExport.generated_by)
        .where(ReportExport.child_id == child.id)
        .order_by(ReportExport.generated_at.desc(), ReportExport.id.desc())
        .limit(EXPORT_LOG_LIMIT)
    ).all()
    out = []
    for row, name in rows:
        rng = row.date_range
        date_from = date_to = None
        if rng is not None and not rng.isempty:
            date_from = rng.lower
            date_to = rng.upper
            if date_to is not None and not rng.upper_inc:
                date_to = date.fromordinal(date_to.toordinal() - 1)
            if date_from is not None and not rng.lower_inc:
                date_from = date.fromordinal(date_from.toordinal() + 1)
        options = row.options if isinstance(row.options, dict) else {}
        out.append({
            "id": str(row.id),
            "report_type": row.report_type,
            "language": row.language,
            "date_from": _iso(date_from),
            "date_to": _iso(date_to),
            "generated_at": _iso(row.generated_at),
            "generated_by": {"id": str(row.generated_by), "name": name} if row.generated_by else None,
            "include_health": bool(options.get("include_health")),
            "include_family": bool(options.get("include_family")),
            "include_private_notes": bool(options.get("include_private_notes")),
        })
    db.commit()
    return {"exports": out}
