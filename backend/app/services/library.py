"""Content library: ready-made stories, activities, games and video plans not tied to a child
(tables ``library_collections`` and ``library_items``, migration 0007).

Admins
    manage collections and items (``/admin/library...``): create, edit, publish, unpublish
    (back to draft) and archive. Nothing is deleted. An item's ``content`` is validated like a
    teacher edit (the type's output model → 400 VALIDATION; wording → 422 UNSAFE_CONTENT
    {issues}); its title is the content's title.

Staff
    see the PUBLISHED items of PUBLISHED collections and give one to children in their scope:
    each child gets a new DRAFT (``generated_content``, ai_provider 'template', ai_model
    'library') to review and approve like any other. With ``use_child_name`` the item's
    ``hero`` becomes the child's name in every text. The draft has no focus area, pack, people
    or sharing; its generation_input holds only the mode, type, template, language, target
    strength and the library item id, never anything about another child.

Item JSON::

    {id, collection_id, content_type, template, language, title, goal, hero, audience, mode,
     target_strength, sort_order, status, updated_at,  # detail only: content}

Collection JSON: {id, title, description, ages, sort_order, status, updated_at, items: [item]}
"""
import copy

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access, vocab
from app.ai import validate_output
from app.ai.context import first_name
from app.audit import audit
from app.errors import AppError
from app.models import GeneratedContent, LibraryCollection, LibraryItem, User
from app.schemas.library import AssignIn, CollectionCreate, CollectionUpdate, ItemCreate, ItemUpdate
from app.services.content import _record_version, summary_out

PUBLISHED = "published"


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def item_out(item: LibraryItem, detail: bool = False) -> dict:
    content = item.content or {}
    out = {
        "id": str(item.id),
        "collection_id": str(item.collection_id),
        "content_type": item.content_type,
        "template": content.get("template") if item.content_type == "digital_game" else None,
        "language": item.language,
        "title": item.title,
        "goal": content.get("goal") or content.get("intro"),
        "hero": item.hero,
        "audience": item.audience,
        "mode": item.mode,
        "target_strength": item.target_strength,
        "sort_order": item.sort_order,
        "status": item.status,
        "updated_at": _iso(item.updated_at),
    }
    if detail:
        out["content"] = content
    return out


def collection_out(c: LibraryCollection, items: list[LibraryItem]) -> dict:
    return {
        "id": str(c.id),
        "title": c.title,
        "description": c.description,
        "ages": c.ages,
        "sort_order": c.sort_order,
        "status": c.status,
        "updated_at": _iso(c.updated_at),
        "items": [item_out(i) for i in items if i.collection_id == c.id],
    }


def _listing(db: Session, published_only: bool) -> dict:
    cq = select(LibraryCollection).order_by(LibraryCollection.sort_order, LibraryCollection.title)
    iq = select(LibraryItem).order_by(LibraryItem.sort_order, LibraryItem.title)
    if published_only:
        cq = cq.where(LibraryCollection.status == PUBLISHED)
        iq = iq.where(LibraryItem.status == PUBLISHED)
    items = db.scalars(iq).all()
    out = [collection_out(c, items) for c in db.scalars(cq).all()]
    if published_only:
        out = [c for c in out if c["items"]]
    return {"collections": out}


def _published_item(db: Session, item_id) -> LibraryItem:
    item = _item_row(db, item_id)
    collection = db.get(LibraryCollection, item.collection_id)
    if item.status != PUBLISHED or collection is None or collection.status != PUBLISHED:
        raise AppError("NOT_FOUND")
    return item


def _item_row(db: Session, item_id) -> LibraryItem:
    item = db.get(LibraryItem, access._as_uuid(item_id)) if access._as_uuid(item_id) else None
    if item is None:
        raise AppError("NOT_FOUND")
    return item


def _collection_row(db: Session, collection_id) -> LibraryCollection:
    row = db.get(LibraryCollection, access._as_uuid(collection_id)) if access._as_uuid(collection_id) else None
    if row is None:
        raise AppError("NOT_FOUND")
    return row


# --------------------------------------------------------------------------- staff


def list_published(db: Session, user: User) -> dict:
    return _listing(db, published_only=True)


def get_item(db: Session, user: User, item_id) -> dict:
    item = _item_row(db, item_id) if user.role == "admin" else _published_item(db, item_id)
    return {"item": item_out(item, detail=True)}


def _rename(value, hero: str, name: str):
    if isinstance(value, str):
        return value.replace(hero, name)
    if isinstance(value, list):
        return [_rename(v, hero, name) for v in value]
    if isinstance(value, dict):
        return {k: _rename(v, hero, name) for k, v in value.items()}
    return value


def assign_item(db: Session, user: User, item_id, body: AssignIn) -> dict:
    """A new draft of the published item for each child (staff with write access to each child)."""
    item = _published_item(db, item_id)
    targets = [access.get_child_or_404(db, user, cid, write=True) for cid in dict.fromkeys(body.child_ids)]
    kind = item.content_type
    template = item.content.get("template") if kind == "digital_game" else None
    gi = {"mode": item.mode, "content_type": kind, "template": template, "language": item.language,
          "library_item_id": str(item.id)}
    if item.target_strength:
        gi["target_strength"] = {"key": item.target_strength,
                                 "label": vocab.label("strength_targets", item.target_strength, item.language)}
    created = []
    for child in targets:
        content = copy.deepcopy(item.content)
        name = first_name(child)
        if body.use_child_name and item.hero and name:
            content = _rename(content, item.hero, name)
        row = GeneratedContent(
            child_id=child.id, focus_area_id=None, pack_id=None, mode=item.mode, content_type=kind, language=item.language,
            title=content["title"], content=content, status="draft", shared_with_parent=False,
            generation_input=copy.deepcopy(gi), ai_provider="template", ai_model="library", is_template=True,
            video_status="script_ready" if kind == "video" else None, created_by=user.id, people=[],
        )
        db.add(row)
        db.flush()
        _record_version(db, row, user, "manual")
        audit(db, user, "library.assign", "content", row.id, child_id=child.id, library_item_id=str(item.id),
              use_child_name=body.use_child_name)
        created.append(row)
    db.flush()
    out = [summary_out(r, staff=True) for r in created]
    db.commit()
    return {"content": out}


# --------------------------------------------------------------------------- admin


def list_all(db: Session, user: User) -> dict:
    return _listing(db, published_only=False)


def create_collection(db: Session, user: User, body: CollectionCreate) -> dict:
    row = LibraryCollection(title=body.title.strip(), description=body.description, ages=body.ages,
                            sort_order=body.sort_order, created_by=user.id, updated_by=user.id)
    db.add(row)
    db.flush()
    audit(db, user, "library.collection_create", "library_collection", row.id)
    db.commit()
    return {"collection": collection_out(row, [])}


def update_collection(db: Session, user: User, collection_id, body: CollectionUpdate) -> dict:
    row = _collection_row(db, collection_id)
    sent = body.model_fields_set
    if "title" in sent and body.title is None:
        raise AppError("VALIDATION", details=[{"path": "title", "message": "The title is required."}])
    changed = []
    for field in ("title", "description", "ages", "sort_order", "status"):
        if field in sent:
            value = getattr(body, field)
            if field == "title":
                value = value.strip()
            if field == "sort_order" and value is None:
                continue
            if field == "status" and value is None:
                continue
            if getattr(row, field) != value:
                setattr(row, field, value)
                changed.append(field)
    if changed:
        row.updated_by = user.id
        audit(db, user, "library.collection_update", "library_collection", row.id, fields=changed,
              status=row.status if "status" in changed else None)
    db.flush()
    items = db.scalars(select(LibraryItem).where(LibraryItem.collection_id == row.id)
                       .order_by(LibraryItem.sort_order, LibraryItem.title)).all()
    out = collection_out(row, items)
    db.commit()
    return {"collection": out}


def validated_item_content(kind: str, data) -> dict:
    """The content checked like a teacher edit: shape → 400 VALIDATION; wording → 422 UNSAFE_CONTENT."""
    if not isinstance(data, dict):
        raise AppError("VALIDATION", details=[{"path": "content", "message": "The content must be an object."}])
    template = data.get("template") if kind == "digital_game" else None
    if kind == "digital_game" and not template:
        raise AppError("VALIDATION", details=[{"path": "content.template", "message": "Choose a game template."}])
    content, issues = validate_output(kind, data, template)
    schema = [i.removeprefix("schema:").strip() for i in issues if i.startswith("schema:")]
    safety = [i.removeprefix("safety:").strip() for i in issues if i.startswith("safety:")]
    if schema:
        raise AppError("VALIDATION", "The content is not complete or has the wrong shape.",
                       details=[{"path": "content", "message": m} for m in schema[:20]])
    if safety:
        raise AppError("UNSAFE_CONTENT", details={"issues": safety[:20]})
    return content


def _check_target(key):
    if key and vocab.item("strength_targets", key) is None and vocab.item("strengths", key) is None:
        raise AppError("VALIDATION", details=[{"path": "target_strength", "message": "Unknown strength."}])


def create_item(db: Session, user: User, body: ItemCreate) -> dict:
    _collection_row(db, body.collection_id)
    _check_target(body.target_strength)
    content = validated_item_content(body.content_type, body.content)
    row = LibraryItem(
        collection_id=body.collection_id, content_type=body.content_type, language=body.language,
        title=content["title"], content=content, hero=body.hero, audience=body.audience, mode=body.mode,
        target_strength=body.target_strength, sort_order=body.sort_order, created_by=user.id, updated_by=user.id,
    )
    db.add(row)
    db.flush()
    audit(db, user, "library.item_create", "library_item", row.id, content_type=row.content_type,
          collection_id=str(row.collection_id))
    out = item_out(row, detail=True)
    db.commit()
    return {"item": out}


def update_item(db: Session, user: User, item_id, body: ItemUpdate) -> dict:
    row = _item_row(db, item_id)
    sent = body.model_fields_set
    changed = []
    if "content" in sent and body.content is not None:
        content = validated_item_content(row.content_type, body.content)
        if content != row.content:
            row.content = content
            row.title = content["title"]
            changed.append("content")
    if "collection_id" in sent and body.collection_id is not None:
        _collection_row(db, body.collection_id)
    if "target_strength" in sent:
        _check_target(body.target_strength)
    for field in ("collection_id", "language", "hero", "audience", "mode", "target_strength", "sort_order", "status"):
        if field not in sent:
            continue
        value = getattr(body, field)
        if value is None and field not in ("hero", "target_strength"):
            continue
        if getattr(row, field) != value:
            setattr(row, field, value)
            changed.append(field)
    if changed:
        row.updated_by = user.id
        audit(db, user, "library.item_update", "library_item", row.id, fields=changed,
              status=row.status if "status" in changed else None)
    db.flush()
    out = item_out(row, detail=True)
    db.commit()
    return {"item": out}
