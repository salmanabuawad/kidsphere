"""WP2-PLAN: functional summaries (Domain 17; X-18, X-25): append-only versions, one approval,
AI drafts through the real app.ai.service.draft_functional_summary (template provider in tests)."""
import json

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.models import AiSuggestion, AuditLog, ChildProfile, FunctionalSummary
from app.services.functional_summaries import draft_fields

SUMMARY = {
    "general_description": "Adam is a curious builder who enjoys cars and blocks.",
    "main_strengths": {"items": [{"key": "building"}, {"custom": "Tells long stories"}], "text": "Builds with care."},
    "main_needs": {"items": ["Starting shared play"], "text": "Joining a group that is already playing."},
    "adaptations": "Start group play at the block corner with one friend.",
    "follow_up_with_parents": "Share the building game with the family.",
    "team_recommendations": "Offer a building role at group time.",
}


def url(child):
    return f"/api/children/{child.id}/functional-summaries"


def save(client, child, **over):
    r = client.post(url(child), json={**SUMMARY, **over})
    assert r.status_code == 201, r.text
    return r.json()["summary"]


def counts(db):
    db.expire_all()
    return {
        "summaries": db.scalar(select(text("count(*)")).select_from(FunctionalSummary)),
        "suggestions": db.scalar(select(text("count(*)")).select_from(AiSuggestion)),
    }


def test_every_save_inserts_a_row_and_history_keeps_all(teacher_client, teacher, child, db):
    first = save(teacher_client, child)
    assert first["status"] == "draft" and first["source"] == "manual" and first["supersedes_id"] is None
    assert first["created_by"] == {"id": str(teacher.id), "name": teacher.name}
    assert first["main_strengths"] == SUMMARY["main_strengths"] and first["main_needs"] == SUMMARY["main_needs"]
    assert first["provenance"] == []
    second = save(teacher_client, child, supersedes_id=first["id"], adaptations="Start with one friend.")
    assert second["supersedes_id"] == first["id"]

    data = teacher_client.get(url(child)).json()
    assert data["latest_approved"] is None
    assert [d["id"] for d in data["drafts"]] == [second["id"]]
    assert [h["id"] for h in data["history"]] == [second["id"], first["id"]]
    assert data["history"][1]["superseded_by"] == second["id"]
    db.expire_all()
    assert db.get(FunctionalSummary, first["id"]).adaptations == SUMMARY["adaptations"]  # never overwritten
    log = db.scalars(select(AuditLog).where(AuditLog.action == "summary.create")).all()
    assert len(log) == 2 and "builder" not in json.dumps([row.meta for row in log])


def test_approve_once(teacher_client, admin_client, admin, child, db):
    first = save(teacher_client, child)
    second = save(teacher_client, child, supersedes_id=first["id"])
    # An older version cannot be approved once a newer one exists.
    r = teacher_client.post(f"/api/functional-summaries/{first['id']}/approve")
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"

    r = admin_client.post(f"/api/functional-summaries/{second['id']}/approve")
    assert r.status_code == 200, r.text
    approved = r.json()["summary"]
    assert approved["status"] == "approved" and approved["approved_at"]
    assert approved["approved_by"] == {"id": str(admin.id), "name": admin.name}
    assert approved["provenance"] == [{"label": "teacher_approved"}]
    r = teacher_client.post(f"/api/functional-summaries/{second['id']}/approve")
    assert r.status_code == 409 and r.json()["error"]["code"] == "SUMMARY_APPROVED"

    data = teacher_client.get(url(child)).json()
    assert data["latest_approved"]["id"] == second["id"] and data["drafts"] == []

    # A later edit is a new draft; the approved text stays as it was.
    third = save(teacher_client, child, supersedes_id=second["id"], general_description="Adam builds with friends.")
    data = teacher_client.get(url(child)).json()
    assert data["latest_approved"]["id"] == second["id"]
    assert [d["id"] for d in data["drafts"]] == [third["id"]]
    assert len(data["history"]) == 3
    assert db.scalars(select(AuditLog).where(AuditLog.action == "summary.approve")).one().object_id is not None

    # The DB refuses to change an approved summary (trigger), whatever the caller.
    with pytest.raises(DBAPIError):
        db.execute(text("UPDATE functional_summaries SET adaptations = 'x' WHERE id = :id"), {"id": second["id"]})
        db.flush()
    db.rollback()


def test_ai_draft_needs_its_suggestion(teacher_client, child, other_child, make_ai_suggestion, db):
    r = teacher_client.post(url(child), json={**SUMMARY, "source": "ai_draft"})
    assert r.status_code == 400
    understanding = make_ai_suggestion(child)  # kind understanding
    foreign = make_ai_suggestion(other_child, kind="functional_summary")
    for sid in (understanding.id, foreign.id):
        r = teacher_client.post(url(child), json={**SUMMARY, "source": "ai_draft", "ai_suggestion_id": str(sid)})
        assert r.status_code == 400 and r.json()["error"]["details"][0]["path"] == "ai_suggestion_id"

    draft = {k: SUMMARY[k] for k in ("general_description", "main_strengths", "main_needs", "adaptations",
                                     "team_recommendations")}
    same = make_ai_suggestion(child, kind="functional_summary", output=draft)
    row = save(teacher_client, child, source="ai_draft", ai_suggestion_id=str(same.id))
    assert row["provenance"] == [{"label": "ai_suggested"}]
    db.expire_all()
    s = db.get(AiSuggestion, same.id)
    assert (s.outcome, s.used_by_type, str(s.used_by_id)) == ("accepted", "functional_summary", row["id"])

    changed = make_ai_suggestion(child, kind="functional_summary", output=draft)
    save(teacher_client, child, source="ai_draft", ai_suggestion_id=str(changed.id), adaptations="Something else.")
    db.expire_all()
    assert db.get(AiSuggestion, changed.id).outcome == "edited"
    ai_drafts = teacher_client.get(url(child)).json()["ai_drafts"]
    assert ai_drafts[str(changed.id)]["adaptations"] == SUMMARY["adaptations"]
    assert ai_drafts[str(changed.id)]["follow_up_with_parents"] is None


def test_validation_and_wording(teacher_client, child, other_child, db):
    for body in (
        {},
        {"general_description": "  "},
        {**SUMMARY, "main_strengths": {"items": [{"key": "building", "custom": "x"}]}},
        {**SUMMARY, "source": "pasted"},
        {**SUMMARY, "extra": 1},
        {**SUMMARY, "adaptations": "x" * 2001},
    ):
        assert teacher_client.post(url(child), json=body).status_code == 400, body
    r = teacher_client.post(url(child), json={**SUMMARY, "main_strengths": {"items": [{"key": "flying"}]}})
    assert r.status_code == 400 and r.json()["error"]["details"][0]["path"] == "main_strengths.items.0.key"
    # A review of another child cannot be linked.
    assert teacher_client.post(url(child), json={**SUMMARY, "review_id": str(other_child.id)}).status_code == 400
    r = teacher_client.post(url(child), json={**SUMMARY, "general_description": "Adam may have ADHD."})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["path"] == "general_description"
    r = teacher_client.post(url(child), json={**SUMMARY, "main_needs": {"items": ["A developmental delay"]}})
    assert r.status_code == 422
    assert counts(db)["summaries"] == 0


def test_suggest_stores_only_the_ai_suggestion(teacher_client, child, db):
    """The real app.ai.service.draft_functional_summary (template provider in tests)."""
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.current_understanding = {
        "summary": "Adam appears to enjoy building with one friend.", "strengths": [{"key": "building"}],
        "interests": [], "what_helps": [], "areas_for_support": ["Starting shared play"],
        "adaptations": "Start at the block corner.", "next_steps": "Offer a building role.", "source": "review",
    }
    db.commit()
    before = counts(db)
    r = teacher_client.post(f"{url(child)}/suggest", json={"language": "en"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert counts(db) == {"summaries": before["summaries"], "suggestions": before["suggestions"] + 1}
    draft = data["draft"]
    assert set(draft) == {"general_description", "main_strengths", "main_needs", "adaptations",
                          "follow_up_with_parents", "team_recommendations"}
    assert draft["general_description"] and draft["follow_up_with_parents"] is None
    assert set(draft["main_strengths"]) == {"items", "text"} and set(draft["main_needs"]) == {"items", "text"}
    assert data["provider"] == "template" and data["is_template"] is True
    assert "involvement" not in r.text and "referral" not in r.text.lower()
    row = db.get(AiSuggestion, data["suggestion_id"])
    assert row.kind == "functional_summary" and row.outcome == "pending" and row.is_template
    assert "Adam" not in json.dumps(row.input, ensure_ascii=False)
    assert db.scalars(select(AuditLog).where(AuditLog.action == "summary.suggest")).one().object_id == row.id

    # The next suggest discards the unused one.
    again = teacher_client.post(f"{url(child)}/suggest").json()
    db.expire_all()
    assert db.get(AiSuggestion, data["suggestion_id"]).outcome == "discarded"
    assert db.get(AiSuggestion, again["suggestion_id"]).outcome == "pending"


def test_suggest_in_the_requested_language_returns_patterns_and_questions(teacher_client, child, db):
    """The real service in Hebrew: the draft, the possible patterns and the next observation
    questions ({domain, question}) come back; the stored output has the same draft."""
    r = teacher_client.post(f"{url(child)}/suggest", json={"language": "he"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data["possible_patterns"], list) and isinstance(data["next_observation_questions"], list)
    assert all(set(q) >= {"domain", "question"} for q in data["next_observation_questions"])
    row = db.get(AiSuggestion, data["suggestion_id"])
    assert row.kind == "functional_summary" and data["draft"]["general_description"]


def test_draft_fields_normalises_an_ai_draft():
    draft = {"general_description": "[child] enjoys building.", "main_strengths": [{"key": "building", "label": "Building"}],
             "main_needs": ["Joining a group"], "adaptations": "One friend first.", "team_recommendations": "Offer a role.",
             "follow_up_with_parents": "never from the AI", "possible_patterns": ["x"]}
    out = draft_fields(draft)
    assert out["main_strengths"]["items"] == [{"key": "building"}]
    assert out["main_needs"]["items"] == ["Joining a group"]
    assert out["follow_up_with_parents"] is None
    assert set(out) == {"general_description", "main_strengths", "main_needs", "adaptations", "follow_up_with_parents",
                        "team_recommendations"}


def test_access(teacher_client, parent_client, other_teacher_client, client, child):
    sid = save(teacher_client, child)["id"]
    for c in (parent_client, other_teacher_client):
        assert c.get(url(child)).status_code == 404
        assert c.post(url(child), json=SUMMARY).status_code == 404
        assert c.post(f"{url(child)}/suggest").status_code == 404
        assert c.post(f"/api/functional-summaries/{sid}/approve").status_code == 404
    assert client.get(url(child)).status_code == 401
    assert teacher_client.post("/api/functional-summaries/not-a-uuid/approve").status_code == 404
