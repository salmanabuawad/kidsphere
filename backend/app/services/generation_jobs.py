"""Generation jobs: content generation that finishes after the response (migration 0011).

A local model can take minutes for one story, longer than a browser request should wait. When the
effective AI mode is "local", ``POST /children/{id}/content/generate`` checks the request, stores a
``generation_jobs`` row and answers 202 at once; the generation itself runs right after the
response inside the API process (FastAPI background task). There is no queue service and no worker:

- ``run_job`` holds one process-wide lock, so local generations run one at a time (the brief: "one
  content item at a time initially").
- It opens its own DB session and calls ``services.content.generate_content`` with the stored
  request as the user who asked, so access, validation, the AI allow-list, audit and history are
  exactly those of a direct generation. The result (content ids, pack id, fallback reason) is kept.
- An AppError becomes ``failed`` with its code; anything else ``failed`` with INTERNAL (logged).
- On API start-up (``mark_interrupted``) jobs left pending or running by a restart become
  ``failed`` with INTERRUPTED; the teacher simply asks again.

Job JSON::

    {id, child_id, status, error_code, result: {content_ids, pack_id, fallback_reason} | null,
     request: {mode, content_type, ...}, created_at, started_at, finished_at}
"""
import logging
import threading

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import access
from app.errors import AppError
from app.models import GenerationJob, User
from app.schemas.content import GenerateIn
from app.services import content as content_svc
from app.services.settings import effective_ai
from app.sessions import utcnow

log = logging.getLogger("app.jobs")

_LOCK = threading.Lock()


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def job_out(job: GenerationJob) -> dict:
    return {
        "id": str(job.id),
        "child_id": str(job.child_id),
        "status": job.status,
        "error_code": job.error_code,
        "result": job.result,
        "request": job.request,
        "created_at": _iso(job.created_at),
        "started_at": _iso(job.started_at),
        "finished_at": _iso(job.finished_at),
    }


def runs_in_background(db: Session) -> bool:
    return effective_ai(db).mode == "local"


def create_job(db: Session, user: User, child_id, body: GenerateIn) -> GenerationJob:
    """Check the request now (so mistakes are reported at once), then store the job."""
    child = content_svc.check_generate(db, user, child_id, body)
    job = GenerationJob(child_id=child.id, request=body.model_dump(mode="json"), created_by=user.id)
    db.add(job)
    db.commit()
    return job


def run_job(job_id) -> None:
    from app.db import SessionLocal

    with _LOCK, SessionLocal() as db:
        job = db.get(GenerationJob, job_id)
        if job is None or job.status != "pending":
            return
        job.status, job.started_at = "running", utcnow()
        db.commit()
        user = db.get(User, job.created_by) if job.created_by else None
        try:
            if user is None or not user.is_active:
                raise AppError("FORBIDDEN")
            out = content_svc.generate_content(db, user, job.child_id, GenerateIn.model_validate(job.request))
            ids = [i["id"] for i in out["items"]] if "items" in out else [out["content"]["id"]]
            result = {"content_ids": ids, "pack_id": out.get("pack_id"), "fallback_reason": out.get("fallback_reason")}
            status, code = "done", None
        except AppError as e:
            db.rollback()
            result, status, code = None, "failed", e.code
        except Exception:
            db.rollback()
            log.exception("generation job failed id=%s", job_id)
            result, status, code = None, "failed", "INTERNAL"
        db.execute(update(GenerationJob).where(GenerationJob.id == job_id)
                   .values(status=status, result=result, error_code=code, finished_at=utcnow()))
        db.commit()
        log.info("generation job id=%s status=%s error=%s", job_id, status, code)


def get_job(db: Session, user: User, job_id) -> dict:
    if not access.is_staff(user):
        raise AppError("NOT_FOUND")
    job = access.get_child_row_or_404(db, user, GenerationJob, job_id)
    return {"job": job_out(job)}


def list_jobs(db: Session, user: User, child_id, open_only: bool = False) -> dict:
    if not access.is_staff(user):
        raise AppError("NOT_FOUND")
    child = access.get_child_or_404(db, user, child_id)
    stmt = select(GenerationJob).where(GenerationJob.child_id == child.id)
    if open_only:
        stmt = stmt.where(GenerationJob.status.in_(("pending", "running")))
    rows = db.scalars(stmt.order_by(GenerationJob.created_at.desc()).limit(20)).all()
    return {"jobs": [job_out(j) for j in rows]}


def mark_interrupted(db: Session) -> int:
    """Jobs a restart left behind cannot finish: mark them failed (INTERRUPTED)."""
    res = db.execute(update(GenerationJob).where(GenerationJob.status.in_(("pending", "running")))
                     .values(status="failed", error_code="INTERRUPTED", finished_at=utcnow()))
    db.commit()
    return res.rowcount or 0
