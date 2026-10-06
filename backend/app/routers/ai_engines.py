"""AI engines (/ai/..., /admin/ai/...). The browser never calls an AI provider: it calls these.

Paths are relative to /api (no router prefix); main.py includes this module.

Staff
- GET  /ai/engines                       → {engines: [{engine, output_kind, status, available}]}
- POST /ai/run {engine, task, input, child_id?, language?, options?} → AIResult
       (always 200 with the standard result: success, status, error {code, message, retryable})
- POST /ai/pipelines/{name} {child_id?, language?, input} → {pipeline_id, name, status, steps: [AIResult]}
       name = activity_for_goal | personalized_cartoon
- GET  /ai/requests/{id}                 → AIResult (a pending long job is checked once)
- GET  /ai/assets/{id}                   → the produced file (private, no-store)

Admin
- GET  /admin/ai/engines                 → {engines: [... config (no secrets), status, last_success_at,
                                            last_error, usage_30d, cost_30d], providers, mock_mode}
- PUT  /admin/ai/engines/{engine}        → that engine (fields sent change; null clears an override)
- POST /admin/ai/engines/{engine}/test   → AIResult of the engine's harmless sample (no child data)
- GET  /admin/ai/requests?engine&status&limit → recent requests (metadata only)
"""
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from app.deps import DB, AdminUser, CurrentUser
from app.schemas.ai_engines import EngineConfigIn, PipelineIn, RunIn
from app.services import ai_engines as svc

router = APIRouter(tags=["ai-engines"])

FILE_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}


@router.get("/ai/engines")
def list_available(db: DB, user: CurrentUser) -> dict:
    return svc.available(db, user)


@router.post("/ai/run")
def run_engine(body: RunIn, db: DB, user: CurrentUser) -> dict:
    return svc.run_engine(db, user, body)


@router.post("/ai/pipelines/{name}")
def run_pipeline(name: str, body: PipelineIn, db: DB, user: CurrentUser) -> dict:
    return svc.run_pipeline(db, user, name, body)


@router.get("/ai/requests/{request_id}")
def get_request(request_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.get_request(db, user, request_id)


@router.get("/ai/assets/{asset_id}")
def get_asset(asset_id: str, db: DB, user: CurrentUser) -> FileResponse:
    path, mime = svc.asset_file(db, user, asset_id)
    return FileResponse(path, media_type=mime, headers=FILE_HEADERS)


@router.get("/admin/ai/engines")
def admin_engines(db: DB, admin: AdminUser) -> dict:
    return svc.admin_engines(db)


@router.put("/admin/ai/engines/{engine}")
def update_engine(engine: str, body: EngineConfigIn, db: DB, admin: AdminUser) -> dict:
    return {"engine": svc.update_engine(db, admin, engine, body)}


@router.post("/admin/ai/engines/{engine}/test")
def test_engine(engine: str, db: DB, admin: AdminUser) -> dict:
    return svc.test_engine(db, admin, engine)


@router.get("/admin/ai/requests")
def admin_requests(db: DB, admin: AdminUser, engine: str | None = None, status: str | None = None,
                   limit: Annotated[int, Query(ge=1, le=100)] = 50) -> dict:
    return svc.admin_requests(db, engine, status, limit)
