"""People in the child's life (0004): the list and its photos, content that includes them, and
what the AI may see of them (only a placeholder and the relation, never a name or photo)."""
import io
import json

import pytest
from alembic import command
from PIL import Image
from sqlalchemy import inspect, select, text

from app.ai import template_provider
from app.ai.context import build_context
from app.ai.service import generate as ai_generate
from app.ai.service import validate_output
from app.config import settings
from app.db import engine
from app.models import AuditLog, ChildPerson, GeneratedContent
from app.services import people as people_svc
from tests.conftest import alembic_config
from tests.test_ai_service import CHILD, FOCUS, PROFILE, TODAY, FakeClaude
from tests.test_content import add_focus, generate, set_profile


@pytest.fixture(autouse=True)
def _no_key(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")


def _image(fmt="PNG", size=(40, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (90, 160, 220)).save(buf, fmt)
    return buf.getvalue()


def add_person(client, child, relation="grandfather", name="Sido", expect=201):
    r = client.post(f"/api/children/{child.id}/people", json={"relation": relation, "display_name": name})
    assert r.status_code == expect, r.text
    return r.json().get("person")


@pytest.fixture
def adam(db, child, teacher):
    child.main_language = "en"
    child.gender = "boy"
    db.commit()
    set_profile(db, child, strengths=("imagination", "building"), interests=("cars_transportation", "animals"),
                what_helps=("adult_mediation",))
    return child, add_focus(db, child, teacher)


# --------------------------------------------------------------------------- the list


def test_staff_manage_people_and_parents_read_them(db, teacher_client, parent_client, other_teacher_client,
                                                   other_parent_client, client, child):
    grandpa = add_person(teacher_client, child)
    assert grandpa["relation"] == "grandfather" and grandpa["display_name"] == "Sido"
    assert grandpa["has_photo"] is False and grandpa["child_id"] == str(child.id)
    add_person(teacher_client, child, "sister", "Lulu")

    listing = parent_client.get(f"/api/children/{child.id}/people")
    assert listing.status_code == 200
    assert [p["display_name"] for p in listing.json()["people"]] == ["Sido", "Lulu"]
    assert listing.json()["max"] == people_svc.MAX_PEOPLE

    # Parents read, but never write; other teachers and parents do not see the child at all.
    add_person(parent_client, child, expect=403)
    assert parent_client.put(f"/api/people/{grandpa['id']}", json={"display_name": "X"}).status_code == 403
    assert parent_client.delete(f"/api/people/{grandpa['id']}").status_code == 403
    assert other_teacher_client.get(f"/api/children/{child.id}/people").status_code == 404
    assert other_teacher_client.put(f"/api/people/{grandpa['id']}", json={"display_name": "X"}).status_code == 404
    assert other_parent_client.get(f"/api/children/{child.id}/people").status_code == 404
    assert client.get(f"/api/children/{child.id}/people").status_code == 401

    r = teacher_client.put(f"/api/people/{grandpa['id']}", json={"display_name": "Grandpa Ali", "relation": "uncle"})
    assert r.status_code == 200, r.text
    assert r.json()["person"]["display_name"] == "Grandpa Ali" and r.json()["person"]["relation"] == "uncle"

    assert teacher_client.delete(f"/api/people/{grandpa['id']}").status_code == 204
    assert [p["display_name"] for p in teacher_client.get(f"/api/children/{child.id}/people").json()["people"]] == ["Lulu"]

    actions = [a.action for a in db.scalars(select(AuditLog).order_by(AuditLog.id))]
    assert actions.count("person.create") == 2 and "person.update" in actions and "person.delete" in actions
    # Audit metadata holds keys and field names, never the name the child uses.
    assert not any("Sido" in json.dumps(a.meta) or "Lulu" in json.dumps(a.meta)
                   for a in db.scalars(select(AuditLog)))


def test_relation_and_name_are_validated(teacher_client, child):
    add_person(teacher_client, child, relation="neighbour_cat", expect=400)
    add_person(teacher_client, child, name="", expect=400)
    add_person(teacher_client, child, name="x" * 41, expect=400)
    p = add_person(teacher_client, child)
    assert teacher_client.put(f"/api/people/{p['id']}", json={"relation": "boss"}).status_code == 400
    assert teacher_client.put(f"/api/people/{p['id']}", json={"display_name": None}).status_code == 400
    r = teacher_client.post(f"/api/children/{child.id}/people", json={"relation": "pet", "display_name": "Mish",
                                                                     "photo": "x"})
    assert r.status_code == 400  # unknown fields are rejected


def test_at_most_twelve_people(teacher_client, child):
    for i in range(people_svc.MAX_PEOPLE):
        add_person(teacher_client, child, "friend", f"Friend {i}")
    r = teacher_client.post(f"/api/children/{child.id}/people", json={"relation": "friend", "display_name": "One more"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"


# --------------------------------------------------------------------------- photos


def test_person_photo_is_reencoded_served_privately_and_removed(db, teacher_client, parent_client,
                                                                 other_parent_client, child, _upload_dir):
    p = add_person(teacher_client, child)
    assert teacher_client.get(f"/api/people/{p['id']}/photo").status_code == 404  # none yet
    r = teacher_client.put(f"/api/people/{p['id']}/photo", files={"file": ("me.png", _image(), "image/png")})
    assert r.status_code == 200, r.text
    assert r.json()["person"]["has_photo"] is True
    files = sorted((_upload_dir / "people").glob("*"))
    assert len(files) == 1 and files[0].suffix == ".jpg"
    assert files[0].name not in r.text

    got = parent_client.get(f"/api/people/{p['id']}/photo")
    assert got.status_code == 200 and got.headers["content-type"] == "image/jpeg"
    assert got.headers["cache-control"] == "private, no-store"
    assert got.content[:3] == b"\xff\xd8\xff"
    assert other_parent_client.get(f"/api/people/{p['id']}/photo").status_code == 404

    # Parents may not change it; a non-image is refused.
    assert parent_client.put(f"/api/people/{p['id']}/photo",
                             files={"file": ("me.png", _image(), "image/png")}).status_code == 403
    bad = teacher_client.put(f"/api/people/{p['id']}/photo", files={"file": ("x.png", b"not an image", "image/png")})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "UPLOAD_FAILED"

    # Replacing deletes the old file; deleting the person deletes the photo too.
    teacher_client.put(f"/api/people/{p['id']}/photo", files={"file": ("b.jpg", _image("JPEG"), "image/jpeg")})
    assert len(list((_upload_dir / "people").glob("*"))) == 1
    assert teacher_client.delete(f"/api/people/{p['id']}/photo").status_code == 204
    assert list((_upload_dir / "people").glob("*")) == []
    teacher_client.put(f"/api/people/{p['id']}/photo", files={"file": ("b.jpg", _image("JPEG"), "image/jpeg")})
    assert teacher_client.delete(f"/api/people/{p['id']}").status_code == 204
    assert list((_upload_dir / "people").glob("*")) == []
    actions = [a.action for a in db.scalars(select(AuditLog))]
    assert "person_photo.set" in actions and "person_photo.delete" in actions


def test_people_are_deleted_with_the_child(db, teacher_client, child):
    add_person(teacher_client, child)
    db.execute(text("DELETE FROM children WHERE id = :id"), {"id": child.id})
    db.commit()
    assert db.scalar(select(ChildPerson.id)) is None


# --------------------------------------------------------------------------- content with people


def test_story_with_people_uses_placeholders_only(db, teacher_client, parent_client, adam):
    child, focus = adam
    grandpa = add_person(teacher_client, child, "grandfather", "Sido Ali")
    sister = add_person(teacher_client, child, "sister", "Lulu")
    out = generate(teacher_client, child, focus, kind="story", people=[grandpa["id"], sister["id"]])
    c = out["content"]

    # The draft names the people by placeholder only; the client puts the names in.
    text_ = json.dumps(c["content"], ensure_ascii=False)
    assert "{grandfather}" in text_ and "{sister}" in text_
    assert "Sido" not in text_ and "Lulu" not in text_
    assert len(c["content"]["illustrations"]) == len(c["content"]["story"])

    # The AI input carries the token and relation only: no name, no id, no photo.
    gi = c["generation_input"]
    assert gi["cast"] == [
        {"token": "{grandfather}", "relation": "grandfather", "label": "Grandfather"},
        {"token": "{sister}", "relation": "sister", "label": "Sister"},
    ]
    gi_text = json.dumps(gi, ensure_ascii=False)
    for secret in ("Sido", "Lulu", grandpa["id"], sister["id"]):
        assert secret not in gi_text

    # The viewer gets each token with the display name and photo flag, and the child's name.
    cast = c["cast"]
    assert cast["child"]["name"] == "Adam" and cast["child"]["has_photo"] is False
    assert [(m["token"], m["display_name"], m["person_id"]) for m in cast["people"]] == [
        ("{grandfather}", "Sido Ali", grandpa["id"]), ("{sister}", "Lulu", sister["id"])]

    row = db.get(GeneratedContent, c["id"])
    assert row.people == [{"token": "{grandfather}", "person_id": grandpa["id"], "relation": "grandfather"},
                          {"token": "{sister}", "person_id": sister["id"], "relation": "sister"}]
    audit = db.scalars(select(AuditLog).where(AuditLog.action == "content.generate")).one()
    assert audit.meta["people"] == ["grandfather", "sister"]

    # Shared with the parent: the parent sees the same cast.
    teacher_client.post(f"/api/content/{c['id']}/approve")
    teacher_client.post(f"/api/content/{c['id']}/share", json={"shared": True})
    seen = parent_client.get(f"/api/content/{c['id']}").json()["content"]
    assert [m["display_name"] for m in seen["cast"]["people"]] == ["Sido Ali", "Lulu"]
    assert "generation_input" not in seen


def test_two_people_of_one_relation_get_numbered_tokens(teacher_client, adam):
    child, focus = adam
    a = add_person(teacher_client, child, "friend", "Rami")
    b = add_person(teacher_client, child, "friend", "Dana")
    c = generate(teacher_client, child, focus, kind="video", people=[a["id"], b["id"]])["content"]
    assert [m["token"] for m in c["cast"]["people"]] == ["{friend}", "{friend_2}"]
    scenes = c["content"]["scenes"]
    assert any("{friend} and {friend_2}" in s["narration"] for s in scenes)
    assert all(s.get("emoji") for s in scenes)


def test_story_builder_asks_who_comes_along(teacher_client, adam):
    child, focus = adam
    grandpa = add_person(teacher_client, child)
    c = generate(teacher_client, child, focus, kind="digital_game", template="story_builder",
                 people=[grandpa["id"]])["content"]
    steps = c["content"]["steps"]
    assert steps[1]["prompt"] == "Who comes along on the adventure?"
    assert steps[1]["choices"][0] == {"label": "{grandfather}", "emoji": "👴"}
    assert len(steps[1]["choices"]) == 2  # one person + the hero


def test_pack_rows_share_the_people_and_regenerate_and_duplicate_keep_them(db, teacher_client, adam):
    child, focus = adam
    grandpa = add_person(teacher_client, child)
    out = generate(teacher_client, child, focus, kind="pack", template="story_builder", people=[grandpa["id"]])
    assert all(i["cast"]["people"][0]["token"] == "{grandfather}" for i in out["items"])
    story = next(i for i in out["items"] if i["content_type"] == "story")

    r = teacher_client.post(f"/api/content/{story['id']}/regenerate", json={"instruction": "Shorter please"})
    assert r.status_code == 200, r.text
    assert r.json()["content"]["generation_input"]["cast"][0]["token"] == "{grandfather}"
    assert "{grandfather}" in json.dumps(r.json()["content"]["content"])

    dup = teacher_client.post(f"/api/content/{story['id']}/duplicate").json()["content"]
    assert dup["cast"]["people"][0]["display_name"] == "Sido"
    assert db.get(GeneratedContent, dup["id"]).people[0]["token"] == "{grandfather}"


def test_people_must_be_this_childs_and_chosen_once(teacher_client, other_teacher_client, adam, other_child):
    child, focus = adam
    mine = add_person(teacher_client, child)
    theirs = add_person(other_teacher_client, other_child)
    for people in ([theirs["id"]], [mine["id"], mine["id"]], ["00000000-0000-0000-0000-000000000000"]):
        generate(teacher_client, child, focus, kind="story", people=people, expect=400)
    many = [add_person(teacher_client, child, "friend", f"F{i}")["id"] for i in range(4)]
    generate(teacher_client, child, focus, kind="story", people=many, expect=400)


def test_teacher_edits_may_use_only_the_contents_placeholders(teacher_client, adam):
    child, focus = adam
    grandpa = add_person(teacher_client, child)
    c = generate(teacher_client, child, focus, kind="story", people=[grandpa["id"]])["content"]
    body = c["content"]
    body["story"][0] = "{grandfather} waves hello."
    ok = teacher_client.put(f"/api/content/{c['id']}", json={"content": body})
    assert ok.status_code == 200, ok.text
    body["story"][0] = "{grandmother} waves hello."
    bad = teacher_client.put(f"/api/content/{c['id']}", json={"content": body})
    assert bad.status_code == 400
    assert "{grandmother}" in bad.text

    plain = generate(teacher_client, child, focus, kind="story")["content"]
    body = plain["content"]
    body["story"][0] = "{grandfather} waves hello."
    assert teacher_client.put(f"/api/content/{plain['id']}", json={"content": body}).status_code == 400


def test_removed_person_keeps_the_token_without_a_name(teacher_client, adam):
    child, focus = adam
    grandpa = add_person(teacher_client, child)
    c = generate(teacher_client, child, focus, kind="story", people=[grandpa["id"]])["content"]
    teacher_client.delete(f"/api/people/{grandpa['id']}")
    member = teacher_client.get(f"/api/content/{c['id']}").json()["content"]["cast"]["people"][0]
    assert member == {"token": "{grandfather}", "relation": "grandfather", "person_id": None, "display_name": None,
                      "has_photo": False, "updated_at": None}


def test_people_names_are_masked_in_ai_input(db, teacher_client, adam, make_observation, teacher):
    child, focus = adam
    add_person(teacher_client, child, "grandfather", "Sido")
    add_person(teacher_client, child, "cousin", "Karim")
    add_person(teacher_client, child, "pet", "Mish")
    make_observation(child, text="Sido picked him up; he told Karim about Mish.", focus_area_id=focus.id,
                     created_by=teacher)
    gi = generate(teacher_client, child, focus, kind="story")["content"]["generation_input"]
    assert gi["recent_observations"] == ["[adult] picked him up; he told [friend] about Mish."]


# --------------------------------------------------------------------------- AI output and templates


def _ctx(kind="story", lang="en", template=None, cast=None):
    return build_context(child=CHILD, profile=PROFILE, mode="growth_support", content_type=kind, language=lang,
                         focus=FOCUS, template=template, today=TODAY,
                         cast=cast if cast is not None else [
                             {"token": "{grandfather}", "relation": "grandfather", "label": "Grandfather"}])


@pytest.mark.parametrize("lang", ["en", "ar", "he"])
@pytest.mark.parametrize("kind,template", [("story", None), ("video", None), ("digital_game", "story_builder"),
                                           ("pack", "story_builder")])
def test_template_output_with_people_is_valid_in_every_language(lang, kind, template):
    ctx = _ctx(kind, lang, template)
    data = template_provider.generate(kind, ctx, template)
    content, issues = validate_output(kind, data, template, tokens={"{grandfather}"})
    assert issues == [] and content is not None
    assert "{grandfather}" in json.dumps(content, ensure_ascii=False)
    # Without the token allowed, the same output is refused.
    assert validate_output(kind, data, template)[0] is None


def test_claude_output_with_an_unknown_placeholder_falls_back():
    ctx = _ctx("story")
    data = template_provider.generate("story", ctx)
    data["story"][0] = "{grandmother} and {grandfather} went out."
    fake = FakeClaude(data)
    result = ai_generate("story", ctx, client=fake)
    assert result.provider == "template" and result.fallback_reason == "AI_INVALID_OUTPUT"
    # The prompt explains the placeholders and carries no name.
    prompt = fake.calls[0]["messages"][0]["content"]
    assert "{grandfather}" in prompt and "People from the child's life" in prompt


def test_claude_output_using_the_cast_is_accepted():
    ctx = _ctx("story")
    data = template_provider.generate("story", ctx)
    data["title"] = "From Claude"
    result = ai_generate("story", ctx, client=FakeClaude(data))
    assert result.provider == "claude" and "{grandfather}" in json.dumps(result.content)


def test_prompt_without_people_has_no_cast_guide():
    ctx = _ctx("story", cast=[])
    data = template_provider.generate("story", ctx)
    fake = FakeClaude(data)
    ai_generate("story", ctx, client=fake)
    assert "People from the child's life" not in fake.calls[0]["messages"][0]["content"]


# --------------------------------------------------------------------------- migration 0004


def test_migration_0004_up_and_down():
    try:
        command.downgrade(alembic_config(), "0003")
        engine.dispose()
        insp = inspect(engine)
        assert "child_people" not in insp.get_table_names()
        assert "people" not in {c["name"] for c in insp.get_columns("generated_content")}
    finally:
        command.upgrade(alembic_config(), "head")
        engine.dispose()
    insp = inspect(engine)
    cols = {c["name"]: c for c in insp.get_columns("child_people")}
    assert set(cols) == {"id", "child_id", "relation", "display_name", "photo_path", "created_by", "created_at",
                         "updated_at"}
    assert cols["display_name"]["nullable"] is False and cols["photo_path"]["nullable"] is True
    people = {c["name"]: c for c in insp.get_columns("generated_content")}["people"]
    assert people["nullable"] is False
