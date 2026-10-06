"""Functional summaries, Domain 17 (/children/{id}/functional-summaries..., /functional-summaries/{sid}/approve).

Paths are relative to /api (no router prefix); main.py includes this module.

- GET  /children/{id}/functional-summaries          → {latest_approved, drafts, history, ai_drafts}
- POST /children/{id}/functional-summaries          SummaryIn → 201 {summary}  (a new draft row)
- POST /children/{id}/functional-summaries/suggest  [SummarySuggestIn] → {draft, suggestion_id, ...}
       (stores the AI suggestion only, never a summary row)
- POST /functional-summaries/{sid}/approve          [SummaryApproveIn] → {summary}
       409 SUMMARY_APPROVED when it is already approved

Staff only: parents and out-of-scope users get 404. See app/services/functional_summaries.py.
"""
from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas.functional_summaries import SummaryApproveIn, SummaryIn, SummarySuggestIn
from app.services import functional_summaries as svc

router = APIRouter(tags=["functional_summaries"])


@router.get("/children/{child_id}/functional-summaries")
def list_summaries(child_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.list_summaries(db, user, child_id)


@router.post("/children/{child_id}/functional-summaries", status_code=201)
def create_summary(child_id: str, body: SummaryIn, db: DB, user: CurrentUser) -> dict:
    return svc.create_summary(db, user, child_id, body)


@router.post("/children/{child_id}/functional-summaries/suggest")
def suggest_summary(child_id: str, db: DB, user: CurrentUser, body: SummarySuggestIn | None = None) -> dict:
    return svc.suggest_summary(db, user, child_id, body)


@router.post("/functional-summaries/{summary_id}/approve")
def approve_summary(summary_id: str, db: DB, user: CurrentUser, body: SummaryApproveIn | None = None) -> dict:
    return svc.approve_summary(db, user, summary_id, body)
