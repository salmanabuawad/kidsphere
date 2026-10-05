"""GET /api/health (public)."""
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.deps import DB

router = APIRouter(tags=["health"])
log = logging.getLogger("app.health")


@router.get("/health")
def health(db: DB):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        log.exception("health check: database unavailable")
        return JSONResponse({"status": "degraded", "db": "error"}, status_code=503)
    return {"status": "ok", "db": "ok"}
