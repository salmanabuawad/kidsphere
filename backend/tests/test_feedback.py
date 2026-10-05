"""WP-11: "How did it go?" feedback (spec §20; PLAN-ADJUSTMENTS B4, B5, B9)."""
import pytest
from sqlalchemy import select

from app.models import ContentFeedback, GeneratedContent, Observation
from tests.test_content import _no_key, adam, approve, audit_rows, generate  # noqa: F401  (fixtures)


@pytest.fixture
def approved(teacher_client, adam):  # noqa: F811
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="real_world_activity")["content"]
    approve(teacher_client, c["id"])
    return child, focus, c


def fb_url(content):
    return f"/api/content/{content['id']}/feedback"


def timeline(client, child):
    return client.get(f"/api/children/{child.id}/timeline").json()["entries"]


def test_result_only_feedback_mirrors_one_observation_and_one_timeline_entry(teacher_client, approved, db, teacher):
    child, focus, c = approved
    r = teacher_client.post(fb_url(c), json={"result": "worked_well"})  # tap 1: open, tap 2: result
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["content"]["status"] == "completed" and body["content"]["last_feedback_result"] == "worked_well"
    fb = body["feedback"]
    assert fb["result"] == "worked_well" and fb["observation"] is None and fb["by_name"] == teacher.name

    db.expire_all()
    rows = db.scalars(select(ContentFeedback)).all()
    obs = db.scalars(select(Observation)).all()
    assert len(rows) == 1 and len(obs) == 1
    assert rows[0].observation_id == obs[0].id and str(obs[0].id) == fb["observation_id"]
    assert obs[0].source == "content_feedback" and obs[0].observation is None
    assert str(obs[0].content_id) == c["id"] and obs[0].focus_area_id == focus.id
    assert obs[0].created_by == teacher.id

    entries = timeline(teacher_client, child)
    feedback_entries = [e for e in entries if e["type"] == "content_feedback"]
    assert len(feedback_entries) == 1
    assert feedback_entries[0]["result"] == "worked_well" and feedback_entries[0]["text"] is None
    assert feedback_entries[0]["content_title"] == c["title"]
    assert body["content"]["feedback"][0]["id"] == fb["id"]


def test_full_feedback_is_mirrored(teacher_client, approved, db):
    child, focus, c = approved
    r = teacher_client.post(fb_url(c), json={
        "result": "partly", "support_level": "some_support", "observation": "  Stayed 8 minutes with a friend.  ",
        "what_helped": ["adult_mediation", {"custom": "A toy garage"}, "adult_mediation"],
    })
    assert r.status_code == 201, r.text
    db.expire_all()
    (obs,) = db.scalars(select(Observation)).all()
    assert obs.observation == "Stayed 8 minutes with a friend." and obs.support_level == "some_support"
    assert obs.what_helped == [{"key": "adult_mediation"}, {"custom": "A toy garage"}]
    (row,) = db.scalars(select(ContentFeedback)).all()
    assert row.result == "partly" and row.what_helped == obs.what_helped and row.observation == obs.observation


def test_repeat_feedback_on_completed_content(teacher_client, approved, db):
    child, _, c = approved
    assert teacher_client.post(fb_url(c), json={"result": "partly"}).status_code == 201
    r = teacher_client.post(fb_url(c), json={"result": "worked_well", "observation": "Asked a friend without prompting."})
    assert r.status_code == 201
    assert r.json()["content"]["status"] == "completed" and len(r.json()["content"]["feedback"]) == 2
    db.expire_all()
    assert len(db.scalars(select(ContentFeedback)).all()) == 2
    assert len(db.scalars(select(Observation)).all()) == 2
    entries = [e for e in timeline(teacher_client, child) if e["type"] == "content_feedback"]
    assert [e["result"] for e in entries] == ["worked_well", "partly"]


def test_feedback_needs_approved_or_completed_content(teacher_client, adam, db):  # noqa: F811
    child, focus = adam
    draft = generate(teacher_client, child, focus, kind="story")["content"]
    r = teacher_client.post(fb_url(draft), json={"result": "partly"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_TRANSITION"
    teacher_client.post(f"/api/content/{draft['id']}/archive")
    assert teacher_client.post(fb_url(draft), json={"result": "partly"}).status_code == 409
    db.expire_all()
    assert db.scalars(select(Observation)).all() == [] and db.scalars(select(ContentFeedback)).all() == []


def test_feedback_validation(teacher_client, approved):
    _, _, c = approved
    assert teacher_client.post(fb_url(c), json={}).status_code == 400
    assert teacher_client.post(fb_url(c), json={"result": "great"}).status_code == 400
    assert teacher_client.post(fb_url(c), json={"result": "partly", "what_helped": ["nope"]}).status_code == 400
    assert teacher_client.post(fb_url(c), json={"result": "partly", "support_level": "a_lot"}).status_code == 400
    assert teacher_client.post(fb_url(c), json={"result": "partly", "score": 3}).status_code == 400
    assert teacher_client.post(fb_url(c), json={"result": "partly", "observation": "x" * 4001}).status_code == 400


def test_feedback_is_staff_only(teacher_client, parent_client, other_teacher_client, approved):
    _, _, c = approved
    assert other_teacher_client.post(fb_url(c), json={"result": "partly"}).status_code == 404
    assert parent_client.post(fb_url(c), json={"result": "partly"}).status_code == 404  # not shared
    teacher_client.post(f"/api/content/{c['id']}/share", json={"shared": True})
    assert parent_client.post(fb_url(c), json={"result": "partly"}).status_code == 403
    assert "feedback" not in parent_client.get(f"/api/content/{c['id']}").json()["content"]


def test_feedback_is_audited_without_text(teacher_client, approved, db):
    child, _, c = approved
    fb = teacher_client.post(fb_url(c), json={"result": "did_not_work", "observation": "Left after a minute."}).json()
    (row,) = audit_rows(db, "feedback.create")
    assert str(row.object_id) == fb["feedback"]["id"] and row.child_id == child.id
    assert row.meta["result"] == "did_not_work" and row.meta["content_id"] == c["id"]
    assert row.meta["from_status"] == "approved"
    assert "Left after a minute." not in str(row.meta)


def test_feedback_is_one_transaction(client_for, teacher, approved, db, monkeypatch):
    """An error after the observation and the feedback rows were flushed leaves nothing behind."""
    _, _, c = approved

    def boom(*args, **kwargs):
        raise RuntimeError("forced failure")

    monkeypatch.setattr("app.services.feedback.audit", boom)
    client = client_for(teacher, raise_server_exceptions=False)
    r = client.post(fb_url(c), json={"result": "partly", "observation": "Should not be saved."})
    assert r.status_code == 500
    db.expire_all()
    assert db.scalars(select(Observation)).all() == []
    assert db.scalars(select(ContentFeedback)).all() == []
    assert db.get(GeneratedContent, c["id"]).status == "approved"
