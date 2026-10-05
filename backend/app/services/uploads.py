"""Image uploads stored under settings.upload_dir (ARCHITECTURE §9).

Ported from src/lib/storage/local.ts (keys resolved inside the root only) and
the sniff logic of src/server/services/media.ts.

- ``read_limited`` reads at most ``MAX_IMAGE_BYTES + 1`` bytes: larger → 413 UPLOAD_FAILED.
- ``sniff_image`` accepts JPEG, PNG and WebP by magic bytes only (the
  client's file name and content type are ignored).
- ``save_image`` re-encodes with Pillow to JPEG, at most 1024 px on the long
  side, which drops EXIF/GPS and any other metadata, and writes it under an
  opaque name ``<subdir>/<uuid4hex>.jpg``. Only that relative path is stored
  in the DB; it is never sent to clients.
- Files are served only through an authenticated endpoint (nginx has no
  location for the uploads directory).
"""
import io
import logging
import os
import uuid
from pathlib import Path
from typing import BinaryIO

from PIL import Image, ImageOps

from app.config import settings
from app.errors import AppError

log = logging.getLogger("app.uploads")

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_SIDE = 1024
MAX_PIXELS = 50_000_000  # refuse decompression bombs well before Pillow's own limit
JPEG_QUALITY = 85
_READ_CHUNK = 1024 * 1024


def read_limited(stream: BinaryIO, max_bytes: int = MAX_IMAGE_BYTES) -> bytes:
    """Read the upload; more than ``max_bytes`` → 413, nothing → 400."""
    buf = bytearray()
    while len(buf) <= max_bytes:
        chunk = stream.read(min(_READ_CHUNK, max_bytes + 1 - len(buf)))
        if not chunk:
            break
        buf.extend(chunk)
    if len(buf) > max_bytes:
        raise AppError("UPLOAD_FAILED", f"The file is too large (max {max_bytes // (1024 * 1024)} MB).", status=413)
    if not buf:
        raise AppError("UPLOAD_FAILED", "The file is empty.")
    return bytes(buf)


def sniff_image(data: bytes) -> str | None:
    """'jpeg' | 'png' | 'webp' from the magic bytes, else None."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def _root() -> Path:
    return Path(settings.upload_dir).resolve()


def resolve_upload(rel_path: str) -> Path:
    """Absolute path of a stored relative path, refusing anything outside the upload root."""
    root = _root()
    full = (root / rel_path).resolve()
    if not full.is_relative_to(root) or full == root:
        raise AppError("NOT_FOUND")
    return full


def _reencode(data: bytes) -> bytes:
    kind = sniff_image(data)
    if kind is None:
        raise AppError("UPLOAD_FAILED", "Please choose a JPEG, PNG or WebP image.")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format is None or probe.format.lower() not in ("jpeg", "png", "webp"):
                raise AppError("UPLOAD_FAILED", "Please choose a JPEG, PNG or WebP image.")
            if probe.width * probe.height > MAX_PIXELS:
                raise AppError("UPLOAD_FAILED", "The image is too large.")
            probe.verify()
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            img = ImageOps.exif_transpose(img)  # keep the visible orientation, then drop all metadata
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                rgba = img.convert("RGBA")
                flat = Image.new("RGB", rgba.size, (255, 255, 255))
                flat.paste(rgba, mask=rgba.getchannel("A"))
                img = flat
            elif img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
            clean = Image.new("RGB", img.size)
            clean.paste(img)
            out = io.BytesIO()
            clean.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
            return out.getvalue()
    except AppError:
        raise
    except (Image.DecompressionBombError, OSError, ValueError, SyntaxError) as exc:
        log.info("image rejected: %s", type(exc).__name__)
        raise AppError("UPLOAD_FAILED", "The image could not be read.") from None


def save_image(data: bytes, subdir: str) -> str:
    """Validate and re-encode ``data``; return the stored relative path ``<subdir>/<hex>.jpg``."""
    jpeg = _reencode(data)
    rel = f"{subdir}/{uuid.uuid4().hex}.jpg"
    full = resolve_upload(rel)
    try:
        full.parent.mkdir(parents=True, exist_ok=True)
        tmp = full.with_suffix(".tmp")
        tmp.write_bytes(jpeg)
        os.replace(tmp, full)
    except OSError:
        log.exception("could not store upload")
        raise AppError("UPLOAD_FAILED", "The upload could not be stored. Please try again.") from None
    return rel


def delete_upload(rel_path: str | None) -> None:
    """Remove a stored file; missing files and bad paths are ignored."""
    if not rel_path:
        return
    try:
        resolve_upload(rel_path).unlink(missing_ok=True)
    except (AppError, OSError):
        log.warning("could not delete upload")
