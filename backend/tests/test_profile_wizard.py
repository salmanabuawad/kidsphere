"""WP-06: profile sections written by the wizard (GET/PATCH /api/children/{id}/profile)."""
from sqlalchemy import select

from app.models import AuditLog, ChildProfile


def url(child):
    return f"/api/children/{child.id}/profile"


def who(**fields):
    data = {"describe_words": [], "strengths": [], "interests": [], "motivators": []}
    data.update(fields)
    return data


def keys(items):
    return [i.get("key") or {"custom": i.get("custom")} for i in items]


def test_staff_wizard_flow(teacher_client, teacher, child, db):
    r = teacher_client.get(url(child))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["wizard"] == {"step": 1, "completed_at": None}
    assert body["teacher_perspective"] == {"sections": {}, "entered": {}}
    assert body["has_baseline"] is False

    r = teacher_client.patch(url(child), json={
        "section": "who",
        "data": who(strengths=["imagination", {"key": "building"}, {"custom": "Kind to friends"}],
                    interests=["cars_transportation", "animals"], appreciate="  Lovely stories  "),
        "wizard_step": 3,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["wizard"]["step"] == 3
    sec = body["teacher_perspective"]["sections"]["who"]
    assert sec["strengths"] == [{"key": "imagination"}, {"key": "building"}, {"custom": "Kind to friends"}]
    assert sec["appreciate"] == "Lovely stories"
    stamps = body["teacher_perspective"]["entered"]["who"]
    assert len(stamps) == 1
    assert stamps[0]["by"] == str(teacher.id) and stamps[0]["role"] == "teacher" and stamps[0]["reported_by"] == "teacher"
    assert keys(body["strengths"]) == ["imagination", "building", {"custom": "Kind to friends"}]
    assert all(i["sources"] == ["teacher"] and i["added_by"] == str(teacher.id) and i["added_at"] for i in body["strengths"])

    # Every other section validates and saves.
    sections = {
        "emotions": {"helps_when_sad": ["hug"], "frustration_reactions": ["moves_away", {"custom": "Hides"}],
                     "calming_helps": ["quiet_space", "other"], "transition_reaction": "needs_preparation",
                     "transition_helps": ["countdown_timer"], "morning_separation": "needs_time",
                     "calming_notes": "", "what_does_not_help": "Shouting"},
        "social": {"social": ["initiates_play"], "communication": ["asks_questions"], "comments": "Chatty"},
        "independence": {"levels": {"eating": "independent", "dressing": "some_support"}, "notes": "Shoes are tricky"},
        "environment": {"items": [{"key": "noise", "what_happens": "Covers ears", "what_helps": ["quiet_space"]}]},
        "priorities": {"parent_priorities": ["social"], "hope_child_feels": ["happy"], "one_thing_to_know": "x"},
    }
    for step, (section, data) in enumerate(sections.items(), start=3):
        r = teacher_client.patch(url(child), json={"section": section, "data": data, "wizard_step": step + 1})
        assert r.status_code == 200, (section, r.text)

    body = teacher_client.get(url(child)).json()
    assert body["wizard"]["step"] == 8
    assert body["teacher_perspective"]["sections"]["emotions"].get("calming_notes") is None
    # what_helps: calming + transition + sad helps + sensitivity helps; "other" is skipped; deduplicated by key.
    wh = {i["key"]: i for i in body["what_helps"]}
    assert set(wh) == {"quiet_space", "countdown_timer", "hug"}
    assert wh["quiet_space"]["list"] == "calming_helps"
    assert body["sensitivities"][0]["key"] == "noise"
    assert body["sensitivities"][0]["what_happens"] == "Covers ears"
    assert body["sensitivities"][0]["what_helps"] == [{"key": "quiet_space"}]

    r = teacher_client.patch(url(child), json={"complete": True})
    assert r.status_code == 200
    assert r.json()["wizard"]["completed_at"]

    rows = db.scalars(select(AuditLog).where(AuditLog.action == "profile.section_update")).all()
    assert len(rows) == 6
    assert all(set(r.meta) == {"section", "perspective", "mode"} and r.meta["mode"] == "self" for r in rows)


def test_parent_flow_and_shape(parent_client, teacher_client, parent, child):
    r = parent_client.patch(url(child), json={"section": "who", "data": who(strengths=["humor"], interests=["music"]), "wizard_step": 3})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["perspective"] == "parent"
    assert "teacher_perspective" not in body and "strengths" not in body
    assert body["wizard"]["step"] == 3
    stamp = body["parent_perspective"]["entered"]["who"][0]
    assert stamp["role"] == "parent" and stamp["reported_by"] == "parent" and stamp["by"] == str(parent.id)

    # The parent's progress is separate from the staff wizard.
    staff = teacher_client.get(url(child)).json()
    assert staff["wizard"]["step"] == 1
    assert staff["parent_perspective"]["wizard"]["step"] == 3
    assert [i["sources"] for i in staff["strengths"]] == [["parent"]]

    r = parent_client.patch(url(child), json={"complete": True, "wizard_step": 7})
    assert r.json()["wizard"]["step"] == 7 and r.json()["wizard"]["completed_at"]

    got = parent_client.get(url(child)).json()
    assert set(got) == {"child_id", "perspective", "parent_perspective", "questionnaire", "wizard"}
    assert got["questionnaire"]["status"] == "draft"  # the legacy "complete" flag does not send the questionnaire


def test_parent_cannot_write_teacher_perspective(parent_client, child):
    r = parent_client.patch(url(child), json={"perspective": "teacher", "section": "who", "data": who()})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


def test_staff_entering_parent_answers_is_stamped(teacher_client, teacher, child):
    r = teacher_client.patch(url(child), json={"perspective": "parent", "section": "social", "data": {"social": ["initiates_play"]}})
    assert r.status_code == 200, r.text
    stamps = r.json()["parent_perspective"]["entered"]["social"]
    assert stamps == [{"by": str(teacher.id), "by_name": teacher.name, "role": "teacher", "reported_by": "parent",
                       "at": stamps[0]["at"], "mode": "on_behalf", "version_seq": 1}]
    assert r.json()["teacher_perspective"]["sections"] == {}

    # Same data again: no new stamp. Changed data: appended, never replaced.
    r = teacher_client.patch(url(child), json={"perspective": "parent", "section": "social", "data": {"social": ["initiates_play"]}})
    assert len(r.json()["parent_perspective"]["entered"]["social"]) == 1
    r = teacher_client.patch(url(child), json={"perspective": "parent", "section": "social", "data": {"social": ["joins_existing_play"]}})
    stamps2 = r.json()["parent_perspective"]["entered"]["social"]
    assert len(stamps2) == 2 and stamps2[0] == stamps[0]


def test_merged_sources_union(teacher_client, parent_client, child):
    parent_client.patch(url(child), json={"section": "who", "data": who(strengths=["imagination", "music"], interests=[{"custom": "Trains"}])})
    r = teacher_client.patch(url(child), json={"section": "who", "data": who(strengths=["imagination"], interests=[{"custom": "trains "}])})
    body = r.json()
    by_key = {i["key"]: i["sources"] for i in body["strengths"]}
    assert by_key == {"imagination": ["parent", "teacher"], "music": ["parent"]}
    assert len(body["interests"]) == 1 and body["interests"][0]["sources"] == ["parent", "teacher"]


def test_recompute_preserves_observation_and_review_items(teacher_client, child, db):
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.strengths = [
        {"key": "empathy", "sources": ["review"], "added_by": None, "added_at": "2026-01-01T00:00:00+00:00", "note": "approved"},
        {"key": "imagination", "sources": ["observation"], "added_by": None, "added_at": "2026-01-02T00:00:00+00:00"},
        {"key": "music", "sources": ["teacher"], "added_by": None, "added_at": "2026-01-03T00:00:00+00:00"},
    ]
    db.commit()

    body = teacher_client.patch(url(child), json={"section": "who", "data": who(strengths=["imagination", "humor"])}).json()
    items = {i["key"]: i for i in body["strengths"]}
    assert set(items) == {"empathy", "imagination", "humor"}  # music came only from the teacher perspective
    assert items["empathy"]["sources"] == ["review"] and items["empathy"]["note"] == "approved"
    assert items["imagination"]["sources"] == ["teacher", "observation"]
    assert items["imagination"]["added_at"] == "2026-01-02T00:00:00+00:00"
    assert items["humor"]["sources"] == ["teacher"]

    body = teacher_client.patch(url(child), json={"section": "who", "data": who()}).json()
    assert {i["key"]: i["sources"] for i in body["strengths"]} == {"empathy": ["review"], "imagination": ["observation"]}


def test_validation(teacher_client, child):
    cases = [
        {"section": "who", "data": who(strengths=["not_a_strength"])},
        {"section": "who", "data": {"unknown_field": 1}},
        {"section": "social", "data": {"social": [{"custom": "free text"}]}},
        {"section": "independence", "data": {"levels": {"flying": "independent"}}},
        {"section": "independence", "data": {"levels": {"eating": "mostly"}}},
        {"section": "emotions", "data": {"transition_reaction": "explodes"}},
        {"section": "environment", "data": {"items": [{"key": "noise", "what_helps": ["magic"]}]}},
        {"section": "who", "data": who(strengths=[{"key": "humor", "custom": "x"}])},
        {"section": "health", "data": {}},
        {"data": {"strengths": []}},
        {"wizard_step": 0},
        {"wizard_step": 11},
        {"status": "sufficient"},
        {"section": "who", "status": "done"},
        {"section": "who", "data": {"not_answered": ["nonsense"]}},
        {"role": "admin"},
    ]
    for body in cases:
        r = teacher_client.patch(url(child), json=body)
        assert r.status_code == 400, (body, r.text)
        assert r.json()["error"]["code"] == "VALIDATION"
    r = teacher_client.patch(url(child), json={"section": "who", "data": who(strengths=["nope"])})
    assert r.json()["error"]["details"][0]["path"].startswith("data.strengths")


def test_scope(client, other_teacher_client, other_parent_client, admin_client, child):
    assert client.get(url(child)).status_code == 401
    assert other_teacher_client.get(url(child)).status_code == 404
    assert other_parent_client.get(url(child)).status_code == 404
    assert other_parent_client.patch(url(child), json={"section": "who", "data": who()}).status_code == 404
    assert other_teacher_client.get("/api/children/not-a-uuid/profile").status_code == 404
    assert admin_client.get(url(child)).status_code == 200


def test_profile_row_created_on_demand(teacher_client, make_child, klass, db):
    kid = make_child(klass, name="Lina", with_profile=False)
    r = teacher_client.get(url(kid))
    assert r.status_code == 200
    db.expire_all()
    assert db.scalars(select(ChildProfile).where(ChildProfile.child_id == kid.id)).first() is not None
