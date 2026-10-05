"""WP-08: quick observations (create, idempotency, validation, scope, edit, audit)."""
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
