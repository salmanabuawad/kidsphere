"""Generation jobs (0011): in local AI mode the draft is made after the response (202 + job)."""
import json
import uuid

import pytest
from alembic import command
from sqlalchemy import inspect, select

from app.ai import local_provider
from app.db import SessionLocal
from app.db import engine as db_engine
from app.models import GeneratedContent, GenerationJob
from app.services import generation_jobs
from tests.conftest import alembic_config
from tests.test_content import _no_key, adam  # noqa: F401  (fixtures)
from tests.test_local_ai import STORY, fake_post, local_mode  # noqa: F401  (fixtures)


def gen(client, child, focus, **extra):
    return client.post(f"/api/children/{child.id}/content/generate",
                       json={"mode": "growth_support", "content_type": "story", "focus_area_id": str(focus.id), **extra})


def test_migration_0011_up_and_down():
    try:
        command.downgrade(alembic_config(), "0010")
        db_engine.dispose()
        assert "generation_jobs" not in inspect(db_engine).get_table_names()
    finally:
        command.upgrade(alembic_config(), "head")
        db_engine.dispose()
    assert "generation_jobs" in inspect(db_engine).get_table_names()


def test_template_mode_answers_directly(teacher_client, adam, db):  # noqa: F811
    child, focus = adam
    r = gen(teacher_client, child, focus)
    assert r.status_code == 201 and "content" in r.json()
    assert db.scalars(select(GenerationJob)).all() == []


def test_local_mode_returns_a_job_and_finishes_it(local_mode, teacher_client, adam, db, monkeypatch):  # noqa: F811
    child, focus = adam
    post, calls = fake_post(STORY)
    monkeypatch.setattr(local_provider, "_post", post)
    r = gen(teacher_client, child, focus)
    assert r.status_code == 202, r.text
    job = r.json()["job"]
    assert job["status"] == "pending" and job["request"]["content_type"] == "story"
    # The TestClient runs the background task after the response.
    done = teacher_client.get(f"/api/generation-jobs/{job['id']}").json()["job"]
    assert done["status"] == "done" and done["error_code"] is None
    (cid,) = done["result"]["content_ids"]
    row = db.get(GeneratedContent, uuid.UUID(cid))
    assert row.ai_provider == "local" and row.status == "draft" and row.child_id == child.id
    assert len(calls) == 1
    listed = teacher_client.get(f"/api/children/{child.id}/generation-jobs").json()["jobs"]
    assert [j["id"] for j in listed] == [job["id"]]
    assert teacher_client.get(f"/api/children/{child.id}/generation-jobs", params={"open": True}).json()["jobs"] == []


def test_a_pack_job_keeps_the_pack_id(local_mode, teacher_client, adam, monkeypatch):  # noqa: F811
    child, focus = adam
    post, _ = fake_post({"nope": 1})  # invalid → template fallback, still done
    monkeypatch.setattr(local_provider, "_post", post)
    job = gen(teacher_client, child, focus, content_type="pack").json()["job"]
    done = teacher_client.get(f"/api/generation-jobs/{job['id']}").json()["job"]
    assert done["status"] == "done" and done["result"]["pack_id"] and len(done["result"]["content_ids"]) == 3
    assert done["result"]["fallback_reason"] == "AI_INVALID_OUTPUT"


def test_bad_requests_fail_before_a_job_exists(local_mode, teacher_client, adam, db):  # noqa: F811
    child, focus = adam
    r = gen(teacher_client, child, focus, content_type="story", template="sequence")
    assert r.status_code == 400
    r = teacher_client.post(f"/api/children/{child.id}/content/generate",
                            json={"mode": "growth_support", "content_type": "story", "focus_area_id": str(uuid.uuid4())})
    assert r.status_code == 400
    db.expire_all()
    assert db.scalars(select(GenerationJob)).all() == []


def test_job_access(local_mode, teacher_client, other_teacher_client, parent_client, adam, monkeypatch):  # noqa: F811
    child, focus = adam
    post, _ = fake_post(STORY)
    monkeypatch.setattr(local_provider, "_post", post)
    job = gen(teacher_client, child, focus).json()["job"]
    assert other_teacher_client.get(f"/api/generation-jobs/{job['id']}").status_code == 404
    assert parent_client.get(f"/api/generation-jobs/{job['id']}").status_code == 404
    assert parent_client.post(f"/api/children/{child.id}/content/generate",
                              json={"mode": "growth_support", "content_type": "story",
                                    "focus_area_id": str(focus.id)}).status_code == 403


def test_a_job_whose_focus_closed_meanwhile_fails_cleanly(teacher, adam, db):  # noqa: F811
    child, focus = adam
    job = GenerationJob(child_id=child.id, request={"mode": "growth_support", "content_type": "story",
                                                    "focus_area_id": str(focus.id)}, created_by=teacher.id)
    db.add(job)
    focus.status = "completed"
    db.commit()
    generation_jobs.run_job(job.id)
    db.expire_all()
    job = db.get(GenerationJob, job.id)
    assert job.status == "failed" and job.error_code == "VALIDATION" and job.finished_at is not None


def test_restart_marks_open_jobs_interrupted(teacher, adam, db):  # noqa: F811
    child, _ = adam
    db.add_all([GenerationJob(child_id=child.id, request={}, created_by=teacher.id, status=s)
                for s in ("pending", "running", "done")])
    db.commit()
    with SessionLocal() as own:
        assert generation_jobs.mark_interrupted(own) == 2
    db.expire_all()
    assert sorted(j.status for j in db.scalars(select(GenerationJob))) == ["done", "failed", "failed"]
    assert {j.error_code for j in db.scalars(select(GenerationJob)) if j.status == "failed"} == {"INTERRUPTED"}
    assert json.dumps([j.request for j in db.scalars(select(GenerationJob))])
