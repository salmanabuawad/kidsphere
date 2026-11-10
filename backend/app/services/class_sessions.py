"""Class sessions (tables ``class_sessions`` and ``class_session_children``, migration 0009).

A teacher runs a group activity, usually a library item, with children of one of their classes,
then notes how each child did: a support level and an optional short note. Each note is an
ordinary observation (``source = 'session'``, ``session_id``, context ``group_time``), one per child
and session, so it reaches the child's timeline, observation history and AI context like any
other. When the item builds something a child has as an active Current Focus (its ``goals`` hold
that focus's suggestion key), the observation is linked to that focus area.

Staff only (parents 403). Teachers see the sessions of their classes; anything else is 404.
Every note goes to ``record_versions`` and the audit log like a quick observation.

Session JSON (detail adds ``children``)::

    {id, class {id, name}, library_item {id, title, content_type} | null, title, held_on,
     children_count, noted_count, created_by {id, name} | null, created_at,
     children: [{id, name, preferred_name, has_photo, updated_at,
                 observation {id, support_level, observation, focus_area_id, focus_area_title} | null}]}
"""
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import access, vocab
from app.audit import audit
from app.errors import AppError
from app.models import (Child, Class, ClassSession, ClassSessionChild, ClassTeacher, FocusArea, LibraryItem, Observation,
                        User)
from app.reports.i18n import LOCAL_TZ
from app.schemas.class_sessions import ParticipantsIn, SessionCreate, SessionNotesIn
from app.services import history
from app.services.observations import AREA_DOMAINS
from app.sessions import utcnow

CONTEXT = "group_time"
MAX_LIST = 50


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def _class(db: Session, user: User, class_id) -> Class:
    uid = access._as_uuid(class_id)
    cls = db.get(Class, uid) if uid else None
    if cls is None:
        raise AppError("NOT_FOUND")
    if user.role != "admin" and db.get(ClassTeacher, (cls.id, user.id)) is None:
        raise AppError("NOT_FOUND")
    return cls


def _session(db: Session, user: User, session_id, lock: bool = False) -> ClassSession:
    uid = access._as_uuid(session_id)
    stmt = select(ClassSession).where(ClassSession.id == uid) if uid else None
    row = db.scalars(stmt.with_for_update() if lock else stmt).first() if stmt is not None else None
    if row is None:
        raise AppError("NOT_FOUND")
    _class(db, user, row.class_id)
    return row


def _children_of_class(db: Session, cls: Class, child_ids) -> list[Child]:
    ids = list(dict.fromkeys(child_ids))
    rows = db.scalars(select(Child).where(Child.id.in_(ids), Child.class_id == cls.id, Child.archived_at.is_(None))).all()
    if len(rows) != len(ids):
        raise AppError("VALIDATION", "Choose children of this class.", details=[{"path": "child_ids", "message": "not in the class"}])
    order = {cid: i for i, cid in enumerate(ids)}
    return sorted(rows, key=lambda c: order[c.id])


def _item(db: Session, user: User, item_id) -> LibraryItem | None:
    if item_id is None:
        return None
    item = db.get(LibraryItem, item_id)
    if item is None or item.status == "archived" or (item.status != "published" and user.role != "admin"):
        raise AppError("NOT_FOUND")
    return item


def _names(db: Session, ids) -> dict:
    ids = [i for i in ids if i]
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all()) if ids else {}


def _summary(db: Session, row: ClassSession, cls: Class | None = None, item: LibraryItem | None = None) -> dict:
    cls = cls or db.get(Class, row.class_id)
    item = item if item is not None else (db.get(LibraryItem, row.library_item_id) if row.library_item_id else None)
    count = db.scalar(select(func.count()).select_from(ClassSessionChild).where(ClassSessionChild.session_id == row.id))
    noted = db.scalar(select(func.count()).select_from(Observation).where(Observation.session_id == row.id))
    names = _names(db, [row.created_by])
    return {
        "id": str(row.id),
        "class": {"id": str(cls.id), "name": cls.name},
        "library_item": {"id": str(item.id), "title": item.title, "content_type": item.content_type} if item else None,
        "title": row.title,
        "held_on": row.held_on.isoformat(),
        "children_count": count,
        "noted_count": noted,
        "created_by": {"id": str(row.created_by), "name": names.get(row.created_by)} if row.created_by else None,
        "created_at": _iso(row.created_at),
    }


def _detail(db: Session, row: ClassSession) -> dict:
    out = _summary(db, row)
    children = db.scalars(
        select(Child).join(ClassSessionChild, ClassSessionChild.child_id == Child.id)
        .where(ClassSessionChild.session_id == row.id).order_by(Child.name)
    ).all()
    obs = {o.child_id: o for o in db.scalars(select(Observation).where(Observation.session_id == row.id))}
    focus_ids = [o.focus_area_id for o in obs.values() if o.focus_area_id]
    titles = dict(db.execute(select(FocusArea.id, FocusArea.title).where(FocusArea.id.in_(focus_ids))).all()) if focus_ids else {}
    out["children"] = []
    for c in children:
        o = obs.get(c.id)
        out["children"].append({
            "id": str(c.id),
            "name": c.name,
            "preferred_name": c.preferred_name,
            "has_photo": bool(c.photo_path),
            "updated_at": _iso(c.updated_at),
            "observation": {
                "id": str(o.id),
                "support_level": o.support_level,
                "observation": o.observation,
                "focus_area_id": str(o.focus_area_id) if o.focus_area_id else None,
                "focus_area_title": titles.get(o.focus_area_id),
            } if o else None,
        })
    return out


def list_sessions(db: Session, user: User, class_id=None, library_item_id=None) -> dict:
    stmt = select(ClassSession)
    if user.role != "admin":
        stmt = stmt.where(ClassSession.class_id.in_(select(ClassTeacher.class_id).where(ClassTeacher.user_id == user.id)))
    if class_id is not None:
        stmt = stmt.where(ClassSession.class_id == class_id)
    if library_item_id is not None:
        stmt = stmt.where(ClassSession.library_item_id == library_item_id)
    rows = db.scalars(stmt.order_by(ClassSession.held_on.desc(), ClassSession.created_at.desc()).limit(MAX_LIST)).all()
    return {"sessions": [_summary(db, r) for r in rows]}


def get_session(db: Session, user: User, session_id) -> dict:
    return {"session": _detail(db, _session(db, user, session_id))}


def create_session(db: Session, user: User, body: SessionCreate) -> dict:
    cls = _class(db, user, body.class_id)
    item = _item(db, user, body.library_item_id)
    title = body.title or (item.title if item else None)
    if not title:
        raise AppError("VALIDATION", details=[{"path": "title", "message": "A title is required without a library item."}])
    today = local_today()
    held_on = body.held_on or today
    # A day of slack for a device whose clock or time zone is ahead.
    if held_on > today + timedelta(days=1):
        raise AppError("VALIDATION", details=[{"path": "held_on", "message": "The day cannot be in the future."}])
    children = _children_of_class(db, cls, body.child_ids)
    row = ClassSession(class_id=cls.id, library_item_id=item.id if item else None, title=title.strip(), held_on=held_on,
                       created_by=user.id)
    db.add(row)
    db.flush()
    for c in children:
        db.add(ClassSessionChild(session_id=row.id, child_id=c.id))
    audit(db, user, "session.create", "class_session", row.id, class_id=str(cls.id),
          library_item_id=str(item.id) if item else None, children=len(children))
    db.flush()
    out = _detail(db, row)
    db.commit()
    return {"session": out}


def set_participants(db: Session, user: User, session_id, body: ParticipantsIn) -> dict:
    row = _session(db, user, session_id, lock=True)
    cls = db.get(Class, row.class_id)
    children = _children_of_class(db, cls, body.child_ids)
    current = set(db.scalars(select(ClassSessionChild.child_id).where(ClassSessionChild.session_id == row.id)))
    wanted = {c.id for c in children}
    for cid in current - wanted:
        db.delete(db.get(ClassSessionChild, (row.id, cid)))
    for cid in wanted - current:
        db.add(ClassSessionChild(session_id=row.id, child_id=cid))
    audit(db, user, "session.participants", "class_session", row.id, added=len(wanted - current), removed=len(current - wanted))
    db.flush()
    out = _detail(db, row)
    db.commit()
    return {"session": out}


def _focus_for(db: Session, child_id, goal_keys: list[str]) -> FocusArea | None:
    if not goal_keys:
        return None
    return db.scalars(select(FocusArea).where(FocusArea.child_id == child_id, FocusArea.status == "active",
                                              FocusArea.suggestion_key.in_(goal_keys))
                      .order_by(FocusArea.created_at)).first()


def local_today() -> date:
    """Today in the kindergarten's time zone (the server runs on UTC)."""
    return datetime.now(LOCAL_TZ).date()


def _observed_at(held_on: date) -> datetime:
    """Now for a session held today (local), else midday of that local day."""
    if held_on >= local_today():
        return utcnow()
    return datetime.combine(held_on, time(12), tzinfo=LOCAL_TZ)


def save_notes(db: Session, user: User, session_id, body: SessionNotesIn) -> dict:
    """Create or update the session observation of each child in ``entries``."""
    row = _session(db, user, session_id, lock=True)
    participants = set(db.scalars(select(ClassSessionChild.child_id).where(ClassSessionChild.session_id == row.id)))
    item = db.get(LibraryItem, row.library_item_id) if row.library_item_id else None
    goal_keys = [g["key"] for g in (item.goals or []) if isinstance(g, dict) and "key" in g] if item else []
    first_goal = vocab.item("focus_suggestions", goal_keys[0]) if goal_keys else None
    existing = {o.child_id: o for o in db.scalars(select(Observation).where(Observation.session_id == row.id))}
    for entry in body.entries:
        if entry.child_id not in participants:
            raise AppError("VALIDATION", "Note only children who took part.",
                           details=[{"path": "entries.child_id", "message": str(entry.child_id)}])
        obs = existing.get(entry.child_id)
        if obs is not None:
            changed = [f for f in ("support_level", "observation") if getattr(obs, f) != getattr(entry, f)]
            if not changed:
                continue
            for f in changed:
                setattr(obs, f, getattr(entry, f))
            db.flush()
            history.record(db, child_id=obs.child_id, entity_type="observation", entity_id=obs.id,
                           data=history.snapshot(obs), user=user, via="manual")
            audit(db, user, "observation.update", "observation", obs.id, child_id=obs.child_id, fields=changed,
                  source="session")
            continue
        if entry.support_level is None and entry.observation is None:
            continue
        focus = _focus_for(db, entry.child_id, goal_keys)
        area = focus.category if focus else (first_goal or {}).get("category")
        obs = Observation(
            child_id=entry.child_id, session_id=row.id, focus_area_id=focus.id if focus else None, source="session",
            observed_at=_observed_at(row.held_on), area=area, context=CONTEXT, observation=entry.observation,
            support_level=entry.support_level, domains=list(AREA_DOMAINS.get(area or "", [])), created_by=user.id,
        )
        db.add(obs)
        db.flush()
        history.record(db, child_id=obs.child_id, entity_type="observation", entity_id=obs.id,
                       data=history.snapshot(obs), user=user, via="manual")
        audit(db, user, "observation.create", "observation", obs.id, child_id=obs.child_id,
              focus_area_id=obs.focus_area_id, source="session", session_id=str(row.id))
    db.flush()
    out = _detail(db, row)
    db.commit()
    return {"session": out}