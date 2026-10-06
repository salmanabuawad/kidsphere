"""End-to-end source-document flow (WP3-INT; SPEC-UPDATE-SOURCE-DOCS, COVERAGE-MATRIX §9).

One child goes through the whole loop with the real registries, the real AI service
(template provider: tests run with an empty ANTHROPIC_API_KEY) and the real PDF renderer:

1. A parent fills all 9 questionnaire steps (every PQ item, health and the heart message
   included) and sends them.
2. A teacher saves the quick baseline (3 main strengths) and creates a baseline.
3. The teacher records a structured observation, fills all 13 observation domains, marks
   2 priority needs and promotes one to a Current Focus.
4. The teacher plans that goal with all 6 plan fields, generates content (the AI payload
   policy holds), edits and approves it and records feedback.
5. The teacher reviews with the Domain 16 follow-up (from an AI suggestion) and approves a
   functional summary drafted by the AI.
6. All 6 PDF reports are exported in Hebrew and Arabic.
7. History keeps the initial versions intact: record_versions holds the initial parent
   answers, plan and content versions; the first observation cycle's entries and the AI
   suggestions are kept; no history row was changed afterwards.
"""
import json
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app import vocab
from app.models import (
    AiSuggestion,
    AuditLog,
    Baseline,
    DevelopmentReview,
    FocusArea,
    FunctionalSummary,
    GeneratedContent,
    RecordVersion,
    ReportExport,
    TeacherAssessmentEntry,
)
from app.models import ASSESSMENT_DOMAIN_VALUES, REPORT_TYPE_VALUES
from tests.fixtures.reports.support import embedded_fonts
from tests.test_assessments import full_document
from tests.test_parent_questionnaire import _section_answers

PQ_SECTIONS = ("who", "joy", "emotions", "separation", "social", "communication", "independence", "health",
               "behaviour", "transitions", "expectations", "partnership", "heart")
# Free texts that must never reach an AI payload (parent answers, names, teacher notes).
NEVER_IN_AI = ("Answer for PQ-", "Details for PQ-", "Other for PQ-", "Text for PQ-", "Words for PQ-", "Brave heart",
               "Builds tall towers", "Name feelings", "Tigrinya", "Dana Levi", "Omar Levi",
               "Covers his ears and moves away", "Waits at the edge of play", "BRIDGE-REMEMBER", "BRIDGE-DIFFICULT",
               "OBS-WITH-WHOM", "Haddad")
THREE = [{"key": "imagination", "note": "Long pretend stories"}, {"key": "building"}, {"custom": "Kind to younger kids"}]


@pytest.fixture
def real_registries():
    vocab.reload()
    yield
    vocab.reload()


def ok(r, status=200):
    assert r.status_code == status, r.text
    return r.json() if r.content and r.headers.get("content-type", "").startswith("application/json") else r


def snapshot(db, child_id) -> dict:
    db.expire_all()
    rows = db.scalars(select(RecordVersion).where(RecordVersion.child_id == child_id)).all()
    return {r.id: (r.entity_type, r.entity_key, r.entity_id, r.seq, json.dumps(r.data, sort_keys=True), r.via)
            for r in rows}


def assert_unchanged(before: dict, after: dict):
    for rid, row in before.items():
        assert after.get(rid) == row, f"record_versions row {rid} changed or disappeared"


def assert_no_never_text(payload, where: str):
    text = json.dumps(payload, ensure_ascii=False)
    leaks = [t for t in NEVER_IN_AI if t in text]
    assert not leaks, f"{where} carries {leaks}"


def test_source_documents_end_to_end(db, real_registries, parent_client, teacher_client, parent, teacher, child,
                                     monkeypatch):
    registry = vocab.source_registry("parent_questionnaire")
    profile_url = f"/api/children/{child.id}/profile"

    # ------------------------------------------------------------------ 1. the family's questionnaire
    answers = _section_answers(registry)
    assert set(answers) == set(PQ_SECTIONS)
    data_section = {s["key"]: s.get("data_section") for s in registry["sections"]}
    for step in registry["meta"]["steps"]:
        for key in step["sections"]:
            section = data_section[key]
            ok(parent_client.patch(profile_url, json={"section": section, "data": answers[section][0],
                                                      "wizard_step": step["step"]}))
    sent = ok(parent_client.patch(profile_url, json={"questionnaire": {"submit": True}, "wizard_step": 10}))
    assert sent["questionnaire"]["status"] == "submitted" and sent["questionnaire"]["entry_mode"] == "self"
    assert sent["wizard"]["completed_at"]
    assert "teacher_perspective" not in sent
    stored = sent["parent_perspective"]["sections"]
    assert stored["heart"]["message"] == answers["heart"][0]["message"]
    assert stored["health"]["sleep"] == answers["health"][0]["sleep"]  # the family sees its own health answers
    for section in PQ_SECTIONS:
        assert sent["parent_perspective"]["section_status"][section]["status"] == "sufficient", section
    db.expire_all()
    keys = set(db.scalars(select(RecordVersion.entity_key).where(RecordVersion.child_id == child.id,
                                                                  RecordVersion.entity_type == "profile_section")))
    assert {f"parent:{s}" for s in PQ_SECTIONS} | {"parent:_questionnaire"} <= keys
    initial_answers = {s: ok(teacher_client.get(profile_url))["parent_perspective"]["sections"][s] for s in PQ_SECTIONS}
    early = snapshot(db, child.id)

    # ------------------------------------------------------------------ 2. quick baseline + baseline
    bridge = {"main_strengths": THREE, "remember": [{"text": "BRIDGE-REMEMBER likes to know what comes next"}, {"text": "Brings the red truck"},
                           {"text": "Sister in the next class"}],
              "calms_helps": {"items": [{"key": "hug", "list": "calming_helps"}], "text": "A quiet corner"},
              "may_be_difficult": "BRIDGE-DIFFICULT crowded hallway",
              "first_area_to_observe": {"domain": "social", "note": "Joining play in the yard"},
              "question_for_parent": {"text": "What songs does he know?"}}
    staff = ok(teacher_client.patch(profile_url, json={"perspective": "teacher", "section": "bridge", "data": bridge,
                                                       "status": "sufficient"}))
    assert staff["section_status"]["teacher"]["bridge"]["status"] == "sufficient"
    assert staff["teacher_perspective"]["sections"]["bridge"]["based_on"]["questionnaire_status"] == "submitted"
    main = [s for s in staff["strengths"] if s.get("main")]
    assert len(main) == 3
    ok(teacher_client.post(f"/api/children/{child.id}/baseline"), 201)
    assert ok(teacher_client.get(f"/api/children/{child.id}/baseline"))["latest"]["original"] is True

    # ------------------------------------------------------------------ 3. observation + 13 domains + needs
    observation = ok(teacher_client.post(f"/api/children/{child.id}/observations", json={
        "observation": "Built a tall tower next to two children and handed them blocks.",
        "context": "free_play", "support_level": "some_support", "domains": ["social", "play"],
        "attributes": {"frequency": "often", "duration_minutes": 15, "intensity": "light"},
        "details": {"what_i_see": "Hands blocks to others", "when_detail": {"time": "10:00", "activity": "free_play",
                                                                            "with_whom": "OBS-WITH-WHOM two friends"},
                    "needs": {"helps": [{"key": "adult_mediation"}]}, "what_we_did": "Invited one friend",
                    "did_it_change": "partly", "what_changed": "Stayed longer"}}), 201)["observation"]
    obs_id = observation["id"]
    ok(teacher_client.put(f"/api/observations/{obs_id}", json={"note": "Edited after a second look"}))
    assert len(ok(teacher_client.get(f"/api/observations/{obs_id}/versions"))["versions"]) == 2

    cycle = ok(teacher_client.post(f"/api/children/{child.id}/teacher-assessments", json={}), 201)["assessment"]
    aid = cycle["id"]
    documents = {d: full_document(d, obs_id) for d in ASSESSMENT_DOMAIN_VALUES}
    documents["priority_needs"]["needs"] = documents["priority_needs"]["needs"][:2]  # two marked needs
    for domain, doc in documents.items():
        out = ok(teacher_client.put(f"/api/teacher-assessments/{aid}/domains/{domain}",
                                    json={"status": "sufficient", "data": doc}))
        assert out["data"] == doc and out["provenance"] == ["teacher_observed"], domain
    initial_entries = {e.domain: (e.id, json.dumps(e.data, sort_keys=True))
                       for e in db.scalars(select(TeacherAssessmentEntry)
                                           .where(TeacherAssessmentEntry.assessment_id == cycle["id"]))}
    assert set(initial_entries) == set(ASSESSMENT_DOMAIN_VALUES)
    focus = ok(teacher_client.post(f"/api/teacher-assessments/{aid}/needs/0/focus", json={}), 201)["focus_area"]
    assert focus["source_need"]["index"] == 0 and focus["assessment_id"] == aid
    current = ok(teacher_client.get(f"/api/children/{child.id}/teacher-assessments"))["current"]
    assert current["need_focus_areas"][0]["focus_area_id"] == focus["id"]
    # A second save of a domain appends; the first stays in the history.
    ok(teacher_client.put(f"/api/teacher-assessments/{aid}/domains/social",
                          json={"status": "review_later", "data": full_document("social", obs_id, " (v2)")}))
    history = ok(teacher_client.get(f"/api/teacher-assessments/{aid}/domains/social/history"))["entries"]
    assert [e["status"] for e in history] == ["review_later", "sufficient"]

    # ------------------------------------------------------------------ 4. plan, content, feedback
    follow_up_on = (date.today() + timedelta(days=21)).isoformat()
    plan = {"strength_used": "Building", "need": "Joining a group", "adaptation": "Start with one friend",
            "what_we_will_do": "Build together at the block corner", "frequency": "Three times a week",
            "who": "Teacher Rana", "success_looks_like": "Joins a group of three without help"}
    planned = ok(teacher_client.put(f"/api/focus-areas/{focus['id']}", json={
        "title": "Joining group play", "plan": plan, "follow_up_on": follow_up_on}))["focus_area"]
    assert planned["plan"]["success_looks_like"] == plan["success_looks_like"]
    assert planned["follow_up_on"] == follow_up_on
    versions = ok(teacher_client.get(f"/api/focus-areas/{focus['id']}/versions"))["versions"]
    assert len(versions) >= 2 and versions[0]["data"].get("plan") != versions[-1]["data"].get("plan")

    content = ok(teacher_client.post(f"/api/children/{child.id}/content/generate", json={
        "mode": "growth_support", "content_type": "real_world_activity", "focus_area_id": focus["id"],
        "language": "en"}), 201)["content"]
    db.expire_all()
    row = db.get(GeneratedContent, content["id"])
    assert_no_never_text(row.generation_input, "generation_input")
    ok(teacher_client.put(f"/api/content/{content['id']}", json={"title": "Tower friends"}))
    ok(teacher_client.post(f"/api/content/{content['id']}/approve"))
    ok(teacher_client.post(f"/api/content/{content['id']}/feedback", json={
        "result": "worked_well", "support_level": "independent", "observation": "Asked a friend to join."}), 201)
    content_versions = ok(teacher_client.get(f"/api/content/{content['id']}/versions"))["versions"]
    assert {"generated", "edited"} <= {v["via"] for v in content_versions}

    # ------------------------------------------------------------------ 5. review + functional summary
    suggestion = ok(teacher_client.post(f"/api/children/{child.id}/development-reviews/suggest",
                                        json={"language": "en"}))
    assert suggestion["suggestion_id"]
    follow_up = {"reassessment_on": (date.today() + timedelta(days=60)).isoformat(),
                 "improvement": {"level": "partial", "note": "Joins with one friend"},
                 "areas": {"domains": ["social", "play"], "focus_area_ids": [focus["id"]], "text": "Free play"},
                 "what_worked": "The block corner", "what_to_change": "Shorter group times",
                 "involvement": {"key": "consultation", "note": "Talk with the family at pick-up"}}
    review = ok(teacher_client.post(f"/api/children/{child.id}/development-reviews", json={
        "summary": "Adam joins shared building more often.",
        "understanding": {"summary": "Adam is curious; building with one friend helps him join.",
                          "strengths": [{"key": "building"}], "what_helps": [{"key": "adult_mediation"}]},
        "focus_review": [{"focus_area_id": focus["id"], "status": "some_improvement", "decision": "keep"}],
        "follow_up": follow_up, "ai_suggested": True, "ai_suggestion_id": suggestion["suggestion_id"]}), 201)["review"]
    assert review["follow_up"] == follow_up and review["provenance"] == ["teacher_approved"]

    drafted = ok(teacher_client.post(f"/api/children/{child.id}/functional-summaries/suggest", json={"language": "en"}))
    assert drafted["suggestion_id"] and drafted["draft"]["follow_up_with_parents"] is None  # the teacher's alone
    summary = ok(teacher_client.post(f"/api/children/{child.id}/functional-summaries", json={
        **drafted["draft"], "general_description": "Adam builds with friends and joins with one friend first.",
        "follow_up_with_parents": "Share the block-corner idea at pick-up.", "source": "ai_draft",
        "ai_suggestion_id": drafted["suggestion_id"], "review_id": review["id"]}), 201)["summary"]
    approved = ok(teacher_client.post(f"/api/functional-summaries/{summary['id']}/approve", json={}))["summary"]
    assert approved["status"] == "approved"
    db.expire_all()
    suggestions = db.scalars(select(AiSuggestion).where(AiSuggestion.child_id == child.id)).all()
    by_id = {str(s.id): s for s in suggestions}
    assert by_id[suggestion["suggestion_id"]].outcome in ("accepted", "edited")
    assert by_id[drafted["suggestion_id"]].outcome == "edited"
    for s in suggestions:
        assert_no_never_text(s.input, f"ai_suggestions.input ({s.kind})")
        assert "Adam" not in json.dumps(s.input, ensure_ascii=False)  # analysis payloads use [child]

    # The family changes an answer after sending: the initial version stays.
    ok(parent_client.patch(profile_url, json={"section": "heart", "data": {"message": "A new message from the heart"}}))

    # ------------------------------------------------------------------ 6. every PDF in Hebrew and Arabic
    for lang in ("he", "ar"):
        for report_type in REPORT_TYPE_VALUES:
            r = teacher_client.post(f"/api/children/{child.id}/reports/pdf", json={
                "report_type": report_type, "language": lang, "include_health": True, "include_family": True,
                "include_private_notes": True})
            assert r.status_code == 200, (lang, report_type, r.text[:300])
            assert r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
            fonts = embedded_fonts(r.content)
            # Only the bundled fonts (Rubik carries Hebrew; Arabic needs the bundled Noto Sans Arabic).
            assert fonts and all(f.startswith("KS-") for f in fonts), (lang, report_type, fonts)
            if lang == "ar":
                assert any(f.startswith("KS-Noto-Sans-Arabic") for f in fonts), (report_type, fonts)
    exports = ok(teacher_client.get(f"/api/children/{child.id}/reports"))["exports"]
    assert len(exports) == 2 * len(REPORT_TYPE_VALUES)
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(ReportExport).where(ReportExport.child_id == child.id)) == 12
    assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "report.export")) == 12

    # ------------------------------------------------------------------ 7. history keeps the initial versions
    hist = ok(teacher_client.get(f"/api/children/{child.id}/profile/history?perspective=parent&section=heart"))
    first = [v for v in hist["versions"] if v["initial"]]
    assert len(first) == 1 and first[0]["data"]["message"] == initial_answers["heart"]["message"]
    messages = [v["data"]["message"] for v in hist["versions"]]
    assert sorted(messages) == sorted([initial_answers["heart"]["message"], "A new message from the heart"])
    for section in PQ_SECTIONS:
        hist = ok(teacher_client.get(f"/api/children/{child.id}/profile/history?perspective=parent&section={section}"))
        initial = [v for v in hist["versions"] if v["initial"]]
        assert initial, section
        assert initial[-1]["data"] == {k: v for k, v in initial_answers[section].items()
                                       if k in initial[-1]["data"]}, section
    assert_unchanged(early, snapshot(db, child.id))
    db.expire_all()
    types = set(db.scalars(select(RecordVersion.entity_type).where(RecordVersion.child_id == child.id)))
    assert types == {"profile_section", "observation", "focus_area", "content"}
    after = {e.id: json.dumps(e.data, sort_keys=True) for e in db.scalars(
        select(TeacherAssessmentEntry).where(TeacherAssessmentEntry.assessment_id == cycle["id"]))}
    for domain, (entry_id, data) in initial_entries.items():
        assert after[entry_id] == data, domain
    assert db.scalar(select(func.count()).select_from(Baseline).where(Baseline.child_id == child.id)) == 1
    assert db.scalar(select(func.count()).select_from(DevelopmentReview).where(DevelopmentReview.child_id == child.id)) == 1
    assert db.scalar(select(func.count()).select_from(FunctionalSummary).where(FunctionalSummary.child_id == child.id)) == 1
    assert db.get(FocusArea, focus["id"]).status == "active"
    # The parent still sees only the questionnaire: no teacher part, observation cycles or reports.
    mine = ok(parent_client.get(profile_url))
    assert "teacher_perspective" not in mine and "BRIDGE-REMEMBER" not in json.dumps(mine, ensure_ascii=False)
    assert parent_client.get(f"/api/children/{child.id}/teacher-assessments").status_code == 404
    assert parent_client.get(f"/api/children/{child.id}/reports").status_code == 404
    assert parent_client.get(f"/api/children/{child.id}/ai-suggestions").status_code == 404
