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
"""
from fastapi import APIRouter

from app.deps import DB, AdminUser, StaffUser
from app.schemas.library import AssignIn, CollectionCreate, CollectionUpdate, ItemCreate, ItemUpdate
from app.services import library as svc

router = APIRouter(tags=["library"])


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
