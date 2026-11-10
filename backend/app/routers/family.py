"""Family and home (migration 0010): parents' home reflections and the suggested next steps.

- POST /content/{id}/home-reflections  HomeReflectionIn {result, note?, client_request_id?}
       parents only, on content shared with them → 201 {reflection}; a repeated client_request_id → 200
       (staff 403, content not visible to the parent 404). See app/services/home_reflections.py.
- GET  /content/{id}/home-reflections  staff: all; a parent: their own → {reflections}
- GET  /children/{id}/home-reflections  staff only (parents 404) → {reflections} with content title/type
- GET  /children/{id}/next-steps  staff only → {focus_areas: [...]} (app/services/next_steps.py)
"""
from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.deps import DB, CurrentUser
from app.schemas.family import HomeReflectionIn
from app.services import home_reflections as svc
from app.services import next_steps as next_svc

router = APIRouter(tags=["family"])


@router.post("/content/{content_id}/home-reflections", status_code=201)
def create_home_reflection(content_id: str, body: HomeReflectionIn, response: Response, db: DB,
                           user: CurrentUser) -> dict:
    out, created = svc.create_reflection(db, user, content_id, body)
    if not created:
        response.status_code = 200
    return out


@router.get("/content/{content_id}/home-reflections")
def content_home_reflections(content_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.list_for_content(db, user, content_id)


@router.get("/children/{child_id}/home-reflections")
def child_home_reflections(child_id: str, db: DB, user: CurrentUser,
                           limit: Annotated[int, Query(ge=1, le=100)] = 30) -> dict:
    return svc.list_for_child(db, user, child_id, limit)


@router.get("/children/{child_id}/next-steps")
def child_next_steps(child_id: str, db: DB, user: CurrentUser) -> dict:
    return next_svc.next_steps(db, user, child_id)


# --------------------------------------------------------------------------- family programs (0012)
# - GET  /family-programs                      staff (admins also see drafts and archived) → {programs}
# - GET  /family-programs/{id}                 staff → {program}
# - POST /admin/family-programs  ProgramCreate admin → 201 {program}
# - PUT  /admin/family-programs/{id}           admin → {program}
# - GET  /children/{id}/family-programs        staff and the child's parents → {enrolments}
# - POST /children/{id}/family-programs  EnrolIn  staff → 201 {enrolment}  (409 DUPLICATE when active)
# - PUT  /family-enrolments/{id}  {status}     staff → {enrolment}
# - POST /family-enrolments/{id}/reflections  WeekReflectionIn  parent (result) or staff (note) → 201 {enrolment}

from app.deps import AdminUser  # noqa: E402
from app.schemas.family import EnrolIn, EnrolmentUpdate, ProgramCreate, ProgramUpdate, WeekReflectionIn  # noqa: E402
from app.services import family_programs as programs  # noqa: E402


@router.get("/family-programs")
def list_family_programs(db: DB, user: CurrentUser) -> dict:
    return programs.list_programs(db, user)


@router.get("/family-programs/{program_id}")
def get_family_program(program_id: str, db: DB, user: CurrentUser) -> dict:
    return programs.get_program(db, user, program_id)


@router.post("/admin/family-programs", status_code=201)
def create_family_program(body: ProgramCreate, db: DB, user: AdminUser) -> dict:
    return programs.create_program(db, user, body)


@router.put("/admin/family-programs/{program_id}")
def update_family_program(program_id: str, body: ProgramUpdate, db: DB, user: AdminUser) -> dict:
    return programs.update_program(db, user, program_id, body)


@router.get("/children/{child_id}/family-programs")
def child_family_programs(child_id: str, db: DB, user: CurrentUser) -> dict:
    return programs.list_enrolments(db, user, child_id)


@router.post("/children/{child_id}/family-programs", status_code=201)
def enrol_child(child_id: str, body: EnrolIn, db: DB, user: CurrentUser) -> dict:
    return programs.enrol(db, user, child_id, body)


@router.put("/family-enrolments/{enrolment_id}")
def update_family_enrolment(enrolment_id: str, body: EnrolmentUpdate, db: DB, user: CurrentUser) -> dict:
    return programs.update_enrolment(db, user, enrolment_id, body)


@router.post("/family-enrolments/{enrolment_id}/reflections", status_code=201)
def add_week_reflection(enrolment_id: str, body: WeekReflectionIn, db: DB, user: CurrentUser) -> dict:
    return programs.add_reflection(db, user, enrolment_id, body)


# --------------------------------------------------------------------------- Parent Copilot
# - POST /copilot/ask  CopilotAsk {child_id, question? | topic?, language?}  parents and staff of the child
#        → {kind: guidance|safety|no_match, article_key, source: guidance|local_ai, answer, topics, suggested_content}

from app.schemas.family import CopilotAsk  # noqa: E402
from app.services import copilot  # noqa: E402


@router.post("/copilot/ask")
def copilot_ask(body: CopilotAsk, db: DB, user: CurrentUser) -> dict:
    return copilot.ask(db, user, body.child_id, body.question, body.topic, body.language)


@router.get("/copilot/topics")
def copilot_topics(user: CurrentUser, language: str | None = None) -> dict:
    lang = language if language in copilot.LANGS else (user.language if user.language in copilot.LANGS else "en")
    return {"topics": copilot.topics(lang)}
