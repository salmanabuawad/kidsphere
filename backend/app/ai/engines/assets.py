"""Files produced by engines, stored like the child photos (UPLOAD_DIR/ai/<random>.<ext>)
and served only through GET /api/ai/assets/{id} after the access check.

Pictures are re-encoded with Pillow (metadata dropped, at most 2048 px); other files are
stored as received (their type and size were checked by validation.py).
"""
import hashlib
import io
import os
import uuid

from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from app.ai.engines.contracts import AssetRef, ProviderBinary
from app.models import AiAsset
from app.services import uploads

SUBDIR = "ai"
EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3", "audio/wav": "wav",
       "audio/ogg": "ogg", "audio/webm": "weba", "audio/mp4": "m4a", "video/mp4": "mp4", "video/webm": "webm",
       "application/json": "json"}
MAX_SIDE = 2048


def _reencode_image(data: bytes) -> tuple[bytes, str, int, int]:
    with Image.open(io.BytesIO(data)) as img:
        img.load()
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
        img.thumbnail((MAX_SIDE, MAX_SIDE))
        clean = Image.new(img.mode, img.size)
        clean.paste(img)
        out = io.BytesIO()
        clean.save(out, "PNG", optimize=True)
        return out.getvalue(), "image/png", clean.width, clean.height


def save(db: Session, *, request_id, child_id, binary: ProviderBinary) -> AiAsset:
    data, mime = binary.data, binary.mime
    width, height = binary.width, binary.height
    if binary.kind == "image":
        data, mime, width, height = _reencode_image(data)
    rel = f"{SUBDIR}/{uuid.uuid4().hex}.{EXT[mime]}"
    full = uploads.resolve_upload(rel)
    full.parent.mkdir(parents=True, exist_ok=True)
    tmp = full.with_suffix(".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, full)
    meta = {k: v for k, v in {"alt": binary.alt, "width": width, "height": height,
                              "duration_seconds": binary.duration_seconds}.items() if v is not None}
    row = AiAsset(request_id=request_id, child_id=child_id, kind=binary.kind, mime=mime, path=rel, size_bytes=len(data),
                  sha256=hashlib.sha256(data).hexdigest(), meta=meta)
    db.add(row)
    db.flush()
    return row


def ref(row: AiAsset) -> AssetRef:
    m = row.meta or {}
    return AssetRef(asset_id=str(row.id), kind=row.kind, mime=row.mime, url=f"/api/ai/assets/{row.id}",
                    alt=m.get("alt"), width=m.get("width"), height=m.get("height"),
                    duration_seconds=m.get("duration_seconds"))
