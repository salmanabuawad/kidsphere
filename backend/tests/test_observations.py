"""WP-08: quick observations (create, idempotency, validation, scope, edit, audit);
WP2-TO: structured observations (D14 stages, domains, attributes, versions, filters)."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.models import AuditLog, FocusArea, Observation


def url(child):
    return f"/api/children/{child.id}/observations"


def make_focus(db, child, title="Joining group play", status="active"):
    row = FocusArea(child_id=child.id, category="social", title=title, status=status)
    db.add(row)
    db.commit()
    return row


def count(db, child):
    db.expire_all()
    return db.scalar(select(func.count()).select_from(Observation).where(Observation.child_id == child.id))


def test_only_text_is_required_and_request_id_is_idempotent(teacher_client, teacher, child, db):
    r = teacher_client.post(url(child), json={"observation": "Built a garage with Sami", "client_request_id": "req-1"})
    assert r.status_code == 201, r.text
    obs = r.json()["observation"]
    assert obs["observation"] == "Built a garage with Sami" and obs["source"] == "quick"
    assert obs["created_by"] == {"id": str(teacher.id), "name": teacher.name}
    assert obs["observed_at"] and obs["support_level"] is None and obs["what_helped"] is None

    again = teacher_client.post(url(child), json={"observation": "Built a garage with Sami", "client_request_id": "req-1"})
    assert again.status_code == 200, again.text
    assert again.json()["observation"]["id"] == obs["id"]
    assert count(db, child) == 1

    plain = teacher_client.post(url(child), json={"observation": "Another one"})
    assert plain.status_code == 201 and plain.json()["observation"]["id"] != obs["id"]
    assert count(db, child) == 2


def test_full_observation(teacher_client, child, db):
    focus = make_focus(db, child)
    when = (datetime.now(timezone.utc) - timedelta(hours=2)).replace(microsecond=0)
    body = {
        "observed_at": when.isoformat(),
        "focus_area_id": str(focus.id),
        "area": "social",
        "context": "free_play",
        "observation": "Asked Lina: can we build this together?",
        "support_level": "some_support",
        "what_helped": ["adult_mediation", {"custom": "A favourite car"}, "adult_mediation"],
        "note": "First time he asked",
        "details": {"what_i_see": "Watched first", "when": "Block corner", "what_needed": "", "did_it_change": "partly"},
    }
    r = teacher_client.post(url(child), json=body)
    assert r.status_code == 201, r.text
    obs = r.json()["observation"]
    assert obs["focus_area_id"] == str(focus.id) and obs["focus_area_title"] == "Joining group play"
    assert obs["what_helped"] == [{"key": "adult_mediation"}, {"custom": "A favourite car"}]
    assert obs["details"] == {"what_i_see": "Watched first", "when": "Block corner", "did_it_change": "partly"}
    assert datetime.fromisoformat(obs["observed_at"]) == when
    assert obs["context"] == "free_play" and obs["area"] == "social" and obs["support_level"] == "some_support"

    listed = teacher_client.get(url(child), params={"focus_area_id": str(focus.id)}).json()
    assert [o["id"] for o in listed["observations"]] == [obs["id"]]


def test_validation(teacher_client, child, other_child, db):
    other_focus = make_focus(db, other_child, "Other")
    bad = [
        {},
        {"observation": ""},
        {"observation": "   "},
        {"observation": "x" * 4001},
        {"observation": "x", "context": "playground_party"},
        {"observation": "x", "area": "behaviour"},
        {"observation": "x", "support_level": "a_lot"},
        {"observation": "x", "what_helped": ["magic"]},
        {"observation": "x", "details": {"did_it_change": "maybe"}},
        {"observation": "x", "details": {"score": "5"}},
        {"observation": "x", "focus_area_id": str(other_focus.id)},
        {"observation": "x", "observed_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()},
        {"observation": "x", "unknown": 1},
    ]
    for body in bad:
        r = teacher_client.post(url(child), json=body)
        assert r.status_code == 400, (body, r.text)
        assert r.json()["error"]["code"] == "VALIDATION"
    assert count(db, child) == 0


def test_scope(other_teacher_client, parent_client, other_parent_client, admin_client, teacher_client, child, db):
    created = teacher_client.post(url(child), json={"observation": "Hello"}).json()["observation"]
    for c in (other_teacher_client, parent_client, other_parent_client):
        assert c.get(url(child)).status_code == 404
        assert c.post(url(child), json={"observation": "x"}).status_code == 404
        assert c.put(f"/api/observations/{created['id']}", json={"observation": "y"}).status_code == 404
    assert teacher_client.get("/api/children/not-a-uuid/observations").status_code == 404
    assert admin_client.get(url(child)).status_code == 200
    assert count(db, child) == 1


def test_list_newest_first_with_limit_offset(teacher_client, child):
    now = datetime.now(timezone.utc)
    ids = []
    for i in range(5):
        r = teacher_client.post(url(child), json={"observation": f"obs {i}", "observed_at": (now - timedelta(days=5 - i)).isoformat()})
        ids.append(r.json()["observation"]["id"])
    first = teacher_client.get(url(child), params={"limit": 2}).json()
    second = teacher_client.get(url(child), params={"limit": 2, "offset": 2}).json()
    third = teacher_client.get(url(child), params={"limit": 2, "offset": 4}).json()
    got = [o["id"] for page in (first, second, third) for o in page["observations"]]
    assert got == list(reversed(ids))
    assert first["has_more"] and second["has_more"] and not third["has_more"]
    assert teacher_client.get(url(child), params={"limit": 0}).status_code == 400


def test_update_by_author_or_admin(teacher_client, admin_client, client_for, make_user, klass, child, db):
    from app.models import ClassTeacher

    created = teacher_client.post(url(child), json={"observation": "Before", "support_level": "significant_support"}).json()["observation"]
    put = f"/api/observations/{created['id']}"
    r = teacher_client.put(put, json={"observation": "After", "support_level": "some_support", "what_helped": ["visual_support"]})
    assert r.status_code == 200, r.text
    out = r.json()["observation"]
    assert out["observation"] == "After" and out["support_level"] == "some_support" and out["what_helped"] == [{"key": "visual_support"}]

    assert teacher_client.put(put, json={"observation": None}).status_code == 400
    assert teacher_client.put(put, json={"context": "nowhere"}).status_code == 400

    colleague = make_user("teacher", name="Colleague")
    db.add(ClassTeacher(class_id=klass.id, user_id=colleague.id))
    db.commit()
    assert client_for(colleague).put(put, json={"observation": "Mine now"}).status_code == 403

    r = admin_client.put(put, json={"note": "Checked"})
    assert r.status_code == 200 and r.json()["observation"]["note"] == "Checked"

    db.expire_all()
    actions = db.execute(select(AuditLog.action, AuditLog.meta).order_by(AuditLog.id)).all()
    assert [a for a, _ in actions] == ["observation.create", "observation.update", "observation.update"]
    assert actions[1][1] == {"fields": ["observation", "support_level", "what_helped"]}
    # Audit metadata never holds the observation text.
    assert all("After" not in str(meta) and "Before" not in str(meta) for _, meta in actions)


def test_feedback_mirror_is_not_editable_here(teacher_client, teacher, child, db):
    row = Observation(child_id=child.id, source="content_feedback", observation=None, created_by=teacher.id)
    db.add(row)
    db.commit()
    r = teacher_client.put(f"/api/observations/{row.id}", json={"observation": "x"})
    assert r.status_code == 409
    listed = teacher_client.get(url(child)).json()["observations"]
    assert listed[0]["source"] == "content_feedback" and listed[0]["observation"] is None


def test_request_id_for_another_child_is_rejected(teacher_client, make_child, klass, child, db):
    second = make_child(klass, name="Lina")
    assert teacher_client.post(url(child), json={"observation": "x", "client_request_id": "same"}).status_code == 201
    r = teacher_client.post(url(second), json={"observation": "x", "client_request_id": "same"})
    assert r.status_code == 409
    assert count(db, second) == 0


# --------------------------------------------------------------------------- WP2-TO: structured observations (D14)


def versions_of(db, obs_id):
    from app.models import RecordVersion

    db.expire_all()
    return db.scalars(select(RecordVersion).where(RecordVersion.entity_type == "observation",
                                                  RecordVersion.entity_id == obs_id).order_by(RecordVersion.seq)).all()


def test_structured_stages_domains_and_attributes_round_trip(teacher_client, child, db):
    from app.services import history

    focus = make_focus(db, child)
    history.record(db, child_id=child.id, entity_type="focus_area", entity_id=focus.id, data={"title": "v1"},
                   user=None, via="manual")
    history.record(db, child_id=child.id, entity_type="focus_area", entity_id=focus.id, data={"title": "v2"},
                   user=None, via="manual")
    db.commit()
    body = {
        "observation": "Got up from group time after about 5 minutes",
        "context": "group_time",
        "domains": ["executive_function", "social", "executive_function"],
        "attributes": {"frequency": "often", "duration_minutes": 5, "intensity": "moderate"},
        "details": {
            "what_i_see": "Stood up and walked to the window",
            "when_detail": {"time": "09:30", "activity": "group_time", "activity_text": "Story", "with_whom": "Lina",
                            "before_event": "Snack", "after_event": ""},
            "needs": {"helps": ["movement", {"key": "visual_support"}, {"custom": "A cushion"}, "movement"],
                      "text": "A short break"},
            "what_we_did": "Gave him the page-turner role",
            "plan_ref": {"focus_area_id": str(focus.id)},
            "did_it_change": "partly",
            "what_changed": "Stayed until the end of the story",
            "documentation": "Second time this week",
        },
    }
    r = teacher_client.post(url(child), json=body)
    assert r.status_code == 201, r.text
    obs = r.json()["observation"]
    assert obs["domains"] == ["executive_function", "social"]
    assert obs["attributes"] == {"frequency": "often", "duration_minutes": 5, "intensity": "moderate"}
    assert obs["details"] == {
        "what_i_see": "Stood up and walked to the window",
        "when_detail": {"time": "09:30", "activity": "group_time", "activity_text": "Story", "with_whom": "Lina",
                        "before_event": "Snack"},
        "needs": {"helps": [{"key": "movement"}, {"key": "visual_support"}, {"custom": "A cushion"}],
                  "text": "A short break"},
        "what_we_did": "Gave him the page-turner role",
        "plan_ref": {"focus_area_id": str(focus.id), "version_seq": 2},
        "did_it_change": "partly",
        "what_changed": "Stayed until the end of the story",
        "documentation": "Second time this week",
    }
    assert obs["version_count"] == 1
    # The stored document can be sent back as it came (PUT keeps the shape).
    again = teacher_client.put(f"/api/observations/{obs['id']}", json={"details": obs["details"]})
    assert again.status_code == 200, again.text
    assert again.json()["observation"]["details"] == obs["details"]
    assert again.json()["observation"]["version_count"] == 1  # nothing changed: no new version


def test_domains_default_to_the_area(teacher_client, child):
    r = teacher_client.post(url(child), json={"observation": "Climbed the frame", "area": "motor"})
    assert r.json()["observation"]["domains"] == ["gross_motor", "fine_motor"]
    r = teacher_client.post(url(child), json={"observation": "Climbed", "area": "motor", "domains": []})
    assert r.json()["observation"]["domains"] == []
    r = teacher_client.post(url(child), json={"observation": "Smiled"})
    assert r.json()["observation"]["domains"] == []


def test_structured_validation(teacher_client, child, other_child, db):
    other_focus = make_focus(db, other_child, "Other")
    bad = [
        {"observation": "x", "domains": ["attention"]},
        {"observation": "x", "domains": ["strengths"]},
        {"observation": "x", "attributes": {"frequency": "always_and_forever"}},
        {"observation": "x", "attributes": {"duration_minutes": 0}},
        {"observation": "x", "attributes": {"duration_minutes": 91}},
        {"observation": "x", "attributes": {"intensity": "extreme"}},
        {"observation": "x", "attributes": {"score": 3}},
        {"observation": "x", "details": {"when_detail": {"activity": "party"}}},
        {"observation": "x", "details": {"when_detail": {"time": "x" * 61}}},
        {"observation": "x", "details": {"needs": {"helps": ["magic"]}}},
        {"observation": "x", "details": {"needs": {"helps": [{"key": "magic"}]}}},
        {"observation": "x", "details": {"what_changed": "x" * 1001}},
        {"observation": "x", "details": {"documentation": "x" * 2001}},
        {"observation": "x", "details": {"plan_ref": {"focus_area_id": str(other_focus.id)}}},
        {"observation": "x", "details": {"plan_ref": {"version_seq": 1}}},
    ]
    for body in bad:
        r = teacher_client.post(url(child), json=body)
        assert r.status_code == 400, (body, r.text)
        assert r.json()["error"]["code"] == "VALIDATION"
    assert count(db, child) == 0


def test_create_and_every_change_write_versions(teacher_client, admin_client, parent_client, other_teacher_client,
                                                teacher, child, db):
    created = teacher_client.post(url(child), json={"observation": "First words", "context": "free_play"}).json()["observation"]
    put = f"/api/observations/{created['id']}"
    assert teacher_client.put(put, json={"observation": "First words to Omar", "domains": ["language"]}).status_code == 200
    assert teacher_client.put(put, json={"observation": "First words to Omar"}).status_code == 200  # no change
    assert admin_client.put(put, json={"details": {"what_changed": "Said it again"}}).status_code == 200
    rows = versions_of(db, uuid.UUID(created["id"]))
    assert [v.seq for v in rows] == [1, 2, 3]
    assert [v.via for v in rows] == ["manual", "manual", "manual"]
    assert rows[0].data["observation"] == "First words" and rows[0].data["domains"] == []
    assert rows[1].data["observation"] == "First words to Omar" and rows[1].data["domains"] == ["language"]
    assert rows[2].data["details"] == {"what_changed": "Said it again"}
    assert rows[0].changed_by == teacher.id and rows[2].changed_role == "admin"
    assert "id" not in rows[0].data and "created_at" not in rows[0].data

    r = teacher_client.get(f"{put}/versions")
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["observation_id"] == created["id"]
    assert [v["seq"] for v in got["versions"]] == [1, 2, 3]
    assert got["versions"][0]["data"]["observation"] == "First words"
    assert got["versions"][1]["changed_by_name"] == teacher.name
    assert teacher_client.get(url(child)).json()["observations"][0]["version_count"] == 3

    for c in (parent_client, other_teacher_client):
        assert c.get(f"{put}/versions").status_code == 404
    assert teacher_client.get(f"/api/observations/{uuid.uuid4()}/versions").status_code == 404
    db.expire_all()
    actions = [a for (a,) in db.execute(select(AuditLog.action).order_by(AuditLog.id)).all()]
    assert actions == ["observation.create", "observation.update", "observation.update"]


def test_list_filters(teacher_client, child, make_observation, teacher, db):
    focus = make_focus(db, child)

    def day(n):
        return datetime(2026, 9, n, 9, 0, tzinfo=timezone.utc)

    make_observation(child, "A", teacher, observed_at=day(1), context="arrival", domains=["emotional"])
    make_observation(child, "B", teacher, observed_at=day(10), context="yard", domains=["gross_motor", "social"],
                     focus_area_id=focus.id)
    make_observation(child, "C", teacher, observed_at=datetime(2026, 9, 20, 23, 59, tzinfo=timezone.utc),
                     context="yard", domains=["social"])
    make_observation(child, None, teacher, observed_at=day(25), source="content_feedback", domains=["social"])

    def ids(**params):
        r = teacher_client.get(url(child), params=params)
        assert r.status_code == 200, r.text
        return {o["observation"] or "D" for o in r.json()["observations"]}

    assert ids() == {"A", "B", "C", "D"}
    assert ids(date_from="2026-09-10") == {"B", "C", "D"}
    assert ids(date_to="2026-09-20") == {"A", "B", "C"}
    assert ids(date_from="2026-09-10", date_to="2026-09-10") == {"B"}
    assert ids(domain="social") == {"B", "C", "D"}
    assert ids(domain="emotional") == {"A"}
    assert ids(domain="language") == set()
    assert ids(context="yard") == {"B", "C"}
    assert ids(source="content_feedback") == {"D"}
    assert ids(source="quick", domain="social") == {"B", "C"}
    assert ids(focus_area_id=str(focus.id)) == {"B"}
    assert ids(domain="social", context="yard", date_from="2026-09-15") == {"C"}
    for params in ({"domain": "strengths"}, {"context": "party"}, {"source": "parent"}, {"date_from": "yesterday"},
                   {"date_from": "2026-09-10", "date_to": "2026-09-01"}):
        r = teacher_client.get(url(child), params=params)
        assert r.status_code == 400, params
        assert r.json()["error"]["code"] == "VALIDATION"


def test_list_filters_by_result(teacher_client, child, make_observation, teacher, db):
    """X-34: the history filters by result: stage E of quick observations, the result of feedback."""
    from app.models import ContentFeedback, GeneratedContent

    make_observation(child, "Y", teacher, details={"did_it_change": "yes"})
    make_observation(child, "P", teacher, details={"did_it_change": "partly"})
    make_observation(child, "N", teacher)
    content = GeneratedContent(child_id=child.id, mode="growth_support", content_type="story", language="en",
                               title="A story", content={"title": "x"}, status="completed", generation_input={},
                               ai_provider="template", is_template=True, created_by=teacher.id)
    db.add(content)
    db.flush()
    feedback = make_observation(child, "F", teacher, source="content_feedback", content_id=content.id)
    db.add(ContentFeedback(content_id=content.id, child_id=child.id, result="worked_well", support_level="independent",
                           observation_id=feedback.id, created_by=teacher.id))
    db.commit()

    def ids(**params):
        r = teacher_client.get(url(child), params=params)
        assert r.status_code == 200, r.text
        return {o["observation"] for o in r.json()["observations"]}

    assert ids(did_it_change="yes") == {"Y"}
    assert ids(did_it_change="partly") == {"P"}
    assert ids(did_it_change="no") == set()
    assert ids(result="worked_well") == {"F"}
    assert ids(result="did_not_work") == set()
    for params in ({"did_it_change": "maybe"}, {"result": "great"}):
        assert teacher_client.get(url(child), params=params).status_code == 400, params
