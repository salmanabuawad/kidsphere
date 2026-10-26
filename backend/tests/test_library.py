"""Content library: list, preview and assign ready-made content to children as drafts."""
import pytest
from sqlalchemy import select

from app.models import AuditLog, GeneratedContent
from app.services import library


def test_every_library_item_is_valid_and_safe():
    data = library.library()
    keys = [i["key"] for i in data["items"]]
    assert len(keys) == len(set(keys)) == 9
    collections = {c["key"] for c in data["collections"]}
    assert all(i["collection"] in collections for i in data["items"])
    assert all(data["hero"] in i["content"]["title"] or i["content_type"] != "story" for i in data["items"])


def test_staff_list_and_preview_parents_cannot(teacher_client, parent_client):
    r = teacher_client.get("/api/library")
    assert r.status_code == 200
    body = r.json()
    assert [c["key"] for c in body["collections"]] == ["lulu_cloud", "lulu_tower"]
    first = body["items"][0]
    assert first["key"] == "lulu_cloud_story" and first["hero"] == "لولو" and "content" not in first
    item = teacher_client.get("/api/library/lulu_cloud_story").json()["item"]
    assert item["content"]["story"][0].startswith("كان يا ما كان")
    assert teacher_client.get("/api/library/nope").status_code == 404
    assert parent_client.get("/api/library").status_code == 403


def test_assign_makes_a_draft_per_child_with_the_childs_name(teacher_client, db, child, make_child, klass):
    maya = make_child(klass, name="Maya Haddad", preferred_name="مايا")
    r = teacher_client.post("/api/library/lulu_tower_story/assign",
                            json={"child_ids": [str(child.id), str(maya.id), str(child.id)]})
    assert r.status_code == 201, r.text
    out = r.json()["content"]
    assert [x["child_id"] for x in out] == [str(child.id), str(maya.id)]
    assert all(x["status"] == "draft" and not x["shared_with_parent"] and x["focus_area_id"] is None for x in out)
    db.expire_all()
    rows = {r.child_id: r for r in db.scalars(select(GeneratedContent))}
    text = " ".join(rows[maya.id].content["story"])
    assert "لولو" not in text and "مايا" in text and "Haddad" not in text
    assert rows[maya.id].title == "مايا والسرّ السحري للقوة الداخلية"
    assert "Adam" in rows[child.id].content["story"][0]
    gi = rows[child.id].generation_input
    assert gi["library_key"] == "lulu_tower_story" and gi["target_strength"]["key"] == "confidence"
    assert rows[child.id].ai_model == "library" and rows[child.id].language == "ar"
    logs = db.scalars(select(AuditLog).where(AuditLog.action == "library.assign")).all()
    assert len(logs) == 2 and all(log.meta["library_key"] == "lulu_tower_story" for log in logs)
    # An ordinary draft from here on: it can be edited, approved and regenerated.
    cid = out[0]["id"]
    assert teacher_client.post(f"/api/content/{cid}/approve").status_code == 200
    assert teacher_client.post(f"/api/content/{cid}/regenerate", json={}).status_code == 200


@pytest.mark.parametrize("key", ["lulu_feelings_game", "lulu_breathing"])
def test_assign_can_keep_the_hero_name(teacher_client, db, child, key):
    r = teacher_client.post(f"/api/library/{key}/assign", json={"child_ids": [str(child.id)], "use_child_name": False})
    assert r.status_code == 201, r.text
    db.expire_all()
    row = db.scalars(select(GeneratedContent)).one()
    assert row.content == library._item(key)["content"]


def test_assign_needs_children_in_scope(teacher_client, parent_client, db, child, other_child):
    url = "/api/library/lulu_breathing/assign"
    assert teacher_client.post(url, json={"child_ids": []}).status_code == 400
    assert teacher_client.post(url, json={"child_ids": [str(child.id), str(other_child.id)]}).status_code == 404
    assert teacher_client.post("/api/library/nope/assign", json={"child_ids": [str(child.id)]}).status_code == 404
    assert parent_client.post(url, json={"child_ids": [str(child.id)]}).status_code == 403
    db.expire_all()
    assert db.scalars(select(GeneratedContent)).first() is None
