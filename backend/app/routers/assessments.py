"""Teacher full observation: observation cycles and domain documents (COVERAGE-MATRIX §4.2).

Paths are relative to /api (no router prefix). Staff only: parents get 404 everywhere.

- GET   /children/{id}/teacher-assessments
        → {current: assessment | null, earlier: [{id, kind, number, status, filled_on, period_from,
           period_to, closed_at}]}   (current = the open cycle, else the latest one)
- POST  /children/{id}/teacher-assessments  AssessmentCreate → 201 {assessment}
        (409 ASSESSMENT_OPEN when a cycle is open; copy_forward copies the previous cycle)
- GET   /teacher-assessments/{aid} → {assessment}
- PATCH /teacher-assessments/{aid}  AssessmentHeaderPatch → {assessment}   (409 ASSESSMENT_CLOSED)
- PUT   /teacher-assessments/{aid}/domains/{domain}  {status, data}
        → {domain, status, data, entry_id, updated_at, updated_by_name, provenance, warnings[]}
        Every call appends an entry. Warnings never block: [{code: wording | strengths_below_3,
        path, message}].
- GET   /teacher-assessments/{aid}/domains/{domain}/history → {assessment_id, domain, entries[]} newest first
- POST  /teacher-assessments/{aid}/close → {assessment}  (the cycle becomes immutable)
- POST  /teacher-assessments/{aid}/apply  {list, domain, items[]} → {list, items, added}
- POST  /teacher-assessments/{aid}/needs/{i}/focus  {title?, category?} → 201 {focus_area}
        (409 FOCUS_LIMIT at 3 active focus areas; 409 DUPLICATE when already promoted)

See app/services/assessments.py for the shapes.
"""
from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas.assessments import AssessmentApply, AssessmentCreate, AssessmentDomain, AssessmentHeaderPatch, DomainPut, NeedFocus
from app.services import assessments as svc

router = APIRouter(tags=["assessments"])


@router.get("/children/{child_id}/teacher-assessments")
def list_assessments(child_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.list_assessments(db, user, child_id)


@router.post("/children/{child_id}/teacher-assessments", status_code=201)
def create_assessment(child_id: str, body: AssessmentCreate, db: DB, user: CurrentUser) -> dict:
    return svc.create_assessment(db, user, child_id, body)


@router.get("/teacher-assessments/{assessment_id}")
def get_assessment(assessment_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.get_assessment(db, user, assessment_id)


@router.patch("/teacher-assessments/{assessment_id}")
def update_assessment(assessment_id: str, body: AssessmentHeaderPatch, db: DB, user: CurrentUser) -> dict:
    return svc.update_header(db, user, assessment_id, body)


@router.put("/teacher-assessments/{assessment_id}/domains/{domain}")
def put_domain(assessment_id: str, domain: AssessmentDomain, body: DomainPut, db: DB, user: CurrentUser) -> dict:
    return svc.put_domain(db, user, assessment_id, domain, body)


@router.get("/teacher-assessments/{assessment_id}/domains/{domain}/history")
def domain_history(assessment_id: str, domain: AssessmentDomain, db: DB, user: CurrentUser) -> dict:
    return svc.domain_history(db, user, assessment_id, domain)


@router.post("/teacher-assessments/{assessment_id}/close")
def close_assessment(assessment_id: str, db: DB, user: CurrentUser) -> dict:
    return svc.close_assessment(db, user, assessment_id)


@router.post("/teacher-assessments/{assessment_id}/apply")
def apply_to_profile(assessment_id: str, body: AssessmentApply, db: DB, user: CurrentUser) -> dict:
    return svc.apply_to_profile(db, user, assessment_id, body)


@router.post("/teacher-assessments/{assessment_id}/needs/{index}/focus", status_code=201)
def need_to_focus(assessment_id: str, index: int, body: NeedFocus, db: DB, user: CurrentUser) -> dict:
    return svc.need_to_focus(db, user, assessment_id, index, body)
