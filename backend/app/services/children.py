"""Children: list, create, role-shaped composite, update, archive, photo (WP-05).

Access (ARCHITECTURE §5, PLAN-ADJUSTMENTS B14):
- Every lookup goes through app.access, so an out-of-scope id is a 404.
- Teachers create children only in their own classes and may move a child
  only between their own classes; admins may use any class.
- Parents read basics plus the merged strengths and interests only, and may
  change only PARENT_FIELDS (anything else → 403). Changes are audited with
  field names, never values.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app import access
from app.audit import audit
from app.errors import AppError
from app.models import (
    Baseline,
    Child,
    ChildProfile,
    Class,
    ClassTeacher,
    FocusArea,
    GeneratedContent,
    Observation,
    User,
)
from app.schemas.children import ChildCreateIn, ChildUpdateIn
from app.services import uploads

PARENT_FIELDS = frozenset({"preferred_name", "additional_languages", "parent_name", "parent_contact"})
REQUIRED_FIELDS = frozenset({"name", "birth_date", "class_id", "main_language", "additional_languages"})
PROFILE_LISTS = ("strengths", "interests", "what_helps", "motivators", "sensitivities")
PARENT_PROFILE_LISTS = ("strengths", "interests")
MAX_ACTIVE_FOCUS = 3
PHOTO_DIR = "children"


def today() -> date:
    """Today's date (a function so tests can pin it)."""
    return date.today()


def age_parts(birth_date: date, on: date | None = None) -> dict:
    """Whole years and remaining months on ``on`` (default today); never negative."""
    on = on or today()
    months = (on.year - birth_date.year) * 12 + (on.month - birth_date.month)
    if on.day < birth_date.day:
        months -= 1
    months = max(months, 0)
    return {"years": months // 12, "months": months % 12}


def _iso(value: datetime | date | None) -> str | None:
    return value.isoformat() if value is not None else None


def _class_out(cls: Class | None) -> dict | None:
    if cls is None:
        return None
    return {"id": str(cls.id), "name": cls.name, "kindergarten": cls.kindergarten}


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ───────────────────────────── list ─────────────────────────────

def list_children(db: Session, user: User, class_id: uuid.UUID | None = None, q: str | None = None,
                  include_archived: bool = False) -> list[dict]:
    """Child cards in the user's scope, sorted by name."""
    staff = access.is_staff(user)
    focus_count = (
        select(func.count()).select_from(FocusArea)
        .where(FocusArea.child_id == Child.id, FocusArea.status == "active")
        .correlate(Child).scalar_subquery()
    )
    last_obs = (
        select(func.max(Observation.observed_at)).where(Observation.child_id == Child.id)
        .correlate(Child).scalar_subquery()
    )
    drafts = (
        select(func.count()).select_from(GeneratedContent)
        .where(GeneratedContent.child_id == Child.id, GeneratedContent.status == "draft")
        .correlate(Child).scalar_subquery()
    )
    stmt = (
        access.visible_children(user, include_archived=include_archived)
        .add_columns(Class, ChildProfile.wizard_completed_at, ChildProfile.strengths, focus_count, last_obs, drafts)
        .outerjoin(Class, Class.id == Child.class_id)
        .outerjoin(ChildProfile, ChildProfile.child_id == Child.id)
    )
    if class_id is not None:
        stmt = stmt.where(Child.class_id == class_id)
    if q and q.strip():
        pattern = f"%{_escape_like(q.strip())}%"
        stmt = stmt.where(or_(Child.name.ilike(pattern, escape="\\"), Child.preferred_name.ilike(pattern, escape="\\")))
    # Display name in a language-neutral ICU order (Arabic, Hebrew and Latin names mixed).
    stmt = stmt.order_by(func.coalesce(Child.preferred_name, Child.name).collate("und-x-icu"), Child.id)

    on = today()
    cards = []
    for child, cls, wizard_done, strengths, n_focus, last_at, n_drafts in db.execute(stmt).all():
        card = {
            "id": str(child.id),
            "name": child.name,
            "preferred_name": child.preferred_name,
            "birth_date": child.birth_date.isoformat(),
            "age": age_parts(child.birth_date, on),
            "class": _class_out(cls),
            "main_language": child.main_language,
            "has_photo": bool(child.photo_path),
            "updated_at": _iso(child.updated_at),
        }
        if staff:
            card.update({
                "wizard_completed": wizard_done is not None,
                "active_focus_count": int(n_focus or 0),
                "last_observation_at": _iso(last_at),
                "draft_content_count": int(n_drafts or 0),
                "archived": child.archived_at is not None,
            })
            # Strengths first: the card leads with them ({key|custom, sources}, like the parent view).
            card["strengths"] = _items(strengths, parent_view=True)
        cards.append(card)
    return cards


def placeable_classes(db: Session, user: User) -> list[dict]:
    """Classes this user may put a child in (and filter by): admin all, teacher own, parent none."""
    if user.role == "admin":
        stmt = select(Class)
    elif user.role == "teacher":
        stmt = select(Class).where(Class.id.in_(select(ClassTeacher.class_id).where(ClassTeacher.user_id == user.id)))
    else:
        return []
    stmt = stmt.order_by(Class.kindergarten.collate("und-x-icu"), Class.name.collate("und-x-icu"), Class.id)
    return [_class_out(c) for c in db.scalars(stmt)]


# ───────────────────────────── create ─────────────────────────────

def _check_class(db: Session, user: User, class_id: uuid.UUID) -> Class:
    """The class a child may be placed in by this user: teachers only their own (403)."""
    if user.role == "teacher":
        own = db.scalar(select(exists().where(ClassTeacher.class_id == class_id, ClassTeacher.user_id == user.id)))
        if not own:
            raise AppError("FORBIDDEN", "You can only add children to your own classes.")
    cls = db.get(Class, class_id)
    if cls is None:
        raise AppError("VALIDATION", details=[{"path": "class_id", "message": "Unknown class."}])
    return cls


def create_child(db: Session, user: User, body: ChildCreateIn) -> Child:
    if not access.is_staff(user):
        raise AppError("FORBIDDEN")
    _check_class(db, user, body.class_id)
    child = Child(
        name=body.name,
        preferred_name=body.preferred_name,
        birth_date=body.birth_date,
        gender=body.gender,
        class_id=body.class_id,
        main_language=body.main_language,
        additional_languages=list(body.additional_languages),
        parent_name=body.parent_name,
        parent_contact=body.parent_contact,
        created_by=user.id,
    )
    db.add(child)
    db.flush()
    db.add(ChildProfile(child_id=child.id))
    audit(db, user, "child.create", "child", child.id, child_id=child.id, class_id=body.class_id)
    return child


# ───────────────────────────── composite ─────────────────────────────

def _items(value, parent_view: bool) -> list[dict]:
    """Profile items as stored ({key|custom, sources, ...}); parents get {key|custom, sources} only."""
    out = []
    for raw in value or []:
        if not isinstance(raw, dict) or not (raw.get("key") or raw.get("custom")):
            continue
        if parent_view:
            item = {k: raw[k] for k in ("key", "custom") if raw.get(k)}
            item["sources"] = list(raw.get("sources") or [])
            out.append(item)
        else:
            out.append(dict(raw))
    return out


def _basics(db: Session, child: Child) -> dict:
    cls = db.get(Class, child.class_id) if child.class_id else None
    return {
        "id": str(child.id),
        "name": child.name,
        "preferred_name": child.preferred_name,
        "birth_date": child.birth_date.isoformat(),
        "age": age_parts(child.birth_date),
        "gender": child.gender,
        "class": _class_out(cls),
        "main_language": child.main_language,
        "additional_languages": list(child.additional_languages or []),
        "parent_name": child.parent_name,
        "parent_contact": child.parent_contact,
        "has_photo": bool(child.photo_path),
        "archived": child.archived_at is not None,
        "updated_at": _iso(child.updated_at),
    }


def child_detail(db: Session, user: User, child: Child) -> dict:
    """Role-shaped composite for GET/PUT /api/children/{id}."""
    profile = db.scalar(select(ChildProfile).where(ChildProfile.child_id == child.id))
    out = _basics(db, child)

    if not access.is_staff(user):
        out["view"] = "parent"
        for name in PARENT_PROFILE_LISTS:
            out[name] = _items(getattr(profile, name, None), parent_view=True)
        return out

    out["view"] = "staff"
    for name in PROFILE_LISTS:
        out[name] = _items(getattr(profile, name, None), parent_view=False)
    out["current_understanding"] = profile.current_understanding if profile else None

    focus = db.scalars(
        select(FocusArea).where(FocusArea.child_id == child.id, FocusArea.status == "active")
        .order_by(FocusArea.created_at, FocusArea.id).limit(MAX_ACTIVE_FOCUS)
    ).all()
    out["focus_areas"] = [
        {
            "id": str(f.id),
            "title": f.title,
            "category": f.category,
            "suggestion_key": f.suggestion_key,
            "description": f.description,
            "plan": f.plan,
            "created_at": _iso(f.created_at),
        }
        for f in focus
    ]

    latest = db.scalars(
        select(Observation).where(Observation.child_id == child.id, Observation.observation.is_not(None))
        .order_by(Observation.observed_at.desc(), Observation.created_at.desc()).limit(1)
    ).first()
    out["latest_observation"] = (
        {
            "id": str(latest.id),
            "observed_at": _iso(latest.observed_at),
            "observation": latest.observation,
            "support_level": latest.support_level,
            "source": latest.source,
            "focus_area_id": str(latest.focus_area_id) if latest.focus_area_id else None,
        }
        if latest
        else None
    )
    out["last_observation_at"] = _iso(
        db.scalar(select(func.max(Observation.observed_at)).where(Observation.child_id == child.id))
    )

    out["wizard"] = {
        "step": profile.wizard_step if profile else 1,
        "completed_at": _iso(profile.wizard_completed_at) if profile else None,
    }
    latest_baseline = db.scalar(select(func.max(Baseline.created_at)).where(Baseline.child_id == child.id))
    out["baseline"] = {"exists": latest_baseline is not None, "latest_created_at": _iso(latest_baseline)}
    out["draft_content_count"] = int(db.scalar(
        select(func.count()).select_from(GeneratedContent)
        .where(GeneratedContent.child_id == child.id, GeneratedContent.status == "draft")
    ) or 0)
    return out


def get_child(db: Session, user: User, child_id: str) -> Child:
    """A child the user may read (admins also see archived children)."""
    return access.get_child_or_404(db, user, child_id, include_archived=True)


# ───────────────────────────── update / archive ─────────────────────────────

def update_child(db: Session, user: User, child_id: str, body: ChildUpdateIn) -> Child:
    sent = body.model_fields_set
    staff = access.is_staff(user)
    child = access.get_child_or_404(db, user, child_id, include_archived=True)
    if not staff and not sent <= PARENT_FIELDS:
        raise AppError("FORBIDDEN", "Parents can change only the preferred name, languages and contact details.")

    values = body.model_dump(include=sent)
    missing = [f for f in sent if f in REQUIRED_FIELDS and values[f] is None]
    if missing:
        raise AppError("VALIDATION", details=[{"path": f, "message": "This field is required."} for f in sorted(missing)])

    if "class_id" in sent and values["class_id"] != child.class_id:
        _check_class(db, user, values["class_id"])

    changed = []
    for field in sorted(sent):
        value = values[field]
        if field == "additional_languages":
            value = list(value)
        if getattr(child, field) != value:
            setattr(child, field, value)
            changed.append(field)
    if changed:
        audit(db, user, "child.update", "child", child.id, child_id=child.id, fields=changed)
    return child


def archive_child(db: Session, user: User, child_id: str) -> None:
    child = access.get_child_or_404(db, user, child_id, write=True)
    child.archived_at = func.now()
    audit(db, user, "child.archive", "child", child.id, child_id=child.id)


def unarchive_child(db: Session, user: User, child_id: str) -> Child:
    if user.role != "admin":
        raise AppError("FORBIDDEN")
    child = access.get_child_or_404(db, user, child_id, write=True, include_archived=True)
    if child.archived_at is not None:
        child.archived_at = None
        audit(db, user, "child.unarchive", "child", child.id, child_id=child.id)
    return child


# ───────────────────────────── photo ─────────────────────────────

def get_photo_target(db: Session, user: User, child_id: str) -> Child:
    """The child whose photo this user may change (staff in scope), else 404/403."""
    return access.get_child_or_404(db, user, child_id, write=True, include_archived=True)


def set_photo(db: Session, user: User, child_id: str, data: bytes) -> tuple[Child, str | None]:
    """Store a new photo; returns the child and the old relative path (delete it after commit)."""
    child = get_photo_target(db, user, child_id)
    rel = uploads.save_image(data, PHOTO_DIR)
    old = child.photo_path
    child.photo_path = rel
    audit(db, user, "photo.set", "child", child.id, child_id=child.id)
    return child, old


def delete_photo(db: Session, user: User, child_id: str) -> str | None:
    """Clear the photo; returns the old relative path (delete it after commit)."""
    child = access.get_child_or_404(db, user, child_id, write=True, include_archived=True)
    old = child.photo_path
    if old:
        child.photo_path = None
        audit(db, user, "photo.delete", "child", child.id, child_id=child.id)
    return old


def photo_file(db: Session, user: User, child_id: str):
    """Absolute path of the child's photo for a user who may read the child, else 404."""
    child = access.get_child_or_404(db, user, child_id, include_archived=True)
    if not child.photo_path:
        raise AppError("NOT_FOUND", "No photo.")
    path = uploads.resolve_upload(child.photo_path)
    if not path.is_file():
        raise AppError("NOT_FOUND", "No photo.")
    return path
