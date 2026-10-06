"""Template provider: every content type x mode x language (and every game template) is valid and safe."""
import json
import re
from datetime import date

import pytest

from app import vocab
from app.ai import template_provider
from app.ai.context import build_context
from app.ai.schemas import GAME_TEMPLATES
from app.ai.service import KINDS, generate, validate_output
from app.config import settings

TODAY = date(2026, 10, 5)
LANGS = ("en", "ar", "he")
MODES = ("growth_support", "strength_builder")

ADAM = {"name": "Adam", "birth_date": date(2022, 8, 5), "gender": "boy"}
ADAM_PROFILE = {
    "strengths": [{"key": "imagination"}, {"key": "building"}, {"key": "vocabulary"}],
    "interests": [{"key": "cars_transportation"}, {"key": "blocks"}, {"key": "construction"}],
    "what_helps": [{"key": "adult_mediation"}],
}
ADAM_FOCUS = {"id": "f-adam", "category": "social", "suggestion_key": "joining_group_play", "title": "Joining group play"}
MAYA = {"name": "Maya", "birth_date": date(2021, 11, 20), "gender": "girl"}
MAYA_PROFILE = {
    "strengths": [{"key": "imagination"}, {"key": "vocabulary"}, {"key": "communication"}],
    "interests": [{"key": "animals"}],
}


@pytest.fixture(autouse=True)
def _no_key(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")


def ctx_for(mode, lang, kind="story", template=None, child=ADAM, profile=ADAM_PROFILE, focus=ADAM_FOCUS,
            target="storytelling", **kw):
    growth = mode == "growth_support"
    return build_context(child=child, profile=profile, mode=mode, content_type=kind, language=lang,
                         focus=focus if growth else None, target_strength=None if growth else target,
                         template=template, today=TODAY, **kw)


def strings(data):
    if isinstance(data, str):
        yield data
    elif isinstance(data, dict):
        for v in data.values():
            yield from strings(v)
    elif isinstance(data, list):
        for v in data:
            yield from strings(v)


def assert_clean(content, lang, gender):
    for s in strings(content):
        assert not re.search(r"\{\w+\}", s), f"unfilled slot in {s!r}"
        if lang == "he" and gender in ("boy", "girl"):
            assert not re.search(r"[א-ת]/[א-ת]", s), f"unresolved slash form in {s!r}"


@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("kind", KINDS)
def test_every_kind_mode_language(kind, mode, lang):
    ctx = ctx_for(mode, lang, kind)
    result = generate(kind, ctx)
    assert result.provider == "template" and result.is_template is True
    assert result.model == template_provider.TEMPLATE_MODEL and result.fallback_reason is None
    assert result.title
    assert_clean(result.content, lang, "boy")


@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("template", GAME_TEMPLATES)
def test_every_game_template(template, mode, lang):
    ctx = ctx_for(mode, lang, "digital_game", template=template)
    result = generate("digital_game", ctx)
    assert result.content["template"] == template
    assert_clean(result.content, lang, "boy")


def test_all_themes_suggestions_and_strengths_are_valid():
    """Every focus category, focus suggestion and strength target in every language."""
    cases = [("growth_support", {"id": "f", "category": c, "title": "Focus"}, None)
             for c in vocab.keys("priority_categories")]
    cases += [("growth_support", {"id": "f", "category": s["category"], "suggestion_key": s["key"], "title": "Focus"},
               None) for s in vocab.lists()["focus_suggestions"]]
    cases += [("strength_builder", None, k) for k in set(vocab.keys("strengths")) | set(vocab.keys("strength_targets"))]
    problems = []
    for lang in LANGS:
        for gender in ("girl", None):
            child = {"name": "Noor", "birth_date": date(2021, 5, 1), "gender": gender}
            for mode, focus, target in cases:
                for kind in KINDS:
                    ctx = build_context(child=child, profile=ADAM_PROFILE, mode=mode, content_type=kind,
                                        language=lang, focus=focus, target_strength=target, include_video=True,
                                        today=TODAY)
                    template = template_provider.pick_template(ctx) if kind in ("digital_game", "pack") else None
                    data = template_provider.generate(kind, ctx, template)
                    # Template text passes even the stricter AI-output rules (deficit and referral wording).
                    content, issues = validate_output(kind, data, template, include_video=True, ai=True)
                    if content is None:
                        problems.append((lang, mode, focus and focus.get("suggestion_key") or focus and
                                         focus["category"], target, kind, issues[:3]))
                    else:
                        assert_clean(content, lang, gender)
    assert problems == []


def test_variant_rotates_hero_and_choices():
    a = generate("digital_game", ctx_for("growth_support", "en", "digital_game", template="multiple_choice"))
    b = generate("digital_game", ctx_for("growth_support", "en", "digital_game", template="multiple_choice",
                                         variant=1))
    assert a.content != b.content
    s0 = generate("story", ctx_for("growth_support", "en"))
    s1 = generate("story", ctx_for("growth_support", "en", variant=1))
    assert s0.content["story"][0] != s1.content["story"][0]


def test_avoid_list_skips_hero():
    # "avoid" holds what the teacher observed (Domain 9); a parent-reported sensitivity alone does not count.
    profile = {**ADAM_PROFILE, "interests": [{"key": "music"}], "sensitivities": [{"key": "noise"}]}
    ctx = ctx_for("growth_support", "en", profile=profile, avoid=["noise"])
    assert "drum" not in json.dumps(generate("story", ctx).content).lower()
    ctx = ctx_for("growth_support", "en", profile=profile)
    assert ctx.avoid == [] and "drum" in json.dumps(generate("story", ctx).content).lower()


@pytest.mark.parametrize("gender", ["girl", "boy", None])
def test_gendered_wording(gender):
    child = {**ADAM, "gender": gender}
    he = generate("story", ctx_for("growth_support", "he", child=child)).content
    close = he["story"][-1]
    if gender == "girl":
        assert "את יכולה" in close
    elif gender == "boy":
        assert "אתה יכול" in close
    else:
        assert "את/ה יכול/ה" in close
    ar = generate("story", ctx_for("growth_support", "ar", child=child)).content["story"][-1]
    assert ("تستطيعين" in ar) == (gender == "girl")


# --------------------------------------------------------------------------- Adam (spec 44, PLAN B7)

ADAM_PHRASES = {
    "en": "Can we build this together?",
    "he": "אפשר לבנות את זה ביחד?",
    "ar": "هل يمكن أن نبني هذا معاً؟",
}


@pytest.mark.parametrize("lang", LANGS)
def test_adam_build_the_garage_together(lang):
    ctx = ctx_for("growth_support", lang, "real_world_activity")
    result = generate("real_world_activity", ctx)
    activity = result.content
    assert any(ADAM_PHRASES[lang] in step for step in activity["instructions"])
    assert len(activity["what_to_observe"]) == 3
    if lang == "en":
        assert result.title == "Build the Garage Together"
        observe = " ".join(activity["what_to_observe"]).lower()
        assert "initiate" in observe
        assert "other child's idea" in observe
        assert "adult support" in observe
        assert "where each car parks" in " ".join(activity["instructions"])
        assert "Toy cars" in activity["materials"]
    if lang == "he":
        assert "חניון" in result.title
        observe = " ".join(activity["what_to_observe"])
        assert "יזם" in observe and "הרעיון של הילד השני" in observe and "תמיכה של מבוגר" in observe
    if lang == "ar":
        assert "المرآب" in result.title
        observe = " ".join(activity["what_to_observe"])
        assert "بادر" in observe and "فكرة الطفل الآخر" in observe and "دعم الكبار" in observe


def test_adam_game_title_references_cars():
    result = generate("digital_game", ctx_for("growth_support", "en", "digital_game"))
    assert result.content["template"] == "what_happens_next"
    assert "Car" in result.title
    first = result.content["rounds"][0]
    preferred = first["choices"][first["correct_or_preferred_answer"]]["label"]
    assert ADAM_PHRASES["en"] in preferred


# --------------------------------------------------------------------------- Maya (spec 45, PLAN B8)


@pytest.mark.parametrize("lang", LANGS)
def test_maya_story_builder(lang):
    ctx = build_context(child=MAYA, profile=MAYA_PROFILE, mode="strength_builder", content_type="digital_game",
                        template="story_builder", target_strength="storytelling", language=lang, today=TODAY)
    result = generate("digital_game", ctx)
    game = result.content
    assert game["template"] == "story_builder"
    assert len(game["steps"]) == 4
    assert all(2 <= len(s["choices"]) <= 4 for s in game["steps"])
    assert "correct_or_preferred_answer" not in json.dumps(game)
    if lang == "en":
        prompts = [s["prompt"] for s in game["steps"]]
        assert "animal" in prompts[0] and "Where" in prompts[1] and "problem" in prompts[2] and "solve" in prompts[3]
        assert game["closing_prompt"] == "Now tell your story!"
        assert {"Lion", "Rabbit", "Elephant", "Owl"} == {c["label"] for c in game["steps"][0]["choices"]}
    if lang == "ar":
        assert game["closing_prompt"] == "والآن احكي قصتك!"
    if lang == "he":
        assert game["closing_prompt"] == "עכשיו ספרי את הסיפור שלך!"


def test_maya_default_template_is_story_builder():
    ctx = build_context(child=MAYA, profile=MAYA_PROFILE, mode="strength_builder", content_type="digital_game",
                        target_strength="storytelling", language="en", today=TODAY)
    assert template_provider.pick_template(ctx) == "story_builder"
    assert generate("digital_game", ctx).content["template"] == "story_builder"


def test_pack_with_and_without_video():
    with_video = generate("pack", ctx_for("growth_support", "en", "pack", include_video=True)).content
    assert with_video["video"]["duration_seconds"] == 60 and len(with_video["story"]["questions"]) == 3
    assert len(with_video["discussion_prompts"]) == 3
    without = generate("pack", ctx_for("growth_support", "en", "pack")).content
    assert without["video"] is None


# --------------------------------------------------------------------------- understanding


def test_template_understanding_marks_needs_more_observation_with_few_observations():
    ctx = build_context(child=ADAM, profile=ADAM_PROFILE, mode=None, content_type="understanding", language="en",
                        today=TODAY)
    data = template_provider.suggest_understanding(
        ctx,
        [{"id": "o1", "focus_area_id": "f-adam", "support_level": "some_support", "text": "joined after a prompt"}],
        [{"id": "f-adam", "title": "Joining group play"}],
        [{"list": "strengths", "key": "building", "label": "Building"}],
    )
    assert data["focus_review"] == [{"focus_area_id": "f-adam", "status": "needs_more_observation",
                                     "note": data["focus_review"][0]["note"]}]
    assert data["baseline_validation"][0]["status"] == "needs_more_observation"
    assert "appears to enjoy" in data["summary"]


def test_template_understanding_with_enough_observations():
    ctx = build_context(child=ADAM, profile=ADAM_PROFILE, mode=None, content_type="understanding", language="he",
                        today=TODAY)
    obs = [{"id": f"o{i}", "focus_area_id": "f-adam", "support_level": level, "text": "בנייה"}
           for i, level in enumerate(["significant_support", "some_support", "independent", "independent"])]
    data = template_provider.suggest_understanding(ctx, obs, [{"id": "f-adam", "title": "הצטרפות למשחק"}], [])
    assert data["focus_review"][0]["status"] == "some_improvement"


# --------------------------------------------------------------------------- analysis templates (WP2-AI)


@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("gender", ("girl", "boy", None))
def test_template_understanding_and_summary_in_every_language(lang, gender):
    from app.ai.safety import check_content
    from app.ai.schemas import FunctionalSummaryDraft, UnderstandingSuggestion

    child = {**ADAM, "gender": gender}
    ctx = build_context(child=child, profile=ADAM_PROFILE, mode=None, content_type="understanding", language=lang,
                        current_understanding={"summary": "Builds with one friend.", "adaptations": None},
                        today=TODAY)
    obs = [{"id": f"o{i}", "focus_area_id": "f-adam", "support_level": level, "text": "x"}
           for i, level in enumerate(["significant_support", "some_support", "independent"])]
    focus = [{"id": "f-adam", "category": "social", "suggestion_key": "joining_group_play", "title": "Joining group play"}]
    understanding = UnderstandingSuggestion.model_validate(template_provider.suggest_understanding(ctx, obs, focus, []))
    summary = FunctionalSummaryDraft.model_validate(template_provider.functional_summary(ctx, obs, focus))
    for data in (understanding, summary):
        assert check_content(data, set(), ai=True) == []
        assert_clean(data.model_dump(), lang, gender)
    assert understanding.possible_patterns and understanding.next_observation_questions
    assert summary.main_needs.items == ["Joining group play"]
    assert [i.key for i in summary.main_strengths.items] == ["imagination", "building", "vocabulary"]
    assert summary.team_recommendations and summary.adaptations
    assert "Adam" in summary.general_description


def test_template_summary_without_data():
    from app.ai.schemas import FunctionalSummaryDraft

    ctx = build_context(child={"name": "Lina", "birth_date": None}, profile=None, mode=None,
                        content_type="functional_summary", language="ar", today=TODAY)
    summary = FunctionalSummaryDraft.model_validate(template_provider.functional_summary(ctx, [], []))
    assert summary.main_needs.items == [] and summary.main_strengths.items == []
    assert summary.next_observation_questions[0].domain == "play"
