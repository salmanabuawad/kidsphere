"""Admin settings and system status (admin only; 403 for everyone else).

    GET  /admin/settings                 {general, ai, reports}; the AI key is never returned
                                         (ai.key_set, ai.key_last4 instead)
    PUT  /admin/settings/{section}       section = general | ai | reports; partial body;
                                         ai also takes anthropic_api_key or {clear: true}
    POST /admin/settings/ai/test         one minimal Claude call -> {ok, model, error_code}
    GET  /admin/system                   read-only status (version, migration, backup, AI, counts)

Paths are relative to /api (no router prefix); main.py includes this module.
"""
from typing import Any, Literal

from fastapi import APIRouter, Body

from app.deps import DB, AdminUser
from app.services import settings as svc

router = APIRouter(tags=["admin-settings"])


@router.get("/admin/settings")
def get_settings(db: DB, admin: AdminUser) -> dict:
    return svc.public_settings(db)


@router.put("/admin/settings/{section}")
def put_settings(section: Literal["general", "ai", "reports"], db: DB, admin: AdminUser,
                 body: dict[str, Any] = Body(...)) -> dict:
    return svc.update_section(db, admin, section, body)


@router.post("/admin/settings/ai/test")
def test_ai_connection(db: DB, admin: AdminUser) -> dict:
    return svc.check_ai_connection(db, admin)


@router.get("/admin/system")
def system_status(db: DB, admin: AdminUser) -> dict:
    return svc.system_status(db)
