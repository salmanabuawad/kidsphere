"""GET /api/source-model: the static source-document registries (authenticated).

``{"parent_questionnaire": {...}, "observation_model": {...}}`` read from
app/data/source/*.json (see app.vocab.source_model). A registry that does not
exist yet is ``{}``. No per-child data, so the response may be cached privately.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import vocab
from app.deps import CurrentUser

router = APIRouter(tags=["options"])


@router.get("/source-model")
def source_model(user: CurrentUser) -> JSONResponse:
    return JSONResponse(vocab.source_model(), headers={"Cache-Control": "private, max-age=300"})
