"""WP-06: baselines (immutable snapshots), current understanding and the demo seed."""
import json

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app import dev_seed, vocab
from app.models import AuditLog, Baseline, Child, ChildProfile, FocusArea


def fill_profile(teacher_client, parent_client, child):
    base = f"/api/children/{child.id}/profile"
    # A teacher enters the parent's answers (most families have no account) ...
    r = teacher_client.patch(base, json={"perspective": "parent", "section": "who", "data": {
        "strengths": ["imagination", "building"], "interests": ["cars_transportation", "animals"]}})
    assert r.status_code == 200, r.text
    # ... and the parent adds more themselves.
    r = parent_client.patch(base, json={"section": "priorities", "data": {
        "parent_priorities": ["social", "confidence"], "hope_child_feels": ["belonging"], "one_thing_to_know": "Likes trains"}})
    assert r.status_code == 200, r.text
    r = parent_client.patch(base, json={"section": "environment", "data": {
        "items": [{"key": "noise", "what_happens": "Covers ears", "what_helps": ["quiet_space"]}]}})
    assert r.status_code == 200, r.text
    for section, data in {
        "who": {"strengths": ["imagination", "vocabulary"], "interests": ["blocks"]},
        "emotions": {"calming_helps": ["hug"], "transition_reaction": "needs_preparation", "transition_helps": ["countdown_timer"]},
        "independence": {"levels": {"eating": "independent", "dressing": "some_support", "shoes": "significant_support",
                                    "toilet": "not_observed"}},
    }.items():
        r = teacher_client.patch(base, json={"section": section, "data": data})
        assert r.status_code == 200, r.text
    r = teacher_client.post(f"/api/children/{child.id}/focus-areas", json={
        "suggestion_key": "joining_group_play", "plan": {"strength_used": "Building", "success_looks_like": "Invites a friend"}})
    assert r.status_code == 201, r.text


def test_create_baseline_snapshot(teacher_client, parent_client, teacher, child, db):
    fill_profile(teacher_client, parent_client, child)
    r = teacher_client.post(f"/api/children/{child.id}/baseline")
    assert r.status_code == 201, r.text
    b = r.json()["baseline"]
    assert b["created_by"] == {"id": str(teacher.id), "name": teacher.name}
    data = b["baseline_data"]
    assert data["basics"]["name"] == "Adam" and data["basics"]["class_name"] == "Class A"
    assert set(data["basics"]["age"]) == {"years", "months"}
    # Both perspectives with entered stamps; parent answers entered by a teacher show as such.
    who_stamps = data["parent_perspective"]["entered"]["who"]
    assert who_stamps[0]["role"] == "teacher" and who_stamps[0]["reported_by"] == "parent"
    assert data["parent_perspective"]["entered"]["priorities"][0]["role"] == "parent"
    assert "who" in data["teacher_perspective"]["sections"]
    # Merged lists.
    assert {i["key"]: i["sources"] for i in data["strengths"]} == {
        "imagination": ["parent", "teacher"], "building": ["parent"], "vocabulary": ["teacher"]}
    assert {i["key"] for i in data["interests"]} == {"cars_transportation", "animals", "blocks"}
    # Support needs (B13).
    needs = data["support_needs"]
    assert needs["independence"] == [
        {"area": "dressing", "level": "some_support", "reported_by": "teacher"},
        {"area": "shoes", "level": "significant_support", "reported_by": "teacher"},
    ]
    assert needs["sensitivities"][0]["key"] == "noise" and needs["sensitivities"][0]["what_helps"] == [{"key": "quiet_space"}]
    assert needs["emotions"]["teacher"]["transition_helps"] == [{"key": "countdown_timer"}]
    assert needs["parent_priorities"]["categories"] == ["social", "confidence"]
    # Active focus areas with their plans.
    assert len(data["focus_areas"]) == 1
    assert data["focus_areas"][0]["suggestion_key"] == "joining_group_play"
    assert data["focus_areas"][0]["plan"] == {"strength_used": "Building", "success_looks_like": "Invites a friend"}
    assert data["created_by"]["id"] == str(teacher.id)

    db.expire_all()
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    assert profile.wizard_completed_at is not None
    cu = profile.current_understanding
    assert cu["source"] == "baseline" and cu["baseline_id"] == b["id"]
    assert cu["areas_for_support"] == ["Joining group play"]
    assert "Adam" in cu["summary"] and cu["summary"]
    assert [i["key"] for i in cu["strengths"]] == ["imagination", "building", "vocabulary"]
    lowered = (cu["summary"] + " " + (cu["adaptations"] or "") + " " + cu["next_steps"]).lower()
    for term in vocab.banned_terms()["clinical"]["en"] + vocab.banned_terms()["child_deficit"]["en"]:
        assert term not in lowered
    assert db.scalars(select(AuditLog).where(AuditLog.action == "baseline.create")).one().child_id == child.id


def test_every_post_inserts_a_new_immutable_row(teacher_client, parent_client, child, db):
    fill_profile(teacher_client, parent_client, child)
    first = teacher_client.post(f"/api/children/{child.id}/baseline").json()["baseline"]
    db.expire_all()
    first_json = json.dumps(db.get(Baseline, first["id"]).baseline_data, sort_keys=True)
    cu_before = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one().current_understanding

    # Late parent answers, then "Create new baseline".
    parent_client.patch(f"/api/children/{child.id}/profile", json={"section": "who", "data": {"strengths": ["humor"]}})
    second = teacher_client.post(f"/api/children/{child.id}/baseline").json()["baseline"]
    assert second["id"] != first["id"]
    assert "humor" in {i["key"] for i in second["baseline_data"]["strengths"]}

    db.expire_all()
    assert db.scalar(select(text("count(*)")).select_from(Baseline)) == 2
    assert json.dumps(db.get(Baseline, first["id"]).baseline_data, sort_keys=True) == first_json
    # Current understanding is only initialised once.
    assert db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one().current_understanding == cu_before

    got = teacher_client.get(f"/api/children/{child.id}/baseline").json()
    assert got["latest"]["id"] == second["id"]
    assert [e["id"] for e in got["earlier"]] == [first["id"]]
    assert got["earlier"][0]["created_by"]["name"]

    # No route changes a baseline.
    for method in ("put", "patch", "delete"):
        assert getattr(teacher_client, method)(f"/api/children/{child.id}/baseline").status_code in (404, 405)


def test_db_trigger_rejects_update(teacher_client, child, db):
    bid = teacher_client.post(f"/api/children/{child.id}/baseline").json()["baseline"]["id"]
    with pytest.raises(DBAPIError):
        db.execute(text("UPDATE baselines SET baseline_data = '{}'::jsonb WHERE id = :id"), {"id": bid})
        db.flush()
    db.rollback()


def test_empty_profile_baseline_and_current_understanding(teacher_client, child):
    assert teacher_client.get(f"/api/children/{child.id}/baseline").json() == {"latest": None, "earlier": []}
    cu = teacher_client.get(f"/api/children/{child.id}/current-understanding").json()
    assert cu == {"current_understanding": None, "baseline": None}

    b = teacher_client.post(f"/api/children/{child.id}/baseline").json()["baseline"]
    needs = b["baseline_data"]["support_needs"]
    assert needs["independence"] == [] and needs["sensitivities"] == [] and needs["emotions"] == {}
    cu = teacher_client.get(f"/api/children/{child.id}/current-understanding").json()
    assert cu["current_understanding"]["summary"]
    assert cu["baseline"]["id"] == b["id"]
    assert set(cu["baseline"]["summary"]) == {"strengths", "interests", "what_helps", "support_needs", "focus_areas"}


def test_understanding_language_follows_user(client_for, make_user, klass, make_child, db):
    from app.models import ClassTeacher

    he_teacher = make_user("teacher", language="he")
    db.add(ClassTeacher(class_id=klass.id, user_id=he_teacher.id))
    db.commit()
    kid = make_child(klass, name="Noa")
    c = client_for(he_teacher)
    c.patch(f"/api/children/{kid.id}/profile", json={"section": "who", "data": {"interests": ["animals"]}})
    c.post(f"/api/children/{kid.id}/baseline")
    cu = c.get(f"/api/children/{kid.id}/current-understanding").json()["current_understanding"]
    assert "בעלי חיים" in cu["summary"] or vocab.label("interests", "animals", "he") in cu["summary"]


def test_access(parent_client, other_teacher_client, admin_client, child):
    for path in ("baseline", "current-understanding"):
        assert parent_client.get(f"/api/children/{child.id}/{path}").status_code == 403
        assert other_teacher_client.get(f"/api/children/{child.id}/{path}").status_code == 404
    assert parent_client.post(f"/api/children/{child.id}/baseline").status_code == 403
    assert other_teacher_client.post(f"/api/children/{child.id}/baseline").status_code == 404
    assert admin_client.post(f"/api/children/{child.id}/baseline").status_code == 201


# --------------------------------------------------------------------------- dev seed


def test_dev_seed_guard():
    assert dev_seed.allowed("postgresql+psycopg://u@h/kidsphere_test", environ={})
    assert dev_seed.allowed("postgresql+psycopg://u@h/kidsphere_preview", environ={})
    assert not dev_seed.allowed("postgresql+psycopg://u@h/kidsphere", environ={})
    assert dev_seed.allowed("postgresql+psycopg://u@h/kidsphere", environ={"KIDSPHERE_ALLOW_DEMO": "1"})
    # The production database name is refused; only KIDSPHERE_ALLOW_DEMO=1 (exactly) overrides.
    assert not dev_seed.allowed("postgresql+psycopg://kidsphere_mvp@127.0.0.1:5432/kidsphere_mvp", environ={})
    assert not dev_seed.allowed("postgresql+psycopg://u@h/kidsphere_mvp", environ={"KIDSPHERE_ALLOW_DEMO": "true"})


def test_dev_seed_main_refuses_the_production_database(monkeypatch, capsys):
    monkeypatch.setattr(dev_seed.settings, "database_url", "postgresql+psycopg://kidsphere_mvp@127.0.0.1:5432/kidsphere_mvp")
    monkeypatch.delenv("KIDSPHERE_ALLOW_DEMO", raising=False)
    assert dev_seed.main([]) == 2
    assert "kidsphere_mvp" in capsys.readouterr().err


def test_dev_seed_creates_adam_and_maya(db):
    result = dev_seed.seed(db, password="Demo-pass-123")
    db.expire_all()
    adam = db.scalars(select(Child).where(Child.name == "Adam")).one()
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == adam.id)).one()
    assert {"imagination", "building", "vocabulary"} <= {i["key"] for i in profile.strengths}
    assert {i["key"] for i in profile.interests} == {"cars_transportation", "animals", "blocks"}
    assert profile.wizard_completed_at is not None and profile.current_understanding
    focus = db.scalars(select(FocusArea).where(FocusArea.child_id == adam.id)).one()
    assert focus.suggestion_key == "joining_group_play" and focus.status == "active"
    assert focus.plan["what_we_will_do"] and focus.plan["success_looks_like"]
    assert db.scalars(select(Baseline).where(Baseline.child_id == adam.id)).first() is not None

    maya = db.scalars(select(Child).where(Child.name == "Maya")).one()
    mp = db.scalars(select(ChildProfile).where(ChildProfile.child_id == maya.id)).one()
    assert {i["key"] for i in mp.strengths} == {"imagination", "vocabulary", "communication"}
    assert [i["key"] for i in mp.interests] == ["animals"]
    assert result["children"]["Adam"][1] is True

    again = dev_seed.seed(db, password="Demo-pass-456")
    assert again["children"]["Adam"] == (str(adam.id), False)
    db.expire_all()
    assert len(db.scalars(select(Child)).all()) == 2
