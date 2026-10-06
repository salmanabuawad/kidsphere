"""Typed application errors and the JSON error envelope.

Every error response has the shape ``{"error": {"code", "message", "details"}}``.
Raise ``AppError("NOT_FOUND")`` (optionally with a message, ``details`` and a
``status`` override, e.g. ``AppError("UPLOAD_FAILED", status=413)``) anywhere
in a request; the handlers installed by ``install_error_handlers`` turn it into
the envelope. Stack traces never leave the server.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app.errors")

STATUS: dict[str, int] = {
    "UNAUTHENTICATED": 401,
    "INVALID_CREDENTIALS": 401,
    "FORBIDDEN": 403,
    "NOT_FOUND": 404,
    "VALIDATION": 400,
    "DUPLICATE": 409,
    "CONFLICT": 409,
    "FOCUS_LIMIT": 409,
    "INVALID_TRANSITION": 409,
    "UNSAFE_CONTENT": 422,
    "UPLOAD_FAILED": 400,
    "RATE_LIMITED": 429,
    "AI_UNAVAILABLE": 503,
    "ASSESSMENT_OPEN": 409,
    "ASSESSMENT_CLOSED": 409,
    "SUMMARY_APPROVED": 409,
    "REPORT_BUSY": 503,
    "REPORT_FAILED": 500,
    "INTERNAL": 500,
}

MESSAGES: dict[str, str] = {
    "UNAUTHENTICATED": "Please sign in.",
    "INVALID_CREDENTIALS": "The e-mail/username or password is incorrect.",
    "FORBIDDEN": "You do not have permission to do this.",
    "NOT_FOUND": "Not found.",
    "VALIDATION": "Some fields are not valid.",
    "DUPLICATE": "This already exists.",
    "CONFLICT": "This conflicts with the current state.",
    "FOCUS_LIMIT": "A child can have at most 3 active focus areas.",
    "INVALID_TRANSITION": "This action is not allowed in the current status.",
    "UNSAFE_CONTENT": "The content contains wording that is not allowed.",
    "UPLOAD_FAILED": "The upload could not be processed.",
    "RATE_LIMITED": "Too many attempts. Please wait and try again.",
    "AI_UNAVAILABLE": "The content generator is not available right now.",
    "ASSESSMENT_OPEN": "An observation cycle is already open for this child.",
    "ASSESSMENT_CLOSED": "This observation cycle is closed. Start a reassessment to add to it.",
    "SUMMARY_APPROVED": "This summary is already approved. Save a new version instead.",
    "REPORT_BUSY": "Another report is being prepared. Please try again in a moment.",
    "REPORT_FAILED": "The report could not be created.",
    "INTERNAL": "Something went wrong.",
}

# DB guards that a service can hit in a race (migration 0002) carry a constraint
# name; an IntegrityError with one of these names becomes that error code.
CONSTRAINT_CODES: dict[str, str] = {
    "focus_areas_max_active": "FOCUS_LIMIT",
    "teacher_assessments_one_open_uq": "ASSESSMENT_OPEN",
    "teacher_assessments_closed": "ASSESSMENT_CLOSED",
    "functional_summaries_approved": "SUMMARY_APPROVED",
}


class AppError(Exception):
    def __init__(self, code: str, message: str | None = None, details=None, status: int | None = None):
        if code not in STATUS:
            raise ValueError(f"unknown error code {code!r}")
        self.code = code
        self.message = message or MESSAGES[code]
        self.details = details
        self.status = status or STATUS[code]
        super().__init__(f"{code}: {self.message}")


def error_response(code: str, message: str | None = None, details=None, status: int | None = None) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": code, "message": message or MESSAGES.get(code, code), "details": details}},
        status_code=status or STATUS.get(code, 500),
    )


def _validation_details(exc: RequestValidationError) -> list[dict]:
    out = []
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", ())]
        if loc and loc[0] == "body":
            loc = loc[1:]
        out.append({"path": ".".join(loc), "message": err.get("msg", "invalid")})
    return out


_HTTP_CODES = {401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "NOT_FOUND", 409: "CONFLICT", 429: "RATE_LIMITED"}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    def _app_error(request: Request, exc: AppError):
        return error_response(exc.code, exc.message, exc.details, exc.status)

    @app.exception_handler(RequestValidationError)
    def _validation(request: Request, exc: RequestValidationError):
        return error_response("VALIDATION", details=_validation_details(exc))

    @app.exception_handler(StarletteHTTPException)
    def _http(request: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code, "INTERNAL" if exc.status_code >= 500 else "VALIDATION")
        return error_response(code, status=exc.status_code)

    @app.exception_handler(IntegrityError)
    def _integrity(request: Request, exc: IntegrityError):
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint in CONSTRAINT_CODES:
            return error_response(CONSTRAINT_CODES[constraint])
        sqlstate = getattr(exc.orig, "sqlstate", None)
        if sqlstate == "23505":  # unique_violation
            return error_response("DUPLICATE")
        if sqlstate in ("23503", "23514", "23502"):  # foreign key / check / not null
            return error_response("VALIDATION")
        log.exception("integrity error on %s %s", request.method, request.url.path)
        return error_response("INTERNAL")

    @app.exception_handler(Exception)
    def _unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return error_response("INTERNAL")
