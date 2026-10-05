from datetime import date

import pytest
from alembic import command
from sqlalchemy import delete, inspect, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.db import engine
from app.models import Base, Baseline, Child, Observation
from tests.conftest import alembic_config

TABLES = {
    "users", "sessions", "classes", "class_teachers", "children", "child_parents", "child_profiles",
    "baselines", "focus_areas", "generated_content", "observations", "content_feedback",
    "development_reviews", "audit_log",
}


def public_tables() -> set[str]:
    engine.dispose()
    return set(inspect(engine).get_table_names()) - {"alembic_version"}


def test_upgrade_downgrade_upgrade():
    assert public_tables() == TABLES
    command.downgrade(alembic_config(), "base")
    assert public_tables() == set()
    command.upgrade(alembic_config(), "head")
    assert public_tables() == TABLES
    engine.dispose()


def test_models_match_the_migration():
    insp = inspect(engine)
    assert set(Base.metadata.tables) == TABLES
    for name, table in Base.metadata.tables.items():
        db_columns = {c["name"] for c in insp.get_columns(name)}
        assert db_columns == {c.name for c in table.columns}, name


@pytest.fixture
def baseline(db, child):
    row = Baseline(child_id=child.id, baseline_data={"strengths": ["imagination"]})
    db.add(row)
    db.commit()
    return row


def test_baselines_cannot_be_updated(db, baseline):
    with pytest.raises(DBAPIError, match="immutable"):
        db.execute(update(Baseline).where(Baseline.id == baseline.id).values(baseline_data={}))
    db.rollback()


def test_baselines_cannot_be_deleted_directly(db, baseline):
    with pytest.raises(DBAPIError, match="together with their child"):
        db.execute(delete(Baseline).where(Baseline.id == baseline.id))
    db.rollback()


def test_baselines_are_deleted_with_their_child(db, baseline, child):
    db.execute(delete(Child).where(Child.id == child.id))
    db.commit()
    assert db.execute(text("SELECT count(*) FROM baselines")).scalar() == 0


def test_observation_text_is_required_except_for_feedback(db, child):
    db.add(Observation(child_id=child.id, source="quick", observation=None))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.add(Observation(child_id=child.id, source="content_feedback", observation=None))
    db.commit()
    db.add(Observation(child_id=child.id, source="quick", observation=""))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


@pytest.mark.parametrize("sql", [
    "INSERT INTO users (name, email, password_hash, role) VALUES ('x', 'x@y.z', 'h', 'superuser')",
    "INSERT INTO users (name, email, password_hash, role) VALUES ('x', 'Upper@y.z', 'h', 'teacher')",
    "INSERT INTO users (name, email, password_hash, role, language) VALUES ('x', 'x@y.z', 'h', 'teacher', 'fr')",
    "INSERT INTO children (name, birth_date, main_language, gender) VALUES ('x', '2022-01-01', 'ar', 'other')",
])
def test_check_constraints(sql):
    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(text(sql))


def test_defaults(db, make_child):
    kid = make_child(name="Defaults", birth_date=date(2022, 1, 1))
    row = db.execute(text(
        "SELECT additional_languages, created_at IS NOT NULL FROM children WHERE id = :id"), {"id": kid.id}).one()
    assert row == ([], True)
    profile = db.execute(text(
        "SELECT wizard_step, strengths, parent_perspective FROM child_profiles WHERE child_id = :id"), {"id": kid.id}).one()
    assert profile == (1, [], {})
