"""Version history: append-only ``record_versions`` rows (never overwrite).

Every save of a profile section, an observation, a focus area (plan goal) or a
content draft writes the FULL new state here, in the same transaction as the
change (COVERAGE-MATRIX §3.1). Rows are never updated or deleted (DB trigger).

    record(db, *, child_id, entity_type, entity_id=None, key="", data, user,
           reported_by=None, via, review_id=None, ai_suggestion_id=None) -> RecordVersion
        Adds the next version (seq = max + 1 for that entity; seq 1 is the first
        known state). It locks the child row (FOR NO KEY UPDATE; a no-op when the
        caller already holds FOR UPDATE through ``get_child_or_404(lock=True)``),
        so concurrent saves of one child get consecutive seqs. Flushes; the
        caller commits once at the end of its unit of work.

        - entity_type: 'profile_section' (key = '<perspective>:<section>', e.g.
          'parent:health', 'teacher:bridge', 'parent:_questionnaire'; no entity_id)
          or 'observation' / 'focus_area' / 'content' (entity_id = the row id).
        - via: how it changed (app.models.RECORD_VIA_VALUES): self / on_behalf /
          meeting (profile entry modes), manual, review, assessment, generated,
          regenerated, edited, status, system ('backfill' is migration-only).
        - reported_by: whose answer it is ('parent' | 'teacher'; provenance).
        - user: the actor (None = 'system'); name and role are copied.
        - data: any JSON-able value; uuids, dates and datetimes become strings.

    versions(db, *, child_id, entity_type, entity_id=None, key=None, newest_first=False)
        -> list[RecordVersion]. Filters on whatever is given: one entity
        (entity_id or key) or every entity of a type for the child. Oldest first.

    version_out(row) -> dict   API shape of one version.
    snapshot(row) -> dict      An ORM row as JSON minus id, child_id, created_by,
                               created_at and updated_at (what the 0002 backfill stored).
"""
import uuid

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app.models import (
    RECORD_ENTITY_VALUES,
    RECORD_VIA_VALUES,
    REPORTED_BY_VALUES,
    Child,
    RecordVersion,
    User,
)

SNAPSHOT_EXCLUDE = frozenset({"id", "child_id", "created_by", "created_at", "updated_at"})


def jsonable(value):
    """``value`` with uuids, dates, datetimes and sets turned into JSON types."""
    return jsonable_encoder(value)


def snapshot(row, exclude=SNAPSHOT_EXCLUDE) -> dict:
    """The row's columns as a JSON-able dict, keyed by column name."""
    mapper = inspect(row).mapper
    out = {}
    for attr in mapper.column_attrs:
        name = attr.columns[0].name
        if name not in exclude:
            out[name] = getattr(row, attr.key)
    return jsonable(out)


def _check(entity_type: str, entity_id, key: str, via: str, reported_by) -> None:
    if entity_type not in RECORD_ENTITY_VALUES:
        raise ValueError(f"unknown entity_type {entity_type!r}")
    if via not in RECORD_VIA_VALUES:
        raise ValueError(f"unknown via {via!r}")
    if reported_by is not None and reported_by not in REPORTED_BY_VALUES:
        raise ValueError(f"unknown reported_by {reported_by!r}")
    if entity_type == "profile_section":
        if entity_id is not None or not key:
            raise ValueError("a profile_section version needs key '<perspective>:<section>' and no entity_id")
    elif entity_id is None:
        raise ValueError(f"a {entity_type} version needs entity_id")


def _same_entity(child_id, entity_type: str, entity_id, key: str) -> list:
    conds = [RecordVersion.child_id == child_id, RecordVersion.entity_type == entity_type,
             RecordVersion.entity_key == key]
    conds.append(RecordVersion.entity_id.is_(None) if entity_id is None else RecordVersion.entity_id == entity_id)
    return conds


def record(
    db: Session,
    *,
    child_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    key: str = "",
    data,
    user: User | None,
    reported_by: str | None = None,
    via: str,
    review_id: uuid.UUID | None = None,
    ai_suggestion_id: uuid.UUID | None = None,
) -> RecordVersion:
    key = key or ""
    _check(entity_type, entity_id, key, via, reported_by)
    # Serialise versions of one child: the next seq is computed after the lock.
    db.execute(select(Child.id).where(Child.id == child_id).with_for_update(key_share=True))
    last = db.scalar(select(func.max(RecordVersion.seq)).where(*_same_entity(child_id, entity_type, entity_id, key)))
    row = RecordVersion(
        child_id=child_id,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_key=key,
        seq=(last or 0) + 1,
        data=jsonable(data),
        changed_by=user.id if user is not None else None,
        changed_by_name=user.name if user is not None else None,
        changed_role=user.role if user is not None else "system",
        reported_by=reported_by,
        via=via,
        review_id=review_id,
        ai_suggestion_id=ai_suggestion_id,
    )
    db.add(row)
    db.flush()
    return row


def versions(
    db: Session,
    *,
    child_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    key: str | None = None,
    newest_first: bool = False,
) -> list[RecordVersion]:
    stmt = select(RecordVersion).where(RecordVersion.child_id == child_id, RecordVersion.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(RecordVersion.entity_id == entity_id)
    if key is not None:
        stmt = stmt.where(RecordVersion.entity_key == key)
    order = (RecordVersion.created_at, RecordVersion.seq, RecordVersion.id)
    stmt = stmt.order_by(*(c.desc() for c in order)) if newest_first else stmt.order_by(*order)
    return list(db.scalars(stmt))


def version_out(row: RecordVersion) -> dict:
    return {
        "id": row.id,
        "seq": row.seq,
        "entity_type": row.entity_type,
        "entity_id": str(row.entity_id) if row.entity_id else None,
        "key": row.entity_key or None,
        "data": row.data,
        "changed_by": str(row.changed_by) if row.changed_by else None,
        "changed_by_name": row.changed_by_name,
        "changed_role": row.changed_role,
        "reported_by": row.reported_by,
        "via": row.via,
        "review_id": str(row.review_id) if row.review_id else None,
        "ai_suggestion_id": str(row.ai_suggestion_id) if row.ai_suggestion_id else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
