"""Situations (Event -> Interpretation -> Emotion -> Response) that content is built around."""
import json
from datetime import date

import pytest

from app.ai import find_unsafe_text, validate_output
from app.ai.context import build_context
from app.ai.service import generate as ai_generate
from app.services import scenarios
from tests.test_content import _no_key, adam, generate  # noqa: F401  (fixtures)

LANGS = ("en", "ar", "he")
KINDS = ("story", "real_world_activity", "home_activity", "pack", "video", "digital_game")


def test_data_is_complete_and_gentle():
    d = scenarios.data()
    feelings = {f["key"] for f in d["feelings"]}
    for f in d["feelings"]:
        assert set(f["label"]) == set(f["felt"]) == set(LANGS)
    for s in d["scenarios"]:
        assert s["feeling"] in feelings and s["goals"]
        for key in ("title", "event", "interpretation", "response"):
            assert set(s[key]) == set(LANGS) and all(s[key].values()), (s["key"], key)
        texts = [s[k][lang] for k in ("title", "event", "interpretation", "response") for lang in LANGS]
        assert find_unsafe_text(texts, child_facing=True) == [], s["key"]


def test_list_is_for_staff(teacher_client, parent_client):
    out = teacher_client.get("/api/scenarios").json()
    assert len(out["scenarios"]) >= 5 and len(out["feelings"]) >= 6
    assert parent_client.get("/api/scenarios").status_code == 404


@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("key", [s["key"] for s in scenarios.data()["scenarios"]])
def test_templates_build_around_every_scenario(lang, kind, key):
    class Body:
        pass
    body = Body()
    body.key, body.event, body.interpretation, body.feeling, body.response = key, None, None, None, None
    scn = scenarios.resolve(body, lang)
    child = {"name": "Noor", "birth_date": date(2020, 5, 1), "gender": "girl"}
    ctx = build_context(child=child, profile={"interests": [{"key": "animals", "sources": ["teacher"]}]},
                        mode="growth_support", content_type=kind, language=lang,
                        focus={"id": "f", "category": "emotional", "title": "Focus"}, scenario=scn, include_video=True)
    result = ai_generate(kind, ctx)
    assert result.fallback_reason is None
    content, issues = validate_output(kind, result.content, include_video=True)
    assert issues == [], issues
    text = json.dumps(result.content, ensure_ascii=False)
    phrase = scn["response"].strip("“”«»״\"").strip()
    if kind in ("story", "real_world_activity", "home_activity", "pack"):
        assert phrase in text
    if kind == "story":
        assert scn["event"] in result.content["story"]


def test_young_children_get_event_feeling_response():
    class Body:
        key, event, interpretation, feeling, response = "toy_taken", None, None, None, None
    scn = scenarios.resolve(Body(), "en")
    young = build_context(child={"name": "Sami", "birth_date": date.today().replace(year=date.today().year - 3)},
                          mode="growth_support", content_type="story", language="en",
                          focus={"id": "f", "category": "social", "title": "Sharing"}, scenario=scn)
    story = ai_generate("story", young).content["story"]
    assert not any("thought" in p for p in story)
    older = young.model_copy(update={"age_years": 5})
    assert any("thought" in p for p in ai_generate("story", older).content["story"])


def test_generate_with_a_ready_scenario_and_regenerate_keeps_it(teacher_client, adam):  # noqa: F811
    child, focus = adam
    c = generate(teacher_client, child, focus, kind="story", scenario={"key": "not_let_play"})["content"]
    gi = c["generation_input"]["scenario"]
    assert gi["feeling_key"] == "sad" and "join" in gi["response"]
    assert "Can I join you? I can build the garage." in json.dumps(c["content"])
    r = teacher_client.post(f"/api/content/{c['id']}/regenerate", json={})
    assert r.status_code == 200, r.text
    assert r.json()["content"]["generation_input"]["scenario"]["feeling_key"] == "sad"


def test_generate_with_the_teachers_own_words_masks_names(teacher_client, adam):  # noqa: F811
    child, focus = adam
    own = {"event": "Adam's tower fell when Omar ran past.", "interpretation": "“Omar did it on purpose!”",
           "feeling": "angry", "response": "“Please be careful, my tower fell.”"}
    c = generate(teacher_client, child, focus, kind="story", scenario=own)["content"]
    gi = json.dumps(c["generation_input"]["scenario"])
    assert "Adam" not in gi and "[child]" in gi
    assert "Adam's tower fell" in json.dumps(c["content"])  # the template puts the name back


@pytest.mark.parametrize("bad", [{"key": "nope"}, {"event": "x", "response": "y"}, {"event": "x", "feeling": "angry"},
                                 {"event": "x", "feeling": "grumpy", "response": "y"}])
def test_bad_scenarios_are_rejected(teacher_client, adam, bad):  # noqa: F811
    child, focus = adam
    generate(teacher_client, child, focus, kind="story", scenario=bad, expect=400)
