"""app.services.history (record_versions writer) and app.provenance (derived labels)."""
import threading
import time
import uuid
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import select

from app import provenance
from app.db import SessionLocal
from app.models import RecordVersion
from app.services import history


def test_record_numbers_versions_per_entity(db, child, other_child, teacher, parent):
    oid, fid = uuid.uuid4(), uuid.uuid4()
    first = history.record(db, child_id=child.id, entity_type="observation", entity_id=oid,
                           data={"observation": "Built a tower"}, user=teacher, via="manual")
    second = history.record(db, child_id=child.id, entity_type="observation", entity_id=oid,
                            data={"observation": "Built a tall tower"}, user=teacher, via="edited")
    other = history.record(db, child_id=child.id, entity_type="focus_area", entity_id=fid,
                           data={"title": "Joining play"}, user=teacher, via="manual")
    who = history.record(db, child_id=child.id, entity_type="profile_section", key="parent:who",
                         data={"appreciate": "Kind"}, user=parent, reported_by="parent", via="self")
    health = history.record(db, child_id=child.id, entity_type="profile_section", key="parent:health",
                            data={"sleep": "Well"}, user=teacher, reported_by="parent", via="on_behalf")
    who2 = history.record(db, child_id=child.id, entity_type="profile_section", key="parent:who",
                          data={"appreciate": "Kind and funny"}, user=teacher, reported_by="parent", via="meeting")
    elsewhere = history.record(db, child_id=other_child.id, entity_type="profile_section", key="parent:who",
                               data={}, user=None, via="system")
    db.commit()
    assert [first.seq, second.seq, other.seq, who.seq, health.seq, who2.seq, elsewhere.seq] == [1, 2, 1, 1, 1, 2, 1]
    assert (second.changed_by, second.changed_by_name, second.changed_role) == (teacher.id, teacher.name, "teacher")
    assert (who.changed_role, who.reported_by, who.via) == ("parent", "parent", "self")
    assert (elsewhere.changed_by, elsewhere.changed_by_name, elsewhere.changed_role) == (None, None, "system")
    assert who.entity_id is None and first.entity_key == ""


def test_record_stores_json_safe_full_state(db, child, teacher):
    fid = uuid.uuid4()
    row = history.record(db, child_id=child.id, entity_type="focus_area", entity_id=fid, user=teacher, via="status",
                         data={"follow_up_on": date(2026, 11, 1), "closed_at": datetime(2026, 10, 6, tzinfo=timezone.utc),
                               "assessment_id": fid, "tags": ("a", "b")})
    db.commit()
    db.expire_all()
    stored = db.scalar(select(RecordVersion.data).where(RecordVersion.id == row.id))
    assert stored == {"follow_up_on": "2026-11-01", "closed_at": "2026-10-06T00:00:00+00:00",
                      "assessment_id": str(fid), "tags": ["a", "b"]}


@pytest.mark.parametrize("kwargs", [
    {"entity_type": "baseline", "entity_id": uuid.uuid4()},
    {"entity_type": "observation"},  # needs entity_id
    {"entity_type": "profile_section"},  # needs a key
    {"entity_type": "profile_section", "key": "parent:who", "entity_id": uuid.uuid4()},
    {"entity_type": "observation", "entity_id": uuid.uuid4(), "via": "guess"},
    {"entity_type": "observation", "entity_id": uuid.uuid4(), "reported_by": "ai"},
])
def test_record_rejects_bad_arguments(db, child, teacher, kwargs):
    kwargs.setdefault("via", "manual")
    with pytest.raises(ValueError):
        history.record(db, child_id=child.id, data={}, user=teacher, **kwargs)


def test_versions_filters_and_output(db, child, teacher):
    a, b = uuid.uuid4(), uuid.uuid4()
    for n in range(3):
        history.record(db, child_id=child.id, entity_type="content", entity_id=a, data={"n": n}, user=teacher,
                       via="generated" if n == 0 else "edited")
    history.record(db, child_id=child.id, entity_type="content", entity_id=b, data={"n": 9}, user=teacher,
                   via="generated")
    history.record(db, child_id=child.id, entity_type="profile_section", key="teacher:bridge", data={"x": 1},
                   user=teacher, reported_by="teacher", via="manual")
    db.commit()
    rows = history.versions(db, child_id=child.id, entity_type="content", entity_id=a)
    assert [r.seq for r in rows] == [1, 2, 3] and [r.data["n"] for r in rows] == [0, 1, 2]
    newest = history.versions(db, child_id=child.id, entity_type="content", entity_id=a, newest_first=True)
    assert [r.seq for r in newest] == [3, 2, 1]
    assert len(history.versions(db, child_id=child.id, entity_type="content")) == 4
    bridge = history.versions(db, child_id=child.id, entity_type="profile_section", key="teacher:bridge")
    out = history.version_out(bridge[0])
    assert out["key"] == "teacher:bridge" and out["entity_id"] is None
    assert {k: out[k] for k in ("seq", "data", "changed_by_name", "changed_role", "reported_by", "via")} == {
        "seq": 1, "data": {"x": 1}, "changed_by_name": teacher.name, "changed_role": "teacher",
        "reported_by": "teacher", "via": "manual"}
    assert out["created_at"] and out["changed_by"] == str(teacher.id)


def test_snapshot_drops_ids_and_audit_columns(db, child, teacher, make_focus_area):
    focus = make_focus_area(child, plan={"need": "Joining play"}, created_by=teacher, follow_up_on=date(2026, 12, 1))
    data = history.snapshot(focus)
    assert not set(data) & history.SNAPSHOT_EXCLUDE
    assert data["title"] == "Joining group play" and data["plan"] == {"need": "Joining play"}
    assert data["follow_up_on"] == "2026-12-01" and data["status"] == "active" and data["assessment_id"] is None


def test_concurrent_saves_get_consecutive_seqs(child, teacher):
    """Each writer computes max+1 only after it holds the child row, so no seq is lost or doubled."""
    oid = uuid.uuid4()
    writers = 6
    barrier = threading.Barrier(writers)
    errors = []

    def write(n):
        try:
            with SessionLocal() as s:
                barrier.wait()
                history.record(s, child_id=child.id, entity_type="observation", entity_id=oid, data={"n": n},
                               user=teacher, via="edited")
                time.sleep(0.05)  # widen the window between computing seq and committing
                s.commit()
        except Exception as exc:  # pragma: no cover - reported below
            errors.append(repr(exc))

    threads = [threading.Thread(target=write, args=(n,)) for n in range(writers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(60)
    assert errors == []
    with SessionLocal() as s:
        seqs = sorted(r.seq for r in history.versions(s, child_id=child.id, entity_type="observation", entity_id=oid))
    assert seqs == list(range(1, writers + 1))


# --------------------------------------------------------------------------- provenance


def test_derive_covers_every_label():
    assert provenance.derive(["parent"]) == ["parent_said"]
    assert provenance.derive(["teacher"]) == ["teacher_observed"]
    assert provenance.derive(["observation"]) == ["teacher_observed"]
    assert provenance.derive(["review"]) == ["teacher_approved"]
    assert provenance.derive(approved=True) == ["teacher_approved"]
    assert provenance.derive(ai_outcome="pending") == ["ai_suggested"]
    assert provenance.derive(ai_outcome="edited", approved=True) == ["ai_suggested", "teacher_approved"]
    assert provenance.derive(ai_outcome="accepted") == []
    assert provenance.derive(ai_outcome="discarded") == []
    assert provenance.derive(reported_by="parent") == ["parent_said"]
    assert provenance.derive(reported_by="teacher") == ["teacher_observed"]
    # Fixed order, no duplicates, unknown sources ignored.
    assert provenance.derive(["review", "observation", "parent", "teacher", "imported"]) == [
        "parent_said", "teacher_observed", "teacher_approved"]
    assert provenance.derive(None) == [] and provenance.derive() == []
    assert set(provenance.LABELS) == {"parent_said", "teacher_observed", "ai_suggested", "teacher_approved"}


def test_badges_mark_parent_answers_entered_by_staff():
    staff_stamp = {"by": "u1", "by_name": "Teacher T", "role": "teacher", "reported_by": "parent",
                   "at": "2026-10-01T08:00:00+00:00", "mode": "meeting"}
    parent_stamp = {"by": "u2", "by_name": "Parent P", "role": "parent", "reported_by": "parent"}
    assert provenance.entered_by_staff(staff_stamp)
    assert not provenance.entered_by_staff(parent_stamp) and not provenance.entered_by_staff(None)
    assert provenance.badges(["parent", "teacher"], stamp=staff_stamp) == [
        {"label": "parent_said", "entered_by": "Teacher T", "mode": "meeting"}, {"label": "teacher_observed"}]
    assert provenance.badges(stamp=parent_stamp) == [{"label": "parent_said"}]
    # A record_versions row (as a dict) works as the stamp too.
    version = {"changed_by_name": "Admin A", "changed_role": "admin", "reported_by": "parent", "via": "on_behalf"}
    assert provenance.badges(stamp=version) == [{"label": "parent_said", "entered_by": "Admin A", "mode": "on_behalf"}]
    assert provenance.badges(ai_outcome="pending") == [{"label": "ai_suggested"}]
    assert provenance.badges(["review"]) == [{"label": "teacher_approved"}]


def test_provenance_labels_are_in_the_vocabulary():
    from app import vocab

    vocab.reload()
    assert vocab.keys("provenance") == list(provenance.LABELS)
