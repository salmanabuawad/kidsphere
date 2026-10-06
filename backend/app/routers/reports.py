"""PDF reports (COVERAGE-MATRIX §4.4; X-40..X-57). Staff in scope only; parents get 404.

- POST /children/{id}/reports/pdf   body ReportRequest → 200 application/pdf
      Content-Disposition: attachment; filename*=UTF-8''kidsphere-<type>-<date>.pdf
      Cache-Control: private, no-store · X-Content-Type-Options: nosniff
      Errors: 400 VALIDATION, 401, 404, 503 REPORT_BUSY, 500 REPORT_FAILED.
      The PDF is rendered in memory: no file, no URL and no path ever reaches the client.
- GET /children/{id}/reports        → {"exports": [{id, report_type, language, date_from,
      date_to, generated_at, generated_by: {id, name}, include_health, include_family,
      include_private_notes}]} newest first (the export log; never the content).
"""
from urllib.parse import quote

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from app.deps import DB, CurrentUser
from app.reports import service
from app.schemas.reports import ReportRequest

router = APIRouter(tags=["reports"])

NO_STORE = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}


@router.post("/children/{child_id}/reports/pdf")
def export_pdf(child_id: str, body: ReportRequest, db: DB, user: CurrentUser) -> Response:
    pdf, filename = service.export_pdf(db, user, child_id, body)
    headers = {
        **NO_STORE,
        "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
    }
    return Response(content=pdf, media_type="application/pdf", headers=headers)


@router.get("/children/{child_id}/reports")
def list_exports(child_id: str, db: DB, user: CurrentUser) -> JSONResponse:
    return JSONResponse(service.list_exports(db, user, child_id), headers={"Cache-Control": "private, no-store"})
