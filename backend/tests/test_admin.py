"""WP-07: users, classes, teacher assignment and parent links (admin only)."""
import uuid

import pytest
from sqlalchemy import select

from app.access import visible_children
from app.models import AuditLog, ChildParent, ClassTeacher, User, UserSession
from app.security import verify_password
from tests.conftest import TEST_PASSWORD

NEW_PASSWORD = "Fresh-pass-2026"


def actions(db, action):
    db.expire_all()
    return list(db.scalars(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id)))


def visible_names(db, user):
    db.expire_all()
    return sorted(c.name for c in db.scalars(visible_children(user)))


# --- access -------------------------------------------------------------------------

@pytest.mark.parametrize("who", ["teacher_client", "parent_client"])
@pytest.mark.parametrize("method,url,body", [
    ("get", "/api/users", None),
    ("post", "/api/users", {"name": "X", "email": "x@test.local", "role": "teacher", "password": "long-enough-1"}),
    ("put", f"/api/users/{uuid.uuid4()}", {"name": "X"}),
    ("post", f"/api/users/{uuid.uuid4()}/password", {"password": "long-enough-1"}),
    ("post", "/api/classes", {"name": "C", "kindergarten": "K"}),
    ("put", f"/api/classes/{uuid.uuid4()}", {"name": "C"}),
    ("delete", f"/api/classes/{uuid.uuid4()}", None),
    ("put", f"/api/classes/{uuid.uuid4()}/teachers", {"user_ids": []}),
])
def test_non_admins_get_403(request, who, method, url, body):
    c = request.getfixturevalue(who)
    kwargs = {"json": body} if body is not None else {}
    r = getattr(c, method)(url, **kwargs)
    assert r.status_code == 403, r.text
    assert r.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.parametrize("who", ["teacher_client", "parent_client"])
def test_non_admins_cannot_manage_parent_links(request, who, child, parent):
    c = request.getfixturevalue(who)
    assert c.get(f"/api/children/{child.id}/parents").status_code == 403
    assert c.post(f"/api/children/{child.id}/parents", json={"user_id": str(parent.id)}).status_code == 403
    assert c.delete(f"/api/children/{child.id}/parents/{parent.id}").status_code == 403


def test_anonymous_gets_401(client):
    assert client.get("/api/users").status_code == 401
    assert client.get("/api/classes").status_code == 401


def test_parents_cannot_list_classes(parent_client, klass):
    r = parent_client.get("/api/classes")
    assert r.status_code == 403


# --- users ----------------------------------------------------------------------------

def test_create_user_lowercases_identifier_and_hashes_password(admin_client, admin, db):
    r = admin_client.post("/api/users", json={
        "name": "  Rana Haddad ", "email": "  Rana@Example.ORG ", "role": "teacher", "language": "he",
        "password": "  spaced password  ",
    })
    assert r.status_code == 201, r.text
    u = r.json()["user"]
    assert u["email"] == "rana@example.org" and u["name"] == "Rana Haddad"
    assert u["role"] == "teacher" and u["language"] == "he" and u["is_active"] is True
    assert "password" not in u and "password_hash" not in u
    row = db.get(User, uuid.UUID(u["id"]))
    assert verify_password("  spaced password  ", row.password_hash)
    [a] = actions(db, "user.create")
    assert a.actor_id == admin.id and str(a.object_id) == u["id"] and a.meta == {"role": "teacher"}


def test_create_user_accepts_a_plain_username_and_defaults_language(admin_client):
    r = admin_client.post("/api/users", json={"name": "Abu Adam", "email": "AbuAdam", "role": "parent",
                                              "password": "0123456789"})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["email"] == "abuadam"
    assert r.json()["user"]["language"] == "ar"


def test_create_user_validation(admin_client, teacher):
    base = {"name": "N", "email": "new@test.local", "role": "teacher", "password": "long-enough-1"}
    short = admin_client.post("/api/users", json={**base, "password": "123456789"})
    assert short.status_code == 400 and short.json()["error"]["code"] == "VALIDATION"
    assert any(d["path"] == "password" for d in short.json()["error"]["details"])
    dup = admin_client.post("/api/users", json={**base, "email": "TEACHER@test.local"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "DUPLICATE"
    for bad in ({**base, "role": "superuser"}, {**base, "language": "fr"}, {**base, "email": "has space"},
                {**base, "name": " "}, {**base, "is_admin": True}):
        r = admin_client.post("/api/users", json=bad)
        assert r.status_code == 400, bad


def test_list_users_filters(admin_client, admin, teacher, other_teacher, parent, make_user):
    make_user("teacher", name="Inactive Teacher", email="gone@test.local", is_active=False)
    r = admin_client.get("/api/users")
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()["users"]]
    assert set(emails) == {"admin@test.local", "teacher@test.local", "other-teacher@test.local",
                           "parent@test.local", "gone@test.local"}
    teachers = admin_client.get("/api/users", params={"role": "teacher"}).json()["users"]
    assert {u["email"] for u in teachers} == {"teacher@test.local", "other-teacher@test.local", "gone@test.local"}
    assert [u["name"] for u in admin_client.get("/api/users", params={"q": "OTHER"}).json()["users"]] == ["Other Teacher"]
    assert admin_client.get("/api/users", params={"q": "100%"}).json()["users"] == []
    active = admin_client.get("/api/users", params={"role": "teacher", "active": "false"}).json()["users"]
    assert [u["email"] for u in active] == ["gone@test.local"]
    assert admin_client.get("/api/users", params={"role": "boss"}).status_code == 400


def test_update_user_fields_and_audit(admin_client, teacher, db):
    r = admin_client.put(f"/api/users/{teacher.id}", json={"name": "Rana", "language": "ar"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["name"] == "Rana" and r.json()["user"]["language"] == "ar"
    [a] = actions(db, "user.update")
    assert a.meta == {"fields": ["language", "name"]}
    # A no-op change writes no audit row.
    assert admin_client.put(f"/api/users/{teacher.id}", json={"name": "Rana"}).status_code == 200
    assert len(actions(db, "user.update")) == 1


def test_update_unknown_or_malformed_user_is_404(admin_client):
    assert admin_client.put(f"/api/users/{uuid.uuid4()}", json={"name": "X"}).status_code == 404
    assert admin_client.put("/api/users/not-a-uuid", json={"name": "X"}).status_code == 404
    assert admin_client.post("/api/users/not-a-uuid/password", json={"password": NEW_PASSWORD}).status_code == 404


def test_update_rejects_unknown_fields(admin_client, teacher):
    r = admin_client.put(f"/api/users/{teacher.id}", json={"email": "other@test.local"})
    assert r.status_code == 400


def test_role_change_revokes_sessions(admin_client, client_for, teacher, db):
    teacher_c = client_for(teacher)
    assert teacher_c.get("/api/me").status_code == 200
    r = admin_client.put(f"/api/users/{teacher.id}", json={"role": "parent"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "parent"
    assert teacher_c.get("/api/me").status_code == 401
    [a] = actions(db, "user.update")
    assert a.meta["from_role"] == "teacher" and a.meta["to_role"] == "parent"


def test_deactivation_revokes_sessions_and_blocks_login(admin_client, client_for, client, teacher, db):
    teacher_c = client_for(teacher)
    r = admin_client.put(f"/api/users/{teacher.id}", json={"is_active": False})
    assert r.status_code == 200 and r.json()["user"]["is_active"] is False
    assert teacher_c.get("/api/me").status_code == 401
    db.expire_all()
    assert db.scalars(select(UserSession).where(UserSession.user_id == teacher.id)).first() is None
    login = client.post("/api/auth/login", json={"identifier": "teacher@test.local", "password": TEST_PASSWORD})
    assert login.status_code == 401
    # Reactivating works (users are never deleted).
    assert admin_client.put(f"/api/users/{teacher.id}", json={"is_active": True}).json()["user"]["is_active"] is True
    login = client.post("/api/auth/login", json={"identifier": "teacher@test.local", "password": TEST_PASSWORD})
    assert login.status_code == 200


def test_name_change_keeps_sessions(admin_client, client_for, teacher):
    teacher_c = client_for(teacher)
    admin_client.put(f"/api/users/{teacher.id}", json={"name": "Renamed"})
    assert teacher_c.get("/api/me").status_code == 200


def test_admin_cannot_demote_or_deactivate_themselves(admin_client, admin, db):
    for body in ({"role": "teacher"}, {"is_active": False}):
        r = admin_client.put(f"/api/users/{admin.id}", json=body)
        assert r.status_code == 403, body
    db.expire_all()
    me = db.get(User, admin.id)
    assert me.role == "admin" and me.is_active
    assert admin_client.get("/api/me").status_code == 200
    # Harmless self-updates still work.
    assert admin_client.put(f"/api/users/{admin.id}", json={"name": "Boss", "role": "admin", "is_active": True}).status_code == 200


def test_admin_can_demote_another_admin(admin_client, make_user, client_for):
    other = make_user("admin")
    other_c = client_for(other)
    assert admin_client.put(f"/api/users/{other.id}", json={"role": "teacher"}).status_code == 200
    assert other_c.get("/api/me").status_code == 401


def test_set_password_revokes_sessions(admin_client, client_for, client, teacher, db):
    teacher_c = client_for(teacher)
    short = admin_client.post(f"/api/users/{teacher.id}/password", json={"password": "short"})
    assert short.status_code == 400
    r = admin_client.post(f"/api/users/{teacher.id}/password", json={"password": NEW_PASSWORD})
    assert r.status_code == 204
    assert teacher_c.get("/api/me").status_code == 401
    assert client.post("/api/auth/login", json={"identifier": "teacher@test.local", "password": NEW_PASSWORD}).status_code == 200
    [a] = actions(db, "user.password_set")
    assert a.object_id == teacher.id and a.meta == {}


def test_admin_setting_own_password_keeps_current_session(admin_client, admin):
    r = admin_client.post(f"/api/users/{admin.id}/password", json={"password": NEW_PASSWORD})
    assert r.status_code == 204
    assert admin_client.get("/api/me").status_code == 200


# --- classes ---------------------------------------------------------------------------

def test_class_crud(admin_client, admin, db):
    r = admin_client.post("/api/classes", json={"name": " Butterflies ", "kindergarten": "Sunflower KG"})
    assert r.status_code == 201, r.text
    cls = r.json()["class"]
    assert cls["name"] == "Butterflies" and cls["kindergarten"] == "Sunflower KG"
    assert cls["teachers"] == [] and cls["child_count"] == 0
    dup = admin_client.post("/api/classes", json={"name": "Butterflies", "kindergarten": "Sunflower KG"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "DUPLICATE"
    # Same name in another kindergarten is fine.
    assert admin_client.post("/api/classes", json={"name": "Butterflies", "kindergarten": "Olive KG"}).status_code == 201
    assert admin_client.post("/api/classes", json={"name": "", "kindergarten": "K"}).status_code == 400

    r = admin_client.put(f"/api/classes/{cls['id']}", json={"name": "Bees"})
    assert r.status_code == 200 and r.json()["class"]["name"] == "Bees"
    assert admin_client.put(f"/api/classes/{cls['id']}", json={"kindergarten": "Olive KG", "name": "Butterflies"}).status_code == 409

    listed = admin_client.get("/api/classes").json()["classes"]
    assert [(c["kindergarten"], c["name"]) for c in listed] == [("Olive KG", "Butterflies"), ("Sunflower KG", "Bees")]

    assert admin_client.delete(f"/api/classes/{cls['id']}").status_code == 204
    assert admin_client.delete(f"/api/classes/{cls['id']}").status_code == 404
    assert admin_client.put("/api/classes/nope", json={"name": "X"}).status_code == 404
    assert [a.action for a in actions(db, "class.create")] == ["class.create", "class.create"]
    [upd] = actions(db, "class.update")
    assert upd.meta["fields"] == ["name"]
    assert len(actions(db, "class.delete")) == 1


def test_delete_class_with_active_children_is_409(admin_client, klass, child, make_child, db):
    r = admin_client.delete(f"/api/classes/{klass.id}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"


def test_delete_class_with_only_archived_children(admin_client, make_class, make_child, db):
    from datetime import datetime, timezone

    cls = make_class("Old")
    kid = make_child(cls, name="Sami", archived_at=datetime.now(timezone.utc))
    assert admin_client.delete(f"/api/classes/{cls.id}").status_code == 204
    db.expire_all()
    db.refresh(kid)
    assert kid.class_id is None


def test_class_list_shapes_and_counts(admin_client, klass, other_class, child, teacher, make_child):
    from datetime import datetime, timezone

    make_child(klass, name="Lina")
    make_child(klass, name="Gone", archived_at=datetime.now(timezone.utc))
    rows = {c["name"]: c for c in admin_client.get("/api/classes").json()["classes"]}
    assert rows["Class A"]["child_count"] == 2
    assert rows["Class A"]["teachers"] == [{"id": str(teacher.id), "name": "Teacher"}]
    assert rows["Class B"]["child_count"] == 0
    assert set(rows["Class A"]) == {"id", "name", "kindergarten", "teachers", "child_count"}


def test_teacher_sees_only_own_classes(teacher_client, other_teacher_client, klass, other_class, make_class):
    make_class("Unassigned")
    assert [c["name"] for c in teacher_client.get("/api/classes").json()["classes"]] == ["Class A"]
    assert [c["name"] for c in other_teacher_client.get("/api/classes").json()["classes"]] == ["Class B"]


def test_assign_teachers_changes_visibility_at_once(admin_client, db, klass, child, teacher, other_teacher):
    assert visible_names(db, other_teacher) == []
    r = admin_client.put(f"/api/classes/{klass.id}/teachers",
                         json={"user_ids": [str(teacher.id), str(other_teacher.id), str(other_teacher.id)]})
    assert r.status_code == 200, r.text
    assert {t["id"] for t in r.json()["class"]["teachers"]} == {str(teacher.id), str(other_teacher.id)}
    assert visible_names(db, other_teacher) == ["Adam"]
    [a] = actions(db, "class.teachers")
    assert a.meta == {"added": [str(other_teacher.id)], "removed": []}

    r = admin_client.put(f"/api/classes/{klass.id}/teachers", json={"user_ids": [str(other_teacher.id)]})
    assert r.status_code == 200
    assert visible_names(db, teacher) == []
    assert visible_names(db, other_teacher) == ["Adam"]
    db.expire_all()
    assert set(db.scalars(select(ClassTeacher.user_id).where(ClassTeacher.class_id == klass.id))) == {other_teacher.id}


def test_unassigned_teacher_gets_404_for_the_child(admin_client, client_for, klass, child, teacher, db):
    from app.main import app

    admin_client.put(f"/api/classes/{klass.id}/teachers", json={"user_ids": []})
    assert visible_names(db, teacher) == []
    has_child_route = any(getattr(r, "path", "") == "/api/children/{child_id}" for r in app.routes)
    if has_child_route:  # WP-05's endpoint, once it lands
        assert client_for(teacher).get(f"/api/children/{child.id}").status_code == 404


def test_only_teachers_can_be_assigned(admin_client, klass, parent, admin):
    for uid in (parent.id, admin.id, uuid.uuid4()):
        r = admin_client.put(f"/api/classes/{klass.id}/teachers", json={"user_ids": [str(uid)]})
        assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION"
    assert admin_client.put(f"/api/classes/{klass.id}/teachers", json={"user_ids": ["nope"]}).status_code == 400
    assert admin_client.put(f"/api/classes/{uuid.uuid4()}/teachers", json={"user_ids": []}).status_code == 404


# --- parent links ------------------------------------------------------------------------

def test_parent_links(admin_client, db, child, parent, other_parent):
    r = admin_client.get(f"/api/children/{child.id}/parents")
    assert r.status_code == 200
    assert [p["id"] for p in r.json()["parents"]] == [str(parent.id)]
    assert set(r.json()["parents"][0]) == {"id", "name", "email", "is_active", "relation", "linked_at"}

    assert visible_names(db, other_parent) == []
    r = admin_client.post(f"/api/children/{child.id}/parents", json={"user_id": str(other_parent.id), "relation": "father"})
    assert r.status_code == 201, r.text
    assert r.json()["parent"]["relation"] == "father"
    assert visible_names(db, other_parent) == ["Adam"]
    dup = admin_client.post(f"/api/children/{child.id}/parents", json={"user_id": str(other_parent.id)})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "DUPLICATE"

    assert admin_client.delete(f"/api/children/{child.id}/parents/{other_parent.id}").status_code == 204
    assert visible_names(db, other_parent) == []
    assert admin_client.delete(f"/api/children/{child.id}/parents/{other_parent.id}").status_code == 404

    [created] = actions(db, "parent_link.create")
    assert created.child_id == child.id and created.object_id == other_parent.id and created.meta == {"relation": "father"}
    [deleted] = actions(db, "parent_link.delete")
    assert deleted.child_id == child.id and deleted.object_id == other_parent.id


def test_linked_parent_sees_child_unlinked_gets_404(admin_client, client_for, db, child, other_parent):
    from app.main import app

    has_child_routes = any(getattr(r, "path", "") == "/api/children" for r in app.routes)
    admin_client.post(f"/api/children/{child.id}/parents", json={"user_id": str(other_parent.id)})
    c = client_for(other_parent)
    if has_child_routes:  # WP-05's endpoints, once they land
        r = c.get("/api/children")
        assert r.status_code == 200
        assert str(child.id) in r.text
    admin_client.delete(f"/api/children/{child.id}/parents/{other_parent.id}")
    assert visible_names(db, other_parent) == []
    if has_child_routes:
        assert c.get(f"/api/children/{child.id}").status_code == 404


def test_only_parent_accounts_can_be_linked(admin_client, child, teacher, admin):
    for uid in (teacher.id, admin.id, uuid.uuid4()):
        r = admin_client.post(f"/api/children/{child.id}/parents", json={"user_id": str(uid)})
        assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION"


def test_parent_link_relation_must_be_known(admin_client, child, other_parent):
    r = admin_client.post(f"/api/children/{child.id}/parents", json={"user_id": str(other_parent.id), "relation": "uncle-bob"})
    assert r.status_code == 400


def test_parent_links_unknown_child_is_404(admin_client, parent):
    assert admin_client.get(f"/api/children/{uuid.uuid4()}/parents").status_code == 404
    assert admin_client.get("/api/children/nope/parents").status_code == 404
    assert admin_client.post(f"/api/children/{uuid.uuid4()}/parents", json={"user_id": str(parent.id)}).status_code == 404


def test_parent_links_work_for_archived_children(admin_client, make_child, other_parent, db):
    from datetime import datetime, timezone

    kid = make_child(None, name="Archived", archived_at=datetime.now(timezone.utc))
    r = admin_client.post(f"/api/children/{kid.id}/parents", json={"user_id": str(other_parent.id)})
    assert r.status_code == 201
    db.expire_all()
    assert db.scalars(select(ChildParent).where(ChildParent.child_id == kid.id)).first() is not None


def test_role_change_drops_old_assignments(admin_client, db, klass, child, teacher, parent):
    assert visible_names(db, teacher) == ["Adam"] and visible_names(db, parent) == ["Adam"]
    assert admin_client.put(f"/api/users/{teacher.id}", json={"role": "parent"}).status_code == 200
    assert admin_client.put(f"/api/users/{parent.id}", json={"role": "teacher"}).status_code == 200
    db.expire_all()
    assert db.scalars(select(ClassTeacher).where(ClassTeacher.user_id == teacher.id)).first() is None
    assert db.scalars(select(ChildParent).where(ChildParent.user_id == parent.id)).first() is None
    metas = [a.meta for a in actions(db, "user.update")]
    assert metas[0]["removed_classes"] == 1 and metas[1]["removed_child_links"] == 1
    # Switching back does not silently restore access.
    admin_client.put(f"/api/users/{teacher.id}", json={"role": "teacher"})
    assert visible_names(db, teacher) == []
