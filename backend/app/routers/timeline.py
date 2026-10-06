"""Development timeline (GET /children/{id}/timeline).

Paths are relative to /api (no router prefix); main.py includes this module.

- GET /children/{id}/timeline?limit=30&offset=0
      &date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&focus_area_id=<uuid>&domain=<ai domain>
      &content_type=<content type>&result=<feedback result>&type=<entry type>&type=…
      → {"entries": [entry], "limit", "offset", "has_more"}   newest first

``type[]=…`` is accepted as an alias of ``type=…``. Staff only: parents get 404.
See app/services/timeline.py for the entry shape and what each filter keeps.
"""
import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.deps import DB, CurrentUser
from app.models import AI_DOMAIN_VALUES
from app.schemas.common import ContentType, FeedbackResult
from app.services import timeline as svc

router = APIRouter(tags=["timeline"])

EntryType = Literal[svc.ENTRY_TYPES]
AiDomain = Literal[AI_DOMAIN_VALUES]


@router.get("/children/{child_id}/timeline")
def get_timeline(
    child_id: str,
    db: DB,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=svc.MAX_LIMIT)] = svc.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
    date_from: date | None = None,
    date_to: date | None = None,
    focus_area_id: uuid.UUID | None = None,
    domain: AiDomain | None = None,
    content_type: ContentType | None = None,
    result: FeedbackResult | None = None,
    type: Annotated[list[EntryType] | None, Query()] = None,
    type_alias: Annotated[list[EntryType] | None, Query(alias="type[]")] = None,
) -> dict:
    filters = svc.make_filters(date_from=date_from, date_to=date_to, focus_area_id=focus_area_id, domain=domain,
                               content_type=content_type, result=result, types=[*(type or ()), *(type_alias or ())])
    return svc.get_timeline(db, user, child_id, limit=limit, offset=offset, filters=filters)
