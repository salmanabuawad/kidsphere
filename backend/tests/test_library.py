"""Content library (0007): admins manage collections and items; staff give published items to
children as drafts."""
import importlib.util

import pytest
from alembic import command
from sqlalchemy import inspect, select

from app.ai import validate_output
from app.config import BACKEND_DIR
from app.db import engine as db_engine
from app.models import AuditLog, GeneratedContent, LibraryCollection, LibraryItem
from tests.conftest import alembic_config

STORY = {
    "title": "Sami and the tower",
    "goal": "Trying again and asking a friend for help.",
    "story": ["Sami builds a tall tower.", "The tower falls, and Sami asks a friend to build it again."],
    "questions": ["How did Sami feel?", "Who helped Sami?"],
    "teacher_note": "Build a tower together after the story.",
}


def migration_0007():
    path = BACKEND_DIR / "migrations" / "versions" / "0007_content_library.py"
    spec = importlib.util.spec_from_file_location("migration_0007", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def lulu(db):
    """The Lulu collections as the 0007 upgrade loads them (the per-test TRUNCATE removed them)."""
    migration_0007().seed(db.connection())
    db.commit()
    return {i.content["title"]: i for i in db.scalars(select(LibraryItem))}


def item_id(lulu, title):
    return str(lulu[title].id)


def test_migration_0007_up_and_down():
    try:
        command.downgrade(alembic_config(), "0006")
        db_engine.dispose()
        assert not {"library_collections", "library_items"} & set(inspect(db_engine).get_table_names())
    finally:
        command.upgrade(alembic_config(), "head")
        db_engine.dispose()
    assert {"library_collections", "library_items"} <= set(inspect(db_engine).get_table_names())


def test_the_seed_is_valid_published_lulu_content(db, lulu):
    assert len(lulu) == 9
    for item in lulu.values():
        content, issues = validate_output(item.content_type, item.content, item.content.get("template"), ai=True)
        assert content is not None, (item.title, issues)
        assert item.status == "published" and item.hero == "لولو" and item.language == "ar"
    assert {i.audience for i in lulu.values() if i.content_type == "real_world_activity"} == {"group"}
    assert [c.title for c in db.scalars(select(LibraryCollection).order_by(LibraryCollection.sort_order))] == [
        "لولو والغيمة الصغيرة", "لولو والسرّ السحري للقوة الداخلية"]


def test_staff_see_published_items_parents_cannot(teacher_client, parent_client, admin_client, db, lulu):
    r = teacher_client.get("/api/library")
    assert r.status_code == 200
    cols = r.json()["collections"]
    assert [len(c["items"]) for c in cols] == [4, 5]
    assert cols[0]["items"][0]["title"] == "لولو والغيمة الصغيرة" and "content" not in cols[0]["items"][0]
    story = lulu["لولو والغيمة الصغيرة"]
    detail = teacher_client.get(f"/api/library/items/{story.id}").json()["item"]
    assert detail["content"]["story"][0].startswith("كان يا ما كان") and detail["hero"] == "لولو"
    assert parent_client.get("/api/library").status_code == 403
    assert teacher_client.get("/api/library/items/nope").status_code == 404

    # Unpublished: gone for teachers, still there for admins.
    assert admin_client.put(f"/api/admin/library/items/{story.id}", json={"status": "draft"}).status_code == 200
    assert teacher_client.get(f"/api/library/items/{story.id}").status_code == 404
    assert admin_client.get(f"/api/library/items/{story.id}").status_code == 200
    assert [len(c["items"]) for c in teacher_client.get("/api/library").json()["collections"]] == [3, 5]
    # An archived collection hides all of its items.
    col = str(story.collection_id)
    assert admin_client.put(f"/api/admin/library/collections/{col}", json={"status": "archived"}).status_code == 200
    assert [len(c["items"]) for c in teacher_client.get("/api/library").json()["collections"]] == [5]


def test_assign_makes_a_draft_per_child_with_the_childs_name(teacher_client, db, child, make_child, klass, lulu):
    maya = make_child(klass, name="Maya Haddad", preferred_name="مايا")
    iid = item_id(lulu, "لولو والسرّ السحري للقوة الداخلية")
    r = teacher_client.post(f"/api/library/items/{iid}/assign", json={"child_ids": [str(child.id), str(maya.id), str(child.id)]})
    assert r.status_code == 201, r.text
    out = r.json()["content"]
    assert [x["child_id"] for x in out] == [str(child.id), str(maya.id)]
    assert all(x["status"] == "draft" and not x["shared_with_parent"] and x["focus_area_id"] is None for x in out)
    db.expire_all()
    rows = {r.child_id: r for r in db.scalars(select(GeneratedContent))}
    text = " ".join(rows[maya.id].content["story"])
    assert "لولو" not in text and "مايا" in text and "Haddad" not in text
    assert rows[maya.id].title == "مايا والسرّ السحري للقوة الداخلية"
    gi = rows[child.id].generation_input
    assert gi["library_item_id"] == iid and gi["target_strength"]["key"] == "confidence"
    logs = db.scalars(select(AuditLog).where(AuditLog.action == "library.assign")).all()
    assert len(logs) == 2 and all(log.meta["library_item_id"] == iid for log in logs)
    cid = out[0]["id"]
    assert teacher_client.post(f"/api/content/{cid}/approve").status_code == 200
    assert teacher_client.post(f"/api/content/{cid}/regenerate", json={}).status_code == 200


def test_assign_can_keep_the_hero_name(teacher_client, db, child, lulu):
    item = lulu["ماذا يشعر لولو؟"]
    r = teacher_client.post(f"/api/library/items/{item.id}/assign", json={"child_ids": [str(child.id)], "use_child_name": False})
    assert r.status_code == 201, r.text
    db.expire_all()
    assert db.scalars(select(GeneratedContent)).one().content == item.content


def test_assign_needs_a_published_item_and_children_in_scope(teacher_client, parent_client, admin_client, db, child,
                                                            other_child, lulu):
    item = lulu["نشمّ الزهرة ونطفئ الشمعة"]
    url = f"/api/library/items/{item.id}/assign"
    assert teacher_client.post(url, json={"child_ids": []}).status_code == 400
    assert teacher_client.post(url, json={"child_ids": [str(child.id), str(other_child.id)]}).status_code == 404
    assert parent_client.post(url, json={"child_ids": [str(child.id)]}).status_code == 403
    admin_client.put(f"/api/admin/library/items/{item.id}", json={"status": "archived"})
    assert teacher_client.post(url, json={"child_ids": [str(child.id)]}).status_code == 404
    db.expire_all()
    assert db.scalars(select(GeneratedContent)).first() is None


def test_admin_creates_edits_and_publishes(admin_client, teacher_client, db, child):
    assert teacher_client.post("/api/admin/library/collections", json={"title": "x"}).status_code == 403
    r = admin_client.post("/api/admin/library/collections", json={"title": "Building together", "ages": "4-5"})
    assert r.status_code == 201, r.text
    col = r.json()["collection"]
    assert col["status"] == "draft" and col["items"] == []

    body = {"collection_id": col["id"], "content_type": "story", "language": "en", "hero": "Sami", "content": STORY}
    r = admin_client.post("/api/admin/library/items", json=body)
    assert r.status_code == 201, r.text
    item = r.json()["item"]
    assert item["status"] == "draft" and item["title"] == "Sami and the tower" and item["audience"] == "child"
    # Drafts are not offered to teachers.
    assert teacher_client.get("/api/library").json()["collections"] == []

    url = f"/api/admin/library/items/{item['id']}"
    edited = dict(STORY, title="Sami builds again")
    r = admin_client.put(url, json={"content": edited, "audience": "group", "target_strength": "building"})
    assert r.status_code == 200 and r.json()["item"]["title"] == "Sami builds again"
    assert admin_client.put(url, json={"status": "published"}).status_code == 200
    admin_client.put(f"/api/admin/library/collections/{col['id']}", json={"status": "published"})
    listed = teacher_client.get("/api/library").json()["collections"]
    assert [i["title"] for i in listed[0]["items"]] == ["Sami builds again"]
    # Clearing the hero keeps the name on assign.
    assert admin_client.put(url, json={"hero": None}).json()["item"]["hero"] is None

    actions = {a.action for a in db.scalars(select(AuditLog))}
    assert {"library.collection_create", "library.item_create", "library.item_update", "library.collection_update"} <= actions
    upd = db.scalars(select(AuditLog).where(AuditLog.action == "library.item_update")).first()
    assert set(upd.meta["fields"]) == {"content", "audience", "target_strength"}


def test_admin_item_content_is_checked(admin_client, db):
    col = admin_client.post("/api/admin/library/collections", json={"title": "C"}).json()["collection"]
    base = {"collection_id": col["id"], "content_type": "story", "language": "en"}
    r = admin_client.post("/api/admin/library/items", json={**base, "content": {"title": "Only a title"}})
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION"
    unsafe = dict(STORY, story=["Sami got a score of 3 points.", "Then Sami played."])
    r = admin_client.post("/api/admin/library/items", json={**base, "content": unsafe})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNSAFE_CONTENT"
    r = admin_client.post("/api/admin/library/items", json={**base, "content_type": "digital_game", "content": {"title": "G"}})
    assert r.status_code == 400
    r = admin_client.post("/api/admin/library/items", json={**base, "content": STORY, "target_strength": "nope"})
    assert r.status_code == 400
    r = admin_client.post("/api/admin/library/items", json={**base, "collection_id": "00000000-0000-0000-0000-000000000000",
                                                            "content": STORY})
    assert r.status_code == 404
    assert db.scalars(select(LibraryItem)).first() is None
