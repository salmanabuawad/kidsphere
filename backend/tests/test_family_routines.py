"""Family routines (0013): picture schedules made by parents or staff."""
import json

from alembic import command
from sqlalchemy import inspect, select

from app.ai import find_unsafe_text
from app.db import engine as db_engine
from app.models import AuditLog
from app.services import family_routines
from tests.conftest import alembic_config

ROUTINE = {"title": "Our morning", "steps": [{"emoji": "🌞", "label": "Wake up"}, {"emoji": "🥣", "label": "Breakfast"}]}


def test_migration_0013_up_and_down():
    try:
        command.downgrade(alembic_config(), "0012")
        db_engine.dispose()
        assert "family_routines" not in inspect(db_engine).get_table_names()
    finally:
        command.upgrade(alembic_config(), "head")
        db_engine.dispose()
    assert "family_routines" in inspect(db_engine).get_table_names()


def test_presets_in_every_language(parent_client):
    for lang in ("en", "ar", "he"):
        out = parent_client.get("/api/routine-presets", params={"language": lang}).json()
        assert [p["key"] for p in out["presets"]] == ["morning", "bedtime", "arrival"] and out["emojis"]
    raw = family_routines.data()["presets"]
    texts = [v for p in raw for v in p["title"].values()] + [v for p in raw for s in p["steps"] for v in s["label"].values()]
    assert find_unsafe_text(texts, child_facing=True) == []


def test_parents_and_teachers_manage_a_childs_routines(parent_client, teacher_client, child, db):
    r = parent_client.post(f"/api/children/{child.id}/routines", json=ROUTINE)
    assert r.status_code == 201, r.text
    rid = r.json()["routine"]["id"]
    assert r.json()["routine"]["created_by_role"] == "parent"
    assert [x["id"] for x in teacher_client.get(f"/api/children/{child.id}/routines").json()["routines"]] == [rid]
    upd = {**ROUTINE, "steps": ROUTINE["steps"] + [{"emoji": "🏫", "label": "Kindergarten"}]}
    assert len(teacher_client.put(f"/api/routines/{rid}", json=upd).json()["routine"]["steps"]) == 3
    assert parent_client.delete(f"/api/routines/{rid}").status_code == 204
    actions = [a.action for a in db.scalars(select(AuditLog).order_by(AuditLog.id)) if a.action.startswith("routine.")]
    assert actions == ["routine.create", "routine.update", "routine.delete"]
    assert "Breakfast" not in json.dumps([a.meta for a in db.scalars(select(AuditLog))])


def test_routine_rules(parent_client, other_parent_client, child):
    url = f"/api/children/{child.id}/routines"
    assert parent_client.post(url, json={"title": "x", "steps": [{"emoji": "🌞", "label": "One"}]}).status_code == 400
    bad = {"title": "Morning", "steps": [{"emoji": "🌞", "label": "Wake up"}, {"emoji": "😠", "label": "punishment"}]}
    assert parent_client.post(url, json=bad).status_code == 422
    assert other_parent_client.post(url, json=ROUTINE).status_code == 404
    rid = parent_client.post(url, json=ROUTINE).json()["routine"]["id"]
    assert other_parent_client.delete(f"/api/routines/{rid}").status_code == 404
    for _ in range(9):
        parent_client.post(url, json=ROUTINE)
    assert parent_client.post(url, json=ROUTINE).status_code == 409
