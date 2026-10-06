"""Stored AI suggestions: ``ai_suggestions`` (COVERAGE-MATRIX §7.9; X-19).

Every analysis call (understanding, functional summary) keeps one row: the
de-identified payload that was (or, with the template provider, would have been)
sent, the output as the teacher saw it (names restored), the provider and the AI
domains sent. Rows are never changed except ONE resolution of a pending outcome
(DB trigger ``ai_suggestions_guard``).

    persist(db, *, child_id, kind, user, provider, model, is_template, fallback_reason,
            domains, input, output) -> AiSuggestion
        Discards the child's earlier PENDING suggestions of the same kind (the teacher
        left them: "discarded, lazily on the next suggest"), inserts the new row and
        flushes. The caller commits.
    resolve(db, suggestion_id, *, child_id, outcome, used_by_type=None, used_by_id=None)
        -> AiSuggestion | None
        One UPDATE pending -> accepted | edited | discarded (+ used_by_type
        'development_review' | 'functional_summary', used_by_id, resolved_at). None
        when the id is not this child's or is no longer pending. Flushes only.
    suggestion_out(row, names=None) -> dict
    list_suggestions(db, user, child_id, kind=None) -> {"suggestions": [...]}
        GET /api/children/{id}/ai-suggestions (staff only; parents get 404). Newest first.
"""
import uuid

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import access, provenance
from app.errors import AppError
from app.models import (
    AI_SUGGESTION_KIND_VALUES,
    AI_SUGGESTION_OUTCOME_VALUES,
    AI_SUGGESTION_USED_BY_VALUES,
    AiSuggestion,
    User,
)
from app.services.history import jsonable
from app.sessions import utcnow

MAX_LIST = 100


def persist(db: Session, *, child_id, kind: str, user: User | None, provider: str, model: str | None,
            is_template: bool, fallback_reason: str | None, domains, input: dict, output: dict) -> AiSuggestion:
    if kind not in AI_SUGGESTION_KIND_VALUES:
        raise ValueError(f"unknown suggestion kind {kind!r}")
    now = utcnow()
    db.execute(
        update(AiSuggestion)
        .where(AiSuggestion.child_id == child_id, AiSuggestion.kind == kind, AiSuggestion.outcome == "pending")
        .values(outcome="discarded", resolved_at=now)
        .execution_options(synchronize_session=False)
    )
    row = AiSuggestion(
        child_id=child_id,
        kind=kind,
        provider=provider,
        model=model,
        is_template=bool(is_template),
        fallback_reason=fallback_reason,
        domains=list(domains or []),
        input=jsonable(input),
        output=jsonable(output),
        outcome="pending",
        created_by=user.id if user is not None else None,
    )
    db.add(row)
    db.flush()
    return row


def resolve(db: Session, suggestion_id, *, child_id, outcome: str, used_by_type: str | None = None,
            used_by_id=None) -> AiSuggestion | None:
    if outcome not in AI_SUGGESTION_OUTCOME_VALUES or outcome == "pending":
        raise ValueError(f"cannot resolve to {outcome!r}")
    if used_by_type is not None and used_by_type not in AI_SUGGESTION_USED_BY_VALUES:
        raise ValueError(f"unknown used_by_type {used_by_type!r}")
    try:
        sid = uuid.UUID(str(suggestion_id))
    except ValueError:
        return None
    done = db.execute(
        update(AiSuggestion)
        .where(AiSuggestion.id == sid, AiSuggestion.child_id == child_id, AiSuggestion.outcome == "pending")
        .values(outcome=outcome, used_by_type=used_by_type, used_by_id=used_by_id, resolved_at=utcnow())
        .returning(AiSuggestion.id)
        .execution_options(synchronize_session=False)
    ).first()
    if done is None:
        return None
    return db.scalars(select(AiSuggestion).where(AiSuggestion.id == sid)
                      .execution_options(populate_existing=True)).one()


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def suggestion_out(row: AiSuggestion, names: dict | None = None) -> dict:
    names = names or {}
    return {
        "id": str(row.id),
        "child_id": str(row.child_id),
        "kind": row.kind,
        "provider": row.provider,
        "model": row.model,
        "is_template": row.is_template,
        "fallback_reason": row.fallback_reason,
        "domains": list(row.domains or []),
        "input": row.input,
        "output": row.output,
        "outcome": row.outcome,
        "used_by_type": row.used_by_type,
        "used_by_id": str(row.used_by_id) if row.used_by_id else None,
        "created_by": {"id": str(row.created_by), "name": names.get(row.created_by)} if row.created_by else None,
        "created_at": _iso(row.created_at),
        "resolved_at": _iso(row.resolved_at),
        "provenance": provenance.derive(ai_outcome=row.outcome),
    }


def list_suggestions(db: Session, user: User, child_id, kind: str | None = None) -> dict:
    if not access.is_staff(user):
        raise AppError("NOT_FOUND", "Child not found.")
    child = access.get_child_or_404(db, user, child_id)
    stmt = select(AiSuggestion).where(AiSuggestion.child_id == child.id)
    if kind is not None:
        stmt = stmt.where(AiSuggestion.kind == kind)
    rows = db.scalars(stmt.order_by(AiSuggestion.created_at.desc(), AiSuggestion.id.desc()).limit(MAX_LIST)).all()
    ids = {r.created_by for r in rows if r.created_by}
    names = dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all()) if ids else {}
    return {"suggestions": [suggestion_out(r, names) for r in rows]}
