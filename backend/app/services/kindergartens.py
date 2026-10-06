"""Kindergartens: the user's kindergartens and each kindergarten's theme.

A kindergarten is the name its classes share (``classes.kindergarten``). Its theme is a
``kindergarten_themes`` vocabulary key (flowers, sun, sea, ...) set by an admin; the client
turns it into an emoji and a play colour. A kindergarten without a theme uses the default look.

- ``mine(db, user)``: the kindergartens this user works in or whose children they see:
  teacher = their classes, parent = their linked children's classes, admin = every class.
  ``{"kindergartens": [{name, theme, classes: [{id, name}]}]}``, sorted by name.
- ``set_theme(db, admin, body)``: set or clear one kindergarten's theme (audited).
- ``themes_for(db, names)``: ``{kindergarten: theme}`` for class rows.
- ``rename(db, old, new)``: keep the theme when the last class of a kindergarten is renamed.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import vocab
from app.audit import audit
from app.errors import AppError
from app.models import Child, ChildParent, Class, ClassTeacher, KindergartenTheme, User
from app.schemas.kindergartens import ThemeIn

THEMES = "kindergarten_themes"


def themes_for(db: Session, names) -> dict[str, str]:
    names = {n for n in names if n}
    if not names:
        return {}
    return dict(db.execute(
        select(KindergartenTheme.kindergarten, KindergartenTheme.theme).where(KindergartenTheme.kindergarten.in_(names))
    ).all())


def mine(db: Session, user: User) -> dict:
    stmt = select(Class)
    if user.role == "teacher":
        stmt = stmt.where(Class.id.in_(select(ClassTeacher.class_id).where(ClassTeacher.user_id == user.id)))
    elif user.role == "parent":
        children = select(Child.class_id).join(ChildParent, ChildParent.child_id == Child.id).where(
            ChildParent.user_id == user.id, Child.archived_at.is_(None))
        stmt = stmt.where(Class.id.in_(children))
    elif user.role != "admin":
        return {"kindergartens": []}
    classes = db.scalars(stmt.order_by(func.lower(Class.kindergarten), func.lower(Class.name))).all()
    themes = themes_for(db, (c.kindergarten for c in classes))
    out: dict[str, dict] = {}
    for c in classes:
        k = out.setdefault(c.kindergarten, {"name": c.kindergarten, "theme": themes.get(c.kindergarten), "classes": []})
        k["classes"].append({"id": str(c.id), "name": c.name})
    return {"kindergartens": list(out.values())}


def set_theme(db: Session, admin: User, body: ThemeIn) -> dict:
    name = body.kindergarten
    if not db.scalar(select(func.count(Class.id)).where(Class.kindergarten == name)):
        raise AppError("NOT_FOUND", "Kindergarten not found.")
    if body.theme is not None and not vocab.is_valid(THEMES, body.theme):
        raise AppError("VALIDATION", details=[{"path": "theme", "message": "Choose one of the themes."}])
    row = db.get(KindergartenTheme, name)
    if body.theme is None:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(KindergartenTheme(kindergarten=name, theme=body.theme, updated_by=admin.id))
    else:
        row.theme = body.theme
        row.updated_by = admin.id
        row.updated_at = func.now()
    audit(db, admin, "kindergarten.theme", "kindergarten", None, theme=body.theme)
    db.commit()
    return {"kindergarten": name, "theme": body.theme}


def rename(db: Session, old: str, new: str) -> None:
    """After a class moved from kindergarten ``old`` to ``new``: when no class is left in ``old``,
    its theme moves to ``new`` (unless ``new`` already has one). The caller commits."""
    if old == new or db.scalar(select(func.count(Class.id)).where(Class.kindergarten == old)):
        return
    row = db.get(KindergartenTheme, old)
    if row is None:
        return
    if db.get(KindergartenTheme, new) is None:
        db.add(KindergartenTheme(kindergarten=new, theme=row.theme, updated_by=row.updated_by))
    db.delete(row)
