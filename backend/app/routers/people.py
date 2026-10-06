"""People in the child's life (/children/{id}/people, /people/{pid}, /people/{pid}/photo).

Paths are relative to /api (no router prefix); main.py includes this module.

- GET    /children/{id}/people              → {"people": [person], "max": 12}   (anyone who may read the child)
- POST   /children/{id}/people {relation, display_name} → 201 {"person"}        (staff; 409 CONFLICT over the limit)
- PUT    /people/{pid} {relation?, display_name?}       → {"person"}            (staff)
- DELETE /people/{pid}                       → 204                              (staff; the photo goes too)
- PUT    /people/{pid}/photo (multipart "file") → {"person"}                    (staff)
- GET    /people/{pid}/photo                 → image/jpeg, private, no-store    (anyone who may read the child)
- DELETE /people/{pid}/photo                 → 204                              (staff)
"""
from typing import Annotated

from fastapi import APIRouter, File, Response, UploadFile
from fastapi.responses import FileResponse

from app.deps import DB, CurrentUser
from app.schemas.people import PersonCreate, PersonUpdate
from app.services import people as svc
from app.services import uploads

router = APIRouter(tags=["people"])

PHOTO_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}


@router.get("/children/{child_id}/people")
def list_people(child_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.list_people(db, user, child_id)


@router.post("/children/{child_id}/people", status_code=201)
def create_person(child_id: str, body: PersonCreate, db: DB, user: CurrentUser) -> dict:
    return svc.create_person(db, user, child_id, body)


@router.put("/people/{person_id}")
def update_person(person_id: str, body: PersonUpdate, db: DB, user: CurrentUser) -> dict:
    return svc.update_person(db, user, person_id, body)


@router.delete("/people/{person_id}", status_code=204)
def delete_person(person_id: str, db: DB, user: CurrentUser) -> Response:
    svc.delete_person(db, user, person_id)
    return Response(status_code=204)


@router.put("/people/{person_id}/photo")
def set_photo(person_id: str, db: DB, user: CurrentUser, file: Annotated[UploadFile, File()]) -> dict:
    # Access is checked before the body is processed (a parent gets 403, others 404).
    svc.photo_target(db, user, person_id)
    data = uploads.read_limited(file.file)
    return svc.set_photo(db, user, person_id, data)


@router.get("/people/{person_id}/photo")
def get_photo(person_id: str, db: DB, user: CurrentUser) -> FileResponse:
    return FileResponse(svc.photo_file(db, user, person_id), media_type="image/jpeg", headers=PHOTO_HEADERS)


@router.delete("/people/{person_id}/photo", status_code=204)
def delete_photo(person_id: str, db: DB, user: CurrentUser) -> Response:
    svc.delete_photo(db, user, person_id)
    return Response(status_code=204)
