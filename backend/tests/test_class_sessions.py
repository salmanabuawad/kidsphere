"""Class sessions (0009): a group activity run with children of a class, and a note per child that
becomes an observation (source 'session')."""
import uuid
from datetime import timedelta

import pytest
from alembic import command
from sqlalchemy import inspect, select

from app.db import engine as db_engine
from app.models import AuditLog, ClassSession, Observation, RecordVersion
from app.services.class_sessions import local_today
from tests.conftest import alembic_config
from tests.test_library import migration

TOWER = "لولو والسرّ السحري للقوة الداخلية"


@pytest.fixture
def lulu(db):
    migration("0007_content_library").seed(db.connection())
    migration("0008_library_media").seed(db.connection())
    db.commit()
    from app.models import LibraryItem
    return {i.title: i for i in db.scalars(select(LibraryItem))}


@pytest.fixture
def maya(make_child, klass):
    return make_child(klass, name="Maya", preferred_name="مايا")


def start(client, klass, children, item=None, **extra):
    body = {"class_id": str(klass.id), "child_ids": [str(c.id) for c in children], **extra}
    if item is not None:
        body["library_item_id"] = str(item.id)
    return client.post("/api/class-sessions", json=body)


def test_migration_0009_up_and_down():
    try:
        command.downgrade(alembic_config(), "0008")
        db_engine.dispose()
        insp = inspect(db_engine)
        assert not {"class_sessions", "class_session_children"} & set(insp.get_table_names())
        assert "session_id" not in {c["name"] for c in insp.get_columns("observations")}
    finally:
        command.upgrade(alembic_config(), "head")
        db_engine.dispose()
    assert {"class_sessions", "class_session_children"} <= set(inspect(db_engine).get_table_names())


def test_run_a_library_item_with_a_class(teacher_client, db, klass, child, maya, lulu):
    r = start(teacher_client, klass, [child, maya], lulu[TOWER])
    assert r.status_code == 201, r.text
    s = r.json()["session"]
    assert s["title"] == TOWER and s["held_on"] == local_today().isoformat()
    assert s["library_item"]["title"] == TOWER and s["class"]["name"] == klass.name
    assert s["children_count"] == 2 and s["noted_count"] == 0
    assert [c["name"] for c in s["children"]] == ["Adam", "Maya"]
    assert all(c["observation"] is None for c in s["children"])
    assert db.scalars(select(AuditLog).where(AuditLog.action == "session.create")).one().meta["children"] == 2

    listed = teacher_client.get("/api/class-sessions", params={"library_item_id": str(lulu[TOWER].id)}).json()["sessions"]
    assert [x["id"] for x in listed] == [s["id"]]


def test_notes_become_observations_linked_to_a_matching_focus(teacher_client, db, klass, child, maya, lulu,
                                                             make_focus_area, teacher):
    focus = make_focus_area(child, suggestion_key="joining_group_play", category="social")
    sid = start(teacher_client, klass, [child, maya], lulu[TOWER]).json()["session"]["id"]
    url = f"/api/class-sessions/{sid}/observations"
    r = teacher_client.put(url, json={"entries": [
        {"child_id": str(child.id), "support_level": "some_support"},
        {"child_id": str(maya.id), "observation": "Asked a friend to build with her."},
    ]})
    assert r.status_code == 200, r.text
    s = r.json()["session"]
    assert s["noted_count"] == 2
    adam = next(c for c in s["children"] if c["name"] == "Adam")["observation"]
    assert adam["support_level"] == "some_support" and adam["focus_area_id"] == str(focus.id)
    assert adam["focus_area_title"] == "Joining group play"
    db.expire_all()
    rows = {o.child_id: o for o in db.scalars(select(Observation))}
    assert rows[child.id].source == "session" and rows[child.id].context == "group_time"
    assert rows[child.id].area == "social" and rows[child.id].observation is None
    assert rows[maya.id].focus_area_id is None and rows[maya.id].area == "confidence"  # the item's first goal

    # Saving again updates the same observation (one per child and session) and keeps history.
    r = teacher_client.put(url, json={"entries": [{"child_id": str(child.id), "support_level": "independent",
                                                    "observation": "Built the tower again with Omar."}]})
    assert r.status_code == 200
    db.expire_all()
    obs = db.scalars(select(Observation).where(Observation.child_id == child.id)).one()
    assert obs.support_level == "independent" and obs.observation.startswith("Built")
    versions = db.scalars(select(RecordVersion).where(RecordVersion.entity_id == obs.id)).all()
    assert len(versions) == 2

    # It is a normal observation on the child's timeline and history, with the session's title.
    entries = teacher_client.get(f"/api/children/{child.id}/timeline").json()["entries"]
    entry = next(e for e in entries if e["type"] == "observation")
    assert entry["session_title"] == TOWER and entry["support_level"] == "independent"
    hist = teacher_client.get(f"/api/children/{child.id}/observations", params={"source": "session"}).json()
    assert hist["observations"][0]["session_id"] == sid
    # Session notes are edited from the session, not as quick observations.
    assert teacher_client.put(f"/api/observations/{obs.id}", json={"observation": "x"}).status_code == 409


def test_empty_entries_are_skipped_and_only_participants_can_be_noted(teacher_client, db, klass, child, maya, lulu):
    sid = start(teacher_client, klass, [child], lulu[TOWER]).json()["session"]["id"]
    url = f"/api/class-sessions/{sid}/observations"
    assert teacher_client.put(url, json={"entries": [{"child_id": str(child.id)}]}).json()["session"]["noted_count"] == 0
    r = teacher_client.put(url, json={"entries": [{"child_id": str(maya.id), "support_level": "independent"}]})
    assert r.status_code == 400
    r = teacher_client.put(f"/api/class-sessions/{sid}/children", json={"child_ids": [str(child.id), str(maya.id)]})
    assert r.status_code == 200 and r.json()["session"]["children_count"] == 2
    assert teacher_client.put(url, json={"entries": [{"child_id": str(maya.id), "support_level": "independent"}]}).status_code == 200


def test_session_without_a_library_item_needs_a_title(teacher_client, klass, child):
    assert start(teacher_client, klass, [child]).status_code == 400
    r = start(teacher_client, klass, [child], title="Circle time: feelings")
    assert r.status_code == 201 and r.json()["session"]["library_item"] is None
    yesterday = (local_today() - timedelta(days=1)).isoformat()
    assert start(teacher_client, klass, [child], title="x", held_on=yesterday).json()["session"]["held_on"] == yesterday
    later = (local_today() + timedelta(days=2)).isoformat()
    assert start(teacher_client, klass, [child], title="x", held_on=later).status_code == 400


def test_scope(teacher_client, other_teacher_client, parent_client, admin_client, db, klass, other_class, child,
               other_child, lulu):
    assert start(teacher_client, klass, [child, other_child], lulu[TOWER]).status_code == 400  # another class's child
    assert start(teacher_client, other_class, [other_child], lulu[TOWER]).status_code == 404
    assert start(parent_client, klass, [child], lulu[TOWER]).status_code == 403
    sid = start(teacher_client, klass, [child], lulu[TOWER]).json()["session"]["id"]
    assert other_teacher_client.get(f"/api/class-sessions/{sid}").status_code == 404
    assert other_teacher_client.get("/api/class-sessions").json()["sessions"] == []
    assert admin_client.get(f"/api/class-sessions/{sid}").status_code == 200
    # A draft item is not offered to teachers.
    item = lulu[TOWER]
    admin_client.put(f"/api/admin/library/items/{item.id}", json={"status": "draft"})
    assert start(teacher_client, klass, [child], item).status_code == 404
    assert start(admin_client, klass, [child], item).status_code == 201


def test_deleting_a_session_keeps_the_observation(teacher_client, db, klass, child, lulu):
    sid = start(teacher_client, klass, [child], lulu[TOWER]).json()["session"]["id"]
    teacher_client.put(f"/api/class-sessions/{sid}/observations",
                       json={"entries": [{"child_id": str(child.id), "support_level": "independent"}]})
    db.delete(db.get(ClassSession, uuid.UUID(sid)))
    db.commit()
    db.expire_all()
    obs = db.scalars(select(Observation)).one()
    assert obs.session_id is None and obs.source == "session"  # the observation stays on the child's record
