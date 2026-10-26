"""Content library (/library..., /admin/library...): ready-made content admins manage and staff
give to children as drafts. Paths are relative to /api (no router prefix); main.py includes this
module. See app/services/library.py.

Staff (parents 403)
- GET  /library                            → {"collections": [collection]}  published only
- GET  /library/items/{id}                 → {"item": item + content}  (admins: any status)
- POST /library/items/{id}/assign AssignIn → 201 {"content": [summary]}  a new draft for each child

Admin
- GET  /admin/library                      → {"collections": [collection]}  every status
- POST /admin/library/collections  CollectionCreate → 201 {"collection"}
- PUT  /admin/library/collections/{id}  CollectionUpdate → {"collection"}
- POST /admin/library/items  ItemCreate     → 201 {"item"}   a draft; 400 VALIDATION, 422 UNSAFE_CONTENT
- PUT  /admin/library/items/{id}  ItemUpdate → {"item"}      status draft | published | archived
- PUT  /admin/library/items/{id}/media/{slot}  multipart file (+ alt, credit) → {"media": [media]}
- PUT  /admin/library/items/{id}/media/{slot}/details  {alt, credit} → {"media"}
- DELETE /admin/library/items/{id}/media/{slot} → 204

Anyone signed in (services/library_media.file_for checks access; parents need shared content)
- GET  /library/media/{id}                → the file (range requests work for audio and video)
"""
from typing import Annotated

from fastapi import APIRouter, File, Form, Response, UploadFile
from fastapi.responses import FileResponse

from app.deps import DB, AdminUser, CurrentUser, StaffUser
from app.schemas.library import AssignIn, CollectionCreate, CollectionUpdate, ItemCreate, ItemUpdate, MediaDetails
from app.services import library as svc
from app.services import library_media as media
from app.services import uploads

router = APIRouter(tags=["library"])

FILE_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}


@router.get("/library")
def list_library(db: DB, user: StaffUser) -> dict:
    return svc.list_published(db, user)


@router.get("/library/items/{item_id}")
def get_library_item(item_id: str, db: DB, user: StaffUser) -> dict:
    return svc.get_item(db, user, item_id)


@router.post("/library/items/{item_id}/assign", status_code=201)
def assign_library_item(item_id: str, body: AssignIn, db: DB, user: StaffUser) -> dict:
    return svc.assign_item(db, user, item_id, body)


@router.get("/admin/library")
def admin_list_library(db: DB, user: AdminUser) -> dict:
    return svc.list_all(db, user)


@router.post("/admin/library/collections", status_code=201)
def create_collection(body: CollectionCreate, db: DB, user: AdminUser) -> dict:
    return svc.create_collection(db, user, body)


@router.put("/admin/library/collections/{collection_id}")
def update_collection(collection_id: str, body: CollectionUpdate, db: DB, user: AdminUser) -> dict:
    return svc.update_collection(db, user, collection_id, body)


@router.post("/admin/library/items", status_code=201)
def create_item(body: ItemCreate, db: DB, user: AdminUser) -> dict:
    return svc.create_item(db, user, body)


@router.put("/admin/library/items/{item_id}")
def update_item(item_id: str, body: ItemUpdate, db: DB, user: AdminUser) -> dict:
    return svc.update_item(db, user, item_id, body)


@router.put("/admin/library/items/{item_id}/media/{slot}")
def set_media(item_id: str, slot: str, db: DB, user: AdminUser, file: Annotated[UploadFile, File()],
              alt: Annotated[str | None, Form(max_length=300)] = None,
              credit: Annotated[str | None, Form(max_length=300)] = None) -> dict:
    data = uploads.read_limited(file.file, uploads.MAX_VIDEO_BYTES)
    return media.upload(db, user, item_id, slot, data, alt=alt, credit=credit)


@router.put("/admin/library/items/{item_id}/media/{slot}/details")
def set_media_details(item_id: str, slot: str, body: MediaDetails, db: DB, user: AdminUser) -> dict:
    return media.update_details(db, user, item_id, slot, body.alt, body.credit)


@router.delete("/admin/library/items/{item_id}/media/{slot}", status_code=204)
def remove_media(item_id: str, slot: str, db: DB, user: AdminUser) -> Response:
    media.remove(db, user, item_id, slot)
    return Response(status_code=204)


@router.get("/library/media/{media_id}")
def get_media(media_id: str, db: DB, user: CurrentUser) -> FileResponse:
    path, mime = media.file_for(db, user, media_id)
    return FileResponse(path, media_type=mime, headers=FILE_HEADERS)
