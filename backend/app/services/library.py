"""Content library: ready-made stories, activities and games that are not tied to a child.

The items live in ``app/data/content_library.json`` (read-only, validated like generated
content): ``{hero, collections [{key, title, ages}], items [{key, collection, content_type,
mode, target_strength, content}]}``. Every item is Arabic for now.

Staff list and preview them, and assign one to children in their scope: each child gets a
new DRAFT (``generated_content``, ai_provider 'template', ai_model 'library') to review and
approve like any other. With ``use_child_name`` the hero's name (Lulu) becomes the child's
name in every text. The row has no focus area, pack, people or sharing; its
generation_input holds only the mode, type, template, language, target strength and the
library key, never anything about another child.
"""
import copy
import json
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from app import access, vocab
from app.ai import validate_output
from app.ai.context import first_name
from app.audit import audit
from app.errors import AppError
from app.models import GeneratedContent, User
from app.schemas.library import AssignIn
from app.services.content import _record_version, summary_out

LIBRARY_FILE = Path(__file__).resolve().parent.parent / "data" / "content_library.json"
LANGUAGE = "ar"


@lru_cache(maxsize=1)
def library() -> dict:
    """The library file with every item validated (a broken item fails loudly, at first use)."""
    data = json.loads(LIBRARY_FILE.read_text(encoding="utf-8"))
    for item in data["items"]:
        content, issues = validate_output(item["content_type"], item["content"], item["content"].get("template"), ai=True)
        if content is None:
            raise ValueError(f"library item {item['key']!r}: {issues}")
        item["content"] = content
    return data


def _require_staff(user: User) -> None:
    if not access.is_staff(user):
        raise AppError("FORBIDDEN")


def _item(key: str) -> dict:
    for item in library()["items"]:
        if item["key"] == key:
            return item
    raise AppError("NOT_FOUND")


def _out(item: dict, detail: bool = False) -> dict:
    content = item["content"]
    out = {
        "key": item["key"],
        "collection": item["collection"],
        "content_type": item["content_type"],
        "template": content.get("template"),
        "language": LANGUAGE,
        "title": content["title"],
        "goal": content.get("goal") or content.get("intro"),
        "hero": library()["hero"],
    }
    if detail:
        out["content"] = content
    return out


def list_items(user: User) -> dict:
    _require_staff(user)
    data = library()
    return {"collections": data["collections"], "items": [_out(i) for i in data["items"]]}


def get_item(user: User, key: str) -> dict:
    _require_staff(user)
    return {"item": _out(_item(key), detail=True)}


def _rename(value, hero: str, name: str):
    if isinstance(value, str):
        return value.replace(hero, name)
    if isinstance(value, list):
        return [_rename(v, hero, name) for v in value]
    if isinstance(value, dict):
        return {k: _rename(v, hero, name) for k, v in value.items()}
    return value


def assign_item(db: Session, user: User, key: str, body: AssignIn) -> dict:
    """A new draft of the item for each child (staff with write access to each child)."""
    _require_staff(user)
    item = _item(key)
    hero = library()["hero"]
    targets = [access.get_child_or_404(db, user, cid, write=True) for cid in dict.fromkeys(body.child_ids)]
    kind = item["content_type"]
    target = item.get("target_strength")
    gi = {"mode": item["mode"], "content_type": kind, "template": item["content"].get("template"), "language": LANGUAGE,
          "library_key": key}
    if target:
        gi["target_strength"] = {"key": target, "label": vocab.label("strength_targets", target, LANGUAGE)}
    created = []
    for child in targets:
        content = copy.deepcopy(item["content"])
        name = first_name(child)
        if body.use_child_name and name:
            content = _rename(content, hero, name)
        row = GeneratedContent(
            child_id=child.id, focus_area_id=None, pack_id=None, mode=item["mode"], content_type=kind, language=LANGUAGE,
            title=content["title"], content=content, status="draft", shared_with_parent=False,
            generation_input=copy.deepcopy(gi), ai_provider="template", ai_model="library", is_template=True,
            video_status="script_ready" if kind == "video" else None, created_by=user.id, people=[],
        )
        db.add(row)
        db.flush()
        _record_version(db, row, user, "manual")
        audit(db, user, "library.assign", "content", row.id, child_id=child.id, library_key=key,
              use_child_name=body.use_child_name)
        created.append(row)
    db.flush()
    out = [summary_out(r, staff=True) for r in created]
    db.commit()
    return {"content": out}
