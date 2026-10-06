"""Functional summaries (Domain 17, סיכום תפקודי קצר; COVERAGE-MATRIX §3.2.5, §4.3, X-18, X-25).

Staff only; parents (and anyone out of scope) get 404.

Never overwritten: every save inserts a new ``functional_summaries`` row (an edit of
an earlier version names it in ``supersedes_id``); the only update the DB allows is
draft → approved (with approved_by / approved_at, and optionally the review or
observation cycle it belongs to). A second approval returns 409 SUMMARY_APPROVED.

- ``list_summaries``  → {latest_approved, drafts[], history[], ai_drafts{suggestion_id: draft}}
  ``drafts`` are the draft rows nothing supersedes (newest first); ``history`` is every
  row, newest first; ``ai_drafts`` are the AI drafts the rows started from, for
  "compare with the AI draft".
- ``create_summary``  → 201 {summary}. Teacher text gets the wording check (422
  UNSAFE_CONTENT). ``source='ai_draft'`` needs the ``ai_suggestion_id`` of the
  /suggest call; that suggestion becomes ``accepted`` (saved as drafted) or ``edited``.
- ``suggest_summary`` → {draft, suggestion_id, provider, is_template, possible_patterns,
  next_observation_questions}. A de-identified AI draft through
  ``app.ai.service.draft_functional_summary(db, child, lang, user) -> (draft, AiSuggestion)``
  (WP2-AI); it inserts the ai_suggestions row only, never a summary row. The draft
  never fills ``follow_up_with_parents``.
- ``approve_summary`` → {summary}.

Summary JSON::

    {id, child_id, supersedes_id, superseded_by, review_id, assessment_id,
     general_description, main_strengths: {items: [{key}|{custom}], text},
     main_needs: {items: [text], text}, adaptations, follow_up_with_parents,
     team_recommendations, source: manual|ai_draft, ai_suggestion_id,
     status: draft|approved, approved_by: {id, name} | null, approved_at,
     created_by: {id, name} | null, created_at, provenance: [badge]}
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access, provenance, vocab
from app.access import get_child_row_or_404
from app.ai import service as ai_service
from app.ai.safety import text_issues
from app.audit import audit
from app.errors import AppError
from app.models import AiSuggestion, DevelopmentReview, FunctionalSummary, User
from app.schemas.functional_summaries import SummaryApproveIn, SummaryIn, SummarySuggestIn
from app.schemas.profile import ident
from app.services.focus_areas import check_assessment
from app.services.observations import staff_child
from app.services.profiles import iso
from app.services.reviews import find_suggestion
from app.sessions import utcnow

KIND = "functional_summary"
TEXT_FIELDS = ("general_description", "adaptations", "follow_up_with_parents", "team_recommendations")
AI_TEXT_FIELDS = ("general_description", "adaptations", "team_recommendations")


def _invalid(path: str, message: str) -> AppError:
    return AppError("VALIDATION", details=[{"path": path, "message": message}])


def _names(db: Session, ids) -> dict:
    ids = {i for i in ids if i is not None}
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all()) if ids else {}


def _ref(user_id, names: dict) -> dict | None:
    return {"id": str(user_id), "name": names.get(user_id)} if user_id else None


def _row_provenance(row: FunctionalSummary) -> list[dict]:
    if row.status == "approved":
        return provenance.badges(approved=True)
    if row.source == "ai_draft":
        return provenance.badges(ai_outcome="pending")  # AI SUGGESTED until a teacher approves it
    return []


def summary_out(row: FunctionalSummary, names: dict, superseded_by=None) -> dict:
    return {
        "id": str(row.id),
        "child_id": str(row.child_id),
        "supersedes_id": str(row.supersedes_id) if row.supersedes_id else None,
        "superseded_by": str(superseded_by) if superseded_by else None,
        "review_id": str(row.review_id) if row.review_id else None,
        "assessment_id": str(row.assessment_id) if row.assessment_id else None,
        "general_description": row.general_description,
        "main_strengths": row.main_strengths or {"items": [], "text": None},
        "main_needs": row.main_needs or {"items": [], "text": None},
        "adaptations": row.adaptations,
        "follow_up_with_parents": row.follow_up_with_parents,
        "team_recommendations": row.team_recommendations,
        "source": row.source,
        "ai_suggestion_id": str(row.ai_suggestion_id) if row.ai_suggestion_id else None,
        "status": row.status,
        "approved_by": _ref(row.approved_by, names),
        "approved_at": iso(row.approved_at),
        "created_by": _ref(row.created_by, names),
        "created_at": iso(row.created_at),
        "provenance": _row_provenance(row),
    }


# --------------------------------------------------------------------------- draft shape


def _clip(text, limit: int) -> str | None:
    return text.strip()[:limit] if isinstance(text, str) and text.strip() else None


def _strength_item(raw) -> dict | None:
    if isinstance(raw, str):
        raw = {"key": raw}
    if not isinstance(raw, dict):
        return None
    key = raw.get("key")
    if isinstance(key, str) and vocab.is_valid("strengths", key):
        return {"key": key}
    text = _clip(raw.get("custom") or raw.get("label") or (key if isinstance(key, str) else None), 120)
    return {"custom": text} if text else None


def _need_text(raw) -> str | None:
    if isinstance(raw, dict):
        raw = raw.get("text") or raw.get("label") or raw.get("custom")
    return _clip(raw, 300)


def _block(value, item_fn) -> dict:
    if isinstance(value, dict):
        items, text = value.get("items"), value.get("text")
    elif isinstance(value, list):
        items, text = value, None
    else:
        items, text = [], value
    out, seen = [], set()
    for raw in items if isinstance(items, list) else []:
        item = item_fn(raw)
        mark = ident(item) if isinstance(item, dict) else item
        if item and mark not in seen:
            seen.add(mark)
            out.append(item)
    return {"items": out[:10], "text": _clip(text, 1000)}


def draft_fields(draft) -> dict:
    """Any AI draft (FunctionalSummaryDraft or a dict) in the summary's own shape. The AI never
    fills follow_up_with_parents, involvement, focus decisions or closing fields."""
    if hasattr(draft, "model_dump"):
        draft = draft.model_dump(mode="json")
    d = draft if isinstance(draft, dict) else {}
    return {
        "general_description": _clip(d.get("general_description"), 4000),
        "main_strengths": _block(d.get("main_strengths"), _strength_item),
        "main_needs": _block(d.get("main_needs") or d.get("areas_for_support"), _need_text),
        "adaptations": _clip(d.get("adaptations"), 2000),
        "follow_up_with_parents": None,
        "team_recommendations": _clip(d.get("team_recommendations"), 1000),
    }


def _same(a: dict, b: dict) -> bool:
    def norm(t):
        return " ".join(t.split()) if isinstance(t, str) else ""

    if any(norm(a.get(f)) != norm(b.get(f)) for f in AI_TEXT_FIELDS):
        return False
    sa, sb = a.get("main_strengths") or {}, b.get("main_strengths") or {}
    na, nb = a.get("main_needs") or {}, b.get("main_needs") or {}
    return ({ident(i) for i in sa.get("items") or []} == {ident(i) for i in sb.get("items") or []}
            and norm(sa.get("text")) == norm(sb.get("text"))
            and [norm(t) for t in na.get("items") or []] == [norm(t) for t in nb.get("items") or []]
            and norm(na.get("text")) == norm(nb.get("text")))


# --------------------------------------------------------------------------- endpoints


def list_summaries(db: Session, user: User, child_id) -> dict:
    child = staff_child(db, user, child_id)
    rows = db.scalars(select(FunctionalSummary).where(FunctionalSummary.child_id == child.id)
                      .order_by(FunctionalSummary.created_at.desc(), FunctionalSummary.id.desc())).all()
    superseded_by = {r.supersedes_id: r.id for r in reversed(rows) if r.supersedes_id}
    names = _names(db, [r.created_by for r in rows] + [r.approved_by for r in rows])
    approved = sorted((r for r in rows if r.status == "approved"), key=lambda r: (r.approved_at, r.created_at),
                      reverse=True)
    suggestion_ids = {r.ai_suggestion_id for r in rows if r.ai_suggestion_id}
    ai_drafts = {}
    if suggestion_ids:
        for s in db.scalars(select(AiSuggestion).where(AiSuggestion.id.in_(suggestion_ids))):
            ai_drafts[str(s.id)] = draft_fields(s.output)

    def out(r):
        return summary_out(r, names, superseded_by.get(r.id))

    return {
        "latest_approved": out(approved[0]) if approved else None,
        "drafts": [out(r) for r in rows if r.status == "draft" and r.id not in superseded_by],
        "history": [out(r) for r in rows],
        "ai_drafts": ai_drafts,
    }


def _check_wording(body: SummaryIn) -> None:
    texts = [(f, getattr(body, f)) for f in TEXT_FIELDS]
    texts += [("main_strengths.text", body.main_strengths.text), ("main_needs.text", body.main_needs.text)]
    texts += [(f"main_strengths.items.{i}.custom", it.custom) for i, it in enumerate(body.main_strengths.items)]
    texts += [(f"main_needs.items.{i}", t) for i, t in enumerate(body.main_needs.items)]
    details = [{"path": path, "message": issue} for path, text in texts if text for issue in text_issues(text, False)]
    if details:
        raise AppError("UNSAFE_CONTENT", "Please describe what you see in everyday words.", details=details[:20])


def _owned(db: Session, model, row_id, child_id, path: str):
    if row_id is None:
        return None
    found = db.scalar(select(model.id).where(model.id == row_id, model.child_id == child_id))
    if found is None:
        raise _invalid(path, "not found for this child")
    return found


def create_summary(db: Session, user: User, child_id, body: SummaryIn) -> dict:
    child = staff_child(db, user, child_id)
    _check_wording(body)
    strengths = []
    for i, it in enumerate(body.main_strengths.items):
        if it.key is not None and not vocab.is_valid("strengths", it.key):
            raise _invalid(f"main_strengths.items.{i}.key", f"unknown strengths key {it.key!r}")
        item = {"key": it.key} if it.key else {"custom": it.custom}
        if ident(item) not in {ident(s) for s in strengths}:
            strengths.append(item)
    supersedes = _owned(db, FunctionalSummary, body.supersedes_id, child.id, "supersedes_id")
    review_id = _owned(db, DevelopmentReview, body.review_id, child.id, "review_id")
    assessment_id = check_assessment(db, child.id, body.assessment_id)
    suggestion = find_suggestion(db, child.id, body.ai_suggestion_id, KIND) if body.ai_suggestion_id else None

    fields = {
        "general_description": body.general_description,
        "main_strengths": {"items": strengths, "text": body.main_strengths.text},
        "main_needs": {"items": list(dict.fromkeys(body.main_needs.items)), "text": body.main_needs.text},
        "adaptations": body.adaptations,
        "follow_up_with_parents": body.follow_up_with_parents,
        "team_recommendations": body.team_recommendations,
    }
    row = FunctionalSummary(child_id=child.id, supersedes_id=supersedes, review_id=review_id,
                            assessment_id=assessment_id, source=body.source,
                            ai_suggestion_id=suggestion.id if suggestion is not None else None,
                            status="draft", created_by=user.id, **fields)
    db.add(row)
    db.flush()
    if suggestion is not None:
        outcome = "accepted" if _same(draft_fields(suggestion.output), fields) else "edited"
        ai_service.resolve_suggestion(db, suggestion.id, child_id=child.id, outcome=outcome,
                                      used_by_type="functional_summary", used_by_id=row.id)
    audit(db, user, "summary.create", "functional_summary", row.id, child_id=child.id, source=body.source,
          supersedes_id=str(supersedes) if supersedes else None,
          ai_suggestion_id=str(suggestion.id) if suggestion is not None else None)
    db.flush()
    db.refresh(row)
    out = summary_out(row, {user.id: user.name})
    db.commit()
    return {"summary": out}


def suggest_summary(db: Session, user: User, child_id, body: SummarySuggestIn | None) -> dict:
    child = staff_child(db, user, child_id)
    lang = (body.language if body else None) or user.language or "en"
    # app.ai.service: a de-identified draft (a dict) plus ONE ai_suggestions row (earlier pending
    # ones are discarded); no summary row is written. Flushes only.
    draft, row = ai_service.draft_functional_summary(db, child, lang, user)
    raw = draft if isinstance(draft, dict) else {}
    audit(db, user, "summary.suggest", "ai_suggestion", row.id, child_id=child.id, provider=row.provider,
          is_template=row.is_template)
    out = {
        "draft": draft_fields(raw),
        "suggestion_id": str(row.id),
        "provider": row.provider,
        "is_template": row.is_template,
        "possible_patterns": list(raw.get("possible_patterns") or []),
        "next_observation_questions": list(raw.get("next_observation_questions") or []),
    }
    db.commit()
    return out


def approve_summary(db: Session, user: User, summary_id, body: SummaryApproveIn | None) -> dict:
    if not access.is_staff(user):
        raise AppError("NOT_FOUND")
    row = get_child_row_or_404(db, user, FunctionalSummary, summary_id, lock=True)
    if row.status == "approved":
        raise AppError("SUMMARY_APPROVED")
    newer = db.scalar(select(FunctionalSummary.id).where(FunctionalSummary.supersedes_id == row.id).limit(1))
    if newer is not None:
        raise AppError("CONFLICT", "A newer version of this summary exists. Approve that one instead.",
                       details={"superseded_by": str(newer)})
    body = body or SummaryApproveIn()
    if body.review_id is not None:
        row.review_id = _owned(db, DevelopmentReview, body.review_id, row.child_id, "review_id")
    if body.assessment_id is not None:
        row.assessment_id = check_assessment(db, row.child_id, body.assessment_id)
    row.status = "approved"
    row.approved_by = user.id
    row.approved_at = utcnow()
    audit(db, user, "summary.approve", "functional_summary", row.id, child_id=row.child_id, source=row.source)
    db.flush()
    db.refresh(row)
    names = _names(db, [row.created_by, row.approved_by])
    out = summary_out(row, names)
    db.commit()
    return {"summary": out}
