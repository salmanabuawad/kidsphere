"""People in the child's life: grandfather, a sister, a friend, a pet (stories, games and videos).

Access
    Staff in scope add, edit and remove people and their photos (``write=True``).
    Anyone who may read the child (parents too: it is their family) lists them and
    sees their photos, so content shared with a parent shows them. At most
    ``MAX_PEOPLE`` per child (409 CONFLICT); ``relation`` is a ``person_relations``
    vocabulary key.

Privacy (PRIVACY.md "People in the child's life")
    The AI never sees a name or a photo. A content request picks at most
    ``MAX_CAST`` people; ``content_people`` gives each a placeholder token made
    from its relation (``{grandfather}``, ``{friend}``, ``{friend_2}``), stored on
    the content row as ``[{token, person_id, relation}]``. ``ai_cast`` is what the
    AIContext carries: the token, the relation key and its label. The AI writes the
    token; the client shows the display name (and the photo) in its place
    (``cast_out``). The display names are also masked in every free text sent to
    the AI (``app.ai.gather``: children as [friend], adults as [adult]).

Photos are stored like the child photo (``services/uploads.py``: re-encoded JPEG
without metadata, under ``UPLOAD_DIR/people``) and served only through
``GET /api/people/{pid}/photo`` after the access check.
"""
import uuid
from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import access, vocab
from app.ai.context import first_name
from app.audit import audit
from app.errors import AppError
from app.models import Child, ChildPerson, User
from app.schemas.people import PersonCreate, PersonUpdate
from app.services import uploads

MAX_PEOPLE = 12
MAX_CAST = 3
PHOTO_DIR = "people"
RELATIONS = "person_relations"


def _iso(value):
    return value.isoformat() if value is not None else None


def _invalid(path: str, message: str) -> AppError:
    return AppError("VALIDATION", details=[{"path": path, "message": message}])


def person_out(p: ChildPerson) -> dict:
    return {
        "id": str(p.id),
        "child_id": str(p.child_id),
        "relation": p.relation,
        "display_name": p.display_name,
        "has_photo": bool(p.photo_path),
        "updated_at": _iso(p.updated_at),
    }


def _rows(db: Session, child_id) -> list[ChildPerson]:
    return list(db.scalars(
        select(ChildPerson).where(ChildPerson.child_id == child_id).order_by(ChildPerson.created_at, ChildPerson.id)
    ).all())


def _check_relation(key: str) -> None:
    if not vocab.is_valid(RELATIONS, key):
        raise _invalid("relation", "Choose who this person is to the child.")


# --------------------------------------------------------------------------- CRUD


def list_people(db: Session, user: User, child_id) -> dict:
    child = access.get_child_or_404(db, user, child_id)
    return {"people": [person_out(p) for p in _rows(db, child.id)], "max": MAX_PEOPLE}


def create_person(db: Session, user: User, child_id, body: PersonCreate) -> dict:
    # The child row is locked so two parallel adds cannot pass the limit together.
    child = access.get_child_or_404(db, user, child_id, write=True, lock=True)
    _check_relation(body.relation)
    count = db.scalar(select(func.count()).select_from(ChildPerson).where(ChildPerson.child_id == child.id))
    if (count or 0) >= MAX_PEOPLE:
        raise AppError("CONFLICT", f"A child can have at most {MAX_PEOPLE} people.", details={"max": MAX_PEOPLE})
    person = ChildPerson(child_id=child.id, relation=body.relation, display_name=body.display_name,
                         created_by=user.id)
    db.add(person)
    db.flush()
    audit(db, user, "person.create", "person", person.id, child_id=child.id, relation=person.relation)
    db.commit()
    db.refresh(person)
    return {"person": person_out(person)}


def update_person(db: Session, user: User, person_id, body: PersonUpdate) -> dict:
    person = access.get_child_row_or_404(db, user, ChildPerson, person_id, write=True, lock=True)
    sent = body.model_fields_set
    values = body.model_dump(include=sent)
    for field in sent:
        if values[field] is None:
            raise _invalid(field, "This field is required.")
    if "relation" in sent:
        _check_relation(values["relation"])
    changed = sorted(f for f in sent if getattr(person, f) != values[f])
    for field in changed:
        setattr(person, field, values[field])
    if changed:
        audit(db, user, "person.update", "person", person.id, child_id=person.child_id, fields=changed)
    db.commit()
    db.refresh(person)
    return {"person": person_out(person)}


def delete_person(db: Session, user: User, person_id) -> None:
    """Remove the person and their photo. Content that included them keeps its token and shows
    the relation instead of the name."""
    person = access.get_child_row_or_404(db, user, ChildPerson, person_id, write=True, lock=True)
    old = person.photo_path
    child_id = person.child_id
    audit(db, user, "person.delete", "person", person.id, child_id=child_id, relation=person.relation)
    db.delete(person)
    db.commit()
    uploads.delete_upload(old)


# --------------------------------------------------------------------------- photo


def photo_target(db: Session, user: User, person_id) -> ChildPerson:
    """The person whose photo this user may change (staff in scope), else 404/403."""
    return access.get_child_row_or_404(db, user, ChildPerson, person_id, write=True)


def set_photo(db: Session, user: User, person_id, data: bytes) -> dict:
    person = photo_target(db, user, person_id)
    rel = uploads.save_image(data, PHOTO_DIR)
    old = person.photo_path
    person.photo_path = rel
    audit(db, user, "person_photo.set", "person", person.id, child_id=person.child_id)
    try:
        db.commit()
    except Exception:
        uploads.delete_upload(rel)
        raise
    uploads.delete_upload(old)
    db.refresh(person)
    return {"person": person_out(person)}


def delete_photo(db: Session, user: User, person_id) -> None:
    person = photo_target(db, user, person_id)
    old = person.photo_path
    if old:
        person.photo_path = None
        audit(db, user, "person_photo.delete", "person", person.id, child_id=person.child_id)
    db.commit()
    uploads.delete_upload(old)


def photo_file(db: Session, user: User, person_id):
    """Absolute path of the person's photo for a user who may read the child, else 404."""
    person = access.get_child_row_or_404(db, user, ChildPerson, person_id)
    if not person.photo_path:
        raise AppError("NOT_FOUND", "No photo.")
    path = uploads.resolve_upload(person.photo_path)
    if not path.is_file():
        raise AppError("NOT_FOUND", "No photo.")
    return path


# --------------------------------------------------------------------------- content


def assign_tokens(pairs) -> list[dict]:
    """``[(person_id, relation)]`` → ``[{token, person_id, relation}]``: the first person of a
    relation is ``{relation}``, the next ``{relation_2}``, ``{relation_3}``."""
    seen: Counter = Counter()
    out = []
    for person_id, relation in pairs:
        seen[relation] += 1
        n = seen[relation]
        token = "{" + (relation if n == 1 else f"{relation}_{n}") + "}"
        out.append({"token": token, "person_id": str(person_id), "relation": relation})
    return out


def content_people(db: Session, child: Child, person_ids) -> list[dict]:
    """The stored ``people`` of new content: the chosen people of THIS child, in the order chosen.
    Unknown ids, other children's people and repeats are a 400."""
    ids = list(person_ids or [])
    if not ids:
        return []
    if len(set(ids)) != len(ids):
        raise _invalid("people", "Choose each person once.")
    if len(ids) > MAX_CAST:
        raise _invalid("people", f"Choose at most {MAX_CAST} people.")
    rows = {p.id: p for p in db.scalars(
        select(ChildPerson).where(ChildPerson.child_id == child.id, ChildPerson.id.in_(ids))
    ).all()}
    if len(rows) != len(ids):
        raise _invalid("people", "Choose people from this child's list.")
    return assign_tokens((rows[i].id, rows[i].relation) for i in ids)


def ai_cast(people, language: str) -> list[dict]:
    """What the AIContext carries for the stored ``people``: token, relation and its label. Never a
    name, a photo or an id."""
    out = []
    for p in people or []:
        relation = p.get("relation") if isinstance(p, dict) else None
        token = p.get("token") if isinstance(p, dict) else None
        if not relation or not token or not vocab.is_valid(RELATIONS, relation):
            continue
        out.append({"token": token, "relation": relation, "label": vocab.label(RELATIONS, relation, language)})
    return out[:MAX_CAST]


def tokens_of(people) -> set[str]:
    return {p["token"] for p in people or [] if isinstance(p, dict) and isinstance(p.get("token"), str)}


def cast_out(db: Session, child: Child, people) -> dict:
    """What a viewer needs to show the content with the real people: the child's name (as the AI
    used it) and photo flag, and each token with the person's display name and photo flag. A
    person removed since keeps the token and relation, with ``display_name`` None."""
    ids = []
    for p in people or []:
        try:
            ids.append(uuid.UUID(str(p.get("person_id"))))
        except (TypeError, ValueError, AttributeError):
            continue
    rows = {}
    if ids:
        rows = {r.id: r for r in db.scalars(
            select(ChildPerson).where(ChildPerson.child_id == child.id, ChildPerson.id.in_(ids))
        ).all()}
    members = []
    for p in people or []:
        if not isinstance(p, dict):
            continue
        try:
            row = rows.get(uuid.UUID(str(p.get("person_id"))))
        except (TypeError, ValueError):
            row = None
        members.append({
            "token": p.get("token"),
            "relation": p.get("relation"),
            "person_id": str(row.id) if row else None,
            "display_name": row.display_name if row else None,
            "has_photo": bool(row and row.photo_path),
            "updated_at": _iso(row.updated_at) if row else None,
        })
    return {
        "child": {"name": first_name(child), "has_photo": bool(child.photo_path), "updated_at": _iso(child.updated_at)},
        "people": members,
    }

