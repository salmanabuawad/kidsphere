"""Kindergartens (0005): the user's kindergartens and each kindergarten's theme."""
from alembic import command
from sqlalchemy import inspect, select

from app.db import engine
from app.models import AuditLog, KindergartenTheme
from tests.conftest import alembic_config


def test_teacher_sees_own_kindergarten_with_its_theme(db, admin_client, teacher_client, other_teacher_client, klass,
                                                       make_class, teacher, other_teacher):
    make_class(name="Class B", kindergarten="Sunflower KG", teachers=(teacher,))
    make_class(name="Roses", kindergarten="Olive KG", teachers=(other_teacher,))
    r = admin_client.put("/api/kindergartens/theme", json={"kindergarten": "Sunflower KG", "theme": "flowers"})
    assert r.status_code == 200, r.text
    assert r.json() == {"kindergarten": "Sunflower KG", "theme": "flowers"}

    mine = teacher_client.get("/api/me/kindergartens").json()["kindergartens"]
    assert [(k["name"], k["theme"], [c["name"] for c in k["classes"]]) for k in mine] == [
        ("Sunflower KG", "flowers", ["Class A", "Class B"])]
    # Another teacher sees only their own kindergarten, without a theme yet.
    theirs = other_teacher_client.get("/api/me/kindergartens").json()["kindergartens"]
    assert [k["name"] for k in theirs] == ["Olive KG"] and theirs[0]["theme"] is None
    # Class rows carry the kindergarten's theme.
    rows = admin_client.get("/api/classes").json()["classes"]
    assert {r["name"]: r["theme"] for r in rows if r["kindergarten"] == "Sunflower KG"} == {"Class A": "flowers",
                                                                                         "Class B": "flowers"}
    assert db.scalars(select(AuditLog).where(AuditLog.action == "kindergarten.theme")).one().meta == {"theme": "flowers"}


def test_parents_see_their_childrens_kindergarten(parent_client, child, klass):
    mine = parent_client.get("/api/me/kindergartens").json()["kindergartens"]
    assert [k["name"] for k in mine] == [klass.kindergarten]


def test_only_admins_set_themes_and_only_known_ones(admin_client, teacher_client, klass):
    body = {"kindergarten": klass.kindergarten, "theme": "sea"}
    assert teacher_client.put("/api/kindergartens/theme", json=body).status_code == 403
    assert admin_client.put("/api/kindergartens/theme", json={**body, "theme": "lava"}).status_code == 400
    assert admin_client.put("/api/kindergartens/theme", json={**body, "kindergarten": "Nowhere"}).status_code == 404
    assert admin_client.put("/api/kindergartens/theme", json=body).json()["theme"] == "sea"
    assert admin_client.put("/api/kindergartens/theme", json={**body, "theme": "sun"}).json()["theme"] == "sun"
    # Clearing it brings back the default look.
    assert admin_client.put("/api/kindergartens/theme", json={"kindergarten": klass.kindergarten}).json()["theme"] is None
    assert admin_client.get("/api/me/kindergartens").json()["kindergartens"][0]["theme"] is None


def test_theme_follows_a_renamed_kindergarten(db, admin_client, klass):
    admin_client.put("/api/kindergartens/theme", json={"kindergarten": klass.kindergarten, "theme": "forest"})
    r = admin_client.put(f"/api/classes/{klass.id}", json={"kindergarten": "Olive KG"})
    assert r.status_code == 200 and r.json()["class"]["theme"] == "forest"
    db.expire_all()
    assert [t.kindergarten for t in db.scalars(select(KindergartenTheme))] == ["Olive KG"]


def test_migration_0005_up_and_down():
    try:
        command.downgrade(alembic_config(), "0004")
        engine.dispose()
        assert "kindergarten_themes" not in inspect(engine).get_table_names()
    finally:
        command.upgrade(alembic_config(), "head")
        engine.dispose()
    cols = {c["name"] for c in inspect(engine).get_columns("kindergarten_themes")}
    assert cols == {"kindergarten", "theme", "updated_by", "updated_at"}
