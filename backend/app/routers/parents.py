"""Admin: parent links (/children/{id}/parents).

Owned by WP-07. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from fastapi import APIRouter, Response

from app.deps import DB, AdminUser
from app.schemas.admin import ParentLinkIn
from app.services import classes as svc

router = APIRouter(tags=["parents"])


@router.get("/children/{child_id}/parents")
def list_parents(child_id: str, db: DB, admin: AdminUser) -> dict:
    return {"parents": svc.list_parent_links(db, admin, child_id)}


@router.post("/children/{child_id}/parents", status_code=201)
def link_parent(child_id: str, body: ParentLinkIn, db: DB, admin: AdminUser) -> dict:
    return {"parent": svc.link_parent(db, admin, child_id, body)}


@router.delete("/children/{child_id}/parents/{user_id}", status_code=204)
def unlink_parent(child_id: str, user_id: str, db: DB, admin: AdminUser) -> Response:
    svc.unlink_parent(db, admin, child_id, user_id)
    return Response(status_code=204)
