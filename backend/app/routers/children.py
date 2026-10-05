"""Children CRUD, archive and photo (/children, /children/{id}, /children/{id}/photo).

Owned by WP-05. Paths are relative to /api (no router prefix); main.py includes this module.

- GET  /children?class_id&q&include_archived   → {"children": [card], "classes": [{id, name, kindergarten}]}
                                                 (classes: where this user may add children; [] for parents)
- POST /children                               → 201 {"child": composite}      (staff)
- GET  /children/{id}                          → {"child": composite}          (role-shaped)
- PUT  /children/{id}                          → {"child": composite}          (parents: PARENT_FIELDS only)
- POST /children/{id}/archive                  → 204                           (staff)
- POST /children/{id}/unarchive                → {"child": composite}          (admin)
- PUT  /children/{id}/photo  (multipart "file")→ {"has_photo": true, "updated_at"} (staff)
- GET  /children/{id}/photo                    → image/jpeg, private, no-store
- DELETE /children/{id}/photo                  → 204                           (staff)
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Query, Response, UploadFile
from fastapi.responses import FileResponse

from app.deps import DB, CurrentUser, StaffUser
from app.schemas.children import ChildCreateIn, ChildUpdateIn
from app.services import children as svc
from app.services import uploads

router = APIRouter(tags=["children"])

PHOTO_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}


@router.get("/children")
def list_children(
    db: DB,
    user: CurrentUser,
    class_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    include_archived: bool = False,
) -> dict:
    return {
        "children": svc.list_children(db, user, class_id=class_id, q=q, include_archived=include_archived),
        "classes": svc.placeable_classes(db, user),
    }


@router.post("/children", status_code=201)
def create_child(body: ChildCreateIn, db: DB, user: StaffUser) -> dict:
    child = svc.create_child(db, user, body)
    db.commit()
    return {"child": svc.child_detail(db, user, child)}


@router.get("/children/{child_id}")
def get_child(child_id: str, db: DB, user: CurrentUser) -> dict:
    child = svc.get_child(db, user, child_id)
    return {"child": svc.child_detail(db, user, child)}


@router.put("/children/{child_id}")
def update_child(child_id: str, body: ChildUpdateIn, db: DB, user: CurrentUser) -> dict:
    child = svc.update_child(db, user, child_id, body)
    db.commit()
    db.refresh(child)
    return {"child": svc.child_detail(db, user, child)}


@router.post("/children/{child_id}/archive", status_code=204)
def archive_child(child_id: str, db: DB, user: StaffUser) -> Response:
    svc.archive_child(db, user, child_id)
    db.commit()
    return Response(status_code=204)


@router.post("/children/{child_id}/unarchive")
def unarchive_child(child_id: str, db: DB, user: StaffUser) -> dict:
    child = svc.unarchive_child(db, user, child_id)
    db.commit()
    db.refresh(child)
    return {"child": svc.child_detail(db, user, child)}


@router.put("/children/{child_id}/photo")
def set_photo(child_id: str, db: DB, user: CurrentUser, file: Annotated[UploadFile, File()]) -> dict:
    # Access is checked before the body is processed (a parent gets 403, others 404).
    svc.get_photo_target(db, user, child_id)
    data = uploads.read_limited(file.file)
    child, old = svc.set_photo(db, user, child_id, data)
    try:
        db.commit()
    except Exception:
        uploads.delete_upload(child.photo_path)
        raise
    uploads.delete_upload(old)
    db.refresh(child)
    return {"has_photo": True, "updated_at": child.updated_at.isoformat()}


@router.get("/children/{child_id}/photo")
def get_photo(child_id: str, db: DB, user: CurrentUser) -> FileResponse:
    path = svc.photo_file(db, user, child_id)
    return FileResponse(path, media_type="image/jpeg", headers=PHOTO_HEADERS)


@router.delete("/children/{child_id}/photo", status_code=204)
def delete_photo(child_id: str, db: DB, user: CurrentUser) -> Response:
    old = svc.delete_photo(db, user, child_id)
    db.commit()
    uploads.delete_upload(old)
    return Response(status_code=204)
