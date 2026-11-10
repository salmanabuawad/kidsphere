"""Pilot support (0014): parent questionnaires and the counts-only overview."""
import json

from alembic import command
from sqlalchemy import inspect

from app.ai import find_unsafe_text
from app.db import engine as db_engine
from app.services import family_pilot
from tests.conftest import alembic_config
from tests.test_family_programs import enrol, roots  # noqa: F401  (fixtures)

ANSWERS = {"big_feelings": "sometimes", "talk_feelings": "rarely", "routines": "often", "play_together": "every_day",
           "ask_teacher": "somewhat"}


def test_migration_0014_up_and_down():
    try:
        command.downgrade(alembic_config(), "0013")
        db_engine.dispose()
        assert "family_questionnaires" not in inspect(db_engine).get_table_names()
    finally:
        command.upgrade(alembic_config(), "head")
        db_engine.dispose()
    assert "family_questionnaires" in inspect(db_engine).get_table_names()


def test_questions_in_every_language_and_gentle(parent_client):
    for lang in ("en", "ar", "he"):
        qs = parent_client.get("/api/family-questionnaire", params={"language": lang}).json()["questions"]
        assert len(qs) == 5 and all(q["options"] for q in qs)
    d = family_pilot.data()
    texts = [v for q in d["questions"] for v in q["text"].values()] + [v for o in d["options"].values() for v in o.values()]
    assert find_unsafe_text(texts, child_facing=True) == []


def test_parent_answers_baseline_and_end(teacher_client, parent_client, other_parent_client, child, roots):  # noqa: F811
    e = enrol(teacher_client, child, roots)
    url = f"/api/family-enrolments/{e['id']}/questionnaire"
    assert parent_client.post(url, json={"kind": "baseline", "answers": {"big_feelings": "often"}}).status_code == 400
    assert parent_client.post(url, json={"kind": "baseline", "answers": {**ANSWERS, "routines": "always"}}).status_code == 400
    assert other_parent_client.post(url, json={"kind": "baseline", "answers": ANSWERS}).status_code == 404
    r = parent_client.post(url, json={"kind": "baseline", "answers": ANSWERS})
    assert r.status_code == 201 and r.json()["answered"] == ["baseline"]
    got = parent_client.get(f"/api/children/{child.id}/family-programs").json()["enrolments"][0]
    assert got["questionnaires"] == ["baseline"]
    parent_client.post(url, json={"kind": "end", "answers": {**ANSWERS, "talk_feelings": "often"}})

    ov = teacher_client.get("/api/family-overview").json()
    assert ov["journeys"]["total"] == 1 and ov["journeys"]["by_status"] == {"active": 1}
    assert ov["questionnaires"]["baseline"] == 1 and ov["questionnaires"]["end"] == 1
    assert ov["questionnaires"]["answers"]["baseline"]["talk_feelings"] == {"rarely": 1, "sometimes": 0, "often": 0}
    assert ov["questionnaires"]["answers"]["end"]["talk_feelings"]["often"] == 1
    text = json.dumps(ov)
    assert "%" not in text and "score" not in text and str(child.id) not in text and child.name not in text


def test_overview_counts_weekly_participation_and_respects_scope(teacher_client, other_teacher_client, admin_client,
                                                                 parent_client, child, roots):  # noqa: F811
    e = enrol(teacher_client, child, roots)
    parent_client.post(f"/api/family-enrolments/{e['id']}/reflections", json={"week": 1, "result": "partly"})
    parent_client.post(f"/api/family-enrolments/{e['id']}/reflections", json={"week": 1, "result": "worked_well"})
    ov = admin_client.get("/api/family-overview", params={"program_id": str(roots.id)}).json()
    assert ov["weekly_reflections"] == [{"week": 1, "families": 1}] and ov["families_active_recently"] == 1
    assert ov["journeys"]["by_kindergarten"] == [{"kindergarten": "Sunflower KG", "count": 1}]
    assert other_teacher_client.get("/api/family-overview").json()["journeys"]["total"] == 0
    assert parent_client.get("/api/family-overview").status_code == 404
