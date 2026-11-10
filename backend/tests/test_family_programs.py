"""Family programs (0012): the weekly journey, enrolments and weekly reflections."""
import importlib.util
import json
from datetime import date, timedelta
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import inspect, select

from app.db import engine as db_engine
from app.models import AuditLog, FamilyProgram, FamilyWeekReflection
from app.services.family_programs import current_week
from app.sessions import utcnow
from tests.conftest import alembic_config

MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0012_family_programs.py"


def _migration():
    spec = importlib.util.spec_from_file_location("m0012", MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def roots(db):
    _migration().seed(db.connection())
    db.commit()
    return db.scalars(select(FamilyProgram)).one()


def week(n=1):
    return {"content_type": "home_activity", "topic": {"en": f"Week {n}"}, "lesson": {"en": "Name feelings calmly."},
            "try_at_home": {"en": "Play together."}, "reflection": {"en": "What did you notice?"}}


def enrol(client, child, program, started_on=None, expect=201):
    body = {"program_id": str(program.id)}
    if started_on:
        body["started_on"] = started_on.isoformat()
    r = client.post(f"/api/children/{child.id}/family-programs", json=body)
    assert r.status_code == expect, r.text
    return r.json().get("enrolment")


def test_migration_0012_up_and_down():
    try:
        command.downgrade(alembic_config(), "0011")
        db_engine.dispose()
        assert not {"family_programs", "family_enrolments"} & set(inspect(db_engine).get_table_names())
    finally:
        command.upgrade(alembic_config(), "head")
        db_engine.dispose()
    assert "family_week_reflections" in inspect(db_engine).get_table_names()


def test_roots_of_resilience_seed(roots):
    assert roots.status == "published" and len(roots.weeks) == 8
    assert roots.title == {"en": "Roots of Resilience", "ar": "جذور المرونة", "he": "שורשים של חוסן"}
    for w in roots.weeks:
        assert set(w) == {"content_type", "topic", "lesson", "try_at_home", "reflection"}
        for key in ("topic", "lesson", "try_at_home", "reflection"):
            assert set(w[key]) == {"en", "ar", "he"} and all(w[key].values())
    from app.ai import find_unsafe_text
    texts = [t for w in roots.weeks for k in ("topic", "lesson", "try_at_home", "reflection") for t in w[k].values()]
    assert find_unsafe_text(texts, child_facing=True) == []


def test_current_week():
    start = date(2026, 11, 2)
    assert current_week(start, 8, date(2026, 11, 1)) == 0
    assert current_week(start, 8, start) == 1
    assert current_week(start, 8, start + timedelta(days=6)) == 1
    assert current_week(start, 8, start + timedelta(days=7)) == 2
    assert current_week(start, 8, start + timedelta(days=200)) == 8


def test_admin_manages_programs(admin_client, teacher_client, parent_client, db):
    r = admin_client.post("/api/admin/family-programs", json={"title": {"en": "Calm Mornings"}, "weeks": [week(1), week(2)]})
    assert r.status_code == 201, r.text
    p = r.json()["program"]
    assert p["status"] == "draft" and len(p["weeks"]) == 2 and p["weeks"][0]["topic"] == {"en": "Week 1"}
    # Teachers see only published programs; parents none.
    assert teacher_client.get("/api/family-programs").json()["programs"] == []
    assert teacher_client.get(f"/api/family-programs/{p['id']}").status_code == 404
    assert parent_client.get("/api/family-programs").status_code == 403
    r = admin_client.put(f"/api/admin/family-programs/{p['id']}", json={"status": "published"})
    assert r.json()["program"]["status"] == "published"
    assert [x["id"] for x in teacher_client.get("/api/family-programs").json()["programs"]] == [p["id"]]
    assert teacher_client.post("/api/admin/family-programs", json={"title": {"en": "x"}, "weeks": [week()]}).status_code == 403
    actions = [a.action for a in db.scalars(select(AuditLog).order_by(AuditLog.id))]
    assert actions == ["family_program.create", "family_program.update"]


def test_program_wording_and_shape_are_checked(admin_client):
    bad = {**week(), "lesson": {"en": "Help with the diagnosis at home."}}
    r = admin_client.post("/api/admin/family-programs", json={"title": {"en": "X"}, "weeks": [bad]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNSAFE_CONTENT"
    assert admin_client.post("/api/admin/family-programs", json={"title": {}, "weeks": [week()]}).status_code == 400
    assert admin_client.post("/api/admin/family-programs", json={"title": {"en": "X"}, "weeks": []}).status_code == 400
    assert admin_client.post("/api/admin/family-programs",
                             json={"title": {"en": "X"}, "weeks": [week(i) for i in range(13)]}).status_code == 400


def test_enrol_and_follow_the_journey(teacher_client, parent_client, other_parent_client, child, roots, db, parent):
    start = utcnow().date() - timedelta(days=8)  # in week 2
    e = enrol(teacher_client, child, roots, start)
    assert e["current_week"] == 2 and e["weeks_count"] == 8 and e["status"] == "active"
    enrol(teacher_client, child, roots, expect=409)

    # The parent sees the journey and answers this week's reflection.
    got = parent_client.get(f"/api/children/{child.id}/family-programs").json()["enrolments"]
    assert [x["id"] for x in got] == [e["id"]] and got[0]["program"]["weeks"][1]["topic"]["en"]
    r = parent_client.post(f"/api/family-enrolments/{e['id']}/reflections",
                           json={"week": 2, "result": "partly", "note": "We played for ten minutes."})
    assert r.status_code == 201, r.text
    (refl,) = r.json()["enrolment"]["reflections"]
    assert refl["author_role"] == "parent" and refl["result"] == "partly" and refl["by_name"] == parent.name
    # A future week, a missing result, another family.
    assert parent_client.post(f"/api/family-enrolments/{e['id']}/reflections", json={"week": 3, "result": "partly"}).status_code == 400
    assert parent_client.post(f"/api/family-enrolments/{e['id']}/reflections", json={"week": 2}).status_code == 400
    assert other_parent_client.post(f"/api/family-enrolments/{e['id']}/reflections",
                                    json={"week": 2, "result": "partly"}).status_code == 404
    assert parent_client.post(f"/api/children/{child.id}/family-programs",
                              json={"program_id": str(roots.id)}).status_code == 403

    # The teacher adds guidance for the family (a note), which is wording-checked.
    r = teacher_client.post(f"/api/family-enrolments/{e['id']}/reflections",
                            json={"week": 2, "note": "Lovely! Try the calm breath before bedtime too."})
    assert r.status_code == 201
    assert [x["author_role"] for x in r.json()["enrolment"]["reflections"]] == ["parent", "teacher"]
    bad = teacher_client.post(f"/api/family-enrolments/{e['id']}/reflections", json={"week": 2, "note": "A disorder."})
    assert bad.status_code == 422

    audit = db.scalars(select(AuditLog).where(AuditLog.action == "family.week_reflection")).all()
    assert len(audit) == 2 and all("note" not in a.meta for a in audit)
    assert "ten minutes" not in json.dumps([a.meta for a in audit])


def test_stopped_journey_takes_no_reflections(teacher_client, parent_client, child, roots, db):
    e = enrol(teacher_client, child, roots)
    r = teacher_client.put(f"/api/family-enrolments/{e['id']}", json={"status": "stopped"})
    assert r.json()["enrolment"]["status"] == "stopped"
    assert parent_client.post(f"/api/family-enrolments/{e['id']}/reflections",
                              json={"week": 1, "result": "partly"}).status_code == 409
    assert parent_client.put(f"/api/family-enrolments/{e['id']}", json={"status": "active"}).status_code == 403
    # A new active enrolment is possible once the first is stopped.
    enrol(teacher_client, child, roots)
    assert teacher_client.put(f"/api/family-enrolments/{e['id']}", json={"status": "active"}).status_code == 409


def test_enrolment_shows_content_shared_since_the_start(teacher_client, parent_client, child, roots, db, teacher):
    from app.models import GeneratedContent

    e = enrol(teacher_client, child, roots, utcnow().date())
    shared = GeneratedContent(child_id=child.id, mode="growth_support", content_type="home_activity", language="en",
                              title="At Home Together", content={}, status="approved", shared_with_parent=True,
                              ai_provider="template", is_template=True, approved_at=utcnow(), created_by=teacher.id,
                              generation_input={})
    hidden = GeneratedContent(child_id=child.id, mode="growth_support", content_type="story", language="en",
                              title="Not shared", content={}, status="approved", shared_with_parent=False,
                              ai_provider="template", is_template=True, approved_at=utcnow(), created_by=teacher.id,
                              generation_input={})
    db.add_all([shared, hidden])
    db.commit()
    got = parent_client.get(f"/api/children/{child.id}/family-programs").json()["enrolments"][0]
    assert [c["title"] for c in got["shared_content"]] == ["At Home Together"]
    assert got["can_edit"] is False
    assert teacher_client.get(f"/api/children/{child.id}/family-programs").json()["enrolments"][0]["can_edit"] is True
    assert e["id"] == got["id"]


def test_other_classes_cannot_see_or_enrol(other_teacher_client, child, roots):
    assert other_teacher_client.get(f"/api/children/{child.id}/family-programs").status_code == 404
    assert other_teacher_client.post(f"/api/children/{child.id}/family-programs",
                                     json={"program_id": str(roots.id)}).status_code == 404


def test_week_reflections_are_kept_per_save(teacher_client, parent_client, child, roots, db):
    e = enrol(teacher_client, child, roots)
    for result in ("partly", "worked_well"):
        parent_client.post(f"/api/family-enrolments/{e['id']}/reflections", json={"week": 1, "result": result})
    db.expire_all()
    assert [r.result for r in db.scalars(select(FamilyWeekReflection).order_by(FamilyWeekReflection.created_at))] == \
        ["partly", "worked_well"]
