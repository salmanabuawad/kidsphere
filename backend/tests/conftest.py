"""Shared pytest fixtures for the KidSphere backend.

The suite runs only against the database ``kidsphere_test`` (DATABASE_URL);
anything else aborts. Once per session the ``public`` schema is dropped and
recreated and ``alembic upgrade head`` runs, so the migrations are exercised
too. Before each test every table except ``alembic_version`` is truncated.

Constants
    TEST_PASSWORD               password of every fixture user

Database
    db                          a SQLAlchemy Session (expire_on_commit=False). The app
                                uses its own sessions: call ``db.expire_all()`` (or
                                ``db.refresh(obj)``) before reading rows an API call changed.

Users (all active, password TEST_PASSWORD, language 'en'; return models.User)
    make_user(role="teacher", name=None, email=None, language="en", is_active=True,
              password=None)  -> User   factory; email defaults to "<role>-<n>@test.local"
    admin, teacher, other_teacher, parent, other_parent

Classes and children
    make_class(name=None, kindergarten="Sunflower KG", teachers=()) -> Class
    klass           class "Class A" with ``teacher`` assigned
    other_class     class "Class B" with ``other_teacher`` assigned
    make_child(class_=None, parents=(), name="Adam", birth_date=date(2022, 8, 5),
               with_profile=True, created_by=None, **child_fields) -> Child
                    inserts a child (main_language 'ar' unless given), links the
                    given parent users and, by default, an empty child_profiles row
    child           "Adam" in ``klass``, linked to ``parent``
    other_child     "Maya" in ``other_class``, linked to ``other_parent``

Child-owned rows (committed; extra keyword arguments are model columns)
    make_focus_area(child, title="Joining group play", category="social", status="active",
                    plan=None, created_by=None, **fields) -> FocusArea
    make_observation(child, text="Built a tower with a friend", created_by=None, **fields)
                    -> Observation (source 'quick'; observed_at now unless given)
    make_assessment(child, created_by=None, kind="initial", **fields) -> TeacherAssessment
                    (an open cycle; ``teacher_id``/``created_by`` default to ``created_by``)
    make_ai_suggestion(child, kind="understanding", input=None, output=None, created_by=None,
                       **fields) -> AiSuggestion (provider 'template', outcome 'pending')

HTTP clients (fastapi.testclient.TestClient; no Origin header is sent)
    client                      anonymous client
    client_for(user) -> TestClient
                                client logged in as ``user`` (a session row is
                                inserted directly; cookie ks_session is set)
    admin_client, teacher_client, other_teacher_client, parent_client, other_parent_client

Settings and files
    settings.cookie_secure is False for the whole run (the TestClient talks http).
    settings.upload_dir points to a fresh tmp directory for every test.
    sample_options              points settings.options_path at
                                tests/fixtures/options.sample.json (for /api/options
                                and vocab tests); returns the Path. The fixtures folder
                                has no lists/ or source/ folder, so no list fragments
                                are merged and every source registry is {}.

History rows are append-only (DB triggers): never UPDATE or DELETE record_versions,
teacher_assessment_entries, report_exports, ai_suggestions (except resolving a
pending outcome), functional_summaries (except draft -> approved) or a closed
teacher_assessments row in a test; the per-test TRUNCATE does not fire them.
"""
import itertools
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import make_url, text

from app import vocab
from app.config import BACKEND_DIR, settings
from app.db import SessionLocal, engine
from app.models import (
    AiSuggestion,
    Child,
    ChildParent,
    ChildProfile,
    Class,
    ClassTeacher,
    FocusArea,
    Observation,
    TeacherAssessment,
    User,
)
from app.security import hash_password
from app.sessions import COOKIE_NAME, create_session

TEST_PASSWORD = "Test-pass-123"
FIXTURES = Path(__file__).parent / "fixtures"

_db_name = make_url(settings.database_url).database or ""
if _db_name != "kidsphere_test" and not _db_name.startswith("kidsphere_test_"):
    raise pytest.UsageError(f"refusing to run tests against database {_db_name!r}; use kidsphere_test")

settings.cookie_secure = False


def alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.attributes["configure_logger"] = False
    return cfg


@pytest.fixture(scope="session", autouse=True)
def _schema():
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    engine.dispose()
    command.upgrade(alembic_config(), "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables(_schema):
    with engine.begin() as conn:
        tables = conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
        )).scalars().all()
        if tables:
            conn.execute(text(f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture(autouse=True)
def _upload_dir(tmp_path, monkeypatch):
    path = tmp_path / "uploads"
    path.mkdir()
    monkeypatch.setattr(settings, "upload_dir", path)
    return path


@pytest.fixture
def sample_options(monkeypatch):
    path = FIXTURES / "options.sample.json"
    monkeypatch.setattr(settings, "options_path", path)
    vocab.reload()
    yield path
    vocab.reload()


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="session")
def _password_hash():
    # Cheap rounds keep fixtures fast; verification works for any cost.
    return hash_password(TEST_PASSWORD, rounds=4)


@pytest.fixture
def make_user(db, _password_hash):
    counter = itertools.count(1)

    def make(role="teacher", name=None, email=None, language="en", is_active=True, password=None):
        n = next(counter)
        user = User(
            name=name or f"{role.title()} {n}",
            email=(email or f"{role}-{n}@test.local").lower(),
            password_hash=hash_password(password, rounds=4) if password else _password_hash,
            role=role,
            language=language,
            is_active=is_active,
        )
        db.add(user)
        db.commit()
        return user

    return make


@pytest.fixture
def admin(make_user):
    return make_user("admin", name="Admin", email="admin@test.local")


@pytest.fixture
def teacher(make_user):
    return make_user("teacher", name="Teacher", email="teacher@test.local")


@pytest.fixture
def other_teacher(make_user):
    return make_user("teacher", name="Other Teacher", email="other-teacher@test.local")


@pytest.fixture
def parent(make_user):
    return make_user("parent", name="Parent", email="parent@test.local")


@pytest.fixture
def other_parent(make_user):
    return make_user("parent", name="Other Parent", email="other-parent@test.local")


@pytest.fixture
def make_class(db):
    counter = itertools.count(1)

    def make(name=None, kindergarten="Sunflower KG", teachers=()):
        cls = Class(name=name or f"Class {next(counter)}", kindergarten=kindergarten)
        db.add(cls)
        db.flush()
        for t in teachers:
            db.add(ClassTeacher(class_id=cls.id, user_id=t.id))
        db.commit()
        return cls

    return make


@pytest.fixture
def klass(make_class, teacher):
    return make_class("Class A", teachers=[teacher])


@pytest.fixture
def other_class(make_class, other_teacher):
    return make_class("Class B", teachers=[other_teacher])


@pytest.fixture
def make_child(db):
    def make(class_=None, parents=(), name="Adam", birth_date=date(2022, 8, 5), with_profile=True,
             created_by=None, **fields):
        fields.setdefault("main_language", "ar")
        child = Child(
            name=name,
            birth_date=birth_date,
            class_id=class_.id if class_ is not None else None,
            created_by=created_by.id if created_by is not None else None,
            **fields,
        )
        db.add(child)
        db.flush()
        for p in parents:
            db.add(ChildParent(child_id=child.id, user_id=p.id, relation="parent"))
        if with_profile:
            db.add(ChildProfile(child_id=child.id))
        db.commit()
        return child

    return make


@pytest.fixture
def child(make_child, klass, parent):
    return make_child(klass, parents=[parent], name="Adam")


@pytest.fixture
def other_child(make_child, other_class, other_parent):
    return make_child(other_class, parents=[other_parent], name="Maya", birth_date=date(2021, 11, 20))


def _add(db, row):
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def make_focus_area(db):
    def make(child, title="Joining group play", category="social", status="active", plan=None, created_by=None,
             **fields):
        return _add(db, FocusArea(child_id=child.id, title=title, category=category, status=status, plan=plan,
                                  created_by=created_by.id if created_by is not None else None, **fields))

    return make


@pytest.fixture
def make_observation(db):
    def make(child, text="Built a tower with a friend", created_by=None, **fields):
        fields.setdefault("source", "quick")
        fields.setdefault("observed_at", datetime.now(timezone.utc))
        return _add(db, Observation(child_id=child.id, observation=text,
                                    created_by=created_by.id if created_by is not None else None, **fields))

    return make


@pytest.fixture
def make_assessment(db):
    def make(child, created_by=None, kind="initial", **fields):
        uid = created_by.id if created_by is not None else None
        fields.setdefault("teacher_id", uid)
        return _add(db, TeacherAssessment(child_id=child.id, kind=kind, created_by=uid, **fields))

    return make


@pytest.fixture
def make_ai_suggestion(db):
    def make(child, kind="understanding", input=None, output=None, created_by=None, **fields):
        fields.setdefault("provider", "template")
        fields.setdefault("is_template", True)
        return _add(db, AiSuggestion(child_id=child.id, kind=kind, input=input or {"child": "[child]"},
                                     output=output or {"summary": "Enjoys building with others."},
                                     created_by=created_by.id if created_by is not None else None, **fields))

    return make


def _new_client(**kwargs) -> TestClient:
    from app.main import app

    return TestClient(app, **kwargs)


@pytest.fixture
def client():
    with _new_client() as c:
        yield c


@pytest.fixture
def client_for(db):
    clients = []

    def make(user: User, **kwargs) -> TestClient:
        token = create_session(db, user, "pytest")
        db.commit()
        c = _new_client(**kwargs)
        c.cookies.set(COOKIE_NAME, token)
        clients.append(c)
        return c

    yield make
    for c in clients:
        c.close()


@pytest.fixture
def admin_client(client_for, admin):
    return client_for(admin)


@pytest.fixture
def teacher_client(client_for, teacher):
    return client_for(teacher)


@pytest.fixture
def other_teacher_client(client_for, other_teacher):
    return client_for(other_teacher)


@pytest.fixture
def parent_client(client_for, parent):
    return client_for(parent)


@pytest.fixture
def other_parent_client(client_for, other_parent):
    return client_for(other_parent)
