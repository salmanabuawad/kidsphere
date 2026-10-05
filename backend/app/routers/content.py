"""Generated content (/children/{id}/content..., /content/{id}..., /packs/{id}).

Owned by WP-11. Paths are relative to /api (no router prefix); main.py includes this module.
See app/services/content.py for the row JSON, the pack storage and the status transitions.

- POST   /children/{id}/content/generate  GenerateIn
         → 201 {"content", "fallback_reason"}  or, for a pack, {"items", "pack_id", "fallback_reason"}
- GET    /children/{id}/content?status&pack_id → {"content": [summary]}   (parents: shared approved/completed only)
- GET    /packs/{pack_id}                  → {"pack_id", "child_id", "items": [detail]}
- GET    /content/{id}                     → {"content": detail}
- PUT    /content/{id}  ContentUpdate      → {"content"}   draft|approved (→ draft); else 409; 422 UNSAFE_CONTENT
- POST   /content/{id}/approve             → {"content", "video_job"}   draft → approved
- POST   /content/{id}/regenerate  {instruction?} → {"content", "fallback_reason"}  same id, variant + 1, → draft
- POST   /content/{id}/duplicate           → 201 {"content"}  a new draft copy
- POST   /content/{id}/share  {shared}     → {"content"}   sharing needs approved|completed
- POST   /content/{id}/archive             → {"content"}
- DELETE /content/{id}                     → 204   drafts only, else 409
"""
import uuid

from fastapi import APIRouter, Response

from app.deps import DB, CurrentUser
from app.schemas.common import ContentStatus
from app.schemas.content import ContentUpdate, GenerateIn, RegenerateIn, ShareIn
from app.services import content as svc

router = APIRouter(tags=["content"])


@router.post("/children/{child_id}/content/generate", status_code=201)
def generate_content(child_id: str, body: GenerateIn, db: DB, user: CurrentUser) -> dict:
    return svc.generate_content(db, user, child_id, body)


@router.get("/children/{child_id}/content")
def list_content(child_id: str, db: DB, user: CurrentUser, status: ContentStatus | None = None,
                 pack_id: uuid.UUID | None = None) -> dict:
    return svc.list_content(db, user, child_id, status=status, pack_id=pack_id)


@router.get("/packs/{pack_id}")
def get_pack(pack_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.get_pack(db, user, pack_id)


@router.get("/content/{content_id}")
def get_content(content_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.get_content(db, user, content_id)


@router.put("/content/{content_id}")
def update_content(content_id: str, body: ContentUpdate, db: DB, user: CurrentUser) -> dict:
    return svc.update_content(db, user, content_id, body)


@router.post("/content/{content_id}/approve")
def approve_content(content_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.approve_content(db, user, content_id)


@router.post("/content/{content_id}/regenerate")
def regenerate_content(content_id: str, db: DB, user: CurrentUser, body: RegenerateIn | None = None) -> dict:
    return svc.regenerate_content(db, user, content_id, body or RegenerateIn())


@router.post("/content/{content_id}/duplicate", status_code=201)
def duplicate_content(content_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.duplicate_content(db, user, content_id)


@router.post("/content/{content_id}/share")
def share_content(content_id: str, body: ShareIn, db: DB, user: CurrentUser) -> dict:
    return svc.share_content(db, user, content_id, body)


@router.post("/content/{content_id}/archive")
def archive_content(content_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.archive_content(db, user, content_id)


@router.delete("/content/{content_id}", status_code=204)
def delete_content(content_id: str, db: DB, user: CurrentUser) -> Response:
    svc.delete_content(db, user, content_id)
    return Response(status_code=204)
