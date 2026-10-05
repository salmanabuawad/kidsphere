"""WP-08: development timeline (PLAN-ADJUSTMENTS B5: feedback shows once; A6 limit/offset)."""
import json
import re
from datetime import datetime, timedelta, timezone

from app.models import (
    Baseline,
    ContentFeedback,
    DevelopmentReview,
    FocusArea,
    GeneratedContent,
    Observation,
)

T0 = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)


def at(hours: float) -> datetime:
    return T0 + timedelta(hours=hours)


def url(child):
    return f"/api/children/{child.id}/timeline"


def content_row(child, teacher, title="Build the Garage Together", status="approved", approved=None, **kw):
    return GeneratedContent(
        child_id=child.id, mode="growth_support", content_type="real_world_activity", language="en",
        title=title, content={"title": title}, status=status, generation_input={}, ai_provider="template",
        is_template=True, approved_by=teacher.id if approved else None, approved_at=approved, created_by=teacher.id, **kw,
    )


def feedback(db, child, teacher, content, result="partly", text=None, when=None):
    obs = Observation(child_id=child.id, content_id=content.id, focus_area_id=content.focus_area_id,
                      source="content_feedback", observation=text, observed_at=when or at(50),
                      support_level="some_support", created_by=teacher.id)
    db.add(obs)
    db.flush()
    db.add(ContentFeedback(content_id=content.id, child_id=child.id, result=result, observation=text,
                           observation_id=obs.id, created_by=teacher.id))
    return obs


def test_one_feedback_is_exactly_one_entry(teacher_client, teacher, child, db):
    content = content_row(child, teacher, status="completed", approved=at(1))
    db.add(content)
    db.flush()
    obs = feedback(db, child, teacher, content, result="worked_well", text=None, when=at(2))
    db.commit()

    entries = teacher_client.get(url(child)).json()["entries"]
    fb = [e for e in entries if e["type"] == "content_feedback"]
    assert len(fb) == 1
    assert fb[0]["id"] == str(obs.id) and fb[0]["result"] == "worked_well"
    assert fb[0]["content_title"] == "Build the Garage Together" and fb[0]["text"] is None
    assert fb[0]["by_name"] == teacher.name and fb[0]["support_level"] == "some_support"
    # The content itself shows once as approved; nothing else.
    assert [e["type"] for e in entries] == ["content_feedback", "content_approved"]
    assert len(entries) == 2


def test_all_sources_in_strict_reverse_order_and_pages_do_not_overlap(teacher_client, teacher, child, db):
    focus = FocusArea(child_id=child.id, category="social", title="Joining group play", status="completed",
                      created_by=teacher.id, created_at=at(3), closed_at=at(40))
    db.add(focus)
    db.add(Baseline(child_id=child.id, baseline_data={"basics": {}}, created_by=teacher.id, created_at=at(1)))
    db.flush()
    db.add(Observation(child_id=child.id, observation="Watched the block corner", observed_at=at(5),
                       focus_area_id=focus.id, context="free_play", created_by=teacher.id))
    db.add(Observation(child_id=child.id, observation="Asked to build together", observed_at=at(30),
                       support_level="independent", created_by=teacher.id))
    approved = content_row(child, teacher, status="approved", approved=at(10), focus_area_id=focus.id)
    done = content_row(child, teacher, title="The Lion Who Asked", status="completed", approved=at(20))
    draft = content_row(child, teacher, title="Draft only", status="draft")
    db.add_all([approved, done, draft])
    db.flush()
    feedback(db, child, teacher, done, result="did_not_work", text="Left after 8 minutes", when=at(25))
    db.add(DevelopmentReview(child_id=child.id, summary="More confident joining play", understanding={},
                             created_by=teacher.id, created_at=at(45)))
    db.commit()

    full = teacher_client.get(url(child), params={"limit": 100}).json()
    entries = full["entries"]
    types = [e["type"] for e in entries]
    assert types == ["review", "focus_closed", "observation", "content_feedback", "content_approved",
                     "content_approved", "observation", "focus_opened", "baseline"]
    stamps = [datetime.fromisoformat(e["at"]) for e in entries]
    assert stamps == sorted(stamps, reverse=True) and len(set(stamps)) == len(stamps)
    assert not full["has_more"]
    assert "Draft only" not in json.dumps(full)

    closed = entries[1]
    assert closed["status"] == "completed" and closed["title"] == "Joining group play"
    first_obs = entries[6]
    assert first_obs["text"] == "Watched the block corner" and first_obs["focus_area_title"] == "Joining group play"
    assert entries[5]["focus_area_title"] == "Joining group play" and entries[4]["content_title"] == "The Lion Who Asked"
    assert entries[0]["text"] == "More confident joining play"

    pages, offset = [], 0
    while True:
        page = teacher_client.get(url(child), params={"limit": 2, "offset": offset}).json()
        pages.append(page)
        offset += 2
        if not page["has_more"]:
            break
    ids = [(e["type"], e["id"]) for p in pages for e in p["entries"]]
    assert ids == [(e["type"], e["id"]) for e in entries]
    assert len(pages) == 5


def test_no_numbers_or_percentages_in_payload(teacher_client, teacher, child, db):
    db.add(Observation(child_id=child.id, observation="Played", created_by=teacher.id))
    db.commit()
    body = teacher_client.get(url(child)).json()
    assert set(body) == {"entries", "limit", "offset", "has_more"}
    entry = body["entries"][0]
    assert not any(isinstance(v, (int, float)) and not isinstance(v, bool) for v in entry.values())
    assert not re.search(r"\d+\s*%|score|points", json.dumps(entry), re.I)


def test_scope(teacher_client, other_teacher_client, parent_client, other_parent_client, admin_client, child):
    assert teacher_client.get(url(child)).status_code == 200
    assert admin_client.get(url(child)).status_code == 200
    for c in (other_teacher_client, parent_client, other_parent_client):
        r = c.get(url(child))
        assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_api_flow_shows_new_observation_and_focus(teacher_client, child):
    f = teacher_client.post(f"/api/children/{child.id}/focus-areas", json={"suggestion_key": "joining_group_play"})
    assert f.status_code == 201
    o = teacher_client.post(f"/api/children/{child.id}/observations",
                            json={"observation": "Joined the train game", "focus_area_id": f.json()["focus_area"]["id"]})
    assert o.status_code == 201
    entries = teacher_client.get(url(child)).json()["entries"]
    assert [e["type"] for e in entries] == ["observation", "focus_opened"]
    assert entries[0]["text"] == "Joined the train game" and entries[0]["focus_area_title"] == "Joining group play"


def test_dev_seed_story_reads_in_order(db, client_for):
    from sqlalchemy import select

    from app import dev_seed
    from app.models import User

    result = dev_seed.seed(db, password="Demo-pass-123")
    teacher = db.scalars(select(User).where(User.email == "demo-teacher")).one()
    c = client_for(teacher)
    adam = c.get(f"/api/children/{result['children']['Adam'][0]}/timeline").json()["entries"]
    assert [e["type"] for e in adam] == ["observation"] * 4 + ["baseline", "focus_opened"]
    assert [e["support_level"] for e in adam[:4]] == ["independent", "some_support", "some_support", "significant_support"]
    assert all(e["focus_area_title"] == "Joining group play" for e in adam[:4])
    maya = c.get(f"/api/children/{result['children']['Maya'][0]}/timeline").json()["entries"]
    assert [e["type"] for e in maya] == ["observation"] * 3 + ["baseline"]
