"""WP2-PQ: Teacher Quick Baseline = the teacher's part after the questionnaire (TP.bridge;
PQ-TCH rows, X-03, X-07). Exactly 3 main strengths and 3 things to remember when the status is "sufficient";
strengths and what calms/helps reach the merged lists; staff only."""
import json

from sqlalchemy import select

from app.config import APP_DIR
from app.models import AuditLog, Baseline, RecordVersion


def url(child):
    return f"/api/children/{child.id}/profile"


def bridge(client, child, data, **extra):
    return client.patch(url(child), json={"section": "bridge", "data": data, **extra})


THREE = [{"key": "imagination", "note": "Long pretend stories"}, {"key": "building"}, {"custom": "Kind to younger kids"}]
REMEMBER = [{"text": "Needs a heads-up before tidy-up"}, {"text": "Loves the red truck"}, {"text": "Brother in class B"}]


def test_three_main_strengths_when_sufficient(teacher_client, child):
    r = bridge(teacher_client, child, {"main_strengths": THREE[:2]}, status="sufficient")
    assert r.status_code == 400, r.text
    assert r.json()["error"]["details"][0]["path"] == "data.main_strengths"
    # A draft with fewer is fine and starts "in progress".
    r = bridge(teacher_client, child, {"main_strengths": THREE[:1]})
    assert r.status_code == 200, r.text
    assert r.json()["section_status"]["teacher"]["bridge"]["status"] == "in_progress"
    # Status-only to sufficient with 1 strength is refused too.
    assert teacher_client.patch(url(child), json={"section": "bridge", "status": "sufficient"}).status_code == 400
    # 3 strengths but fewer than 3 things to remember: refused too (exactly 3 + 3, PQ-TCH-03).
    r = bridge(teacher_client, child, {"main_strengths": THREE, "remember": REMEMBER[:2]}, status="sufficient")
    assert r.status_code == 400, r.text
    assert r.json()["error"]["details"][0]["path"] == "data.remember"
    r = bridge(teacher_client, child, {"main_strengths": THREE, "remember": [*REMEMBER[:2], {"text": "  "}]},
               status="sufficient")
    assert r.status_code == 400, r.text
    r = bridge(teacher_client, child, {"main_strengths": THREE, "remember": REMEMBER}, status="sufficient")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["section_status"]["teacher"]["bridge"]["status"] == "sufficient"
    assert [s.get("key") or s.get("custom") for s in body["teacher_perspective"]["sections"]["bridge"]["main_strengths"]] == [
        "imagination", "building", "Kind to younger kids"]
    # Once sufficient, dropping to 2 without changing the status is refused; review_later is fine.
    assert bridge(teacher_client, child, {"main_strengths": THREE[:2]}).status_code == 400
    assert bridge(teacher_client, child, {"main_strengths": THREE[:2]}, status="review_later").status_code == 200


def test_more_than_three_or_duplicates_are_rejected(teacher_client, child):
    assert bridge(teacher_client, child, {"main_strengths": [*THREE, {"key": "music"}]}).status_code == 400
    assert bridge(teacher_client, child, {"main_strengths": [{"key": "music"}, "music"]}).status_code == 400
    assert bridge(teacher_client, child, {"main_strengths": [{"key": "flying"}]}).status_code == 400
    assert bridge(teacher_client, child, {"remember": [{"text": "a"}] * 4}).status_code == 400
    assert bridge(teacher_client, child, {"first_area_to_observe": {"domain": "astrology"}}).status_code == 400
    assert bridge(teacher_client, child, {"calms_helps": {"items": [{"key": "hug", "list": "what_helps"}]}}).status_code == 400


def test_bridge_feeds_the_merged_lists(teacher_client, parent_client, child):
    parent_client.patch(url(child), json={"section": "who", "data": {"strengths": ["imagination"]}})
    teacher_client.patch(url(child), json={"section": "who", "data": {"strengths": ["music"]}})
    r = bridge(teacher_client, child, {"main_strengths": THREE, "calms_helps": {
        "items": [{"key": "hug"}, {"key": "adult_mediation"}, {"custom": "Singing his name"}], "text": "A quiet corner"},
        "remember": REMEMBER}, status="sufficient")
    body = r.json()
    strengths = {i.get("key") or i.get("custom"): i for i in body["strengths"]}
    assert strengths["imagination"]["main"] is True and strengths["imagination"]["sources"] == ["parent", "teacher"]
    assert strengths["building"]["main"] is True and strengths["building"]["sources"] == ["teacher"]
    assert strengths["Kind to younger kids"]["main"] is True
    assert "main" not in strengths["music"]
    assert [b["label"] for b in strengths["imagination"]["provenance"]] == ["parent_said", "teacher_observed"]
    helps = {i.get("key") or i.get("custom"): i for i in body["what_helps"]}
    assert helps["hug"]["list"] == "calming_helps" and helps["hug"]["sources"] == ["teacher"]
    assert helps["adult_mediation"]["list"] == "what_helps"
    assert "Singing his name" in helps
    # Removing a strength from the quick baseline drops its "main" flag (and the item when nothing else names it).
    body = bridge(teacher_client, child, {"main_strengths": [{"key": "music"}, {"key": "imagination"}, {"key": "humor"}],
                                         "remember": REMEMBER}, status="sufficient").json()
    strengths = {i.get("key") or i.get("custom"): i for i in body["strengths"]}
    assert strengths["music"]["main"] is True and "building" not in strengths and "Kind to younger kids" not in strengths


def test_bridge_is_versioned_and_based_on_the_family_answers(teacher_client, parent_client, teacher, child, db):
    parent_client.patch(url(child), json={"section": "heart", "data": {"message": "He loves trains"},
                                          "questionnaire": {"submit": True}})
    r = bridge(teacher_client, child, {"main_strengths": THREE[:1], "may_be_difficult": "Loud transitions"})
    data = r.json()["teacher_perspective"]["sections"]["bridge"]
    based = data["based_on"]
    assert based["questionnaire_status"] == "submitted" and based["read_at"] and based["parent_version_seq"] == 1
    assert based["parent_version_id"] is not None
    rows = db.scalars(select(RecordVersion).where(RecordVersion.entity_key == "teacher:bridge")).all()
    assert len(rows) == 1 and (rows[0].via, rows[0].reported_by, rows[0].changed_role) == ("manual", "teacher", "teacher")
    # The same answers again: no new version, the reading stamp stays.
    r = bridge(teacher_client, child, {"main_strengths": THREE[:1], "may_be_difficult": "Loud transitions"})
    assert r.json()["teacher_perspective"]["sections"]["bridge"]["based_on"] == based
    db.expire_all()
    assert len(db.scalars(select(RecordVersion).where(RecordVersion.entity_key == "teacher:bridge")).all()) == 1
    audit = db.scalars(select(AuditLog).where(AuditLog.action == "profile.section_update")).all()
    assert {a.meta["section"] for a in audit} == {"heart", "bridge"}


def test_question_for_the_family(teacher_client, child):
    r = bridge(teacher_client, child, {"question_for_parent": {"text": "Does he nap at home?"}})
    q = r.json()["teacher_perspective"]["sections"]["bridge"]["question_for_parent"]
    assert q == {"text": "Does he nap at home?"}
    r = bridge(teacher_client, child, {"question_for_parent": {"text": "Does he nap at home?", "status": "clarified",
                                                               "outcome_note": "Only on weekends"}})
    q = r.json()["teacher_perspective"]["sections"]["bridge"]["question_for_parent"]
    assert q["status"] == "clarified" and q["clarified_at"] and q["outcome_note"] == "Only on weekends"


def test_teacher_wording_check(teacher_client, child):
    r = bridge(teacher_client, child, {"may_be_difficult": "Possible ADHD symptoms"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "UNSAFE_CONTENT"
    assert r.json()["error"]["details"][0]["path"] == "data.may_be_difficult"


def test_bridge_is_staff_only(parent_client, teacher_client, other_teacher_client, child):
    bridge(teacher_client, child, {"main_strengths": THREE[:1]})
    assert bridge(parent_client, child, {"main_strengths": THREE[:1]}).status_code == 403
    got = parent_client.get(url(child)).json()
    assert "teacher_perspective" not in got and "bridge" not in json.dumps(got)
    assert bridge(other_teacher_client, child, {}).status_code == 404
    r = teacher_client.patch(url(child), json={"perspective": "parent", "section": "bridge", "data": {}})
    assert r.status_code == 400 and r.json()["error"]["details"][0]["path"] == "section"


def test_every_bridge_item_round_trips(teacher_client, child):
    registry = json.loads((APP_DIR / "data" / "source" / "parent_questionnaire.json").read_text(encoding="utf-8"))
    samples = {
        "main_strengths": THREE,
        "remember": REMEMBER,
        "calms_helps": {"items": [{"key": "hug", "list": "calming_helps"}, {"key": "visual_support", "list": "what_helps"}],
                        "text": "Sitting next to the teacher"},
        "may_be_difficult": "Crowded hallway in the morning",
        "first_area_to_observe": {"domain": "social", "note": "Joining play in the yard"},
        "question_for_parent": {"text": "What songs does he know?", "status": "open"},
    }
    fields = [i["field"] for i in registry["items"] if i["storage"].startswith("TP.bridge.")]
    assert set(fields) == set(samples)
    r = bridge(teacher_client, child, samples, status="sufficient")
    assert r.status_code == 200, r.text
    stored = teacher_client.get(url(child)).json()["teacher_perspective"]["sections"]["bridge"]
    for field, value in samples.items():
        assert stored[field] == value, field


def test_create_baseline_after_the_quick_baseline(teacher_client, child, db):
    bridge(teacher_client, child, {"main_strengths": THREE, "calms_helps": {"items": [{"key": "hug"}]}, "remember": REMEMBER},
           status="sufficient")
    r = teacher_client.post(f"/api/children/{child.id}/baseline")
    assert r.status_code in (200, 201), r.text
    db.expire_all()
    row = db.scalars(select(Baseline).where(Baseline.child_id == child.id)).one()
    assert row.baseline_data["teacher_perspective"]["sections"]["bridge"]["main_strengths"][0]["key"] == "imagination"
    assert {i.get("key") for i in row.baseline_data["strengths"]} >= {"imagination", "building"}
