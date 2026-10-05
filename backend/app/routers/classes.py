"""Admin: classes and teacher assignment (/classes, /classes/{id}/teachers).

GET /classes is also open to teachers (their own classes, for the Add Child
class picker); parents get 403. Everything else is admin only.

Owned by WP-07. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from fastapi import APIRouter, Response

from app.deps import DB, AdminUser, StaffUser
from app.schemas.admin import ClassIn, ClassUpdateIn, TeachersIn
from app.services import classes as svc

router = APIRouter(tags=["classes"])


@router.get("/classes")
def list_classes(db: DB, user: StaffUser) -> dict:
    return {"classes": svc.list_classes(db, user)}


@router.post("/classes", status_code=201)
def create_class(body: ClassIn, db: DB, admin: AdminUser) -> dict:
    return {"class": svc.create_class(db, admin, body)}


@router.put("/classes/{class_id}")
def update_class(class_id: str, body: ClassUpdateIn, db: DB, admin: AdminUser) -> dict:
    return {"class": svc.update_class(db, admin, class_id, body)}


@router.delete("/classes/{class_id}", status_code=204)
def delete_class(class_id: str, db: DB, admin: AdminUser) -> Response:
    svc.delete_class(db, admin, class_id)
    return Response(status_code=204)


@router.put("/classes/{class_id}/teachers")
def set_teachers(class_id: str, body: TeachersIn, db: DB, admin: AdminUser) -> dict:
    return {"class": svc.set_teachers(db, admin, class_id, body)}
