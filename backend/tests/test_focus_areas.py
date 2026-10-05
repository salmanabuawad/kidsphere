"""WP-06: Current Focus areas (max 3 active, plan, close/reactivate, scope)."""
import threading
import time

from sqlalchemy import func, select

from app.models import AuditLog, Child, FocusArea

PLAN = {
    "strength_used": "Imagination and building",
    "need": "Joining other children's play",
    "adaptation": "Start in a pair at the block corner",
    "what_we_will_do": "Build the garage together; practise 'Can we build this together?'",
    "frequency": "3 times a week",
    "who": "Class teacher",
    "review_on": "2026-11-01",
    "success_looks_like": "Invites a friend to build without prompting",
}


def create(client, child, **body):
    body.setdefault("category", "social")
    body.setdefault("title", "Focus")
    return client.post(f"/api/children/{child.id}/focus-areas", json=body)


def active(db, child):
    db.expire_all()
    return db.scalar(select(func.count()).select_from(FocusArea).where(FocusArea.child_id == child.id, FocusArea.status == "active"))


def test_create_from_suggestion_with_plan(teacher_client, teacher, child, db):
    r = teacher_client.post(f"/api/children/{child.id}/focus-areas", json={"suggestion_key": "joining_group_play", "plan": PLAN})
    assert r.status_code == 201, r.text
    fa = r.json()["focus_area"]
    assert fa["category"] == "social" and fa["title"] == "Joining group play" and fa["status"] == "active"
    assert fa["plan"] == PLAN and fa["created_by"] == str(teacher.id)

    listed = teacher_client.get(f"/api/children/{child.id}/focus-areas").json()
    assert listed["max_active"] == 3 and listed["focus_areas"][0]["plan"] == PLAN
    log = db.scalars(select(AuditLog).where(AuditLog.action == "focus.create")).one()
    assert log.meta == {"category": "social", "suggestion_key": "joining_group_play"}


def test_custom_focus_and_empty_plan(teacher_client, child):
    r = create(teacher_client, child, category="confidence", title="Trying the climbing frame", description="Short tries",
               plan={"need": "", "adaptation": "  "})
    assert r.status_code == 201, r.text
    fa = r.json()["focus_area"]
    assert fa["suggestion_key"] is None and fa["plan"] is None and fa["description"] == "Short tries"


def test_validation(teacher_client, child):
    for body in (
        {"category": "behaviour", "title": "x"},
        {"suggestion_key": "not_a_suggestion"},
        {"title": "no category"},
        {"category": "social"},
        {"category": "social", "title": "x", "plan": {"score": "5"}},
        {"category": "social", "title": "x", "status": "active"},
    ):
        r = teacher_client.post(f"/api/children/{child.id}/focus-areas", json=body)
        assert r.status_code == 400, (body, r.text)


def test_fourth_active_is_rejected(teacher_client, child, db):
    for i in range(3):
        assert create(teacher_client, child, title=f"F{i}").status_code == 201
    r = create(teacher_client, child, title="F4")
    assert r.status_code == 409 and r.json()["error"]["code"] == "FOCUS_LIMIT"
    assert active(db, child) == 3


def test_pause_close_and_reactivate(teacher_client, child, db):
    ids = [create(teacher_client, child, title=f"F{i}").json()["focus_area"]["id"] for i in range(3)]
    r = teacher_client.post(f"/api/focus-areas/{ids[0]}/close", json={"status": "paused", "close_reason": "Holiday"})
    assert r.status_code == 200, r.text
    assert r.json()["focus_area"]["status"] == "paused" and r.json()["focus_area"]["closed_at"]
    assert create(teacher_client, child, title="F3").status_code == 201

    # Reactivating the paused one would make 4 active.
    r = teacher_client.put(f"/api/focus-areas/{ids[0]}", json={"status": "active"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "FOCUS_LIMIT"
    assert active(db, child) == 3

    r = teacher_client.post(f"/api/focus-areas/{ids[1]}/close")
    assert r.status_code == 200 and r.json()["focus_area"]["status"] == "completed"
    r = teacher_client.put(f"/api/focus-areas/{ids[0]}", json={"status": "active"})
    assert r.status_code == 200 and r.json()["focus_area"]["closed_at"] is None
    assert active(db, child) == 3
    # Saving an already active area does not count it twice.
    assert teacher_client.put(f"/api/focus-areas/{ids[0]}", json={"status": "active", "title": "Renamed"}).status_code == 200
    # A completed focus cannot be paused via close.
    assert teacher_client.post(f"/api/focus-areas/{ids[1]}/close", json={"status": "paused"}).status_code == 409

    listed = teacher_client.get(f"/api/children/{child.id}/focus-areas").json()["focus_areas"]
    assert [f["status"] for f in listed] == ["active", "active", "active", "completed"]
    assert len(teacher_client.get(f"/api/children/{child.id}/focus-areas", params={"status": "completed"}).json()["focus_areas"]) == 1
    actions = db.scalars(select(AuditLog.action).where(AuditLog.object_type == "focus_area")).all()
    assert {"focus.create", "focus.update", "focus.close"} <= set(actions)


def test_update_plan_roundtrip(teacher_client, child, db):
    fid = create(teacher_client, child, plan={"need": "Asking for help"}).json()["focus_area"]["id"]
    r = teacher_client.put(f"/api/focus-areas/{fid}", json={"plan": PLAN, "title": "Asking for help", "suggestion_key": "asking_for_help"})
    assert r.status_code == 200, r.text
    fa = r.json()["focus_area"]
    assert fa["plan"] == PLAN and fa["category"] == "communication" and fa["suggestion_key"] == "asking_for_help"
    log = db.scalars(select(AuditLog).where(AuditLog.action == "focus.update")).one()
    assert set(log.meta["fields"]) == {"plan", "title", "suggestion_key"}
    # Fields that are not sent stay as they are; plan: null clears it.
    r = teacher_client.put(f"/api/focus-areas/{fid}", json={"description": "New"})
    assert r.json()["focus_area"]["plan"] == PLAN
    r = teacher_client.put(f"/api/focus-areas/{fid}", json={"plan": None})
    assert r.json()["focus_area"]["plan"] is None


def test_concurrent_creates_leave_three(client_for, teacher, child, db):
    for i in range(2):
        assert create(client_for(teacher), child, title=f"F{i}").status_code == 201
    clients = [client_for(teacher), client_for(teacher)]
    barrier = threading.Barrier(2)
    results = []

    def go(c, n):
        barrier.wait()
        results.append(create(c, child, title=f"race-{n}").status_code)

    threads = [threading.Thread(target=go, args=(c, n)) for n, c in enumerate(clients)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    assert sorted(results) == [201, 409]
    assert active(db, child) == 3


def test_create_waits_for_the_child_lock(client_for, teacher, child, db):
    """A create blocked on the child row lock sees rows committed meanwhile (no lost check)."""
    for i in range(2):
        assert create(client_for(teacher), child, title=f"F{i}").status_code == 201
    c = client_for(teacher)
    db.scalars(select(Child).where(Child.id == child.id).with_for_update()).one()  # hold the lock
    result = {}
    t = threading.Thread(target=lambda: result.setdefault("status", create(c, child, title="late").status_code))
    t.start()
    time.sleep(0.5)
    assert "status" not in result  # still waiting for the lock
    db.add(FocusArea(child_id=child.id, category="social", title="third", status="active"))
    db.commit()  # releases the lock
    t.join(30)
    assert result["status"] == 409
    assert active(db, child) == 3


def test_scope(teacher_client, parent_client, other_teacher_client, admin_client, child, other_child):
    fid = create(teacher_client, child).json()["focus_area"]["id"]
    assert parent_client.get(f"/api/children/{child.id}/focus-areas").status_code == 403
    assert parent_client.put(f"/api/focus-areas/{fid}", json={"title": "x"}).status_code == 403
    assert other_teacher_client.get(f"/api/children/{child.id}/focus-areas").status_code == 404
    assert create(other_teacher_client, child).status_code == 404
    assert other_teacher_client.put(f"/api/focus-areas/{fid}", json={"title": "x"}).status_code == 404
    assert other_teacher_client.post(f"/api/focus-areas/{fid}/close").status_code == 404
    assert teacher_client.put("/api/focus-areas/not-a-uuid", json={"title": "x"}).status_code == 404
    assert teacher_client.get(f"/api/children/{other_child.id}/focus-areas").status_code == 404
    assert admin_client.put(f"/api/focus-areas/{fid}", json={"title": "Admin edit"}).status_code == 200
