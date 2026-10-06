"""Database reads for the AI payloads (no writes).

    classmate_names(db, child) -> list[str]   names to mask as [friend]
    adult_names(db, child) -> list[str]       names to mask as [adult]
    current_assessment(db, child_id) -> TeacherAssessment | None
        the open observation cycle, else the latest closed one
    assessment_cache(db, child_id) -> dict    its ``domains`` cache ({} when there is none)
    observation_entry(row) -> dict            the minimised observation for the AI
    domain_observations(db, child_id, domains, *, exclude_ids=(), per_domain=3, since=None)
        -> {domain: [entry]}                  the newest observations tagged with each domain
    content_domains(db, child_id, relevant, *, exclude_observation_ids=())
        -> (blocks, avoid)                    what content generation sends per domain

An observation entry carries only ``id, observed_at, context, support_level,
focus_area_id, domains`` (AI domain keys), the descriptive attributes
``frequency / duration_minutes / intensity``, the stage-C help keys
(``details.needs.helps``), the stage-E key ``changed`` (``details.did_it_change``), the
``plan_focus_area_id`` (``details.plan_ref.focus_area_id``) and ``text`` = the observation itself (or
``details.what_i_see``). Never ``note``, ``when_detail.with_whom /
before_event / after_event``, ``what_changed``, ``documentation``, need texts or
any other free text (COVERAGE-MATRIX §7.4). The text is masked and clipped in
app/ai/context.py / app/ai/service.py, not here.
"""
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.ai.domains import AI_DOMAINS, assessment_blocks, help_keys, is_key, teacher_avoid
from app.models import (
    Child,
    ChildParent,
    ChildPerson,
    ChildProfile,
    Class,
    ClassTeacher,
    Observation,
    TeacherAssessment,
    User,
)

INTENSITIES = ("light", "moderate", "strong")
# People of the child's life (child_people) masked as [friend]; a pet's name is not masked, every
# other relation is an adult.
CHILD_RELATIONS = ("sister", "brother", "cousin", "friend")
UNMASKED_RELATIONS = ("pet",)
CHANGE_KEYS = ("yes", "partly", "no")


def _kindergarten_classes(child: Child):
    """The ids of every class of the child's kindergarten (shared yard, mixed activities)."""
    kindergarten = select(Class.kindergarten).where(Class.id == child.class_id).scalar_subquery()
    return select(Class.id).where(Class.kindergarten == kindergarten)


def classmate_names(db: Session, child: Child) -> list[str]:
    """Names (full and preferred) of the other children, for masking in AI input as [friend]:
    every child of the same kindergarten and every child without a class; every other child
    when this one has no class. Also the children in the child's people list."""
    stmt = select(Child.name, Child.preferred_name).where(Child.id != child.id)
    if child.class_id is not None:
        stmt = stmt.where(or_(Child.class_id.in_(_kindergarten_classes(child)), Child.class_id.is_(None)))
    names = [n for row in db.execute(stmt).all() for n in row if n]
    # The sisters, brothers, cousins and friends in the child's people list (services/people.py).
    names += db.scalars(select(ChildPerson.display_name).where(ChildPerson.child_id == child.id,
                                                               ChildPerson.relation.in_(CHILD_RELATIONS))).all()
    return names


def adult_names(db: Session, child: Child) -> list[str]:
    """Names of the adults around the child, for masking in AI input as [adult]: the parent name on
    the child, the linked parent accounts, the parents named in the questionnaire
    (PP.who.parents[].name) and the teachers of the kindergarten's classes (of every
    class when the child has no class), and the adults in the child's people list."""
    names = [child.parent_name]
    names += db.scalars(select(User.name).join(ChildParent, ChildParent.user_id == User.id)
                        .where(ChildParent.child_id == child.id)).all()
    teachers = select(User.name).join(ClassTeacher, ClassTeacher.user_id == User.id)
    if child.class_id is not None:
        teachers = teachers.where(ClassTeacher.class_id.in_(_kindergarten_classes(child)))
    names += db.scalars(teachers.distinct()).all()
    # The parents and guardians the family named in the questionnaire (PQ-INTRO-02), with or
    # without an account: a second parent is otherwise never masked.
    profile = db.scalar(select(ChildProfile).where(ChildProfile.child_id == child.id))
    pp = profile.parent_perspective if profile is not None and isinstance(profile.parent_perspective, dict) else {}
    who = (pp.get("sections") or {}).get("who") if isinstance(pp.get("sections"), dict) else None
    parents = who.get("parents") if isinstance(who, dict) else None
    names += [p["name"] for p in parents or [] if isinstance(p, dict) and isinstance(p.get("name"), str) and p["name"].strip()]
    # The adults in the child's people list (a grandfather, an aunt; services/people.py).
    names += db.scalars(select(ChildPerson.display_name).where(
        ChildPerson.child_id == child.id, ChildPerson.relation.not_in(CHILD_RELATIONS + UNMASKED_RELATIONS))).all()
    return [n for n in names if n]


def current_assessment(db: Session, child_id) -> TeacherAssessment | None:
    open_first = (TeacherAssessment.status == "open").desc()
    return db.scalars(
        select(TeacherAssessment).where(TeacherAssessment.child_id == child_id)
        .order_by(open_first, TeacherAssessment.created_at.desc(), TeacherAssessment.id.desc()).limit(1)
    ).first()


def assessment_cache(db: Session, child_id) -> dict:
    row = current_assessment(db, child_id)
    return row.domains if row is not None and isinstance(row.domains, dict) else {}


def _iso(value):
    return value.isoformat() if isinstance(value, datetime) else value


def observation_text(row) -> str | None:
    """The observation itself, or the structured 'what I see' (stage A). Never the note."""
    text = getattr(row, "observation", None) if not isinstance(row, dict) else row.get("observation")
    if text:
        return text
    details = getattr(row, "details", None) if not isinstance(row, dict) else row.get("details")
    what = details.get("what_i_see") if isinstance(details, dict) else None
    return what if isinstance(what, str) and what.strip() else None


def observation_entry(row: Observation) -> dict:
    details = row.details if isinstance(row.details, dict) else {}
    entry = {
        "id": str(row.id),
        "observed_at": _iso(row.observed_at),
        "context": row.context,
        "support_level": row.support_level,
        "focus_area_id": str(row.focus_area_id) if row.focus_area_id else None,
        "domains": [d for d in (row.domains or []) if d in AI_DOMAINS],
        "text": observation_text(row),
        # Stage C "what the child might need": help keys only, never the text (OM-D14-08).
        "helps": help_keys(details.get("needs")),
    }
    # Stage E "did anything change" (key only, never what_changed) and the plan it applied
    # (OM-D14-09/10, X-38): the review loop needs the result per focus.
    if details.get("did_it_change") in CHANGE_KEYS:
        entry["changed"] = details["did_it_change"]
    ref = details.get("plan_ref")
    if isinstance(ref, dict) and ref.get("focus_area_id"):
        entry["plan_focus_area_id"] = str(ref["focus_area_id"])
    attrs = row.attributes if isinstance(row.attributes, dict) else {}
    if is_key(attrs.get("frequency")):
        entry["frequency"] = attrs["frequency"]
    minutes = attrs.get("duration_minutes")
    if isinstance(minutes, int) and not isinstance(minutes, bool) and 1 <= minutes <= 90:
        entry["duration_minutes"] = minutes
    if attrs.get("intensity") in INTENSITIES:
        entry["intensity"] = attrs["intensity"]
    return entry


def domain_observations(db: Session, child_id, domains, *, exclude_ids=(), per_domain: int = 3,
                        since=None, scan: int = 60) -> dict[str, list[dict]]:
    """The newest observations tagged with each relevant domain (each observation goes to its
    first relevant domain only, so nothing is sent twice)."""
    wanted = [d for d in AI_DOMAINS if d in set(domains or ())]
    if not wanted:
        return {}
    stmt = select(Observation).where(Observation.child_id == child_id, Observation.domains.overlap(wanted))
    if since is not None:
        stmt = stmt.where(Observation.observed_at >= since)
    excluded = {str(i) for i in exclude_ids or ()}
    rows = db.scalars(stmt.order_by(Observation.observed_at.desc(), Observation.id.desc()).limit(scan)).all()
    out: dict[str, list[dict]] = {}
    for row in rows:
        if str(row.id) in excluded or not observation_text(row):
            continue
        domain = next((d for d in wanted if d in (row.domains or [])), None)
        if domain is None or len(out.get(domain, [])) >= per_domain:
            continue
        out.setdefault(domain, []).append(observation_entry(row))
    return out


def content_domains(db: Session, child_id, relevant, *, exclude_observation_ids=(), per_domain: int = 3):
    """Content generation: (raw domain blocks, avoid keys). The blocks hold the relevant domains'
    keys and levels from the latest teacher assessment, their newest tagged observations (not
    those already sent as recent_observations) and the help keys; ``avoid`` holds the sensitivity
    keys the teacher observed (Domain 9)."""
    cache = assessment_cache(db, child_id)
    blocks = assessment_blocks(cache, relevant)
    observed = domain_observations(db, child_id, relevant, exclude_ids=exclude_observation_ids, per_domain=per_domain)
    for domain, entries in observed.items():
        block = blocks.setdefault(domain, {"assessment": [], "helps": []})
        block["observations"] = entries
        for entry in entries:
            block["helps"] += [h for h in entry.get("helps") or [] if h not in block["helps"]]
    return blocks, teacher_avoid(cache)
