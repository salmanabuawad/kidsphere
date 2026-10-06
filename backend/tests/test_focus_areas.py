"""WP-06 / WP2-PLAN: Current Focus areas = plan goals (max 3 active, the 6 plan columns,
close/reactivate, version history, periods, family hopes and Domain 13 candidates, scope)."""
import threading
import time
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import AuditLog, Child, ChildProfile, FocusArea, RecordVersion
from app.services import focus_areas as focus_service

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
    # A new ISO plan.review_on (legacy field) also fills the follow-up date.
    assert set(log.meta["fields"]) == {"plan", "title", "suggestion_key", "follow_up_on"}
    assert fa["follow_up_on"] == "2026-11-01"
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


# --------------------------------------------------------------------------- WP2-PLAN: plan columns, history, periods


def versions(db, focus_id):
    db.expire_all()
    return db.scalars(select(RecordVersion).where(RecordVersion.entity_type == "focus_area",
                                                  RecordVersion.entity_id == focus_id)
                      .order_by(RecordVersion.seq)).all()


def test_all_six_plan_columns_round_trip(teacher_client, child):
    plan = {"what_we_will_do": "Build the garage together", "frequency": "Three mornings a week",
            "who": "Rana and the assistant", "success_looks_like": "Invites a friend to build",
            "strength_used": "Building", "need": "Joining play", "adaptation": "Start in a pair"}
    r = create(teacher_client, child, title="Joining group play", plan=plan, follow_up_on="2026-11-15")
    assert r.status_code == 201, r.text
    fa = r.json()["focus_area"]
    assert fa["plan"] == plan and fa["follow_up_on"] == "2026-11-15" and fa["assessment_id"] is None

    listed = teacher_client.get(f"/api/children/{child.id}/focus-areas").json()
    got = listed["focus_areas"][0]
    assert (got["title"], got["plan"]["what_we_will_do"], got["plan"]["frequency"], got["plan"]["who"],
            got["plan"]["success_looks_like"], got["follow_up_on"]) == (
        "Joining group play", "Build the garage together", "Three mornings a week", "Rana and the assistant",
        "Invites a friend to build", "2026-11-15")
    assert listed["active_count"] == 1 and listed["max_active"] == 3

    r = teacher_client.put(f"/api/focus-areas/{fa['id']}", json={"follow_up_on": "2026-12-01"})
    assert r.status_code == 200 and r.json()["focus_area"]["follow_up_on"] == "2026-12-01"
    r = teacher_client.put(f"/api/focus-areas/{fa['id']}", json={"follow_up_on": None})
    assert r.status_code == 200 and r.json()["focus_area"]["follow_up_on"] is None
    assert r.json()["focus_area"]["plan"] == plan
    assert create(teacher_client, child, follow_up_on="next week").status_code == 400


def test_new_review_on_values_must_be_dates(teacher_client, child, make_focus_area):
    assert create(teacher_client, child, plan={"review_on": "after the holidays"}).status_code == 400
    r = create(teacher_client, child, plan={"review_on": "2026-11-20"})
    assert r.status_code == 201 and r.json()["focus_area"]["follow_up_on"] == "2026-11-20"

    # A legacy free-text value (from before the change) is kept while it is not changed.
    old = make_focus_area(child, title="Legacy", plan={"review_on": "after the holidays", "need": "x"})
    r = teacher_client.put(f"/api/focus-areas/{old.id}", json={"plan": {"review_on": "after the holidays", "need": "y"}})
    assert r.status_code == 200, r.text
    assert r.json()["focus_area"]["plan"] == {"review_on": "after the holidays", "need": "y"}
    r = teacher_client.put(f"/api/focus-areas/{old.id}", json={"plan": {"review_on": "in spring"}})
    assert r.status_code == 400 and r.json()["error"]["details"][0]["path"] == "plan.review_on"
    r = teacher_client.put(f"/api/focus-areas/{old.id}", json={"plan": {"review_on": "2027-03-01"}})
    assert r.status_code == 200 and r.json()["focus_area"]["follow_up_on"] == "2027-03-01"


def test_every_change_adds_a_version_and_reopening_keeps_the_closure(teacher_client, teacher, child, db):
    fid = create(teacher_client, child, title="Taking turns", plan={"need": "Waiting"}).json()["focus_area"]["id"]
    assert [(v.seq, v.via, v.data["status"]) for v in versions(db, fid)] == [(1, "manual", "active")]

    assert teacher_client.put(f"/api/focus-areas/{fid}", json={"plan": {"need": "Waiting for a turn",
                                                                       "frequency": "Daily"}}).status_code == 200
    r = teacher_client.post(f"/api/focus-areas/{fid}/close", json={"status": "completed", "close_reason": "Takes turns now"})
    assert r.status_code == 200
    assert teacher_client.put(f"/api/focus-areas/{fid}", json={"status": "active"}).status_code == 200
    r = teacher_client.post(f"/api/focus-areas/{fid}/close", json={"status": "completed", "close_reason": "Steady again"})
    assert r.status_code == 200
    # Saving without a change adds nothing.
    assert teacher_client.put(f"/api/focus-areas/{fid}", json={"title": "Taking turns"}).status_code == 200

    rows = versions(db, fid)
    assert [v.seq for v in rows] == [1, 2, 3, 4, 5]
    assert [v.data["status"] for v in rows] == ["active", "active", "completed", "active", "completed"]
    assert rows[1].data["plan"] == {"need": "Waiting for a turn", "frequency": "Daily"}
    assert rows[2].data["close_reason"] == "Takes turns now" and rows[2].data["closed_at"]
    assert rows[3].data["close_reason"] is None  # the row was reopened ...
    assert {v.changed_by for v in rows} == {teacher.id} and {v.changed_role for v in rows} == {"teacher"}

    data = teacher_client.get(f"/api/focus-areas/{fid}/versions").json()  # ... but both closures are kept
    assert [v["seq"] for v in data["versions"]] == [1, 2, 3, 4, 5]
    assert data["versions"][0]["changed_by_name"] == teacher.name
    changes = data["status_changes"]
    assert [(c["status"], c["close_reason"]) for c in changes] == [
        ("active", None), ("completed", "Takes turns now"), ("active", None), ("completed", "Steady again")]
    assert data["focus_area"]["close_reason"] == "Steady again"


def test_versions_are_staff_only(teacher_client, parent_client, other_teacher_client, admin_client, client, child):
    fid = create(teacher_client, child).json()["focus_area"]["id"]
    assert parent_client.get(f"/api/focus-areas/{fid}/versions").status_code == 404
    assert other_teacher_client.get(f"/api/focus-areas/{fid}/versions").status_code == 404
    assert client.get(f"/api/focus-areas/{fid}/versions").status_code == 401
    assert teacher_client.get("/api/focus-areas/not-a-uuid/versions").status_code == 404
    assert admin_client.get(f"/api/focus-areas/{fid}/versions").status_code == 200


def test_goals_belong_to_the_open_observation_cycle(teacher_client, teacher, child, other_child, make_assessment):
    cycle = make_assessment(child, created_by=teacher, period_from=date(2026, 9, 1), period_to=date(2026, 12, 31))
    first = create(teacher_client, child, title="A").json()["focus_area"]
    assert first["assessment_id"] == str(cycle.id)
    second = create(teacher_client, child, title="B", assessment_id=None).json()["focus_area"]
    assert second["assessment_id"] is None

    listed = teacher_client.get(f"/api/children/{child.id}/focus-areas").json()
    assert listed["open_assessment_id"] == str(cycle.id)
    assert listed["periods"] == [{"id": str(cycle.id), "kind": "initial", "filled_on": listed["periods"][0]["filled_on"],
                                  "period_from": "2026-09-01", "period_to": "2026-12-31", "status": "open",
                                  "closed_at": None}]
    by_period = teacher_client.get(f"/api/children/{child.id}/focus-areas", params={"assessment_id": str(cycle.id)})
    assert [f["title"] for f in by_period.json()["focus_areas"]] == ["A"]
    assert teacher_client.get(f"/api/children/{child.id}/focus-areas", params={"assessment_id": "x"}).status_code == 400

    foreign = make_assessment(other_child)
    assert create(teacher_client, child, title="C", assessment_id=str(foreign.id)).status_code == 400
    r = teacher_client.put(f"/api/focus-areas/{second['id']}", json={"assessment_id": str(cycle.id)})
    assert r.status_code == 200 and r.json()["focus_area"]["assessment_id"] == str(cycle.id)


def test_the_db_trigger_backs_up_the_limit(teacher_client, child, db, monkeypatch):
    for i in range(3):
        assert create(teacher_client, child, title=f"F{i}").status_code == 201
    # Even if the service check were skipped, the deferred trigger rejects a 4th active goal at COMMIT.
    monkeypatch.setattr(focus_service, "assert_can_add_active", lambda *a, **k: None)
    r = create(teacher_client, child, title="F4")
    assert r.status_code == 409 and r.json()["error"]["code"] == "FOCUS_LIMIT"
    assert active(db, child) == 3

    db.add(FocusArea(child_id=child.id, category="social", title="direct", status="active"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    assert active(db, child) == 3


def test_family_hopes_and_need_candidates(teacher_client, teacher, child, db, make_assessment):
    listed = teacher_client.get(f"/api/children/{child.id}/focus-areas").json()
    assert listed["family_hopes"] is None and listed["need_candidates"] == []

    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.parent_perspective = {
        "sections": {
            "expectations": {
                "most_important": "He is shy at first",
                "hope_child_feels": {"selected": ["safe", "belonging"], "other": "Proud"},
                "develop": {"social": {"text": "To play with other children"}, "motor": {"text": ""},
                            "other": {"area": "Music", "text": "To sing in the group"}},
            },
            "priorities": {"parent_priorities": ["social"]},
        },
        "entered": {"expectations": [{"by": str(teacher.id), "by_name": teacher.name, "role": "teacher",
                                      "reported_by": "parent", "at": "2026-09-01T10:00:00+00:00", "mode": "meeting"}]},
    }
    db.commit()
    cycle = make_assessment(child, domains={"priority_needs": {"status": "in_progress", "data": {"needs": [
        {"area": "social", "seeing": "Watches the block corner from the side", "how_often": "Most mornings"},
        {"area": "independence", "seeing": "Waits for help with shoes",
         "focus_area_id": "00000000-0000-0000-0000-000000000001"},
    ]}}})

    data = teacher_client.get(f"/api/children/{child.id}/focus-areas").json()
    hopes = data["family_hopes"]
    assert hopes["develop"] == [{"area": "social", "label": None, "text": "To play with other children"},
                                {"area": "other", "label": "Music", "text": "To sing in the group"}]
    assert hopes["hope_child_feels"] == ["safe", "belonging"] and hopes["hope_other"] == "Proud"
    assert hopes["categories"] == ["social"]
    assert hopes["provenance"] == [{"label": "parent_said", "entered_by": teacher.name, "mode": "meeting"}]
    needs = data["need_candidates"]
    assert [(n["index"], n["area"], n["focus_area_id"]) for n in needs] == [
        (0, "social", None), (1, "independence", "00000000-0000-0000-0000-000000000001")]
    assert needs[0]["assessment_id"] == str(cycle.id) and needs[0]["seeing"].startswith("Watches")
    assert needs[0]["provenance"] == [{"label": "teacher_observed"}]
