"""Library media (table ``library_media``, migration 0008): one picture, clip, narration or
music file per (library item, slot).

Slots, by the item's type (N counts from 0):
    every type            cover (image), music (audio)
    story                 page:N (image) and narration:N (audio) for each paragraph
    real_world_activity   step:N (image or video) for each instruction

Admins upload, replace and remove files and edit their alt text and credit (source and licence)
(``/admin/library/items/{id}/media/{slot}``). Pictures are re-encoded like photos (JPEG, at most
1024 px, metadata dropped); audio (mp3, ogg, wav, m4a, webm; 15 MB) and video (mp4, webm; 50 MB)
are recognised by their magic bytes and stored unchanged under UPLOAD_DIR/library.

``GET /api/library/media/{id}`` serves a file to staff, and to a parent only when one of their
children has shared approved|completed content made from that item. A draft given to a child
(``generation_input.library_item_id``) shows the item's media; its narration is left out when the
character's name was replaced by the child's, because the recording still says the old name.
"""
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access
from app.audit import audit
from app.errors import AppError
from app.models import GeneratedContent, LibraryItem, LibraryMedia, User
from app.services import uploads

MEDIA_DIR = "library"
SLOT_RE = re.compile(r"^(cover|music|page:\d{1,2}|narration:\d{1,2}|step:\d{1,2})$")
SLOT_KINDS = {"cover": ("image",), "music": ("audio",), "page": ("image",), "narration": ("audio",),
              "step": ("image", "video")}
MAX_BYTES = {"image": uploads.MAX_IMAGE_BYTES, "audio": uploads.MAX_AUDIO_BYTES, "video": uploads.MAX_VIDEO_BYTES}
PARENT_STATUSES = ("approved", "completed")


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def media_out(m: LibraryMedia) -> dict:
    return {
        "id": str(m.id),
        "slot": m.slot,
        "kind": m.kind,
        "mime": m.mime,
        "url": f"/api/library/media/{m.id}",
        "alt": m.alt,
        "credit": m.credit,
        "size_bytes": m.size_bytes,
        "updated_at": _iso(m.updated_at),
    }


def _slot_order(slot: str):
    name, _, n = slot.partition(":")
    return ({"cover": 0, "page": 1, "narration": 2, "step": 3, "music": 4}.get(name, 9), int(n or 0))


def item_media(db: Session, item_id) -> list[dict]:
    rows = db.scalars(select(LibraryMedia).where(LibraryMedia.item_id == item_id)).all()
    return [media_out(m) for m in sorted(rows, key=lambda m: _slot_order(m.slot))]


def allowed_slots(item: LibraryItem) -> list[str]:
    content = item.content or {}
    slots = ["cover"]
    if item.content_type == "story":
        n = len(content.get("story") or [])
        slots += [f"page:{i}" for i in range(n)] + [f"narration:{i}" for i in range(n)]
    elif item.content_type == "real_world_activity":
        slots += [f"step:{i}" for i in range(len(content.get("instructions") or []))]
    return slots + ["music"]


def _item(db: Session, item_id) -> LibraryItem:
    uid = access._as_uuid(item_id)
    item = db.get(LibraryItem, uid) if uid else None
    if item is None:
        raise AppError("NOT_FOUND")
    return item


def _check_slot(item: LibraryItem, slot: str) -> tuple[str, ...]:
    if not SLOT_RE.match(slot) or slot not in allowed_slots(item):
        raise AppError("VALIDATION", "This item has no such media slot.", details=[{"path": "slot", "message": slot}])
    return SLOT_KINDS[slot.partition(":")[0]]


def _detect(data: bytes, kinds: tuple[str, ...]) -> tuple[str, str | None]:
    """(kind, mime) of the upload among the slot's kinds; mime None for an image (re-encoded)."""
    if "image" in kinds and uploads.sniff_image(data):
        return "image", None
    for kind in kinds:
        if kind != "image":
            mime = uploads.sniff_media(data, kind)
            if mime:
                return kind, mime
    names = {"image": "a JPEG, PNG or WebP picture", "audio": "an mp3, ogg, wav or m4a sound file",
             "video": "an mp4 or webm clip"}
    raise AppError("UPLOAD_FAILED", "Please choose " + " or ".join(names[k] for k in kinds) + ".")


def _clean(text):
    text = (text or "").strip()
    return text[:300] or None


def upload(db: Session, user: User, item_id, slot: str, data: bytes, alt=None, credit=None) -> dict:
    item = _item(db, item_id)
    kinds = _check_slot(item, slot)
    kind, mime = _detect(data, kinds)
    if len(data) > MAX_BYTES[kind]:
        raise AppError("UPLOAD_FAILED", f"The file is too large (max {MAX_BYTES[kind] // (1024 * 1024)} MB).", status=413)
    if kind == "image":
        rel, mime = uploads.save_image(data, MEDIA_DIR), "image/jpeg"
    else:
        rel = uploads.save_bytes(data, MEDIA_DIR, uploads.MEDIA_EXT[mime])
    size = uploads.resolve_upload(rel).stat().st_size
    row = db.scalars(select(LibraryMedia).where(LibraryMedia.item_id == item.id, LibraryMedia.slot == slot)).first()
    old = row.path if row is not None else None
    if row is None:
        row = LibraryMedia(item_id=item.id, slot=slot, created_by=user.id)
        db.add(row)
    row.kind, row.path, row.mime, row.size_bytes = kind, rel, mime, size
    if alt is not None:
        row.alt = _clean(alt)
    if credit is not None:
        row.credit = _clean(credit)
    db.flush()
    audit(db, user, "library.media_set", "library_item", item.id, slot=slot, kind=kind, replaced=old is not None)
    try:
        db.commit()
    except Exception:
        uploads.delete_upload(rel)
        raise
    uploads.delete_upload(old)
    return {"media": item_media(db, item.id)}


def _row(db: Session, item: LibraryItem, slot: str) -> LibraryMedia:
    row = db.scalars(select(LibraryMedia).where(LibraryMedia.item_id == item.id, LibraryMedia.slot == slot)).first()
    if row is None:
        raise AppError("NOT_FOUND")
    return row


def update_details(db: Session, user: User, item_id, slot: str, alt, credit) -> dict:
    item = _item(db, item_id)
    row = _row(db, item, slot)
    row.alt, row.credit = _clean(alt), _clean(credit)
    audit(db, user, "library.media_details", "library_item", item.id, slot=slot)
    db.commit()
    return {"media": item_media(db, item.id)}


def remove(db: Session, user: User, item_id, slot: str) -> None:
    item = _item(db, item_id)
    row = _row(db, item, slot)
    path = row.path
    db.delete(row)
    audit(db, user, "library.media_remove", "library_item", item.id, slot=slot)
    db.commit()
    uploads.delete_upload(path)


def file_for(db: Session, user: User, media_id) -> tuple:
    """(absolute path, mime) of a media file the user may see; anything else is 404."""
    uid = access._as_uuid(media_id)
    row = db.get(LibraryMedia, uid) if uid else None
    if row is None:
        raise AppError("NOT_FOUND")
    if not access.is_staff(user):
        shared = db.scalar(select(GeneratedContent.id).where(
            GeneratedContent.generation_input["library_item_id"].astext == str(row.item_id),
            GeneratedContent.shared_with_parent.is_(True),
            GeneratedContent.status.in_(PARENT_STATUSES),
            GeneratedContent.deleted_at.is_(None),
            GeneratedContent.child_id.in_(access.scoped_child_ids(user)),
        ).limit(1))
        if shared is None:
            raise AppError("NOT_FOUND")
    path = uploads.resolve_upload(row.path)
    if not path.is_file():
        raise AppError("NOT_FOUND")
    return path, row.mime


def media_for_content(db: Session, row: GeneratedContent) -> list[dict]:
    """The media of the library item a content row was made from ([] for anything else)."""
    gi = row.generation_input if isinstance(row.generation_input, dict) else {}
    uid = access._as_uuid(gi.get("library_item_id"))
    if uid is None:
        return []
    media = item_media(db, uid)
    if gi.get("hero_replaced"):
        media = [m for m in media if not m["slot"].startswith("narration:")]
    return media
