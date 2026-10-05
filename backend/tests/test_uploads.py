"""WP-05: child photo upload (ARCHITECTURE §9) and services/uploads.py."""
import io

import pytest
from PIL import Image
from sqlalchemy import select

from app.models import AuditLog, Child
from app.services import uploads


def _image(fmt="PNG", size=(64, 48), color=(200, 120, 40), exif=None, mode="RGB") -> bytes:
    img = Image.new(mode, size, color if mode == "RGB" else color + (128,))
    buf = io.BytesIO()
    kwargs = {"exif": exif.tobytes()} if exif is not None else {}
    img.save(buf, fmt, **kwargs)
    return buf.getvalue()


def _gps_exif() -> Image.Exif:
    exif = Image.Exif()
    exif[0x010F] = "SecretCam"  # Make
    exif[0x013B] = "Photographer Name"  # Artist
    exif[0x8825] = {1: "N", 2: (32.0, 5.0, 0.0), 3: "E", 4: (34.0, 46.0, 0.0)}  # GPSInfo IFD
    return exif


def _put(client, child_id, data: bytes, name="photo.jpg", ctype="image/jpeg"):
    return client.put(f"/api/children/{child_id}/photo", files={"file": (name, data, ctype)})


def _stored_files(upload_dir):
    return sorted((upload_dir / "children").glob("*")) if (upload_dir / "children").exists() else []


def test_upload_png_is_reencoded_and_served_privately(db, teacher_client, parent_client, child, _upload_dir):
    r = _put(teacher_client, child.id, _image("PNG"), name="me.png", ctype="image/png")
    assert r.status_code == 200, r.text
    assert r.json()["has_photo"] is True
    files = _stored_files(_upload_dir)
    assert len(files) == 1 and files[0].suffix == ".jpg"
    assert len(files[0].stem) == 32  # opaque uuid4 hex

    db.expire_all()
    stored = db.get(Child, child.id).photo_path
    assert stored == f"children/{files[0].name}"

    detail = teacher_client.get(f"/api/children/{child.id}")
    assert detail.json()["child"]["has_photo"] is True
    assert "photo_path" not in detail.text and files[0].stem not in detail.text
    listing = teacher_client.get("/api/children")
    assert listing.json()["children"][0]["has_photo"] is True
    assert files[0].stem not in listing.text

    for c in (teacher_client, parent_client):
        got = c.get(f"/api/children/{child.id}/photo")
        assert got.status_code == 200
        assert got.headers["content-type"] == "image/jpeg"
        assert "private" in got.headers["cache-control"] and "no-store" in got.headers["cache-control"]
        assert got.headers["x-content-type-options"] == "nosniff"
        assert got.content[:3] == b"\xff\xd8\xff"

    rows = db.scalars(select(AuditLog).where(AuditLog.action == "photo.set")).all()
    assert len(rows) == 1 and rows[0].child_id == child.id


def test_exif_and_gps_are_stripped(teacher_client, child, _upload_dir):
    src = _image("JPEG", exif=_gps_exif())
    with Image.open(io.BytesIO(src)) as check:  # the source really carries GPS + camera data
        assert check.getexif().get_ifd(0x8825)
        assert check.getexif().get(0x010F) == "SecretCam"
    assert _put(teacher_client, child.id, src).status_code == 200
    [stored] = _stored_files(_upload_dir)
    raw = stored.read_bytes()
    assert b"Exif" not in raw and b"SecretCam" not in raw and b"Photographer" not in raw
    with Image.open(stored) as img:
        assert img.format == "JPEG"
        assert len(img.getexif()) == 0
        assert not img.getexif().get_ifd(0x8825)


def test_large_image_is_downscaled_and_webp_accepted(teacher_client, child, _upload_dir):
    assert _put(teacher_client, child.id, _image("WEBP", size=(2000, 1500)), name="x.webp", ctype="image/webp").status_code == 200
    [stored] = _stored_files(_upload_dir)
    with Image.open(stored) as img:
        assert max(img.size) == 1024 and img.size == (1024, 768)


def test_transparent_png_is_flattened(teacher_client, child, _upload_dir):
    assert _put(teacher_client, child.id, _image("PNG", mode="RGBA")).status_code == 200
    [stored] = _stored_files(_upload_dir)
    with Image.open(stored) as img:
        assert img.mode == "RGB"


@pytest.mark.parametrize(
    "data",
    [
        b"this is not an image at all, just text pretending to be a jpg",
        b"\xff\xd8\xff" + b"garbage" * 50,  # JPEG magic, broken body
        b"GIF89a" + b"\x00" * 64,  # GIF is not allowed
        b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
    ],
)
def test_bad_bytes_are_rejected(db, teacher_client, child, _upload_dir, data):
    r = _put(teacher_client, child.id, data)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "UPLOAD_FAILED"
    assert _stored_files(_upload_dir) == []
    db.expire_all()
    assert db.get(Child, child.id).photo_path is None


def test_gif_bytes_from_pillow_rejected(teacher_client, child):
    r = _put(teacher_client, child.id, _image("GIF"), name="a.gif", ctype="image/gif")
    assert r.status_code == 400 and r.json()["error"]["code"] == "UPLOAD_FAILED"


def test_too_large_is_413(teacher_client, child, _upload_dir):
    data = b"\xff\xd8\xff" + b"\x00" * (uploads.MAX_IMAGE_BYTES - 2)
    r = _put(teacher_client, child.id, data)
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "UPLOAD_FAILED"
    assert _stored_files(_upload_dir) == []


def test_empty_and_missing_file(teacher_client, child):
    r = _put(teacher_client, child.id, b"")
    assert r.status_code == 400 and r.json()["error"]["code"] == "UPLOAD_FAILED"
    r = teacher_client.put(f"/api/children/{child.id}/photo")
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION"


def test_photo_access_rules(teacher_client, other_teacher_client, parent_client, other_parent_client, client, child):
    assert _put(other_teacher_client, child.id, _image()).status_code == 404
    assert _put(parent_client, child.id, _image()).status_code == 403
    assert _put(client, child.id, _image()).status_code == 401
    assert teacher_client.get(f"/api/children/{child.id}/photo").status_code == 404  # no photo yet
    assert _put(teacher_client, child.id, _image()).status_code == 200

    assert other_teacher_client.get(f"/api/children/{child.id}/photo").status_code == 404
    assert other_parent_client.get(f"/api/children/{child.id}/photo").status_code == 404
    assert client.get(f"/api/children/{child.id}/photo").status_code == 401
    assert parent_client.delete(f"/api/children/{child.id}/photo").status_code == 403
    assert other_teacher_client.delete(f"/api/children/{child.id}/photo").status_code == 404


def test_replace_and_delete_remove_old_files(db, teacher_client, child, _upload_dir):
    assert _put(teacher_client, child.id, _image(color=(1, 2, 3))).status_code == 200
    [first] = _stored_files(_upload_dir)
    assert _put(teacher_client, child.id, _image(color=(9, 8, 7))).status_code == 200
    [second] = _stored_files(_upload_dir)
    assert first != second and not first.exists()

    assert teacher_client.delete(f"/api/children/{child.id}/photo").status_code == 204
    assert _stored_files(_upload_dir) == []
    assert teacher_client.get(f"/api/children/{child.id}/photo").status_code == 404
    assert teacher_client.get(f"/api/children/{child.id}").json()["child"]["has_photo"] is False
    assert len(db.scalars(select(AuditLog).where(AuditLog.action == "photo.delete")).all()) == 1
    # Deleting again is harmless and not audited twice.
    assert teacher_client.delete(f"/api/children/{child.id}/photo").status_code == 204
    db.expire_all()
    assert len(db.scalars(select(AuditLog).where(AuditLog.action == "photo.delete")).all()) == 1


def test_resolve_upload_refuses_escape(_upload_dir):
    from app.errors import AppError

    for bad in ("../etc/passwd", "/etc/passwd", "children/../../x", ""):
        with pytest.raises(AppError):
            uploads.resolve_upload(bad)
    assert uploads.resolve_upload("children/a.jpg") == (_upload_dir / "children" / "a.jpg").resolve()


def test_sniff_image():
    assert uploads.sniff_image(_image("PNG")) == "png"
    assert uploads.sniff_image(_image("JPEG")) == "jpeg"
    assert uploads.sniff_image(_image("WEBP")) == "webp"
    assert uploads.sniff_image(b"GIF89a") is None
    assert uploads.sniff_image(b"") is None
