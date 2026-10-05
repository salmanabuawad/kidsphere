"""GET /api/options: the shared vocabulary lists (authenticated)."""
from fastapi import APIRouter

from app import vocab
from app.deps import CurrentUser

router = APIRouter(tags=["options"])


@router.get("/options")
def options(user: CurrentUser) -> dict:
    return {"lists": vocab.lists()}
