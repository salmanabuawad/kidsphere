"""AIContext: allow-list only, caps, labels and name masking."""
import json
from datetime import date
from types import SimpleNamespace

from app.ai.context import AIContext, build_context, mask_names

TODAY = date(2026, 10, 5)

CHILD = SimpleNamespace(
    id="c-1", name="Adam Haddad", preferred_name=None, birth_date=date(2022, 8, 5), gender="boy",
    main_language="ar", parent_name="Rana Haddad", parent_contact="050-1234567", photo_path="/uploads/adam.jpg",
    class_id="k-1",
)
PROFILE = {
    "parent_perspective": {"health": "asthma", "free_text": "He hates loud rooms at home"},
    "teacher_perspective": {"notes": "secret teacher note"},
    "strengths": [{"key": "imagination", "sources": ["parent"]}, {"key": "building", "sources": ["teacher"]},
                  {"custom": "Kind to babies", "sources": ["parent"]}, {"key": "vocabulary", "sources": ["teacher"]}],
    "interests": [{"key": "cars_transportation"}, {"key": "animals"}, {"key": "blocks"}, {"key": "music"},
                  {"key": "not_a_real_key"}],
    "what_helps": [{"key": "adult_mediation"}, {"key": "quiet_space"}, {"key": "countdown_timer"}, {"key": "hug"}],
    "sensitivities": [{"key": "noise", "helps": ["quiet_space"]}, {"key": "touch"}, {"custom": "the blue room"},
                      {"key": "bright_lights"}, {"key": "crowded_spaces"}],
    "motivators": [{"key": "praise"}],
}
FOCUS = {"id": "f-1", "category": "social", "suggestion_key": "joining_group_play", "title": "Joining group play",
         "description": "Joining Noa and Yusuf in the block corner",
         "plan": {"strength_used": "building", "need": "starting shared play", "adaptation": None,
                  "what_we_will_do": "build together with Noa", "success_looks_like": "asks to join"}}
OBS = [
    {"observation": "Adam watched Noa and Yusuf build, then Adam joined after a prompt."},
    {"observation": "Adam asked Yusuf: can we build together?"},
    {"observation": None},
    {"observation": "x" * 500},
    {"observation": "Played alone with cars."},
    {"observation": "Sixth observation."},
    {"observation": "Seventh observation."},
]

DOCUMENTED_KEYS = {
    "mode", "content_type", "template", "language", "name", "age_years", "gender", "strengths", "interests",
    "what_helps", "avoid", "focus", "target_strength", "recent_observations", "current_understanding",
    "instruction", "variant", "include_video",
}


def make(**over):
    args = dict(child=CHILD, profile=PROFILE, mode="growth_support", content_type="real_world_activity",
                language="en", focus=FOCUS, recent_observations=OBS, classmate_names=["Noa Levi", "Yusuf"],
                today=TODAY)
    args.update(over)
    return build_context(**args)


def test_context_has_exactly_the_documented_keys():
    data = make().model_dump(mode="json")
    assert set(data) == DOCUMENTED_KEYS == set(AIContext.model_fields)


def test_forbidden_fields_never_present():
    text = json.dumps(make(current_understanding={"summary": "Adam enjoys cars."}).model_dump(mode="json"),
                      ensure_ascii=False)
    for forbidden in ("2022", "Haddad", "050-1234567", "adam.jpg", "asthma", "loud rooms", "secret teacher",
                      "birth", "photo", "contact", "Rana", "health", "praise"):
        assert forbidden not in text, forbidden


def test_name_age_gender():
    ctx = make()
    assert ctx.name == "Adam" and ctx.age_years == 4 and ctx.gender == "boy"
    child = SimpleNamespace(**{**vars(CHILD), "preferred_name": "Adi", "gender": "unspecified"})
    ctx = make(child=child)
    assert ctx.name == "Adi" and ctx.gender is None


def test_lists_capped_and_labelled_in_language():
    ctx = make(language="he")
    assert [s.label for s in ctx.strengths] == ["דמיון", "בנייה והרכבה", "Kind to babies"]
    assert ctx.strengths[2].key is None
    assert [i.key for i in ctx.interests] == ["cars_transportation", "animals", "blocks"]
    assert len(ctx.what_helps) == 3 and ctx.what_helps[1].label == "פינה שקטה"
    assert ctx.avoid == ["noise", "touch", "bright_lights"]


def test_focus_plan_and_target_strength():
    ctx = make()
    assert ctx.focus.category == "social" and ctx.focus.suggestion_key == "joining_group_play"
    assert ctx.focus.plan["need"] == "starting shared play" and "adaptation" not in ctx.focus.plan
    assert "Noa" not in ctx.focus.description and "[friend]" in ctx.focus.description
    ctx = make(mode="strength_builder", focus=None, target_strength="storytelling", language="ar")
    assert ctx.focus is None and ctx.target_strength.key == "storytelling"
    assert ctx.target_strength.label == "رواية القصص"


def test_observations_masked_capped_and_truncated():
    obs = make().recent_observations
    assert len(obs) == 5
    assert all(len(o) <= 300 for o in obs)
    assert obs[0] == "[child] watched [friend] and [friend] build, then [child] joined after a prompt."
    assert obs[1] == "[child] asked [friend]: can we build together?"
    joined = " ".join(obs)
    for name in ("Adam", "Noa", "Yusuf"):
        assert name not in joined


def test_masking_with_hebrew_and_arabic_prefixes():
    assert mask_names("ראיתי שאדם שיחק עם נועה ולאדם היה כיף", ["אדם"], ["נועה"]) == \
        "ראיתי ש[child] שיחק עם [friend] ול[child] היה כיף"
    assert mask_names("لعب آدم مع يوسف ولآدم صديق", ["آدم"], ["يوسف"]) == "لعب [child] مع [friend] ول[child] صديق"
    assert mask_names("Adamant Adam", ["Adam"], []) == "Adamant [child]"


def test_current_understanding_and_instruction():
    ctx = make(current_understanding={"summary": "Adam appears to enjoy building with Noa.",
                                      "adaptations": "Start with one friend.", "next_steps": "Invite Yusuf.",
                                      "strengths": ["x"]},
               instruction="Make it about Noa's trucks", variant=2)
    assert ctx.current_understanding.adaptations == "Start with one friend."
    assert "Noa" not in ctx.current_understanding.summary
    assert ctx.instruction == "Make it about [friend]'s trucks"
    assert ctx.variant == 2


def test_rows_with_missing_profile_still_work():
    ctx = build_context(child={"name": "Maya", "birth_date": "2021-11-20"}, profile=None, mode="strength_builder",
                        content_type="digital_game", template="story_builder", language="he",
                        target_strength="storytelling", today=TODAY)
    assert ctx.name == "Maya" and ctx.age_years == 4 and ctx.strengths == [] and ctx.template == "story_builder"
