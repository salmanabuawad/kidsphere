import uuid
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.access import child_scope, get_child_or_404, get_child_row_or_404, visible_children
from app.audit import audit
from app.deps import AdminUser, CurrentUser, StaffUser
from app.errors import AppError, install_error_handlers
from app.models import AuditLog, Child, FocusArea
from app.sessions import COOKIE_NAME


def names(db, user):
    return sorted(c.name for c in db.scalars(visible_children(user)))


@pytest.fixture
def world(make_child, make_class, klass, other_class, teacher, parent, other_parent):
    """child (Adam, klass, parent), other_child (Maya, other_class, other_parent),
    plus Lina in klass with no parent and Omar with no class."""
    adam = make_child(klass, parents=[parent], name="Adam")
    maya = make_child(other_class, parents=[other_parent], name="Maya")
    lina = make_child(klass, name="Lina")
    omar = make_child(None, name="Omar")
    return {"adam": adam, "maya": maya, "lina": lina, "omar": omar}


def test_admin_sees_everyone(db, admin, world):
    assert names(db, admin) == ["Adam", "Lina", "Maya", "Omar"]


def test_teacher_sees_only_assigned_classes(db, teacher, other_teacher, world, make_class):
    assert names(db, teacher) == ["Adam", "Lina"]
    assert names(db, other_teacher) == ["Maya"]


def test_teacher_in_two_classes(db, make_user, klass, other_class, world):
    from app.models import ClassTeacher

    both = make_user("teacher")
    db.add_all([ClassTeacher(class_id=klass.id, user_id=both.id), ClassTeacher(class_id=other_class.id, user_id=both.id)])
    db.commit()
    assert names(db, both) == ["Adam", "Lina", "Maya"]


def test_parent_sees_only_linked_children(db, parent, other_parent, make_user, world):
    assert names(db, parent) == ["Adam"]
    assert names(db, other_parent) == ["Maya"]
    assert names(db, make_user("parent")) == []


def test_scope_predicate_composes_into_any_query(db, teacher, world):
    ids = set(db.scalars(select(Child.id).where(child_scope(teacher), Child.name.like("%a%"))))
    assert ids == {world["adam"].id, world["lina"].id}


def test_get_child_or_404(db, teacher, parent, other_teacher, world):
    adam = world["adam"]
    assert get_child_or_404(db, teacher, adam.id).id == adam.id
    assert get_child_or_404(db, teacher, str(adam.id), write=True).id == adam.id
    assert get_child_or_404(db, parent, adam.id).id == adam.id
    for user, child_id in [(other_teacher, adam.id), (teacher, world["maya"].id), (parent, world["lina"].id),
                           (teacher, uuid.uuid4()), (teacher, "not-a-uuid")]:
        with pytest.raises(AppError) as exc:
            get_child_or_404(db, user, child_id)
        assert exc.value.code == "NOT_FOUND" and exc.value.status == 404


def test_parent_write_on_own_child_is_403(db, parent, world):
    with pytest.raises(AppError) as exc:
        get_child_or_404(db, parent, world["adam"].id, write=True)
    assert exc.value.code == "FORBIDDEN" and exc.value.status == 403


def test_archived_children_are_visible_to_admin_only(db, admin, teacher, world):
    adam = world["adam"]
    adam.archived_at = datetime.now(timezone.utc)
    db.commit()
    assert names(db, teacher) == ["Lina"]
    with pytest.raises(AppError):
        get_child_or_404(db, teacher, adam.id)
    with pytest.raises(AppError):
        get_child_or_404(db, admin, adam.id)
    assert get_child_or_404(db, admin, adam.id, include_archived=True).id == adam.id


def test_child_owned_rows_follow_the_child_scope(db, teacher, other_teacher, parent, world):
    focus = FocusArea(child_id=world["adam"].id, category="social", title="Joining group play")
    db.add(focus)
    db.commit()
    assert get_child_row_or_404(db, teacher, FocusArea, focus.id, write=True).id == focus.id
    with pytest.raises(AppError) as exc:
        get_child_row_or_404(db, other_teacher, FocusArea, focus.id)
    assert exc.value.status == 404
    with pytest.raises(AppError) as exc:
        get_child_row_or_404(db, parent, FocusArea, focus.id, write=True)
    assert exc.value.status == 403


def _role_app() -> FastAPI:
    test_app = FastAPI()
    install_error_handlers(test_app)

    @test_app.get("/any")
    def any_user(user: CurrentUser):
        return {"role": user.role}

    @test_app.get("/staff")
    def staff(user: StaffUser):
        return {"role": user.role}

    @test_app.get("/admin")
    def admin_only(user: AdminUser):
        return {"role": user.role}

    return test_app


@pytest.mark.parametrize("role,expected", [
    ("admin", {"/any": 200, "/staff": 200, "/admin": 200}),
    ("teacher", {"/any": 200, "/staff": 200, "/admin": 403}),
    ("parent", {"/any": 200, "/staff": 403, "/admin": 403}),
])
def test_require_roles(role, expected, make_user, client_for):
    test_app = _role_app()
    c = TestClient(test_app)
    c.cookies.set(COOKIE_NAME, client_for(make_user(role)).cookies.get(COOKIE_NAME))
    for path, status in expected.items():
        r = c.get(path)
        assert r.status_code == status, path
        if status == 403:
            assert r.json()["error"]["code"] == "FORBIDDEN"
    anon = TestClient(test_app)
    assert anon.get("/any").status_code == 401


def test_audit_accepts_primitives_only(db, teacher, world):
    audit(db, teacher, "child.update", "child", world["adam"].id, child_id=world["adam"].id,
          fields=["name", "gender"], count=2, ok=True, ref=uuid.UUID(int=1))
    db.commit()
    row = db.scalars(select(AuditLog)).one()
    assert row.actor_id == teacher.id and row.child_id == world["adam"].id
    assert row.meta == {"fields": ["name", "gender"], "count": 2, "ok": True, "ref": str(uuid.UUID(int=1))}
    with pytest.raises(TypeError):
        audit(db, teacher, "child.update", "child", None, answers={"free": "text"})
    db.rollback()
