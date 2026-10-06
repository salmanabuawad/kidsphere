"""Classes (with their kindergarten name), teacher assignment and parent links.

- Admins see and manage every class; a teacher sees only the classes they are
  assigned to (the Add Child wizard's class picker). Parents have no access.
- A class can be deleted only when it has no active (non-archived) children.
- Only teacher-role users can be assigned to a class; only parent-role users
  can be linked to a child.
"""
import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import vocab
from app.access import get_child_or_404
from app.audit import audit
from app.errors import AppError
from app.models import Child, ChildParent, Class, ClassTeacher, User
from app.schemas.admin import ClassIn, ClassUpdateIn, ParentLinkIn, TeachersIn, class_out, parent_link_out
from app.services import kindergartens


def _uuid_or_404(value, what: str = "Class") -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise AppError("NOT_FOUND", f"{what} not found.")


def _class_rows(db: Session, classes: list[Class]) -> list[dict]:
    ids = [c.id for c in classes]
    if not ids:
        return []
    teachers: dict[uuid.UUID, list[User]] = {i: [] for i in ids}
    for class_id, user in db.execute(
        select(ClassTeacher.class_id, User)
        .join(User, User.id == ClassTeacher.user_id)
        .where(ClassTeacher.class_id.in_(ids))
        .order_by(func.lower(User.name))
    ):
        teachers[class_id].append(user)
    counts = dict(db.execute(
        select(Child.class_id, func.count(Child.id))
        .where(Child.class_id.in_(ids), Child.archived_at.is_(None))
        .group_by(Child.class_id)
    ).all())
    themes = kindergartens.themes_for(db, (c.kindergarten for c in classes))
    return [class_out(c, teachers[c.id], counts.get(c.id, 0), themes.get(c.kindergarten)) for c in classes]


def list_classes(db: Session, user: User) -> list[dict]:
    stmt = select(Class)
    if user.role == "teacher":
        stmt = stmt.where(Class.id.in_(select(ClassTeacher.class_id).where(ClassTeacher.user_id == user.id)))
    elif user.role != "admin":
        raise AppError("FORBIDDEN")
    classes = list(db.scalars(stmt.order_by(func.lower(Class.kindergarten), func.lower(Class.name))))
    return _class_rows(db, classes)


def class_row(db: Session, cls: Class) -> dict:
    return _class_rows(db, [cls])[0]


def get_class_or_404(db: Session, class_id, lock: bool = False) -> Class:
    stmt = select(Class).where(Class.id == _uuid_or_404(class_id))
    if lock:
        stmt = stmt.with_for_update()
    cls = db.scalars(stmt).first()
    if cls is None:
        raise AppError("NOT_FOUND", "Class not found.")
    return cls


def _check_unique(db: Session, name: str, kindergarten: str, exclude: uuid.UUID | None = None) -> None:
    stmt = select(Class.id).where(Class.name == name, Class.kindergarten == kindergarten)
    if exclude is not None:
        stmt = stmt.where(Class.id != exclude)
    if db.scalars(stmt).first() is not None:
        raise AppError("DUPLICATE", "A class with this name already exists in this kindergarten.",
                       details=[{"path": "name", "message": "already exists"}])


def create_class(db: Session, actor: User, body: ClassIn) -> dict:
    _check_unique(db, body.name, body.kindergarten)
    cls = Class(name=body.name, kindergarten=body.kindergarten)
    db.add(cls)
    db.flush()
    audit(db, actor, "class.create", "class", cls.id, name=cls.name, kindergarten=cls.kindergarten)
    db.commit()
    return class_row(db, cls)


def update_class(db: Session, actor: User, class_id, body: ClassUpdateIn) -> dict:
    cls = get_class_or_404(db, class_id)
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None and getattr(cls, k) != v}
    if changes:
        _check_unique(db, changes.get("name", cls.name), changes.get("kindergarten", cls.kindergarten), exclude=cls.id)
        old_kindergarten = cls.kindergarten
        for field, value in changes.items():
            setattr(cls, field, value)
        if "kindergarten" in changes:
            db.flush()
            kindergartens.rename(db, old_kindergarten, cls.kindergarten)
        audit(db, actor, "class.update", "class", cls.id, fields=sorted(changes), name=cls.name)
        db.commit()
    return class_row(db, cls)


def delete_class(db: Session, actor: User, class_id) -> None:
    cls = get_class_or_404(db, class_id, lock=True)
    active = db.scalar(select(func.count(Child.id)).where(Child.class_id == cls.id, Child.archived_at.is_(None)))
    if active:
        raise AppError("CONFLICT", "This class still has children. Move them to another class first.",
                       details=[{"path": "child_count", "message": str(active)}])
    audit(db, actor, "class.delete", "class", cls.id, name=cls.name, kindergarten=cls.kindergarten)
    db.delete(cls)
    db.commit()


def set_teachers(db: Session, actor: User, class_id, body: TeachersIn) -> dict:
    cls = get_class_or_404(db, class_id, lock=True)
    wanted = list(dict.fromkeys(body.user_ids))
    if wanted:
        found = {u.id: u for u in db.scalars(select(User).where(User.id.in_(wanted)))}
        bad = [str(i) for i in wanted if i not in found or found[i].role != "teacher"]
        if bad:
            raise AppError("VALIDATION", "Only teacher accounts can be assigned to a class.",
                           details=[{"path": "user_ids", "message": "not a teacher", "ids": bad}])
    current = set(db.scalars(select(ClassTeacher.user_id).where(ClassTeacher.class_id == cls.id)))
    added = [i for i in wanted if i not in current]
    removed = [i for i in current if i not in set(wanted)]
    if removed:
        db.execute(delete(ClassTeacher).where(ClassTeacher.class_id == cls.id, ClassTeacher.user_id.in_(removed)))
    for uid in added:
        db.add(ClassTeacher(class_id=cls.id, user_id=uid))
    if added or removed:
        audit(db, actor, "class.teachers", "class", cls.id, added=sorted(str(i) for i in added),
              removed=sorted(str(i) for i in removed))
    db.commit()
    return class_row(db, cls)


# --- parent links -------------------------------------------------------------------

def list_parent_links(db: Session, actor: User, child_id) -> list[dict]:
    child = get_child_or_404(db, actor, child_id, include_archived=True)
    rows = db.execute(
        select(User, ChildParent)
        .join(ChildParent, ChildParent.user_id == User.id)
        .where(ChildParent.child_id == child.id)
        .order_by(ChildParent.created_at, func.lower(User.name))
    ).all()
    return [parent_link_out(u, link) for u, link in rows]


def link_parent(db: Session, actor: User, child_id, body: ParentLinkIn) -> dict:
    child = get_child_or_404(db, actor, child_id, include_archived=True)
    if body.relation is not None and body.relation != "" and not vocab.is_valid("relations", body.relation):
        raise AppError("VALIDATION", details=[{"path": "relation", "message": "unknown relation"}])
    user = db.get(User, body.user_id)
    if user is None or user.role != "parent":
        raise AppError("VALIDATION", "Only parent accounts can be linked to a child.",
                       details=[{"path": "user_id", "message": "not a parent"}])
    exists = db.scalars(select(ChildParent).where(ChildParent.child_id == child.id, ChildParent.user_id == user.id)).first()
    if exists is not None:
        raise AppError("DUPLICATE", "This parent is already linked to the child.")
    link = ChildParent(child_id=child.id, user_id=user.id, relation=body.relation or None)
    db.add(link)
    db.flush()
    audit(db, actor, "parent_link.create", "user", user.id, child_id=child.id, relation=link.relation)
    db.commit()
    db.refresh(link)
    return parent_link_out(user, link)


def unlink_parent(db: Session, actor: User, child_id, user_id) -> None:
    child = get_child_or_404(db, actor, child_id, include_archived=True)
    uid = _uuid_or_404(user_id, "Link")
    link = db.scalars(select(ChildParent).where(ChildParent.child_id == child.id, ChildParent.user_id == uid)).first()
    if link is None:
        raise AppError("NOT_FOUND", "Link not found.")
    db.delete(link)
    audit(db, actor, "parent_link.delete", "user", uid, child_id=child.id)
    db.commit()
