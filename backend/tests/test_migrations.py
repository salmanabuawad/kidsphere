"""Migrations 0001 + 0002: tables, model mirroring, guard triggers and the 0002 backfill."""
import importlib.util
import json
import threading
import time
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from alembic import command
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, inspect, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.config import BACKEND_DIR
from app.db import SessionLocal, engine
from app.errors import install_error_handlers
from app.models import (
    AiSuggestion,
    Base,
    Baseline,
    Child,
    DevelopmentReview,
    FocusArea,
    FunctionalSummary,
    GeneratedContent,
    Observation,
    RecordVersion,
    ReportExport,
    TeacherAssessment,
    TeacherAssessmentEntry,
)
from app.services import history
from tests.conftest import alembic_config

TABLES_0001 = {
    "users", "sessions", "classes", "class_teachers", "children", "child_parents", "child_profiles",
    "baselines", "focus_areas", "generated_content", "observations", "content_feedback",
    "development_reviews", "audit_log",
}
NEW_TABLES = {
    "ai_suggestions", "record_versions", "teacher_assessments", "teacher_assessment_entries",
    "functional_summaries", "report_exports",
}
TABLES_0003 = {"app_settings"}  # tests/test_admin_settings.py covers 0003 up/down
TABLES_0004 = {"child_people"}  # tests/test_people.py covers 0004 up/down
TABLES_0005 = {"kindergarten_themes"}  # tests/test_kindergartens.py covers 0005 up/down
TABLES = TABLES_0001 | NEW_TABLES | TABLES_0003 | TABLES_0004 | TABLES_0005
NOW = datetime(2026, 10, 6, 9, 0, tzinfo=timezone.utc)


def public_tables() -> set[str]:
    engine.dispose()
    return set(inspect(engine).get_table_names()) - {"alembic_version"}


def columns(table: str) -> set[str]:
    engine.dispose()
    return {c["name"] for c in inspect(engine).get_columns(table)}


def functions() -> set[str]:
    with engine.connect() as conn:
        return set(conn.execute(text(
            "SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'"
        )).scalars())


def migration_0002():
    path = BACKEND_DIR / "migrations" / "versions" / "0002_source_documents.py"
    spec = importlib.util.spec_from_file_location("migration_0002", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_downgrade_upgrade():
    assert public_tables() == TABLES
    command.downgrade(alembic_config(), "base")
    assert public_tables() == set()
    command.upgrade(alembic_config(), "head")
    assert public_tables() == TABLES
    engine.dispose()


def test_downgrade_0002_drops_only_its_own_objects():
    try:
        command.downgrade(alembic_config(), "0001")
        assert public_tables() == TABLES_0001
        assert not {"follow_up_on", "assessment_id", "source_need"} & columns("focus_areas")
        assert not {"domains", "attributes"} & columns("observations")
        assert not {"follow_up", "ai_suggestion_id"} & columns("development_reviews")
        assert not {"deleted_at", "deleted_by"} & columns("generated_content")
        assert functions() == {"baselines_immutable"}
    finally:
        command.upgrade(alembic_config(), "head")
        engine.dispose()
    assert public_tables() == TABLES
    assert {"kidsphere_append_only", "focus_areas_max_active", "ai_suggestions_guard", "teacher_assessments_guard",
            "teacher_assessment_entries_open", "functional_summaries_guard"} <= functions()


def test_models_match_the_migration():
    insp = inspect(engine)
    assert set(Base.metadata.tables) == TABLES
    for name, table in Base.metadata.tables.items():
        db_columns = {c["name"] for c in insp.get_columns(name)}
        assert db_columns == {c.name for c in table.columns}, name


# --------------------------------------------------------------------------- 0001 guards


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


# --------------------------------------------------------------------------- 0002 append-only tables


@pytest.fixture
def history_rows(db, child, teacher, make_assessment):
    version = history.record(db, child_id=child.id, entity_type="observation", entity_id=uuid.uuid4(),
                             data={"observation": "x"}, user=teacher, via="manual")
    cycle = make_assessment(child, created_by=teacher)
    entry = TeacherAssessmentEntry(assessment_id=cycle.id, child_id=child.id, domain="emotional", status="in_progress",
                                   data={"items": {}}, entered_by=teacher.id, entered_role="teacher")
    export = ReportExport(child_id=child.id, report_type="full", language="he", generated_by=teacher.id,
                          options={"include_health": False})
    db.add_all([entry, export])
    db.commit()
    return {"record_versions": version, "teacher_assessment_entries": entry, "report_exports": export}


@pytest.mark.parametrize("table", ["record_versions", "teacher_assessment_entries", "report_exports"])
def test_append_only_tables_reject_update_and_direct_delete(db, history_rows, table):
    row_id = history_rows[table].id
    with pytest.raises(DBAPIError, match="append-only"):
        db.execute(text(f"UPDATE {table} SET child_id = child_id WHERE id = :id"), {"id": row_id})
    db.rollback()
    with pytest.raises(DBAPIError, match="together with their child"):
        db.execute(text(f"DELETE FROM {table} WHERE id = :id"), {"id": row_id})
    db.rollback()
    assert db.scalar(text(f"SELECT count(*) FROM {table}")) == 1


def test_record_versions_constraints(db, child, teacher):
    def bad(**fields):
        row = {"child_id": child.id, "entity_type": "observation", "entity_id": uuid.uuid4(), "entity_key": "",
               "seq": 1, "data": {}, "via": "manual", **fields}
        db.add(RecordVersion(**row))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    bad(entity_type="profile_section", entity_key="parent:who")  # a profile section has no entity_id
    bad(entity_type="profile_section", entity_id=None, entity_key="")  # ... but needs a key
    bad(entity_id=None)  # an observation version needs its id
    bad(seq=0)
    bad(via="guess")
    bad(changed_role="robot")
    bad(reported_by="ai")
    bad(entity_type="baseline")
    oid = uuid.uuid4()
    db.add(RecordVersion(child_id=child.id, entity_type="observation", entity_id=oid, seq=1, data={}, via="manual"))
    db.commit()
    bad(entity_id=oid, seq=1)  # one row per (entity, seq)


# --------------------------------------------------------------------------- teacher assessments


def _close(db, cycle, user):
    db.execute(update(TeacherAssessment).where(TeacherAssessment.id == cycle.id)
               .values(status="closed", closed_at=func.now(), closed_by=user.id))
    db.commit()


def _entry(cycle, child, teacher, domain="social"):
    return TeacherAssessmentEntry(assessment_id=cycle.id, child_id=child.id, domain=domain, status="in_progress",
                                  data={"items": {"initiates_contact": {"level": "some_support"}}},
                                  entered_by=teacher.id, entered_by_name=teacher.name, entered_role="teacher")


def test_one_open_and_one_initial_cycle_per_child(db, child, teacher, make_assessment):
    first = make_assessment(child, created_by=teacher)
    db.add(TeacherAssessment(child_id=child.id, kind="reassessment", previous_id=first.id))
    with pytest.raises(IntegrityError, match="teacher_assessments_one_open_uq"):
        db.commit()
    db.rollback()
    _close(db, first, teacher)
    db.add(TeacherAssessment(child_id=child.id, kind="initial"))
    with pytest.raises(IntegrityError, match="teacher_assessments_one_initial_uq"):
        db.commit()
    db.rollback()
    second = make_assessment(child, created_by=teacher, kind="reassessment", previous_id=first.id)
    assert second.status == "open"


def test_open_cycle_accepts_entries_and_header_edits(db, child, other_child, teacher, make_assessment):
    cycle = make_assessment(child, created_by=teacher, period_from=date(2026, 9, 1))
    db.add_all([_entry(cycle, child, teacher), _entry(cycle, child, teacher)])
    db.commit()
    db.execute(update(TeacherAssessment).where(TeacherAssessment.id == cycle.id)
               .values(period_to=date(2026, 10, 1), domains={"social": {"status": "in_progress"}}))
    db.commit()
    assert db.scalar(select(func.count()).select_from(TeacherAssessmentEntry)) == 2
    db.add(TeacherAssessment(child_id=other_child.id, period_from=date(2026, 9, 2), period_to=date(2026, 9, 1)))
    with pytest.raises(IntegrityError, match="teacher_assessments_period_chk"):
        db.commit()
    db.rollback()


def test_closed_cycle_is_immutable_and_takes_no_entries(db, child, other_child, teacher, make_assessment):
    cycle = make_assessment(child, created_by=teacher)
    db.add(_entry(cycle, other_child, teacher))  # wrong child
    with pytest.raises(DBAPIError, match="child of their assessment"):
        db.commit()
    db.rollback()
    db.add(_entry(cycle, child, teacher))
    db.commit()
    _close(db, cycle, teacher)
    with pytest.raises(IntegrityError, match="closed teacher assessments are immutable"):
        db.execute(update(TeacherAssessment).where(TeacherAssessment.id == cycle.id).values(period_note="later"))
    db.rollback()
    with pytest.raises(IntegrityError, match="immutable"):  # no reopening either
        db.execute(update(TeacherAssessment).where(TeacherAssessment.id == cycle.id)
                   .values(status="open", closed_at=None))
    db.rollback()
    db.add(_entry(cycle, child, teacher))
    with pytest.raises(IntegrityError, match="closed teacher assessment"):
        db.commit()
    db.rollback()
    with pytest.raises(DBAPIError, match="together with their child"):
        db.execute(delete(TeacherAssessment).where(TeacherAssessment.id == cycle.id))
    db.rollback()
    db.add(TeacherAssessment(child_id=child.id, kind="reassessment", status="closed"))  # closed needs closed_at
    with pytest.raises(IntegrityError, match="teacher_assessments_closed_chk"):
        db.commit()
    db.rollback()


def test_entry_domains_and_statuses_are_checked(db, child, teacher, make_assessment):
    cycle = make_assessment(child, created_by=teacher)
    for fields in ({"domain": "behaviour"}, {"status": "done"}, {"entered_role": "parent"}):
        row = _entry(cycle, child, teacher)
        for k, v in fields.items():
            setattr(row, k, v)
        db.add(row)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_entry_insert_waits_for_a_concurrent_close(db, child, teacher, make_assessment):
    """The open-cycle check locks the cycle row, so an entry cannot slip into a cycle being closed."""
    cycle = make_assessment(child, created_by=teacher)
    db.execute(update(TeacherAssessment).where(TeacherAssessment.id == cycle.id)
               .values(status="closed", closed_at=func.now(), closed_by=teacher.id))  # not committed yet
    result = {}

    def insert():
        with SessionLocal() as s:
            s.add(_entry(cycle, child, teacher))
            try:
                s.commit()
                result["status"] = "inserted"
            except IntegrityError as exc:
                result["status"] = "closed" if "closed teacher assessment" in str(exc) else str(exc)

    t = threading.Thread(target=insert)
    t.start()
    time.sleep(0.5)
    assert "status" not in result  # waiting for the cycle row
    db.commit()
    t.join(30)
    assert result["status"] == "closed"


# --------------------------------------------------------------------------- functional summaries


def _summary(child, teacher, **fields):
    fields.setdefault("source", "manual")
    return FunctionalSummary(child_id=child.id, general_description="Enjoys building with friends.",
                             main_strengths={"items": [{"key": "building"}], "text": ""}, created_by=teacher.id,
                             **fields)


def test_functional_summary_draft_to_approved_only(db, child, teacher):
    draft = _summary(child, teacher)
    db.add(draft)
    db.commit()
    with pytest.raises(IntegrityError):  # approved needs approved_by and approved_at
        db.execute(update(FunctionalSummary).where(FunctionalSummary.id == draft.id).values(status="approved"))
    db.rollback()
    with pytest.raises(DBAPIError, match="immutable"):  # content never changes
        db.execute(update(FunctionalSummary).where(FunctionalSummary.id == draft.id)
                   .values(general_description="Changed"))
    db.rollback()
    with pytest.raises(DBAPIError, match="immutable"):  # not even together with the approval
        db.execute(update(FunctionalSummary).where(FunctionalSummary.id == draft.id)
                   .values(status="approved", approved_by=teacher.id, approved_at=func.now(), adaptations="x"))
    db.rollback()
    db.execute(update(FunctionalSummary).where(FunctionalSummary.id == draft.id)
               .values(status="approved", approved_by=teacher.id, approved_at=func.now()))
    db.commit()
    for values in ({"status": "approved", "approved_at": func.now()}, {"status": "draft", "approved_by": None,
                                                                        "approved_at": None}):
        with pytest.raises(IntegrityError, match="already approved"):
            db.execute(update(FunctionalSummary).where(FunctionalSummary.id == draft.id).values(**values))
        db.rollback()
    with pytest.raises(DBAPIError, match="together with their child"):
        db.execute(delete(FunctionalSummary).where(FunctionalSummary.id == draft.id))
    db.rollback()
    newer = _summary(child, teacher, supersedes_id=draft.id)
    db.add(newer)
    db.commit()
    assert newer.status == "draft"


def test_ai_draft_summary_needs_its_suggestion(db, child, teacher, make_ai_suggestion):
    db.add(_summary(child, teacher, source="ai_draft"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    ais = make_ai_suggestion(child, kind="functional_summary", created_by=teacher)
    db.add(_summary(child, teacher, source="ai_draft", ai_suggestion_id=ais.id))
    db.commit()


# --------------------------------------------------------------------------- AI suggestions


def test_ai_suggestion_outcome_is_resolved_once(db, child, teacher, make_ai_suggestion):
    ais = make_ai_suggestion(child, created_by=teacher, domains=["social", "communication"])
    for values in ({"input": {"child": "Adam"}}, {"output": {}}, {"domains": ["social"]},
                   {"used_by_type": "development_review"},  # pending -> pending
                   {"outcome": "accepted", "provider": "claude"}):
        with pytest.raises(DBAPIError, match="only a pending suggestion"):
            db.execute(update(AiSuggestion).where(AiSuggestion.id == ais.id).values(**values))
        db.rollback()
    db.execute(update(AiSuggestion).where(AiSuggestion.id == ais.id).values(
        outcome="edited", used_by_type="development_review", used_by_id=uuid.uuid4(), resolved_at=func.now()))
    db.commit()
    with pytest.raises(DBAPIError, match="only a pending suggestion"):
        db.execute(update(AiSuggestion).where(AiSuggestion.id == ais.id).values(outcome="discarded"))
    db.rollback()
    with pytest.raises(DBAPIError, match="together with their child"):
        db.execute(delete(AiSuggestion).where(AiSuggestion.id == ais.id))
    db.rollback()


def test_ai_suggestion_values_are_checked(db, child, make_ai_suggestion):
    for fields in ({"kind": "diagnosis"}, {"outcome": "maybe"}, {"domains": ["social", "behaviour"]},
                   {"used_by_type": "content"}):
        with pytest.raises(IntegrityError):
            make_ai_suggestion(child, **fields)
        db.rollback()


# --------------------------------------------------------------------------- other 0002 columns


def test_observation_domains_and_soft_delete_checks(db, child, make_observation):
    obs = make_observation(child, domains=["social", "communication"], attributes={"frequency": "often"})
    db.refresh(obs)
    assert obs.domains == ["social", "communication"]
    assert make_observation(child).domains == []
    with pytest.raises(IntegrityError):
        make_observation(child, domains=["social", "behaviour"])
    db.rollback()
    content = dict(child_id=child.id, mode="growth_support", content_type="story", language="en", title="t",
                   content={"story": "x"}, generation_input={}, ai_provider="template", is_template=True)
    db.add(GeneratedContent(**content, status="draft", deleted_at=NOW))
    db.commit()
    db.add(GeneratedContent(**content, status="approved", deleted_at=NOW))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


# --------------------------------------------------------------------------- max 3 active focus areas


def active(child) -> int:
    with SessionLocal() as s:
        return s.scalar(select(func.count()).select_from(FocusArea).where(
            FocusArea.child_id == child.id, FocusArea.status == "active"))


def test_fourth_active_focus_is_rejected_at_commit(db, child, make_focus_area):
    for i in range(3):
        make_focus_area(child, title=f"F{i}")
    db.add(FocusArea(child_id=child.id, category="social", title="F4", status="active"))
    db.flush()  # deferred: nothing is checked before COMMIT
    with pytest.raises(IntegrityError, match="FOCUS_LIMIT"):
        db.commit()
    db.rollback()
    assert active(child) == 3


def test_reactivating_a_fourth_focus_is_rejected(db, child, make_focus_area):
    rows = [make_focus_area(child, title=f"F{i}") for i in range(3)]
    paused = make_focus_area(child, title="Paused", status="paused")
    db.execute(update(FocusArea).where(FocusArea.id == paused.id).values(status="active"))
    with pytest.raises(IntegrityError, match="FOCUS_LIMIT"):
        db.commit()
    db.rollback()
    db.execute(update(FocusArea).where(FocusArea.id == rows[0].id).values(title="Renamed"))  # other edits still work
    db.commit()


def test_close_then_create_in_one_transaction(db, child, make_focus_area):
    rows = [make_focus_area(child, title=f"F{i}") for i in range(3)]
    db.execute(update(FocusArea).where(FocusArea.id == rows[0].id).values(status="completed", closed_at=func.now()))
    db.add(FocusArea(child_id=child.id, category="social", title="New", status="active"))
    db.commit()
    assert active(child) == 3
    db.add(FocusArea(child_id=child.id, category="social", title="Newer", status="active"))  # create, then pause
    db.flush()
    db.execute(update(FocusArea).where(FocusArea.id == rows[1].id).values(status="paused"))
    db.commit()
    assert active(child) == 3


def test_max_active_check_serialises_on_the_child_row(db, child, make_focus_area):
    for i in range(2):
        make_focus_area(child, title=f"F{i}")
    holder = SessionLocal()
    # FOR SHARE lets the insert's foreign-key check (FOR KEY SHARE) through but not the
    # COMMIT-time check, which locks the child row FOR NO KEY UPDATE before counting.
    holder.execute(select(Child.id).where(Child.id == child.id).with_for_update(read=True))
    result = {}

    def create():
        with SessionLocal() as s:
            s.add(FocusArea(child_id=child.id, category="social", title="third", status="active"))
            s.flush()
            result["flushed"] = True
            s.commit()
            result["done"] = True

    t = threading.Thread(target=create)
    t.start()
    time.sleep(0.5)
    assert result == {"flushed": True}  # the COMMIT-time check waits for the child row
    holder.rollback()
    holder.close()
    t.join(30)
    assert result == {"flushed": True, "done": True}
    assert active(child) == 3


# --------------------------------------------------------------------------- DB guards -> error codes


def test_db_guards_map_to_error_codes(db, child, teacher, make_focus_area, make_assessment):
    for i in range(3):
        make_focus_area(child, title=f"F{i}")
    open_cycle = make_assessment(child, created_by=teacher)
    closed = TeacherAssessment(child_id=child.id, kind="reassessment", status="closed", closed_at=NOW)
    approved = _summary(child, teacher, status="approved", approved_by=teacher.id, approved_at=NOW)
    db.add_all([closed, approved])
    db.commit()

    actions = {
        "focus": lambda s: s.add(FocusArea(child_id=child.id, category="social", title="F4", status="active")),
        "open": lambda s: s.add(TeacherAssessment(child_id=child.id, kind="reassessment", previous_id=open_cycle.id)),
        "closed_entry": lambda s: s.add(_entry(closed, child, teacher)),
        "closed_edit": lambda s: s.execute(update(TeacherAssessment).where(TeacherAssessment.id == closed.id)
                                           .values(period_note="x")),
        "approve_again": lambda s: s.execute(update(FunctionalSummary).where(FunctionalSummary.id == approved.id)
                                             .values(approved_at=func.now())),
    }
    app = FastAPI()
    install_error_handlers(app)

    @app.post("/run/{name}")
    def run(name: str):
        with SessionLocal() as s:
            actions[name](s)
            s.commit()
        return {}

    expected = {"focus": "FOCUS_LIMIT", "open": "ASSESSMENT_OPEN", "closed_entry": "ASSESSMENT_CLOSED",
                "closed_edit": "ASSESSMENT_CLOSED", "approve_again": "SUMMARY_APPROVED"}
    with TestClient(app) as c:
        for name, code in expected.items():
            r = c.post(f"/run/{name}")
            assert (r.status_code, r.json()["error"]["code"]) == (409, code), name


# --------------------------------------------------------------------------- child deletion


def test_deleting_a_child_cascades_through_every_new_table(db, child, other_child, teacher, make_assessment,
                                                           make_ai_suggestion, make_focus_area):
    def populate(kid):
        ais = make_ai_suggestion(kid, created_by=teacher, outcome="accepted")
        review = DevelopmentReview(child_id=kid.id, summary="Joins play more often.", understanding={},
                                   ai_suggestion_id=ais.id, follow_up={"reassessment_on": "2026-12-01"})
        db.add(review)
        db.commit()
        first = make_assessment(kid, created_by=teacher)
        db.add(_entry(first, kid, teacher))
        db.commit()
        _close(db, first, teacher)
        second = make_assessment(kid, created_by=teacher, kind="reassessment", previous_id=first.id)
        db.add(_entry(second, kid, teacher, domain="play"))
        focus = make_focus_area(kid, assessment_id=second.id, follow_up_on=date(2026, 12, 1),
                                source_need={"assessment_id": str(second.id), "index": 0})
        summary = _summary(kid, teacher, source="ai_draft", ai_suggestion_id=ais.id, review_id=review.id,
                           assessment_id=first.id, status="approved", approved_by=teacher.id, approved_at=NOW)
        db.add(summary)
        db.commit()
        db.add(_summary(kid, teacher, supersedes_id=summary.id))
        db.add(ReportExport(child_id=kid.id, report_type="timeline", language="ar", generated_by=teacher.id))
        history.record(db, child_id=kid.id, entity_type="focus_area", entity_id=focus.id, data={"title": "x"},
                       user=teacher, via="review", review_id=review.id, ai_suggestion_id=ais.id)
        history.record(db, child_id=kid.id, entity_type="profile_section", key="parent:who", data={}, user=teacher,
                       reported_by="parent", via="on_behalf")
        db.commit()

    populate(child)
    populate(other_child)
    counts = {t: db.scalar(text(f"SELECT count(*) FROM {t}")) for t in NEW_TABLES}
    db.execute(delete(Child).where(Child.id == child.id))
    db.commit()
    for table in NEW_TABLES:
        assert db.scalar(text(f"SELECT count(*) FROM {table}")) == counts[table] // 2, table
        assert db.scalar(text(f"SELECT count(*) FROM {table} WHERE child_id = :id"), {"id": child.id}) == 0


# --------------------------------------------------------------------------- 0002 backfill


T_ID, P_ID = uuid.uuid4(), uuid.uuid4()
PROFILE_UPDATED = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def _stamp(user_id, name, role, reported_by, at):
    return {"by": str(user_id), "by_name": name, "role": role, "reported_by": reported_by, "at": at}


ADAM_PARENT = {
    "sections": {
        "who": {"describe_words": [{"key": "curious"}], "appreciate": "Kind heart", "strengths": [{"key": "imagination"}]},
        "emotions": {"calming_helps": [{"key": "hug"}], "calming_notes": "Sing to him"},
        "priorities": {"parent_priorities": [], "one_thing_to_know": ""},
    },
    "entered": {
        "who": [_stamp(P_ID, "Parent P", "parent", "parent", "2026-09-01T08:00:00+00:00"),
                _stamp(T_ID, "Teacher T", "teacher", "parent", "2026-09-03T09:30:00+00:00")],
        "emotions": [_stamp(P_ID, "Parent P", "parent", "parent", "2026-09-02T10:00:00+00:00")],
    },
    "wizard": {"step": 7, "completed_at": "2026-09-02T10:05:00+00:00"},
    "legacy_note": {"nested": [1, 2.5, "x", None, True]},
}
ADAM_TEACHER = {
    "sections": {"who": {"strengths": [{"key": "building"}]}, "independence": {"levels": {"eating": "independent"}}},
    "entered": {"who": [_stamp(T_ID, "Teacher T", "teacher", "teacher", "2026-09-04T11:00:00+00:00")]},
}
MAYA_TEACHER = {
    "sections": {"social": {"social": [{"key": "initiates_play"}]}},
    "section_status": {"social": {"status": "sufficient"}},
}
SAMI_PARENT = {
    "sections": {"who": {"appreciate": "Laughs a lot"}},
    "entered": {"who": [_stamp(P_ID, "Parent P", "parent", "parent", "2026-09-06T07:00:00+00:00")]},
    "wizard": {"step": 3},
}


def _insert_legacy(conn) -> dict:
    """Rows as the 0001 schema stores them (raw SQL: the models already have the 0002 columns)."""
    ids = {k: uuid.uuid4() for k in ("class", "adam", "maya", "sami", "obs_motor", "obs_attention", "obs_none",
                                     "obs_other", "obs_feedback", "focus_iso", "focus_bad", "focus_text",
                                     "focus_none", "draft", "approved", "archived")}
    conn.execute(text(
        "INSERT INTO users (id, name, email, password_hash, role) VALUES "
        "(:t, 'Teacher T', 'legacy-t@test.local', 'h', 'teacher'), (:p, 'Parent P', 'legacy-p@test.local', 'h', 'parent')"
    ), {"t": T_ID, "p": P_ID})
    conn.execute(text("INSERT INTO classes (id, name, kindergarten) VALUES (:id, 'Legacy', 'Legacy KG')"),
                 {"id": ids["class"]})
    profiles = {"adam": (ADAM_PARENT, ADAM_TEACHER), "maya": ({}, MAYA_TEACHER), "sami": (SAMI_PARENT, {})}
    for name, (parent_doc, teacher_doc) in profiles.items():
        conn.execute(text(
            "INSERT INTO children (id, name, birth_date, main_language, class_id) VALUES (:id, :name, '2022-03-01', 'he', :c)"
        ), {"id": ids[name], "name": name.title(), "c": ids["class"]})
        conn.execute(text(
            "INSERT INTO child_profiles (child_id, parent_perspective, teacher_perspective, updated_at) "
            "VALUES (:id, CAST(:pp AS jsonb), CAST(:tp AS jsonb), :at)"
        ), {"id": ids[name], "pp": json.dumps(parent_doc), "tp": json.dumps(teacher_doc), "at": PROFILE_UPDATED})
    for key, area, source, body in (("obs_motor", "motor", "quick", "Climbed the ladder"),
                                    ("obs_attention", "attention", "quick", "Listened to the whole story"),
                                    ("obs_none", None, "quick", "Played in the sand"),
                                    ("obs_other", "other", "quick", "Brought a shell"),
                                    ("obs_feedback", None, "content_feedback", None)):
        conn.execute(text(
            "INSERT INTO observations (id, child_id, source, area, observation, created_by, created_at, updated_at) "
            "VALUES (:id, :child, :source, :area, :body, :t, :c, :u)"
        ), {"id": ids[key], "child": ids["adam"], "source": source, "area": area, "body": body, "t": T_ID,
            "c": NOW - timedelta(days=9), "u": NOW - timedelta(days=8)})
    for key, plan, status in (("focus_iso", {"need": "joining", "review_on": "2026-11-01"}, "active"),
                              ("focus_bad", {"review_on": "2026-02-30"}, "active"),
                              ("focus_text", {"review_on": "next month"}, "paused"),
                              ("focus_none", None, "completed")):
        conn.execute(text(
            "INSERT INTO focus_areas (id, child_id, category, title, plan, status, created_by, updated_at) "
            "VALUES (:id, :child, 'social', :title, CAST(:plan AS jsonb), :status, :t, :u)"
        ), {"id": ids[key], "child": ids["adam"], "title": key, "plan": json.dumps(plan) if plan else None,
            "status": status, "t": T_ID, "u": NOW - timedelta(days=3)})
    for key, status in (("draft", "draft"), ("approved", "approved"), ("archived", "archived")):
        conn.execute(text(
            "INSERT INTO generated_content (id, child_id, mode, content_type, language, title, content, status, "
            "generation_input, ai_provider, is_template, created_by) VALUES (:id, :child, 'growth_support', 'story', "
            "'he', :title, CAST(:content AS jsonb), :status, CAST(:gi AS jsonb), 'template', true, :t)"
        ), {"id": ids[key], "child": ids["adam"], "title": key, "content": json.dumps({"story": key}),
            "status": status, "gi": json.dumps({"focus": "x"}), "t": T_ID})
    return ids


def _profile_json(conn) -> dict:
    rows = conn.execute(text(
        "SELECT child_id, parent_perspective, teacher_perspective, updated_at, "
        "(SELECT jsonb_object_agg(k, v::text) FROM jsonb_each(parent_perspective) AS e(k, v)), "
        "(SELECT jsonb_object_agg(k, v::text) FROM jsonb_each(teacher_perspective) AS e(k, v)) FROM child_profiles"
    )).all()
    return {r[0]: {"parent": r[1], "teacher": r[2], "updated_at": r[3], "parent_text": r[4] or {},
                   "teacher_text": r[5] or {}} for r in rows}


def _versions(conn) -> list[dict]:
    return [dict(r) for r in conn.execute(text(
        "SELECT entity_type, entity_id, entity_key, seq, data, changed_by, changed_by_name, changed_role, "
        "reported_by, via, created_at, child_id FROM record_versions ORDER BY id"
    )).mappings()]


def _observations(conn) -> list[tuple]:
    return sorted(tuple(r) for r in conn.execute(text("SELECT id, observation, updated_at FROM observations")))


def test_backfill_keeps_every_existing_value_and_adds_history():
    engine.dispose()
    try:
        command.downgrade(alembic_config(), "0001")
        with engine.begin() as conn:
            ids = _insert_legacy(conn)
            before = _profile_json(conn)
            obs_before = _observations(conn)
        engine.dispose()
        command.upgrade(alembic_config(), "head")
    finally:
        command.upgrade(alembic_config(), "head")
        engine.dispose()

    with engine.connect() as conn:
        after = _profile_json(conn)
        versions = _versions(conn)
        domains = dict(conn.execute(text("SELECT id, domains FROM observations")).all())
        follow_up = dict(conn.execute(text("SELECT id, follow_up_on FROM focus_areas")).all())
        review_on = dict(conn.execute(text("SELECT id, plan->>'review_on' FROM focus_areas")).all())
        obs_after = _observations(conn)

    # Every pre-existing key is byte-identical; only questionnaire / section_status were added.
    for child_id, old in before.items():
        new = after[child_id]
        assert new["updated_at"] == old["updated_at"]
        for which in ("parent", "teacher"):
            for key, value in old[f"{which}_text"].items():
                assert new[f"{which}_text"][key] == value, (child_id, which, key)
            assert set(new[which]) - set(old[which]) <= {"questionnaire", "section_status"}
    assert obs_after == obs_before

    adam, maya, sami = (after[ids[k]] for k in ("adam", "maya", "sami"))
    assert adam["parent"]["questionnaire"] == {"status": "submitted", "entry_mode": "on_behalf", "migrated": True,
                                               "submitted_at": "2026-09-02T10:05:00+00:00"}
    assert adam["parent"]["section_status"] == {
        "who": {"status": "in_progress", "by": str(T_ID), "at": "2026-09-03T09:30:00+00:00", "derived": True},
        "emotions": {"status": "in_progress", "by": str(P_ID), "at": "2026-09-02T10:00:00+00:00", "derived": True},
    }  # priorities holds no answer
    assert "questionnaire" not in adam["teacher"]
    assert adam["teacher"]["section_status"]["independence"] == {
        "status": "in_progress", "by": None, "at": PROFILE_UPDATED.isoformat(), "derived": True}
    assert maya["parent"] == {}  # never started: nothing added
    assert maya["teacher"] == MAYA_TEACHER  # its section_status already existed
    assert sami["parent"]["questionnaire"] == {"status": "draft", "entry_mode": "self", "migrated": True}

    # Exactly one seq-1 'backfill' version per profile section, observation, focus area and live content row.
    assert all(v["seq"] == 1 and v["via"] == "backfill" for v in versions)
    sections = {(v["child_id"], v["entity_key"]): v for v in versions if v["entity_type"] == "profile_section"}
    assert set(sections) == {(ids["adam"], "parent:who"), (ids["adam"], "parent:emotions"),
                             (ids["adam"], "parent:priorities"), (ids["adam"], "teacher:who"),
                             (ids["adam"], "teacher:independence"), (ids["maya"], "teacher:social"),
                             (ids["sami"], "parent:who")}
    who = sections[(ids["adam"], "parent:who")]
    assert who["data"] == ADAM_PARENT["sections"]["who"]
    assert (who["changed_by"], who["changed_by_name"], who["changed_role"], who["reported_by"]) == (
        T_ID, "Teacher T", "teacher", "parent")  # staff entered the parent's answers
    assert who["created_at"] == datetime(2026, 9, 3, 9, 30, tzinfo=timezone.utc)
    independence = sections[(ids["adam"], "teacher:independence")]
    assert (independence["changed_by"], independence["changed_role"], independence["reported_by"],
            independence["created_at"]) == (None, "system", "teacher", PROFILE_UPDATED)

    by_entity = {(v["entity_type"], v["entity_id"]): v for v in versions if v["entity_id"] is not None}
    assert len(by_entity) == len([v for v in versions if v["entity_id"] is not None])
    assert {e for t, e in by_entity if t == "observation"} == {
        ids[k] for k in ("obs_motor", "obs_attention", "obs_none", "obs_other", "obs_feedback")}
    assert {e for t, e in by_entity if t == "focus_area"} == {
        ids[k] for k in ("focus_iso", "focus_bad", "focus_text", "focus_none")}
    assert {e for t, e in by_entity if t == "content"} == {ids["draft"], ids["approved"]}  # not the archived one
    motor = by_entity[("observation", ids["obs_motor"])]
    assert motor["data"]["observation"] == "Climbed the ladder"
    assert motor["data"]["domains"] == ["gross_motor", "fine_motor"]
    assert not {"id", "child_id", "created_by", "created_at", "updated_at"} & set(motor["data"])
    assert (motor["changed_by"], motor["changed_role"]) == (T_ID, "teacher")
    assert motor["created_at"] == NOW - timedelta(days=8)
    assert by_entity[("focus_area", ids["focus_iso"])]["data"]["follow_up_on"] == "2026-11-01"
    assert by_entity[("content", ids["draft"])]["data"]["content"] == {"story": "draft"}

    assert domains[ids["obs_motor"]] == ["gross_motor", "fine_motor"]
    assert domains[ids["obs_attention"]] == ["executive_function"]
    assert domains[ids["obs_none"]] == [] and domains[ids["obs_other"]] == []
    assert follow_up[ids["focus_iso"]] == date(2026, 11, 1)
    assert follow_up[ids["focus_bad"]] is None and follow_up[ids["focus_text"]] is None
    assert review_on[ids["focus_text"]] == "next month"  # the legacy text is kept

    # Idempotent: running every data step again changes nothing.
    with engine.begin() as conn:
        migration_0002().backfill(conn)
    with engine.connect() as conn:
        assert _versions(conn) == versions
        again = _profile_json(conn)
    assert {k: (v["parent"], v["teacher"]) for k, v in again.items()} == {
        k: (v["parent"], v["teacher"]) for k, v in after.items()}
