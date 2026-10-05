"""WP-12: suggested current understanding, baseline validation and the development review
(spec §3, §12, §22–27; PLAN-ADJUSTMENTS B3 loop closes, B6 no certainty from limited data,
B12 review decisions incl. create + FOCUS_LIMIT rollback)."""
import json
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text

from app.ai import build_context
from app.models import AuditLog, Baseline, Child, ChildProfile, DevelopmentReview, FocusArea, GeneratedContent

SCORING = re.compile(r"\d+\s*%|\bscore\b|\bpoints\b", re.IGNORECASE)


# --------------------------------------------------------------------------- helpers


def reviews_url(child):
    return f"/api/children/{child.id}/development-reviews"


def suggest_url(child):
    return f"/api/children/{child.id}/development-reviews/suggest"


def add_focus(client, child, **body):
    body = body or {"suggestion_key": "joining_group_play"}
    r = client.post(f"/api/children/{child.id}/focus-areas", json=body)
    assert r.status_code == 201, r.text
    return r.json()["focus_area"]["id"]


def observe(client, child, focus_id=None, note="Built a garage with a friend", level="some_support", observed_at=None):
    body = {"observation": note, "support_level": level, "context": "free_play"}
    if focus_id:
        body["focus_area_id"] = focus_id
    if observed_at:
        body["observed_at"] = observed_at
    r = client.post(f"/api/children/{child.id}/observations", json=body)
    assert r.status_code == 201, r.text
    return r.json()["observation"]["id"]


def setup_child(client, child):
    """Adam (§44): profile lists, the 'joining group play' focus and a baseline."""
    r = client.patch(f"/api/children/{child.id}/profile", json={"section": "who", "data": {
        "strengths": ["imagination", "building", "vocabulary"], "interests": ["cars_transportation", "animals", "blocks"]}})
    assert r.status_code == 200, r.text
    r = client.patch(f"/api/children/{child.id}/profile", json={"section": "independence", "data": {
        "levels": {"dressing": "some_support", "eating": "independent"}}})
    assert r.status_code == 200, r.text
    focus_id = add_focus(client, child)
    r = client.post(f"/api/children/{child.id}/baseline")
    assert r.status_code == 201, r.text
    return focus_id, r.json()["baseline"]["id"]


def table_counts(db):
    names = db.execute(text(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
    )).scalars().all()
    return {n: db.execute(text(f'SELECT count(*) FROM "{n}"')).scalar() for n in names}


def review_body(focus_review=(), **over):
    body = {
        "summary": "Adam appears to be becoming more independent in initiating shared play.",
        "understanding": {
            "strengths": [{"key": "building"}, {"key": "empathy"}],
            "interests": [{"key": "cars_transportation"}, {"custom": "Trains"}],
            "what_helps": [{"key": "countdown_timer"}],
            "areas_for_support": ["Starting shared play"],
            "adaptations": "Start with one friend and a building activity.",
            "next_steps": "Invite one friend to build together.",
        },
        "baseline_validation": [],
        "focus_review": list(focus_review),
        "ai_suggested": True,
    }
    body.update(over)
    return body


def profile_row(db, child):
    db.expire_all()
    return db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()


# --------------------------------------------------------------------------- suggest


def test_suggest_writes_nothing(teacher_client, child, db):
    focus_id, baseline_id = setup_child(teacher_client, child)
    observe(teacher_client, child, focus_id)
    observe(teacher_client, child, None, note="Painted with the whole group")
    before = table_counts(db)
    profile_before = json.dumps(profile_row(db, child).current_understanding, sort_keys=True)

    r = teacher_client.post(suggest_url(child), json={"language": "en"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["provider"] == "template" and data["is_template"] is True
    assert data["baseline"]["id"] == baseline_id
    assert data["observation_count_since_baseline"] == 2
    assert data["max_active"] == 3
    assert [(f["id"], f["observation_count"]) for f in data["focus_areas"]] == [(focus_id, 1)]
    lists = {i["list"] for i in data["baseline_items"]}
    assert lists == {"strengths", "interests", "support_needs", "focus"}
    assert {"list": "support_needs", "key": "dressing", "custom": None, "label": "Dressing"} in data["baseline_items"]
    s = data["suggestion"]
    assert s["summary"] and "Adam" in s["summary"]
    assert set(s) >= {"strengths", "interests", "what_helps", "areas_for_support", "adaptations", "next_steps",
                      "baseline_validation", "focus_review"}
    assert not SCORING.search(r.text)

    db.expire_all()
    assert table_counts(db) == before
    assert json.dumps(profile_row(db, child).current_understanding, sort_keys=True) == profile_before

    # No body at all is fine too.
    assert teacher_client.post(suggest_url(child)).status_code == 200
    assert table_counts(db) == before


def test_suggest_does_not_create_a_profile_row(teacher_client, make_child, klass, db):
    bare = make_child(klass, name="Lina", with_profile=False)
    r = teacher_client.post(suggest_url(bare))
    assert r.status_code == 200, r.text
    assert r.json()["baseline"] is None
    db.expire_all()
    assert db.scalars(select(ChildProfile).where(ChildProfile.child_id == bare.id)).first() is None


def test_template_suggestion_downgrades_statuses_with_few_observations(teacher_client, child):
    focus_id, _ = setup_child(teacher_client, child)
    # An observation before the baseline does not count.
    observe(teacher_client, child, focus_id, observed_at=(datetime.now(timezone.utc) - timedelta(days=30)).isoformat())
    observe(teacher_client, child, focus_id, level="significant_support")
    observe(teacher_client, child, focus_id, level="some_support")

    s = teacher_client.post(suggest_url(child)).json()["suggestion"]
    assert [(f["focus_area_id"], f["status"]) for f in s["focus_review"]] == [(focus_id, "needs_more_observation")]
    assert s["baseline_validation"] and {b["status"] for b in s["baseline_validation"]} == {"needs_more_observation"}

    # A third linked observation since the baseline: the template may now describe a change.
    observe(teacher_client, child, focus_id, level="independent", note="Asked a friend to build without prompting")
    data = teacher_client.post(suggest_url(child)).json()
    assert data["observation_count_since_baseline"] == 3
    statuses = {f["focus_area_id"]: f["status"] for f in data["suggestion"]["focus_review"]}
    assert statuses[focus_id] in ("some_improvement", "no_clear_change")
    focus_item = next(b for b in data["suggestion"]["baseline_validation"] if b["list"] == "focus")
    assert focus_item["key"] == focus_id and len(focus_item["observation_ids"]) == 3


# --------------------------------------------------------------------------- save


def test_save_applies_decisions_and_warns_on_limited_data(teacher_client, teacher, child, db):
    focus_a, baseline_id = setup_child(teacher_client, child)
    focus_b = add_focus(teacher_client, child, suggestion_key="taking_turns")
    focus_c = add_focus(teacher_client, child, category="emotional", title="Calming down")
    obs_id = observe(teacher_client, child, focus_a)
    baseline_json = json.dumps(db.get(Baseline, baseline_id).baseline_data, sort_keys=True)

    body = review_body(
        focus_review=[
            {"focus_area_id": focus_a, "status": "improving", "decision": "keep", "what_worked": "Building first"},
            {"focus_area_id": focus_b, "status": "no_longer_needed", "decision": "close", "note": "Takes turns now"},
            {"focus_area_id": focus_c, "status": "needs_more_observation", "decision": "edit",
             "edit": {"title": "Calming down after outdoor play", "plan": {"adaptation": "Quiet corner"}}},
            {"decision": "create", "create": {"suggestion_key": "expressing_frustration_in_words"}},
        ],
        baseline_validation=[
            {"list": "strengths", "key": "building", "label": "Building", "status": "supported",
             "observation_ids": [obs_id]},
            {"list": "interests", "key": "animals", "label": "Animals", "status": "needs_more_observation"},
        ],
    )
    r = teacher_client.post(reviews_url(child), json=body)
    assert r.status_code == 201, r.text
    out = r.json()
    review = out["review"]
    assert review["created_by"] == {"id": str(teacher.id), "name": teacher.name}
    assert review["ai_suggested"] is True and review["review_date"]
    decisions = [(f["decision"], f["status"]) for f in review["focus_review"]]
    assert decisions == [("keep", "improving"), ("close", "no_longer_needed"), ("edit", "needs_more_observation"),
                         ("create", None)]
    assert review["focus_review"][2]["title"] == "Calming down after outdoor play"
    assert review["baseline_validation"][0]["observation_ids"] == [obs_id]

    # B6: the teacher keeps control, but limited data is pointed out (no downgrade).
    warned = {(w["path"], w["observation_count"]) for w in out["warnings"]}
    assert warned == {("focus_review.0.status", 1), ("focus_review.1.status", 0), ("baseline_validation.0.status", 1)}
    assert all(w["code"] == "LIMITED_OBSERVATIONS" for w in out["warnings"])

    db.expire_all()
    rows = {str(f.id): f for f in db.scalars(select(FocusArea).where(FocusArea.child_id == child.id))}
    assert rows[focus_a].status == "active"
    assert rows[focus_b].status == "completed" and rows[focus_b].closed_at is not None
    assert rows[focus_b].close_reason == "Takes turns now"
    assert rows[focus_c].title == "Calming down after outdoor play" and rows[focus_c].plan == {"adaptation": "Quiet corner"}
    new_id = review["focus_review"][3]["focus_area_id"]
    assert rows[new_id].status == "active" and rows[new_id].suggestion_key == "expressing_frustration_in_words"
    assert rows[new_id].category == "emotional"
    assert sum(1 for f in rows.values() if f.status == "active") == 3

    stored = db.get(DevelopmentReview, review["id"])
    assert stored.summary == body["summary"] and stored.understanding["summary"] == body["summary"]
    # Baselines are never touched.
    assert db.scalar(select(text("count(*)")).select_from(Baseline)) == 1
    assert json.dumps(db.get(Baseline, baseline_id).baseline_data, sort_keys=True) == baseline_json

    actions = [a.action for a in db.scalars(select(AuditLog).where(AuditLog.child_id == child.id)
                                            .where(AuditLog.action.in_(["review.create", "focus.close", "focus.update",
                                                                        "focus.create"]))
                                            .order_by(AuditLog.id))]
    assert actions[-4:] == ["focus.close", "focus.update", "focus.create", "review.create"]


def test_create_beyond_three_active_rolls_back_everything(teacher_client, child, db):
    focus_a, _ = setup_child(teacher_client, child)
    focus_b = add_focus(teacher_client, child, suggestion_key="taking_turns")
    add_focus(teacher_client, child, category="emotional", title="Calming down")
    cu_before = json.dumps(profile_row(db, child).current_understanding, sort_keys=True)
    counts_before = table_counts(db)

    body = review_body(focus_review=[
        {"focus_area_id": focus_b, "status": "no_longer_needed", "decision": "pause"},
        {"decision": "create", "create": {"category": "social", "title": "Sharing toys"}},
        {"decision": "create", "create": {"category": "independence", "title": "Putting on shoes"}},
    ])
    r = teacher_client.post(reviews_url(child), json=body)
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "FOCUS_LIMIT"

    db.expire_all()
    assert table_counts(db) == counts_before  # no review row, no focus row, no audit row
    assert db.scalars(select(FocusArea).where(FocusArea.id == focus_b)).one().status == "active"
    assert json.dumps(profile_row(db, child).current_understanding, sort_keys=True) == cu_before
    assert db.scalar(select(text("count(*)")).select_from(DevelopmentReview)) == 0
    assert focus_a


def test_keep_reactivates_a_paused_focus_only_within_the_limit(teacher_client, child, db):
    focus_a, _ = setup_child(teacher_client, child)
    r = teacher_client.post(f"/api/focus-areas/{focus_a}/close", json={"status": "paused"})
    assert r.status_code == 200, r.text
    add_focus(teacher_client, child, suggestion_key="taking_turns")
    focus_c = add_focus(teacher_client, child, category="emotional", title="Calming down")
    add_focus(teacher_client, child, category="independence", title="Putting on shoes")

    keep = {"focus_area_id": focus_a, "status": "some_improvement", "decision": "keep"}
    r = teacher_client.post(reviews_url(child), json=review_body(focus_review=[keep]))
    assert r.status_code == 409 and r.json()["error"]["code"] == "FOCUS_LIMIT"

    # Closing another focus in the same review makes room.
    close_c = {"focus_area_id": focus_c, "status": "no_longer_needed", "decision": "close"}
    r = teacher_client.post(reviews_url(child), json=review_body(focus_review=[keep, close_c]))
    assert r.status_code == 201, r.text
    db.expire_all()
    a = db.get(FocusArea, focus_a)
    assert a.status == "active" and a.closed_at is None


def test_current_understanding_and_profile_merge_survive_profile_edits(teacher_client, teacher, child, db):
    """PLAN B3: approved items join the profile with source review and stay after a later PATCH."""
    focus_id, baseline_id = setup_child(teacher_client, child)
    r = teacher_client.post(reviews_url(child), json=review_body(
        focus_review=[{"focus_area_id": focus_id, "status": "needs_more_observation", "decision": "keep"}]))
    assert r.status_code == 201, r.text
    review_id = r.json()["review"]["id"]
    assert r.json()["warnings"] == []

    profile = profile_row(db, child)
    cu = profile.current_understanding
    assert cu["source"] == "review" and cu["review_id"] == review_id
    assert cu["approved_by"] == str(teacher.id) and cu["approved_at"] and cu["baseline_id"] == baseline_id
    assert cu["summary"].startswith("Adam appears to be becoming more independent")
    assert cu["adaptations"] and cu["next_steps"] and cu["areas_for_support"] == ["Starting shared play"]
    assert cu["what_helps"] == [{"key": "countdown_timer", "list": "what_helps"}]

    strengths = {i.get("key") or i.get("custom"): i["sources"] for i in profile.strengths}
    assert strengths["building"] == ["teacher", "review"]
    assert strengths["empathy"] == ["review"]
    interests = {i.get("key") or i.get("custom"): i["sources"] for i in profile.interests}
    assert interests["Trains"] == ["review"] and interests["cars_transportation"] == ["teacher", "review"]
    assert {i["key"]: i["sources"] for i in profile.what_helps}["countdown_timer"] == ["review"]
    empathy = next(i for i in profile.strengths if i.get("key") == "empathy")
    assert empathy["added_by"] == str(teacher.id) and empathy["added_at"]

    # A later wizard edit drops building and empathy from the teacher's answers: the review keeps them.
    r = teacher_client.patch(f"/api/children/{child.id}/profile", json={"section": "who", "data": {
        "strengths": ["humor"], "interests": ["animals"]}})
    assert r.status_code == 200, r.text
    profile = profile_row(db, child)
    strengths = {i.get("key") or i.get("custom"): i["sources"] for i in profile.strengths}
    assert strengths == {"building": ["review"], "empathy": ["review"], "humor": ["teacher"]}
    interests = {i.get("key") or i.get("custom"): i["sources"] for i in profile.interests}
    assert interests == {"cars_transportation": ["review"], "Trains": ["review"], "animals": ["teacher"]}
    assert profile.current_understanding["review_id"] == review_id


def test_timeline_shows_the_review(teacher_client, child):
    focus_id, _ = setup_child(teacher_client, child)
    r = teacher_client.post(reviews_url(child), json=review_body(
        focus_review=[{"focus_area_id": focus_id, "status": "needs_more_observation", "decision": "keep"}]))
    assert r.status_code == 201, r.text
    entries = teacher_client.get(f"/api/children/{child.id}/timeline").json()["entries"]
    reviews = [e for e in entries if e["type"] == "review"]
    assert len(reviews) == 1
    assert reviews[0]["id"] == r.json()["review"]["id"]
    assert reviews[0]["text"] == review_body()["summary"]


def test_new_content_uses_the_approved_understanding(teacher_client, child, db):
    """PLAN B3: after an approved review, the generation_input of new content contains it."""
    from app.main import app

    focus_id, _ = setup_child(teacher_client, child)
    summary = "Adam appears to enjoy building with one friend and starts shared play more often."
    body = review_body(summary=summary, focus_review=[
        {"focus_area_id": focus_id, "status": "needs_more_observation", "decision": "keep"}])
    body["understanding"]["adaptations"] = "Offer a building role first."
    assert teacher_client.post(reviews_url(child), json=body).status_code == 201

    has_generate = any(getattr(r, "path", "").endswith("/content/generate") and "POST" in (getattr(r, "methods", None) or ())
                       for r in app.routes)
    if has_generate:
        r = teacher_client.post(f"/api/children/{child.id}/content/generate", json={
            "mode": "growth_support", "content_type": "real_world_activity", "focus_area_id": focus_id,
            "language": "en"})
        assert r.status_code in (200, 201), r.text
        db.expire_all()
        row = db.scalars(select(GeneratedContent).where(GeneratedContent.child_id == child.id)
                         .order_by(GeneratedContent.created_at.desc())).first()
        generation_input = row.generation_input
    else:  # content generation (WP-11) not wired yet: the AI context it will store
        profile = profile_row(db, child)
        generation_input = build_context(
            child=db.get(Child, child.id), profile=profile, mode="growth_support", content_type="real_world_activity",
            language="en", focus=db.get(FocusArea, focus_id), current_understanding=profile.current_understanding,
        ).model_dump(mode="json")
    assert generation_input["current_understanding"]["summary"] == summary
    assert generation_input["current_understanding"]["adaptations"] == "Offer a building role first."


def test_list_reviews_newest_first_with_context(teacher_client, admin_client, teacher, admin, child):
    focus_id, baseline_id = setup_child(teacher_client, child)
    keep = [{"focus_area_id": focus_id, "status": "needs_more_observation", "decision": "keep"}]
    first = teacher_client.post(reviews_url(child), json=review_body(focus_review=keep, summary="First look.")).json()
    second = admin_client.post(reviews_url(child), json=review_body(focus_review=keep, summary="Second look.")).json()

    data = teacher_client.get(reviews_url(child)).json()
    assert [r["id"] for r in data["reviews"]] == [second["review"]["id"], first["review"]["id"]]
    assert data["reviews"][0]["created_by"]["name"] == admin.name
    assert data["reviews"][1]["created_by"]["name"] == teacher.name
    assert data["reviews"][1]["summary"] == "First look."
    ctx = data["context"]
    assert ctx["baseline"]["id"] == baseline_id and ctx["observation_count_since_baseline"] == 0
    assert "Adam" in ctx["baseline"]["summary"]  # the first-picture wording, for the baseline card
    assert [f["id"] for f in ctx["focus_areas"]] == [focus_id]
    assert any(i["list"] == "focus" and i["key"] == focus_id for i in ctx["baseline_items"])
    assert not SCORING.search(json.dumps(data))


# --------------------------------------------------------------------------- validation and access


def test_validation_errors(teacher_client, child, other_child, db):
    focus_id, _ = setup_child(teacher_client, child)
    url = reviews_url(child)
    cases = [
        review_body(understanding={"summary": "x", "strengths": [{"key": "not_a_strength"}]}),
        review_body(understanding={"summary": "x", "what_helps": [{"key": "hug", "list": "strengths"}]}),
        review_body(focus_review=[{"focus_area_id": focus_id, "status": "great", "decision": "keep"}]),
        review_body(focus_review=[{"focus_area_id": focus_id, "status": "improving", "decision": "maybe"}]),
        review_body(focus_review=[{"focus_area_id": focus_id, "status": "improving", "decision": "edit"}]),
        review_body(focus_review=[{"focus_area_id": focus_id, "decision": "keep"}]),
        review_body(focus_review=[{"decision": "create"}]),
        review_body(focus_review=[{"focus_area_id": focus_id, "status": "improving", "decision": "keep"},
                                  {"focus_area_id": focus_id, "status": "improving", "decision": "pause"}]),
        review_body(baseline_validation=[{"list": "strengths", "label": "Building", "status": "certain"}]),
        review_body(summary=None, understanding={"strengths": []}),
        review_body(ai_suggested=True, extra=1),
    ]
    for body in cases:
        r = teacher_client.post(url, json=body)
        assert r.status_code == 400, (body, r.text)
        assert r.json()["error"]["code"] == "VALIDATION"

    # A focus area of another child is unknown here.
    other_focus = FocusArea(child_id=other_child.id, category="social", title="Other", status="active")
    db.add(other_focus)
    db.commit()
    r = teacher_client.post(url, json=review_body(focus_review=[
        {"focus_area_id": str(other_focus.id), "status": "improving", "decision": "keep"}]))
    assert r.status_code == 400 and r.json()["error"]["details"][0]["path"] == "focus_review.0.focus_area_id"

    # Clinical labels are not accepted in teacher text either (spec §2).
    r = teacher_client.post(url, json=review_body(summary="Adam may have ADHD."))
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNSAFE_CONTENT"
    assert r.json()["error"]["details"][0]["path"] == "summary"
    db.expire_all()
    assert db.scalar(select(text("count(*)")).select_from(DevelopmentReview)) == 0


def test_access_rules(teacher_client, parent_client, other_teacher_client, other_parent_client, client, child):
    focus_id, _ = setup_child(teacher_client, child)
    body = review_body(focus_review=[{"focus_area_id": focus_id, "status": "needs_more_observation", "decision": "keep"}])
    for c in (parent_client, other_teacher_client, other_parent_client):
        assert c.post(suggest_url(child)).status_code == 404
        assert c.post(reviews_url(child), json=body).status_code == 404
        assert c.get(reviews_url(child)).status_code == 404
    assert client.get(reviews_url(child)).status_code == 401
    assert client.post(reviews_url(child), json=body).status_code == 401
    assert teacher_client.get("/api/children/not-a-uuid/development-reviews").status_code == 404
