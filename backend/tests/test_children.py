"""WP-05: children list, create, role-shaped composite, update allowlist, archive."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import AuditLog, Baseline, Child, ChildProfile, FocusArea, GeneratedContent, Observation
from app.services import children as svc

STAFF_ONLY_KEYS = {
    "what_helps", "motivators", "sensitivities", "current_understanding", "focus_areas",
    "latest_observation", "last_observation_at", "wizard", "baseline", "draft_content_count",
}


@pytest.fixture(autouse=True)
def _pin_today(monkeypatch):
    monkeypatch.setattr(svc, "today", lambda: date(2026, 10, 5))


def _audits(db, action):
    db.expire_all()
    return db.scalars(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id)).all()


def _content(db, child, status="draft", title="Story"):
    row = GeneratedContent(
        child_id=child.id, mode="growth_support", content_type="story", language="en", title=title,
        content={"story": "x"}, status=status, generation_input={}, ai_provider="template", is_template=True,
    )
    db.add(row)
    db.commit()
    return row


def _focus(db, child, title="Joining group play", status="active", plan=None, created_at=None):
    row = FocusArea(child_id=child.id, category="social", suggestion_key="joining_group_play", title=title,
                    status=status, plan=plan)
    if created_at is not None:
        row.created_at = created_at
    db.add(row)
    db.commit()
    return row


def _observation(db, child, text="Built a garage with Sami", observed_at=None, source="quick", support="some_support"):
    row = Observation(child_id=child.id, observation=text, source=source, support_level=support,
                      observed_at=observed_at or datetime.now(timezone.utc))
    db.add(row)
    db.commit()
    return row


def _fill_profile(db, child):
    profile = db.scalar(select(ChildProfile).where(ChildProfile.child_id == child.id))
    profile.strengths = [
        {"key": "imagination", "sources": ["parent", "teacher"], "added_by": "x", "added_at": "2026-09-01T10:00:00Z"},
        {"custom": "Great at puzzles", "sources": ["teacher"]},
    ]
    profile.interests = [{"key": "cars_transportation", "sources": ["parent"]}]
    profile.what_helps = [{"key": "visual_support", "sources": ["teacher"]}]
    profile.motivators = [{"key": "praise", "sources": ["parent"]}]
    profile.sensitivities = [{"key": "noise", "sources": ["parent"], "what_happens": "covers ears", "what_helps": ["quiet_space"]}]
    profile.teacher_perspective = {"sections": {"who": {"describe_words": ["curious"]}}}
    profile.parent_perspective = {"sections": {"who": {"describe_words": ["kind"]}}}
    profile.current_understanding = {"summary": "Appears to enjoy building with others.", "source": "baseline"}
    profile.wizard_step = 4
    db.commit()
    return profile


# ───────────────────────────── age ─────────────────────────────

def test_age_parts():
    assert svc.age_parts(date(2022, 8, 5), date(2026, 10, 5)) == {"years": 4, "months": 2}
    assert svc.age_parts(date(2022, 8, 5), date(2026, 10, 4)) == {"years": 4, "months": 1}
    assert svc.age_parts(date(2022, 8, 5), date(2022, 8, 5)) == {"years": 0, "months": 0}
    assert svc.age_parts(date(2027, 1, 1), date(2026, 10, 5)) == {"years": 0, "months": 0}
    assert svc.age_parts(date(2020, 2, 29), date(2026, 2, 28)) == {"years": 5, "months": 11}


# ───────────────────────────── list ─────────────────────────────

def test_teacher_list_is_scoped_and_shaped(db, teacher_client, child, other_child):
    _focus(db, child)
    _observation(db, child, observed_at=datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc))
    _content(db, child, "draft")
    _content(db, child, "draft")
    _content(db, child, "approved")

    r = teacher_client.get("/api/children")
    assert r.status_code == 200
    cards = r.json()["children"]
    assert [c["name"] for c in cards] == ["Adam"]
    card = cards[0]
    assert card["id"] == str(child.id)
    assert card["age"] == {"years": 4, "months": 2}
    assert card["birth_date"] == "2022-08-05"
    assert card["class"] == {"id": str(child.class_id), "name": "Class A", "kindergarten": "Sunflower KG"}
    assert card["main_language"] == "ar"
    assert card["has_photo"] is False
    assert card["wizard_completed"] is False
    assert card["active_focus_count"] == 1
    assert card["last_observation_at"].startswith("2026-09-01")
    assert card["draft_content_count"] == 2
    assert "photo_path" not in card


def test_admin_list_sees_everyone(admin_client, child, other_child, make_child):
    make_child(None, name="Omar")
    names = [c["name"] for c in admin_client.get("/api/children").json()["children"]]
    assert sorted(names) == ["Adam", "Maya", "Omar"]


def test_parent_list_has_only_linked_children_without_profile_fields(parent_client, child, other_child):
    r = parent_client.get("/api/children")
    assert r.status_code == 200
    cards = r.json()["children"]
    assert [c["name"] for c in cards] == ["Adam"]
    for key in ("active_focus_count", "last_observation_at", "draft_content_count", "wizard_completed"):
        assert key not in cards[0]


def test_list_filters_by_class_and_search(admin_client, child, other_child, make_child, klass):
    make_child(klass, name="Lina", preferred_name="Lulu")
    by_class = admin_client.get("/api/children", params={"class_id": str(klass.id)}).json()["children"]
    assert sorted(c["name"] for c in by_class) == ["Adam", "Lina"]
    assert [c["name"] for c in admin_client.get("/api/children", params={"q": "may"}).json()["children"]] == ["Maya"]
    assert [c["name"] for c in admin_client.get("/api/children", params={"q": "lul"}).json()["children"]] == ["Lina"]
    assert admin_client.get("/api/children", params={"q": "%"}).json()["children"] == []
    assert admin_client.get("/api/children", params={"class_id": "nope"}).status_code == 400


def test_list_includes_placeable_classes(make_class, teacher, teacher_client, admin_client, parent_client, klass, other_class):
    empty = make_class("Class Z", teachers=[teacher])
    assert [c["id"] for c in teacher_client.get("/api/children").json()["classes"]] == [str(klass.id), str(empty.id)]
    assert len(admin_client.get("/api/children").json()["classes"]) == 3
    assert parent_client.get("/api/children").json()["classes"] == []


def test_list_requires_sign_in(client):
    assert client.get("/api/children").status_code == 401


# ───────────────────────────── create ─────────────────────────────

def _new_child_body(cls_id, **extra):
    body = {
        "name": "Noor",
        "birth_date": "2022-03-14",
        "class_id": str(cls_id),
        "main_language": "ar",
        "additional_languages": ["he", "en", "he"],
        "gender": "girl",
        "parent_name": "Huda",
        "parent_contact": "050-0000000",
    }
    body.update(extra)
    return body


def test_teacher_creates_child_in_own_class(db, teacher_client, teacher, klass):
    r = teacher_client.post("/api/children", json=_new_child_body(klass.id))
    assert r.status_code == 201, r.text
    data = r.json()["child"]
    assert data["name"] == "Noor"
    assert data["additional_languages"] == ["he", "en"]
    assert data["wizard"] == {"step": 1, "completed_at": None}
    assert data["baseline"] == {"exists": False, "latest_created_at": None}
    db.expire_all()
    created = db.get(Child, uuid.UUID(data["id"]))
    assert created.created_by == teacher.id
    assert db.scalar(select(ChildProfile).where(ChildProfile.child_id == created.id)) is not None
    rows = _audits(db, "child.create")
    assert len(rows) == 1 and rows[0].child_id == created.id and rows[0].actor_id == teacher.id


def test_teacher_cannot_create_in_another_class(db, teacher_client, other_class):
    r = teacher_client.post("/api/children", json=_new_child_body(other_class.id))
    assert r.status_code == 403
    assert db.scalar(select(Child).where(Child.name == "Noor")) is None


def test_admin_creates_anywhere_and_parent_cannot(admin_client, parent_client, other_class):
    assert admin_client.post("/api/children", json=_new_child_body(other_class.id)).status_code == 201
    assert parent_client.post("/api/children", json=_new_child_body(other_class.id)).status_code == 403


@pytest.mark.parametrize(
    "extra",
    [
        {"main_language": "xx"},
        {"additional_languages": ["en", "klingon"]},
        {"gender": "robot"},
        {"birth_date": "2099-01-01"},
        {"name": "   "},
        {"role": "admin"},
        {"class_id": str(uuid.uuid4())},
    ],
)
def test_create_validation(admin_client, klass, extra):
    r = admin_client.post("/api/children", json=_new_child_body(klass.id, **extra))
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "VALIDATION"


def test_create_blank_optional_strings_become_null(admin_client, klass):
    r = admin_client.post("/api/children", json=_new_child_body(klass.id, gender="", preferred_name=" ", parent_contact=""))
    assert r.status_code == 201
    data = r.json()["child"]
    assert data["gender"] is None and data["preferred_name"] is None and data["parent_contact"] is None


# ───────────────────────────── detail ─────────────────────────────

def test_get_out_of_scope_is_404(child, other_teacher_client, other_parent_client, teacher_client, client):
    assert other_teacher_client.get(f"/api/children/{child.id}").status_code == 404
    assert other_parent_client.get(f"/api/children/{child.id}").status_code == 404
    assert teacher_client.get("/api/children/not-a-uuid").status_code == 404
    assert teacher_client.get(f"/api/children/{uuid.uuid4()}").status_code == 404
    assert client.get(f"/api/children/{child.id}").status_code == 401


def test_staff_composite(db, teacher_client, child):
    _fill_profile(db, child)
    plan = {"strength_used": "imagination", "need": "joining play", "what_we_will_do": "build together"}
    base = datetime(2026, 9, 1, tzinfo=timezone.utc)
    f1 = _focus(db, child, "Joining group play", plan=plan, created_at=base)
    f2 = _focus(db, child, "Taking turns", created_at=base + timedelta(days=1))
    _focus(db, child, "Old focus", status="completed")
    _observation(db, child, "Asked Sami to build together", observed_at=base + timedelta(days=3))
    _observation(db, child, "older", observed_at=base + timedelta(days=2))
    fb = Observation(child_id=child.id, source="content_feedback", observation=None, observed_at=base + timedelta(days=4))
    db.add(fb)
    db.add(Baseline(child_id=child.id, baseline_data={"basics": {}}))
    db.commit()
    _content(db, child, "draft")

    r = teacher_client.get(f"/api/children/{child.id}")
    assert r.status_code == 200
    data = r.json()["child"]
    assert data["view"] == "staff"
    assert data["age"] == {"years": 4, "months": 2}
    assert data["class"]["name"] == "Class A"
    assert [i.get("key") or i.get("custom") for i in data["strengths"]] == ["imagination", "Great at puzzles"]
    assert data["interests"][0]["key"] == "cars_transportation"
    assert data["what_helps"][0]["key"] == "visual_support"
    assert data["motivators"][0]["key"] == "praise"
    assert data["sensitivities"][0]["what_helps"] == ["quiet_space"]
    assert data["current_understanding"]["summary"].startswith("Appears")
    assert [f["id"] for f in data["focus_areas"]] == [str(f1.id), str(f2.id)]
    assert data["focus_areas"][0]["plan"] == plan
    assert data["latest_observation"]["observation"] == "Asked Sami to build together"
    assert data["latest_observation"]["support_level"] == "some_support"
    assert data["last_observation_at"].startswith((base + timedelta(days=4)).date().isoformat())
    assert data["wizard"] == {"step": 4, "completed_at": None}
    assert data["baseline"]["exists"] is True and data["baseline"]["latest_created_at"]
    assert data["draft_content_count"] == 1
    assert "teacher_perspective" not in data and "parent_perspective" not in data
    assert "photo_path" not in r.text


def test_parent_composite_has_no_teacher_fields(db, parent_client, child):
    _fill_profile(db, child)
    _focus(db, child)
    _observation(db, child)
    r = parent_client.get(f"/api/children/{child.id}")
    assert r.status_code == 200
    data = r.json()["child"]
    assert data["view"] == "parent"
    assert data["name"] == "Adam" and data["age"] == {"years": 4, "months": 2}
    assert data["strengths"] == [
        {"key": "imagination", "sources": ["parent", "teacher"]},
        {"custom": "Great at puzzles", "sources": ["teacher"]},
    ]
    assert data["interests"] == [{"key": "cars_transportation", "sources": ["parent"]}]
    assert not STAFF_ONLY_KEYS & data.keys()
    text = r.text
    for leaked in ("teacher_perspective", "Joining group play", "Built a garage", "curious", "Appears to enjoy"):
        assert leaked not in text


# ───────────────────────────── update ─────────────────────────────

def test_parent_update_allowlist(db, parent_client, parent, child):
    r = parent_client.put(f"/api/children/{child.id}", json={"birth_date": "2022-01-01"})
    assert r.status_code == 403
    assert parent_client.put(f"/api/children/{child.id}", json={"name": "Other"}).status_code == 403
    assert parent_client.put(f"/api/children/{child.id}", json={"parent_contact": "x", "class_id": str(uuid.uuid4())}).status_code == 403

    r = parent_client.put(f"/api/children/{child.id}", json={"parent_contact": "052-1234567", "preferred_name": "Adoush"})
    assert r.status_code == 200, r.text
    data = r.json()["child"]
    assert data["parent_contact"] == "052-1234567" and data["preferred_name"] == "Adoush"
    assert data["view"] == "parent"
    rows = _audits(db, "child.update")
    assert len(rows) == 1
    assert rows[0].actor_id == parent.id
    assert rows[0].meta == {"fields": ["parent_contact", "preferred_name"]}
    assert "052" not in str(rows[0].meta)
    db.expire_all()
    assert db.get(Child, child.id).birth_date == date(2022, 8, 5)


def test_other_parent_cannot_update(other_parent_client, child):
    assert other_parent_client.put(f"/api/children/{child.id}", json={"parent_contact": "x"}).status_code == 404


def test_staff_update_and_audit(db, teacher_client, child, make_class, teacher, other_class):
    second = make_class("Class C", teachers=[teacher])
    r = teacher_client.put(f"/api/children/{child.id}", json={
        "name": "Adam K", "gender": "boy", "additional_languages": ["en"], "class_id": str(second.id), "main_language": "ar",
    })
    assert r.status_code == 200, r.text
    data = r.json()["child"]
    assert data["name"] == "Adam K" and data["gender"] == "boy" and data["class"]["name"] == "Class C"
    rows = _audits(db, "child.update")
    assert rows[-1].meta == {"fields": ["additional_languages", "class_id", "gender", "name"]}

    assert teacher_client.put(f"/api/children/{child.id}", json={"class_id": str(other_class.id)}).status_code == 403
    assert teacher_client.put(f"/api/children/{child.id}", json={"name": None}).status_code == 400
    assert teacher_client.put(f"/api/children/{child.id}", json={"gender": "robot"}).status_code == 400
    assert teacher_client.put(f"/api/children/{child.id}", json={"photo_path": "x"}).status_code == 400

    # No change → no audit row.
    before = len(_audits(db, "child.update"))
    assert teacher_client.put(f"/api/children/{child.id}", json={"name": "Adam K"}).status_code == 200
    assert len(_audits(db, "child.update")) == before


def test_other_teacher_update_is_404(other_teacher_client, child):
    assert other_teacher_client.put(f"/api/children/{child.id}", json={"name": "X"}).status_code == 404


# ───────────────────────────── archive ─────────────────────────────

def test_archive_hides_child(db, teacher_client, admin_client, parent_client, other_teacher_client, child):
    assert parent_client.post(f"/api/children/{child.id}/archive").status_code == 403
    assert other_teacher_client.post(f"/api/children/{child.id}/archive").status_code == 404
    assert teacher_client.post(f"/api/children/{child.id}/archive").status_code == 204
    assert len(_audits(db, "child.archive")) == 1

    assert teacher_client.get("/api/children").json()["children"] == []
    assert teacher_client.get(f"/api/children/{child.id}").status_code == 404
    assert parent_client.get(f"/api/children/{child.id}").status_code == 404
    assert admin_client.get("/api/children").json()["children"] == []
    archived = admin_client.get("/api/children", params={"include_archived": "true"}).json()["children"]
    assert [c["archived"] for c in archived] == [True]
    assert admin_client.get(f"/api/children/{child.id}").json()["child"]["archived"] is True

    assert teacher_client.post(f"/api/children/{child.id}/unarchive").status_code == 403
    r = admin_client.post(f"/api/children/{child.id}/unarchive")
    assert r.status_code == 200 and r.json()["child"]["archived"] is False
    assert [c["name"] for c in teacher_client.get("/api/children").json()["children"]] == ["Adam"]
