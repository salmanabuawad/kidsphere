"""WP-11: content generation, review/edit/approve, regenerate, duplicate, share, archive, delete.

Everything runs with the template provider (no API key). Adam (spec §44) and
Maya (spec §45) are built here with the same profile data as app/dev_seed.py.
"""
import json
from datetime import date

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import AuditLog, ChildProfile, FocusArea, GeneratedContent, Observation, RecordVersion

KINDS = ("story", "video", "digital_game", "real_world_activity")
MODES = ("growth_support", "strength_builder")

ADAM_PHRASE = "Can we build this together?"


# --------------------------------------------------------------------------- fixtures / helpers


@pytest.fixture(autouse=True)
def _no_key(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "video_provider", "none")


def set_profile(db, child, strengths=(), interests=(), what_helps=(), understanding=None):
    profile = db.scalar(select(ChildProfile).where(ChildProfile.child_id == child.id))
    profile.strengths = [{"key": k, "sources": ["teacher"]} for k in strengths]
    profile.interests = [{"key": k, "sources": ["teacher"]} for k in interests]
    profile.what_helps = [{"key": k, "sources": ["teacher"], "list": "what_helps"} for k in what_helps]
    if understanding is not None:
        profile.current_understanding = understanding
    db.commit()
    return profile


def add_focus(db, child, teacher, status="active", suggestion_key="joining_group_play", title="Joining group play",
              category="social"):
    focus = FocusArea(
        child_id=child.id, category=category, suggestion_key=suggestion_key, title=title, status=status,
        description="Joining other children's play at the block corner.",
        plan={"strength_used": "Imagination and building", "need": "Joining shared play",
              "adaptation": "Start in a pair", "what_we_will_do": "Build the garage together",
              "success_looks_like": "Invites a friend to build without prompting"},
        created_by=teacher.id,
    )
    db.add(focus)
    db.commit()
    return focus


@pytest.fixture
def adam(db, child, teacher):
    """§44 Adam: strengths imagination/building/vocabulary, interests cars/animals/blocks,
    active focus joining_group_play. Returns (child, focus)."""
    child.main_language = "en"
    child.gender = "boy"
    db.commit()
    set_profile(db, child, strengths=("imagination", "building", "vocabulary"),
                interests=("cars_transportation", "animals", "blocks"), what_helps=("adult_mediation",))
    return child, add_focus(db, child, teacher)


@pytest.fixture
def maya(db, make_child, klass):
    """§45 Maya: strengths imagination/vocabulary/communication, interest animals (Adam's class)."""
    maya = make_child(klass, name="Maya", birth_date=date(2021, 11, 20), gender="girl", main_language="en")
    set_profile(db, maya, strengths=("imagination", "vocabulary", "communication"), interests=("animals",))
    return maya


def gen_url(child):
    return f"/api/children/{child.id}/content/generate"


def generate(client, child, focus=None, mode="growth_support", kind="real_world_activity", expect=201, **extra):
    body = {"mode": mode, "content_type": kind, **extra}
    if mode == "growth_support" and focus is not None and "focus_area_id" not in extra:
        body["focus_area_id"] = str(focus.id)
    if mode == "strength_builder" and "target_strength" not in extra:
        body["target_strength"] = "building"
    r = client.post(gen_url(child), json=body)
    assert r.status_code == expect, r.text
    return r.json()


def approve(client, content_id):
    r = client.post(f"/api/content/{content_id}/approve")
    assert r.status_code == 200, r.text
    return r.json()["content"]


def audit_rows(db, action):
    db.expire_all()
    return db.scalars(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id)).all()


# --------------------------------------------------------------------------- generation


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("kind", KINDS)
def test_generate_each_type_and_mode_with_templates(teacher_client, adam, db, kind, mode):
    child, focus = adam
    out = generate(teacher_client, child, focus, mode=mode, kind=kind)
    c = out["content"]
    assert c["status"] == "draft" and c["content_type"] == kind and c["mode"] == mode
    assert c["is_template"] is True and c["ai_provider"] == "template" and c["ai_model"]
    assert c["language"] == "en" and c["variant"] == 0 and c["shared_with_parent"] is False
    assert c["title"] == c["content"]["title"]
    assert c["focus_area_id"] == (str(focus.id) if mode == "growth_support" else None)
    if mode == "growth_support":
        assert c["focus_area_title"] == "Joining group play"
    assert c["video_status"] == ("script_ready" if kind == "video" else None)
    if kind == "digital_game":
        assert c["template"] == c["content"]["template"]
    gi = c["generation_input"]
    assert gi["content_type"] == kind and gi["mode"] == mode and gi["name"] == "[child]"
    dumped = json.dumps(gi)
    assert "birth_date" not in dumped and "2022-08-05" not in dumped and "health" not in dumped
    assert out["fallback_reason"] is None
    row = db.get(GeneratedContent, c["id"])
    assert row.status == "draft" and row.is_template and row.generation_input == gi


def test_generate_is_audited_with_ids_only(teacher_client, adam, db, teacher):
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="story")["content"]
    (row,) = audit_rows(db, "content.generate")
    assert row.actor_id == teacher.id and str(row.object_id) == c["id"] and row.child_id == child.id
    assert row.meta["content_type"] == "story" and row.meta["provider"] == "template"
    assert all(not isinstance(v, str) or len(v) < 80 for v in row.meta.values())


def test_default_language_follows_child_then_user(teacher_client, adam, db):
    child, focus = adam
    child.main_language = "he"
    db.commit()
    assert generate(teacher_client, child, focus, kind="story")["content"]["language"] == "he"
    child.main_language = "fr"
    db.commit()
    assert generate(teacher_client, child, focus, kind="story")["content"]["language"] == "en"  # teacher's language
    assert generate(teacher_client, child, focus, kind="story", language="ar")["content"]["language"] == "ar"


def test_growth_support_requires_an_active_focus_of_this_child(teacher_client, adam, db, teacher, make_child, klass):
    child, focus = adam
    r = teacher_client.post(gen_url(child), json={"mode": "growth_support", "content_type": "story"})
    assert r.status_code == 400 and r.json()["error"]["details"][0]["path"] == "focus_area_id"

    paused = add_focus(db, child, teacher, status="paused", suggestion_key="taking_turns", title="Taking turns")
    r = teacher_client.post(gen_url(child), json={"mode": "growth_support", "content_type": "story",
                                                  "focus_area_id": str(paused.id)})
    assert r.status_code == 400

    other = make_child(klass, name="Lina")
    other_focus = add_focus(db, other, teacher)
    r = teacher_client.post(gen_url(child), json={"mode": "growth_support", "content_type": "story",
                                                  "focus_area_id": str(other_focus.id)})
    assert r.status_code == 400

    r = teacher_client.post(gen_url(child), json={"mode": "strength_builder", "content_type": "story",
                                                  "target_strength": "building", "focus_area_id": str(focus.id)})
    assert r.status_code == 400
    assert db.scalars(select(GeneratedContent)).all() == []


def test_strength_builder_target_must_be_a_profile_strength_or_a_target(teacher_client, adam):
    child, _ = adam
    body = {"mode": "strength_builder", "content_type": "story"}
    r = teacher_client.post(gen_url(child), json=body)
    assert r.status_code == 400 and r.json()["error"]["details"][0]["path"] == "target_strength"
    r = teacher_client.post(gen_url(child), json={**body, "target_strength": "music"})  # a strength, not Adam's
    assert r.status_code == 400
    assert teacher_client.post(gen_url(child), json={**body, "target_strength": "building"}).status_code == 201
    assert teacher_client.post(gen_url(child), json={**body, "target_strength": "storytelling"}).status_code == 201


def test_template_and_include_video_only_where_they_apply(teacher_client, adam):
    child, focus = adam
    base = {"mode": "growth_support", "focus_area_id": str(focus.id)}
    assert teacher_client.post(gen_url(child), json={**base, "content_type": "story", "template": "sequence"}).status_code == 400
    assert teacher_client.post(gen_url(child), json={**base, "content_type": "story", "include_video": True}).status_code == 400
    assert teacher_client.post(gen_url(child), json={**base, "content_type": "digital_game", "template": "nope"}).status_code == 400
    out = generate(teacher_client, child, focus, kind="digital_game", template="sequence")
    assert out["content"]["template"] == "sequence"


def test_pack_is_split_into_rows_sharing_one_pack_id(teacher_client, adam, db):
    child, focus = adam
    out = generate(teacher_client, child, focus, kind="pack")
    items, pack_id = out["items"], out["pack_id"]
    assert [i["content_type"] for i in items] == ["story", "real_world_activity", "digital_game"]
    assert {i["pack_id"] for i in items} == {pack_id}
    assert all(i["status"] == "draft" and i["focus_area_id"] == str(focus.id) for i in items)
    story = items[0]["content"]
    assert len(story["questions"]) == 3 and len(story["discussion_prompts"]) == 3
    assert "discussion_prompts" not in items[1]["content"]
    assert len(db.scalars(select(GeneratedContent).where(GeneratedContent.pack_id == pack_id)).all()) == 3

    listed = teacher_client.get(f"/api/children/{child.id}/content", params={"pack_id": pack_id}).json()["content"]
    assert {i["id"] for i in listed} == {i["id"] for i in items}
    pack = teacher_client.get(f"/api/packs/{pack_id}").json()
    assert pack["child_id"] == str(child.id)
    assert [i["content_type"] for i in pack["items"]] == ["story", "real_world_activity", "digital_game"]
    assert teacher_client.get("/api/packs/not-a-uuid").status_code == 404


def test_pack_with_video_only_when_requested(teacher_client, adam):
    child, focus = adam
    items = generate(teacher_client, child, focus, kind="pack", include_video=True)["items"]
    assert [i["content_type"] for i in items] == ["story", "real_world_activity", "digital_game", "video"]
    assert items[3]["video_status"] == "script_ready"
    assert 30 <= items[3]["content"]["duration_seconds"] <= 90


def test_generation_input_reads_the_current_understanding(teacher_client, adam, db):
    child, focus = adam
    set_profile(db, child, strengths=("imagination",), interests=("cars_transportation",),
                understanding={"summary": "Joins shared building more often.", "next_steps": "Invite a friend."})
    gi = generate(teacher_client, child, focus, kind="story")["content"]["generation_input"]
    assert gi["current_understanding"]["summary"] == "Joins shared building more often."
    assert gi["current_understanding"]["next_steps"] == "Invite a friend."


def test_context_uses_focus_observations_and_masks_classmates(teacher_client, adam, db, teacher, make_child, klass):
    child, focus = adam
    make_child(klass, name="Omar Haddad")
    db.add(Observation(child_id=child.id, focus_area_id=focus.id, observation="Adam asked Omar to build a road.",
                       created_by=teacher.id))
    db.add(Observation(child_id=child.id, observation="Painted at the easel.", created_by=teacher.id))
    db.commit()
    gi = generate(teacher_client, child, focus, kind="story")["content"]["generation_input"]
    assert gi["recent_observations"] == ["[child] asked [friend] to build a road."]
    # strength_builder has no focus: only observations tagged with the strength's AI domains are
    # sent (building → fine_motor, play), never unrelated recent ones (COVERAGE-MATRIX §7.3).
    gi = generate(teacher_client, child, mode="strength_builder", kind="story")["content"]["generation_input"]
    assert gi["recent_observations"] == [] and gi["domains"] == {}
    db.add(Observation(child_id=child.id, observation="Adam built a tall tower with Omar.", domains=["fine_motor"],
                       created_by=teacher.id))
    db.commit()
    gi = generate(teacher_client, child, mode="strength_builder", kind="story")["content"]["generation_input"]
    assert list(gi["domains"]) == ["fine_motor"]
    assert [o["text"] for o in gi["domains"]["fine_motor"]["observations"]] == ["[child] built a tall tower with [friend]."]


def test_context_masks_the_kindergarten_and_the_adults(teacher_client, adam, db, teacher, make_child, make_class,
                                                       make_user):
    from app.services.content import adult_names, classmate_names

    child, focus = adam
    child.name, child.parent_name = "Adam Haddad", "Rana Haddad"
    db.commit()
    dana = make_user("teacher", name="Dana Cohen")
    yard = make_class("Class C", teachers=[dana])  # another class of the same kindergarten
    make_child(yard, name="Lina Saleh")
    make_child(None, name="Sami")  # not in a class yet
    elsewhere = make_class("Class D", kindergarten="Other KG", teachers=[make_user("teacher", name="Yara Kassem")])
    make_child(elsewhere, name="Huda")
    db.add(Observation(child_id=child.id, focus_area_id=focus.id, created_by=teacher.id,
                       observation="Adam Haddad played with Lina and Sami while Rana and Dana watched."))
    db.commit()
    gi = generate(teacher_client, child, focus, kind="story")["content"]["generation_input"]
    assert gi["recent_observations"] == ["[child] played with [friend] and [friend] while [adult] and [adult] watched."]

    assert {"Lina Saleh", "Sami"} <= set(classmate_names(db, child)) and "Huda" not in classmate_names(db, child)
    assert set(adult_names(db, child)) == {"Rana Haddad", "Parent", "Teacher", "Dana Cohen"}
    loner = make_child(None, name="Omar")  # without a class: every other child and every teacher
    assert {"Adam Haddad", "Lina Saleh", "Sami", "Huda"} <= set(classmate_names(db, loner))
    assert {"Teacher", "Dana Cohen", "Yara Kassem"} <= set(adult_names(db, loner))


def test_scope_and_roles_for_generation(other_teacher_client, parent_client, adam):
    child, focus = adam
    body = {"mode": "growth_support", "content_type": "story", "focus_area_id": str(focus.id)}
    assert other_teacher_client.post(gen_url(child), json=body).status_code == 404
    assert parent_client.post(gen_url(child), json=body).status_code == 403
    assert other_teacher_client.get(f"/api/children/{child.id}/content").status_code == 404


# --------------------------------------------------------------------------- parents


def test_parent_sees_only_shared_approved_content_without_teacher_data(teacher_client, parent_client,
                                                                       other_parent_client, adam):
    child, focus = adam
    story = generate(teacher_client, child, focus, kind="story")["content"]
    other = generate(teacher_client, child, focus, kind="real_world_activity")["content"]
    list_url = f"/api/children/{child.id}/content"
    item_url = f"/api/content/{story['id']}"

    assert parent_client.get(list_url).json() == {"content": []}
    assert parent_client.get(item_url).status_code == 404  # draft
    assert parent_client.post(f"/api/content/{story['id']}/approve").status_code == 404  # invisible → 404
    approve(teacher_client, story["id"])
    assert parent_client.get(item_url).status_code == 404  # approved but not shared
    r = teacher_client.post(f"/api/content/{story['id']}/share", json={"shared": True})
    assert r.status_code == 200 and r.json()["content"]["shared_with_parent"] is True

    listed = parent_client.get(list_url).json()["content"]
    assert [c["id"] for c in listed] == [story["id"]]
    seen = parent_client.get(item_url).json()["content"]
    assert seen["title"] == story["title"] and seen["content"]["story"] == story["content"]["story"]
    assert "teacher_note" not in seen["content"]
    for hidden in ("generation_input", "focus_area_id", "focus_area_title", "mode", "feedback", "ai_provider",
                   "is_template", "created_by", "approved_by", "shared_with_parent"):
        assert hidden not in seen
    assert "teacher_note" in teacher_client.get(item_url).json()["content"]["content"]
    # writes stay staff-only, even on visible content
    assert parent_client.post(f"/api/content/{story['id']}/archive").status_code == 403
    assert parent_client.get(f"/api/content/{other['id']}").status_code == 404
    assert other_parent_client.get(item_url).status_code == 404
    assert other_parent_client.get(list_url).status_code == 404

    # back to draft (edit) hides it again
    teacher_client.put(item_url, json={"title": "A new title"})
    assert parent_client.get(item_url).status_code == 404
    assert parent_client.get(list_url).json()["content"] == []


def test_share_needs_approved_or_completed(teacher_client, adam, db):
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="story")["content"]
    r = teacher_client.post(f"/api/content/{c['id']}/share", json={"shared": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_TRANSITION"
    assert teacher_client.post(f"/api/content/{c['id']}/share", json={"shared": False}).status_code == 200
    approve(teacher_client, c["id"])
    assert teacher_client.post(f"/api/content/{c['id']}/share", json={"shared": True}).status_code == 200
    (row,) = audit_rows(db, "content.share")
    assert row.meta == {"shared": True}


# --------------------------------------------------------------------------- edit / transitions


def test_edit_draft_and_approved_returns_to_draft(teacher_client, adam, db):
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="story")["content"]
    url = f"/api/content/{c['id']}"
    r = teacher_client.put(url, json={"title": "Adam and the Garage"})
    assert r.status_code == 200
    assert r.json()["content"]["title"] == "Adam and the Garage" == r.json()["content"]["content"]["title"]

    approve(teacher_client, c["id"])
    new = dict(r.json()["content"]["content"])
    new["story"] = ["Adam built a garage.", "His friend added a roof."]
    r = teacher_client.put(url, json={"content": new})
    assert r.status_code == 200
    out = r.json()["content"]
    assert out["status"] == "draft" and out["approved_at"] is None and out["content"]["story"] == new["story"]
    edits = audit_rows(db, "content.edit")
    assert [e.meta["from_status"] for e in edits] == ["draft", "approved"]
    assert "story" in edits[1].meta["fields"]


def test_edit_with_unsafe_wording_is_422_and_bad_shape_is_400(teacher_client, adam, db):
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="story")["content"]
    url = f"/api/content/{c['id']}"
    bad = dict(c["content"], story=["Adam has a diagnosis.", "He builds."])
    r = teacher_client.put(url, json={"content": bad})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "UNSAFE_CONTENT" and any("diagnosis" in i for i in err["details"]["issues"])
    r = teacher_client.put(url, json={"content": dict(c["content"], questions=[])})
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION"
    r = teacher_client.put(url, json={"content": dict(c["content"], extra="x")})
    assert r.status_code == 400
    r = teacher_client.put(url, json={})
    assert r.status_code == 400
    db.expire_all()
    assert db.get(GeneratedContent, c["id"]).content == c["content"]


def test_edit_game_keeps_its_template_and_pack_prompts_are_checked(teacher_client, adam):
    child, focus = adam
    game = generate(teacher_client, child, focus, kind="digital_game", template="sequence")["content"]
    other = {"template": "multiple_choice", "title": "Choose",
             "rounds": [{"question": "Which?", "choices": [{"label": "A"}, {"label": "B"}],
                         "correct_or_preferred_answer": 0, "explanation": "Good."}]}
    assert teacher_client.put(f"/api/content/{game['id']}", json={"content": other}).status_code == 400
    items = generate(teacher_client, child, focus, kind="pack")["items"]
    story = items[0]
    url = f"/api/content/{story['id']}"
    edited = dict(story["content"], discussion_prompts=["What did you build?", "Who helped?"])
    r = teacher_client.put(url, json={"content": edited})
    assert r.status_code == 200 and r.json()["content"]["content"]["discussion_prompts"] == edited["discussion_prompts"]
    r = teacher_client.put(url, json={"content": dict(story["content"], discussion_prompts=["What is your score?"])})
    assert r.status_code == 422
    r = teacher_client.put(url, json={"content": dict(story["content"], discussion_prompts=[])})
    assert r.status_code == 400


def test_completed_content_cannot_be_edited_or_regenerated_but_can_be_duplicated(teacher_client, adam, db):
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="story")["content"]
    approve(teacher_client, c["id"])
    assert teacher_client.post(f"/api/content/{c['id']}/feedback", json={"result": "worked_well"}).status_code == 201
    url = f"/api/content/{c['id']}"
    r = teacher_client.put(url, json={"title": "Changed"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_TRANSITION"
    assert teacher_client.post(f"{url}/regenerate", json={}).status_code == 409

    r = teacher_client.post(f"{url}/duplicate")
    assert r.status_code == 201
    copy = r.json()["content"]
    assert copy["id"] != c["id"] and copy["status"] == "draft" and copy["pack_id"] is None
    assert copy["content"] == c["content"] and copy["shared_with_parent"] is False
    assert teacher_client.put(f"/api/content/{copy['id']}", json={"title": "Changed"}).status_code == 200
    (dup,) = audit_rows(db, "content.duplicate")
    assert dup.meta["source_id"] == c["id"] and dup.meta["source_status"] == "completed"


def test_regenerate_keeps_id_bumps_variant_and_returns_to_draft(teacher_client, adam, db):
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="digital_game", template="match_pairs")["content"]
    approve(teacher_client, c["id"])
    r = teacher_client.post(f"/api/content/{c['id']}/regenerate", json={"instruction": "Use buses please"})
    assert r.status_code == 200, r.text
    out = r.json()["content"]
    assert out["id"] == c["id"] and out["variant"] == 1 and out["status"] == "draft"
    assert out["template"] == "match_pairs"
    assert out["generation_input"]["variant"] == 1 and out["generation_input"]["instruction"] == "Use buses please"
    r = teacher_client.post(f"/api/content/{c['id']}/regenerate")  # body is optional
    assert r.status_code == 200 and r.json()["content"]["variant"] == 2
    (first, second) = audit_rows(db, "content.regenerate")
    assert first.meta["from_status"] == "approved" and first.meta["variant"] == 1 and first.meta["with_instruction"]


def test_regenerate_pack_story_keeps_discussion_prompts(teacher_client, adam):
    child, focus = adam
    story = generate(teacher_client, child, focus, kind="pack")["items"][0]
    out = teacher_client.post(f"/api/content/{story['id']}/regenerate", json={}).json()["content"]
    assert out["content_type"] == "story" and len(out["content"]["discussion_prompts"]) == 3
    assert out["pack_id"] == story["pack_id"] and out["variant"] == 1


def test_delete_only_drafts_and_archive_from_any_status(teacher_client, adam, db):
    child, focus = adam
    draft = generate(teacher_client, child, focus, kind="story")["content"]
    used = generate(teacher_client, child, focus, kind="story")["content"]
    approve(teacher_client, used["id"])
    r = teacher_client.delete(f"/api/content/{used['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_TRANSITION"
    assert teacher_client.post(f"/api/content/{used['id']}/approve").status_code == 200  # idempotent
    assert teacher_client.delete(f"/api/content/{draft['id']}").status_code == 204
    db.expire_all()
    gone = db.get(GeneratedContent, draft["id"])  # a soft delete (OQ-5): the row stays, hidden everywhere
    assert gone is not None and gone.deleted_at is not None and gone.status == "draft"
    assert teacher_client.get(f"/api/content/{draft['id']}").status_code == 404

    teacher_client.post(f"/api/content/{used['id']}/feedback", json={"result": "partly"})
    r = teacher_client.post(f"/api/content/{used['id']}/archive")
    assert r.status_code == 200 and r.json()["content"]["status"] == "archived"
    assert teacher_client.delete(f"/api/content/{used['id']}").status_code == 409
    assert teacher_client.post(f"/api/content/{used['id']}/approve").status_code == 409
    assert teacher_client.post(f"/api/content/{used['id']}/share", json={"shared": True}).status_code == 409
    assert [a.meta["from_status"] for a in audit_rows(db, "content.archive")] == ["completed"]
    assert len(audit_rows(db, "content.delete")) == 1

    listed = teacher_client.get(f"/api/children/{child.id}/content", params={"status": "archived"}).json()["content"]
    assert [c["id"] for c in listed] == [used["id"]]
    assert teacher_client.get(f"/api/children/{child.id}/content", params={"status": "nope"}).status_code == 400


def test_approving_a_video_starts_the_placeholder_job(teacher_client, adam, db, teacher):
    child, focus = adam
    v = generate(teacher_client, child, focus, kind="video")["content"]
    r = teacher_client.post(f"/api/content/{v['id']}/approve")
    assert r.status_code == 200
    body = r.json()
    assert body["video_job"] == {"status": "script_ready", "provider": "none", "external_job_id": None,
                                 "notice": "provider_not_configured"}
    out = body["content"]
    assert out["status"] == "approved" and out["video_status"] == "script_ready" and out["video_provider"] == "none"
    assert out["video_url"] is None and out["approved_by"]["id"] == str(teacher.id)
    (row,) = audit_rows(db, "content.approve")
    assert row.meta["video_status"] == "script_ready"


def test_list_groups_by_status_with_last_feedback(teacher_client, adam):
    child, focus = adam
    a = generate(teacher_client, child, focus, kind="story")["content"]
    b = generate(teacher_client, child, focus, kind="real_world_activity")["content"]
    approve(teacher_client, b["id"])
    teacher_client.post(f"/api/content/{b['id']}/feedback", json={"result": "partly"})
    listed = teacher_client.get(f"/api/children/{child.id}/content").json()["content"]
    by_id = {c["id"]: c for c in listed}
    assert by_id[a["id"]]["status"] == "draft" and by_id[a["id"]]["last_feedback_result"] is None
    assert by_id[b["id"]]["status"] == "completed" and by_id[b["id"]]["last_feedback_result"] == "partly"
    assert "content" not in by_id[a["id"]] and "generation_input" not in by_id[a["id"]]
    drafts = teacher_client.get(f"/api/children/{child.id}/content", params={"status": "draft"}).json()["content"]
    assert [c["id"] for c in drafts] == [a["id"]]


# --------------------------------------------------------------------------- spec examples


def test_adam_spec_44_loop(teacher_client, adam, db):
    """Growth Support → real-world activity "Build the Garage Together" → approve →
    feedback "partly" with a note → a mirrored observation → one timeline entry."""
    child, focus = adam
    c = generate(teacher_client, child, focus, mode="growth_support", kind="real_world_activity")["content"]
    activity = c["content"]
    assert "garage" in c["title"].lower()
    assert any(ADAM_PHRASE in step for step in activity["instructions"])
    observe = " ".join(activity["what_to_observe"]).lower()
    assert "initiate" in observe and "other child's idea" in observe and "adult support" in observe
    assert c["generation_input"]["focus"]["suggestion_key"] == "joining_group_play"
    assert c["generation_input"]["focus"]["plan"]["what_we_will_do"] == "Build the garage together"

    approve(teacher_client, c["id"])
    note = "Joined after prompting and stayed 8 minutes."
    r = teacher_client.post(f"/api/content/{c['id']}/feedback",
                            json={"result": "partly", "observation": note, "support_level": "some_support",
                                  "what_helped": ["adult_mediation"]})
    assert r.status_code == 201, r.text
    assert r.json()["content"]["status"] == "completed"

    db.expire_all()
    (obs,) = db.scalars(select(Observation).where(Observation.child_id == child.id)).all()
    assert obs.source == "content_feedback" and obs.observation == note
    assert str(obs.content_id) == c["id"] and obs.focus_area_id == focus.id

    entries = teacher_client.get(f"/api/children/{child.id}/timeline").json()["entries"]
    fb = [e for e in entries if e["type"] == "content_feedback"]
    assert len(fb) == 1
    assert fb[0]["text"] == note and fb[0]["result"] == "partly" and fb[0]["content_id"] == c["id"]
    assert fb[0]["focus_area_title"] == "Joining group play"
    assert [e["type"] for e in entries].count("content_approved") == 1


def test_adam_garage_game_loop(teacher_client, adam):
    """The game version of §44: growth_support digital_game → approve → feedback partly with the
    8-minute note → the timeline shows the approved content and the feedback."""
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="digital_game")["content"]
    assert c["template"] == "what_happens_next" and "Car" in c["title"]
    approve(teacher_client, c["id"])
    note = "Joined after prompting and stayed 8 minutes."
    assert teacher_client.post(f"/api/content/{c['id']}/feedback",
                               json={"result": "partly", "observation": note}).status_code == 201
    entries = teacher_client.get(f"/api/children/{child.id}/timeline").json()["entries"]
    approved = [e for e in entries if e["type"] == "content_approved"]
    feedback = [e for e in entries if e["type"] == "content_feedback"]
    assert len(approved) == 1 and approved[0]["content_id"] == c["id"] and approved[0]["status"] == "completed"
    assert len(feedback) == 1 and feedback[0]["text"] == note and feedback[0]["result"] == "partly"


def test_maya_spec_45_story_builder(teacher_client, maya):
    out = generate(teacher_client, maya, mode="strength_builder", kind="digital_game", target_strength="storytelling",
                   template="story_builder")["content"]
    game = out["content"]
    assert out["template"] == "story_builder" and game["template"] == "story_builder"
    assert 3 <= len(game["steps"]) <= 5 and game["closing_prompt"] == "Now tell your story!"
    assert "correct_or_preferred_answer" not in json.dumps(game)
    assert out["generation_input"]["target_strength"]["key"] == "storytelling"
    # without a template, Maya's storytelling goal picks the story builder too
    auto = generate(teacher_client, maya, mode="strength_builder", kind="digital_game",
                    target_strength="storytelling")["content"]
    assert auto["template"] == "story_builder"


# --------------------------------------------------------------------------- history, soft delete, AI domains (WP2-AI)


def versions(client, content_id, expect=200):
    r = client.get(f"/api/content/{content_id}/versions")
    assert r.status_code == expect, r.text
    return r.json()["versions"] if expect == 200 else None


def test_generate_edit_and_regenerate_each_add_a_version(teacher_client, adam, db):
    """X-15: content is never overwritten; the AI draft and every edit stay in record_versions."""
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="story")["content"]
    first_title = c["title"]
    (v1,) = versions(teacher_client, c["id"])
    assert (v1["seq"], v1["via"], v1["entity_type"], v1["changed_by_name"]) == (1, "generated", "content", "Teacher")
    assert v1["data"]["title"] == first_title and v1["data"]["content"]["title"] == first_title
    assert v1["data"]["is_template"] is True and v1["data"]["generation_input"]["name"] == "[child]"

    r = teacher_client.put(f"/api/content/{c['id']}", json={"title": "A garage for everyone"})
    assert r.status_code == 200, r.text
    # an unchanged save adds nothing
    assert teacher_client.put(f"/api/content/{c['id']}", json={"title": "A garage for everyone"}).status_code == 200
    r = teacher_client.post(f"/api/content/{c['id']}/regenerate", json={"instruction": "Use buses"})
    assert r.status_code == 200, r.text
    listed = versions(teacher_client, c["id"])
    assert [(v["seq"], v["via"]) for v in listed] == [(3, "regenerated"), (2, "edited"), (1, "generated")]
    assert listed[1]["data"]["title"] == "A garage for everyone" and listed[2]["data"]["title"] == first_title
    assert listed[0]["data"]["variant"] == 1 and listed[0]["data"]["generation_input"]["instruction"] == "Use buses"

    dup = teacher_client.post(f"/api/content/{c['id']}/duplicate").json()["content"]
    assert [(v["seq"], v["via"]) for v in versions(teacher_client, dup["id"])] == [(1, "manual")]


def test_pack_rows_each_get_a_version(teacher_client, adam, db):
    child, focus = adam
    items = generate(teacher_client, child, focus, kind="pack")["items"]
    for item in items:
        assert [v["via"] for v in versions(teacher_client, item["id"])] == ["generated"]


def test_a_row_without_history_keeps_its_state_before_the_first_change(teacher_client, adam, db, teacher):
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="real_world_activity")["content"]
    original = db.get(GeneratedContent, c["id"])
    old = GeneratedContent(child_id=child.id, focus_area_id=focus.id, mode="growth_support",
                           content_type="real_world_activity", language="en", title="Old activity",
                           content={**original.content, "title": "Old activity"}, status="approved",
                           generation_input=original.generation_input, ai_provider="template",
                           ai_model="kidsphere-template-1", is_template=True, created_by=teacher.id)
    db.add(old)
    db.commit()
    r = teacher_client.put(f"/api/content/{old.id}", json={"title": "Old activity, renewed"})
    assert r.status_code == 200, r.text
    listed = versions(teacher_client, old.id)
    assert [(v["seq"], v["via"], v["changed_role"]) for v in listed] == [(2, "edited", "teacher"), (1, "system", "system")]
    assert listed[1]["data"]["title"] == "Old activity" and listed[1]["data"]["status"] == "approved"
    assert listed[0]["data"]["status"] == "draft"


def test_versions_are_staff_only(teacher_client, parent_client, other_teacher_client, adam, db):
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="story")["content"]
    approve(teacher_client, c["id"])
    teacher_client.post(f"/api/content/{c['id']}/share", json={"shared": True})
    assert parent_client.get(f"/api/content/{c['id']}").status_code == 200  # shared with the parent
    versions(parent_client, c["id"], expect=404)
    versions(other_teacher_client, c["id"], expect=404)
    versions(teacher_client, "not-a-uuid", expect=404)


def test_soft_deleted_drafts_disappear_everywhere(teacher_client, adam, db):
    """OQ-5: DELETE keeps the row (deleted_at/deleted_by); lists, packs and every action hide it."""
    child, focus = adam
    items = generate(teacher_client, child, focus, kind="pack")["items"]
    story, pack_id = items[0], items[0]["pack_id"]
    assert teacher_client.delete(f"/api/content/{story['id']}").status_code == 204
    db.expire_all()
    row = db.get(GeneratedContent, story["id"])
    assert row.deleted_at is not None and row.deleted_by is not None and row.status == "draft"
    listed = teacher_client.get(f"/api/children/{child.id}/content").json()["content"]
    assert story["id"] not in {c["id"] for c in listed} and len(listed) == len(items) - 1
    assert story["id"] not in {c["id"] for c in teacher_client.get(f"/api/packs/{pack_id}").json()["items"]}
    url = f"/api/content/{story['id']}"
    assert teacher_client.get(url).status_code == 404
    assert teacher_client.put(url, json={"title": "x"}).status_code == 404
    for action in ("approve", "regenerate", "duplicate", "archive"):
        assert teacher_client.post(f"{url}/{action}", json={}).status_code == 404, action
    assert teacher_client.post(f"{url}/share", json={"shared": False}).status_code == 404
    assert teacher_client.delete(url).status_code == 404
    versions(teacher_client, story["id"], expect=404)
    # The versions are kept.
    assert db.scalar(select(RecordVersion.id).where(RecordVersion.entity_id == row.id)) is not None
    (audit_row,) = audit_rows(db, "content.delete")
    assert audit_row.meta["soft"] is True


def test_draft_count_ignores_deleted_drafts(teacher_client, adam):
    child, focus = adam
    a = generate(teacher_client, child, focus, kind="story")["content"]
    generate(teacher_client, child, focus, kind="story")
    assert teacher_client.delete(f"/api/content/{a['id']}").status_code == 204
    assert teacher_client.get(f"/api/children/{child.id}").json()["child"]["draft_content_count"] == 1


def _assessment_cache():
    return {
        "emotional": {"status": "in_progress", "data": {
            "items": {"calms_after_frustration": {"level": "some_support", "note": "SECRET-EMO-NOTE"}},
            "fields": {"what_makes_it_harder": {"text": "SECRET-HARDER"}}}},
        "independence": {"status": "sufficient", "data": {"items": {
            "dressing": {"level": "some_support", "note": "SECRET-DRESS-NOTE"},
            "eating": {"level": "independent"},
            "toilet": {"level": "not_observed"}}}},
        "sensory": {"status": "in_progress", "data": {"items": {
            "noise": {"effect": "affects", "reaction_text": "SECRET-COVERS-EARS", "helps": ["reduced_stimulation"]},
            "light": {"effect": "no_visible_effect"},
            "smells": {"effect": "sometimes"}}}},
    }


def test_content_sends_only_the_focus_domains(teacher_client, adam, db, teacher, make_assessment):
    """X-28: a focus in category independence sends only the independence block; the domains are recorded."""
    child, _ = adam
    focus = add_focus(db, child, teacher, suggestion_key="dressing_independently", title="Dressing for the yard",
                      category="independence")
    make_assessment(child, created_by=teacher, domains=_assessment_cache())
    db.add_all([
        Observation(child_id=child.id, observation="Put on the coat with a picture card.", domains=["independence"],
                    details={"needs": {"helps": ["visual_support"], "text": "SECRET-NEEDS-TEXT"}},
                    note="SECRET-OBS-NOTE", created_by=teacher.id),
        Observation(child_id=child.id, observation="Shared the blocks in the corner.", domains=["social"],
                    created_by=teacher.id),
    ])
    db.commit()
    gi = generate(teacher_client, child, focus, kind="real_world_activity")["content"]["generation_input"]
    assert list(gi["domains"]) == ["independence"]
    block = gi["domains"]["independence"]
    # In the registry's question order (eating before dressing), whatever the JSONB key order.
    assert block["assessment"] == [{"item": "eating", "level": "independent", "effect": None, "helps": []},
                                   {"item": "dressing", "level": "some_support", "effect": None, "helps": []}]
    assert [o["text"] for o in block["observations"]] == ["Put on the coat with a picture card."]
    assert block["helps"] == ["visual_support"]
    dumped = json.dumps(gi)
    assert "SECRET" not in dumped and "Shared the blocks" not in dumped and "calms_after_frustration" not in dumped
    # avoid: only what the teacher observed (noise affects, smells sometimes -> strong_smells)
    assert gi["avoid"] == ["noise", "strong_smells"]


def test_parent_reported_sensitivities_never_become_avoid(teacher_client, adam, db):
    child, focus = adam
    profile = db.scalar(select(ChildProfile).where(ChildProfile.child_id == child.id))
    profile.sensitivities = [{"key": "certain_foods", "sources": ["parent"]}, {"key": "noise", "sources": ["parent"]}]
    db.commit()
    gi = generate(teacher_client, child, focus, kind="story")["content"]["generation_input"]
    assert gi["avoid"] == [] and "certain_foods" not in json.dumps(gi)
