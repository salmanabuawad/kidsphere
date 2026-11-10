"""Family and home (0010): home activities for parents, home reflections and the suggested next steps.

The first demo scenario of the Family Resilience module runs end to end in
``test_family_loop``: the teacher sets an emotional goal → KidSphere drafts a story and a home
activity → the teacher approves and shares them → the parent opens the activity and says how it went
→ the teacher sees it on the timeline → KidSphere suggests the next step, with the facts it used.
"""
import json
import uuid

import pytest
from alembic import command
from sqlalchemy import inspect, select

from app.ai import validate_output
from app.ai.context import build_context
from app.ai.service import generate as ai_generate
from app.db import engine as db_engine
from app.models import (
    AuditLog,
    ContentFeedback,
    FocusArea,
    GeneratedContent,
    HomeReflection,
    LibraryCollection,
    LibraryItem,
    Observation,
)
from tests.conftest import alembic_config
from tests.test_content import _no_key, adam, approve, generate  # noqa: F401  (fixtures)

LANGS = ("en", "ar", "he")


def share(client, content_id):
    r = client.post(f"/api/content/{content_id}/share", json={"shared": True})
    assert r.status_code == 200, r.text


def reflect(client, content_id, expect=201, **body):
    r = client.post(f"/api/content/{content_id}/home-reflections", json={"result": "partly", **body})
    assert r.status_code == expect, r.text
    return r.json()


def feelings_focus(db, child, teacher):
    focus = FocusArea(child_id=child.id, category="emotional", suggestion_key="naming_feelings",
                      title="Naming feelings", status="active", created_by=teacher.id)
    db.add(focus)
    db.commit()
    return focus


@pytest.fixture
def shared_home(teacher_client, adam):  # noqa: F811
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="home_activity")["content"]
    approve(teacher_client, c["id"])
    share(teacher_client, c["id"])
    return child, focus, c


# --------------------------------------------------------------------------- migration


def test_migration_0010_up_and_down():
    try:
        command.downgrade(alembic_config(), "0009")
        db_engine.dispose()
        assert "home_reflections" not in inspect(db_engine).get_table_names()
    finally:
        command.upgrade(alembic_config(), "head")
        db_engine.dispose()
    assert "home_reflections" in inspect(db_engine).get_table_names()


# --------------------------------------------------------------------------- home activity


@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("gender", ("girl", "boy", None))
@pytest.mark.parametrize("key", ("naming_feelings", "talking_about_feelings_with_family", "taking_turns"))
def test_home_activity_template_is_valid_and_safe(lang, gender, key):
    child = {"name": "Noor", "gender": gender}
    profile = {"strengths": [{"key": "imagination", "sources": ["teacher"]}],
               "interests": [{"key": "cars_transportation", "sources": ["teacher"]}],
               "what_helps": [{"key": "adult_mediation", "sources": ["teacher"], "list": "what_helps"}]}
    category = {"naming_feelings": "emotional", "talking_about_feelings_with_family": "communication"}.get(key, "social")
    ctx = build_context(child=child, profile=profile, mode="growth_support", content_type="home_activity",
                        language=lang, focus={"id": "f", "category": category, "suggestion_key": key, "title": "Focus"})
    result = ai_generate("home_activity", ctx)
    assert result.provider == "template" and result.fallback_reason is None
    content, issues = validate_output("home_activity", result.content)
    assert issues == []
    assert 2 <= len(content["steps"]) <= 8 and content["words_to_try"] and content["what_to_notice"]
    assert "Noor" in json.dumps(content, ensure_ascii=False)
    strings = [v for v in content.values() if isinstance(v, str)]
    strings += [s for v in content.values() if isinstance(v, list) for s in v]
    assert not [s for s in strings if "{" in s or "}" in s]  # every slot was filled


def test_home_activity_uses_the_practice_phrase(teacher_client, db, adam, teacher):  # noqa: F811
    child, _ = adam
    focus = feelings_focus(db, child, teacher)
    c = generate(teacher_client, child, focus, kind="home_activity")["content"]
    assert c["content_type"] == "home_activity" and c["status"] == "draft" and c["shared_with_parent"] is False
    assert c["content"]["words_to_try"][0] == "I feel happy. I feel sad. I feel angry."
    assert c["generation_input"]["content_type"] == "home_activity"


def test_home_activity_teacher_edit_is_checked(teacher_client, shared_home):
    _, _, c = shared_home
    body = {**c["content"], "parent_tip": "This is a diagnosis."}
    r = teacher_client.put(f"/api/content/{c['id']}", json={"content": body})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNSAFE_CONTENT"
    body = {**c["content"], "steps": ["Only one step"]}
    assert teacher_client.put(f"/api/content/{c['id']}", json={"content": body}).status_code == 400


def test_library_items_cannot_be_home_activities(admin_client):
    r = admin_client.post("/api/admin/library/items", json={
        "collection_id": str(uuid.uuid4()), "content_type": "home_activity", "language": "en", "content": {}})
    assert r.status_code == 400


# --------------------------------------------------------------------------- home reflections


def test_parent_sees_the_shared_home_activity_and_reflects(parent_client, teacher_client, shared_home, db, parent):
    child, focus, c = shared_home
    got = parent_client.get(f"/api/content/{c['id']}").json()["content"]
    assert got["content_type"] == "home_activity" and "generation_input" not in got and "feedback" not in got

    out = reflect(parent_client, c["id"], result="worked_well", note="  He laughed and said he felt proud.  ")
    rf = out["reflection"]
    assert rf["result"] == "worked_well" and rf["note"] == "He laughed and said he felt proud."
    assert rf["by_name"] == parent.name

    db.expire_all()
    # Parent-reported: no observation, no feedback, no status change.
    assert db.scalars(select(Observation)).all() == []
    assert db.scalars(select(ContentFeedback)).all() == []
    assert db.get(GeneratedContent, c["id"]).status == "approved"
    (row,) = db.scalars(select(AuditLog).where(AuditLog.action == "home_reflection.create")).all()
    assert row.actor_id == parent.id and row.child_id == child.id
    assert "proud" not in json.dumps(row.meta) and row.meta["result"] == "worked_well" and row.meta["has_note"] is True

    mine = parent_client.get(f"/api/content/{c['id']}/home-reflections").json()["reflections"]
    assert [x["id"] for x in mine] == [rf["id"]]
    staff = teacher_client.get(f"/api/children/{child.id}/home-reflections").json()["reflections"]
    assert staff[0]["content_title"] == c["title"] and staff[0]["content_type"] == "home_activity"


def test_reflection_is_idempotent_with_a_request_id(parent_client, shared_home, db):
    _, _, c = shared_home
    first = reflect(parent_client, c["id"], client_request_id="r-1")
    r = parent_client.post(f"/api/content/{c['id']}/home-reflections",
                           json={"result": "did_not_work", "client_request_id": "r-1"})
    assert r.status_code == 200 and r.json()["reflection"]["id"] == first["reflection"]["id"]
    db.expire_all()
    assert len(db.scalars(select(HomeReflection)).all()) == 1


def test_reflection_access(parent_client, other_parent_client, teacher_client, other_teacher_client, adam, db):  # noqa: F811
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="home_activity")["content"]
    # A draft, then approved but not shared: invisible to the parent.
    reflect(parent_client, c["id"], expect=404)
    approve(teacher_client, c["id"])
    reflect(parent_client, c["id"], expect=404)
    share(teacher_client, c["id"])
    reflect(parent_client, c["id"])
    # Staff record what they see as feedback or observations instead.
    reflect(teacher_client, c["id"], expect=403)
    # Other families and other classes see nothing.
    reflect(other_parent_client, c["id"], expect=404)
    assert other_teacher_client.get(f"/api/content/{c['id']}/home-reflections").status_code == 404
    assert parent_client.get(f"/api/children/{child.id}/home-reflections").status_code == 404
    assert parent_client.get(f"/api/children/{child.id}/next-steps").status_code == 404
    # Unsharing hides it again.
    teacher_client.post(f"/api/content/{c['id']}/share", json={"shared": False})
    assert parent_client.get(f"/api/content/{c['id']}/home-reflections").status_code == 404


def test_reflection_validation(parent_client, shared_home):
    _, _, c = shared_home
    url = f"/api/content/{c['id']}/home-reflections"
    assert parent_client.post(url, json={"result": "great"}).status_code == 400
    assert parent_client.post(url, json={"result": "partly", "note": "x" * 1001}).status_code == 400
    assert parent_client.post(url, json={"result": "partly", "score": 3}).status_code == 400
    assert parent_client.post(url, json={"result": "partly", "note": "   "}).json()["reflection"]["note"] is None


def test_timeline_shows_each_reflection_once(teacher_client, parent_client, shared_home):
    child, focus, c = shared_home
    reflect(parent_client, c["id"], result="partly", note="Short but happy.")
    entries = teacher_client.get(f"/api/children/{child.id}/timeline").json()["entries"]
    (e,) = [x for x in entries if x["type"] == "home_reflection"]
    assert e["result"] == "partly" and e["text"] == "Short but happy." and e["content_title"] == c["title"]
    assert e["focus_area_id"] == str(focus.id)

    def types(**params):
        return {x["type"] for x in teacher_client.get(f"/api/children/{child.id}/timeline", params=params).json()["entries"]}

    assert types(result="partly") == {"home_reflection"}
    assert types(result="worked_well") == set()
    assert "home_reflection" in types(focus_area_id=str(focus.id))
    assert "home_reflection" in types(content_type="home_activity")
    assert types(type="home_reflection") == {"home_reflection"}


def test_parent_note_never_reaches_the_ai(teacher_client, parent_client, shared_home):
    child, focus, c = shared_home
    reflect(parent_client, c["id"], note="SECRET-FAMILY-NOTE")
    new = generate(teacher_client, child, focus, kind="story")["content"]
    assert "SECRET-FAMILY-NOTE" not in json.dumps(new["generation_input"])


# --------------------------------------------------------------------------- next steps


def steps_for(client, child, focus):
    out = client.get(f"/api/children/{child.id}/next-steps")
    assert out.status_code == 200, out.text
    return next(f for f in out.json()["focus_areas"] if f["focus_area_id"] == str(focus.id))


def test_next_steps_follow_the_newest_fact(teacher_client, parent_client, shared_home, make_observation, teacher):
    child, focus, c = shared_home
    s = steps_for(teacher_client, child, focus)
    assert s["signal"] == "start" and s["facts"] == []
    assert [x["content_type"] for x in s["suggestions"]] == ["story", "home_activity"]

    reflect(parent_client, c["id"], result="partly", note="He wanted to stop early.")
    s = steps_for(teacher_client, child, focus)
    assert s["signal"] == "repeat"
    (fact,) = s["facts"]
    assert fact["kind"] == "home_reflection" and fact["reported_by"] == "parent" and fact["result"] == "partly"
    assert "stop early" not in json.dumps(s)  # facts never carry free text

    r = teacher_client.post(f"/api/content/{c['id']}/feedback", json={"result": "did_not_work"})
    assert r.status_code == 201
    s = steps_for(teacher_client, child, focus)
    assert s["signal"] == "smaller_step" and s["facts"][0]["kind"] == "teacher_feedback"
    # The feedback's mirrored observation is not counted twice.
    assert [f["kind"] for f in s["facts"]].count("observation") == 0

    make_observation(child, created_by=teacher, focus_area_id=focus.id, support_level="independent")
    s = steps_for(teacher_client, child, focus)
    assert s["signal"] == "build" and s["facts"][0]["kind"] == "observation"
    assert [x["content_type"] for x in s["suggestions"]] == ["digital_game", "home_activity"]
    assert all(x["mode"] == "growth_support" for x in s["suggestions"])


def test_next_steps_list_only_active_focus_and_matching_library_items(teacher_client, db, adam, teacher):  # noqa: F811
    child, focus = adam
    closed = FocusArea(child_id=child.id, category="social", title="Closed", status="completed", created_by=teacher.id)
    col = LibraryCollection(title="Feelings", status="published")
    db.add_all([closed, col])
    db.flush()
    base = {"collection_id": col.id, "content_type": "story", "language": "en", "content": {}, "mode": "growth_support"}
    db.add_all([
        LibraryItem(title="Match", status="published", goals=[{"key": "joining_group_play"}], **base),
        LibraryItem(title="Draft", status="draft", goals=[{"key": "joining_group_play"}], **base),
        LibraryItem(title="Other goal", status="published", goals=[{"key": "taking_turns"}], **base),
    ])
    db.commit()
    out = teacher_client.get(f"/api/children/{child.id}/next-steps").json()["focus_areas"]
    assert [f["focus_area_id"] for f in out] == [str(focus.id)]
    assert [i["title"] for i in out[0]["library"]] == ["Match"]


# --------------------------------------------------------------------------- the demo scenario


def test_family_loop(teacher_client, parent_client, db, adam, teacher):  # noqa: F811
    child, _ = adam
    # 1. The teacher sets an emotional goal.
    r = teacher_client.post(f"/api/children/{child.id}/focus-areas", json={
        "category": "emotional", "suggestion_key": "naming_feelings", "title": "Naming feelings"})
    assert r.status_code == 201, r.text
    focus = db.get(FocusArea, uuid.UUID(r.json()["focus_area"]["id"]))
    # 2. KidSphere drafts a personalised story and a home activity.
    story = generate(teacher_client, child, focus, kind="story")["content"]
    home = generate(teacher_client, child, focus, kind="home_activity")["content"]
    # 3. The teacher approves and shares them.
    for c in (story, home):
        approve(teacher_client, c["id"])
        share(teacher_client, c["id"])
    # 4. The parent sees both and opens the activity.
    listed = parent_client.get(f"/api/children/{child.id}/content").json()["content"]
    assert {x["content_type"] for x in listed} == {"story", "home_activity"}
    assert parent_client.get(f"/api/content/{home['id']}").status_code == 200
    # 5. The parent says how it went at home.
    reflect(parent_client, home["id"], result="worked_well", note="He named 'angry' by himself.")
    # 6. The teacher sees it on the timeline.
    entries = teacher_client.get(f"/api/children/{child.id}/timeline").json()["entries"]
    assert any(e["type"] == "home_reflection" and e["result"] == "worked_well" for e in entries)
    # 7. KidSphere suggests the next step and shows why.
    s = steps_for(teacher_client, child, focus)
    assert s["signal"] == "build" and s["facts"][0]["kind"] == "home_reflection"
    assert s["suggestions"][0] == {"content_type": "digital_game", "mode": "growth_support"}
