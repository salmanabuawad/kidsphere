"""Stored AI suggestions (X-19; COVERAGE-MATRIX §4.5).

- GET /children/{id}/ai-suggestions?kind → {"suggestions": [...]}
  Staff only (parents and out-of-scope ids get 404). Each suggestion holds the
  de-identified input that was sent (or would have been, with templates), the
  output the teacher saw, the AI domains sent, the provider and the outcome
  (pending / accepted / edited / discarded), newest first. See app/ai/suggestions.py.
"""
from typing import Literal

from fastapi import APIRouter

from app.ai import suggestions as svc
from app.deps import DB, CurrentUser

router = APIRouter(tags=["ai"])

SuggestionKind = Literal["understanding", "functional_summary", "observation_questions"]


@router.get("/children/{child_id}/ai-suggestions")
def list_ai_suggestions(child_id: str, db: DB, user: CurrentUser, kind: SuggestionKind | None = None) -> dict:
    return svc.list_suggestions(db, user, child_id, kind=kind)
