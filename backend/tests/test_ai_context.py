"""AIContext: allow-list only, caps, labels and name masking."""
import json
from datetime import date
from types import SimpleNamespace

from app.ai.context import AIContext, build_context, first_name, mask_names, name_masker
from app.ai.prompts import user_prompt

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
    # "Kind to babies" is a parent's own wording (sources: parent only): never sent.
    assert [s.label for s in ctx.strengths] == ["דמיון", "בנייה והרכבה", "אוצר מילים עשיר"]
    assert all(s.key for s in ctx.strengths)
    assert [i.key for i in ctx.interests] == ["cars_transportation", "animals", "blocks"]
    assert len(ctx.what_helps) == 3 and ctx.what_helps[1].label == "פינה שקטה"
    assert ctx.avoid == ["noise", "touch", "bright_lights"]


def test_custom_labels_only_when_staff_confirmed_and_masked():
    profile = {**PROFILE, "strengths": [
        {"custom": "Kind to babies", "sources": ["parent"]},  # the parent's own wording
        {"custom": "Sings with Rana", "sources": []},
        {"custom": "Builds towers with Noa", "sources": ["parent", "teacher"]},  # confirmed by the teacher
        {"custom": "Shares with Adam Haddad's sister", "sources": ["review"]},
        {"custom": "Draws maps", "sources": ["observation"]},
    ], "what_helps": [{"custom": "Mum Rana's song", "sources": ["teacher"], "list": "what_helps"}]}
    ctx = make(profile=profile, adult_names=["Dana Cohen"])
    assert [s.label for s in ctx.strengths] == ["Builds towers with [friend]", "Shares with [child]'s sister",
                                                "Draws maps"]
    assert all(s.key is None for s in ctx.strengths)
    assert [h.label for h in ctx.what_helps] == ["Mum [adult]'s song"]  # the child's parent_name is masked too
    text = json.dumps(ctx.model_dump(mode="json"), ensure_ascii=False)
    for leaked in ("Kind to babies", "Noa", "Haddad", "Rana"):
        assert leaked not in text, leaked


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


# Marks are built from code points so the test source shows no invisible characters.
FATHA, DAMMA, KASRA, SUKUN, TATWEEL = (chr(c) for c in (0x064E, 0x064F, 0x0650, 0x0652, 0x0640))
SHEVA, QAMATS, GERESH = chr(0x05B0), chr(0x05B8), chr(0x05F3)


def test_masking_with_hebrew_and_arabic_prefixes():
    assert mask_names("ראיתי שאדם שיחק עם נועה ולאדם היה כיף", ["אדם"], ["נועה"]) == \
        "ראיתי ש[child] שיחק עם [friend] ול[child] היה כיף"
    assert mask_names("لعب آدم مع يوسف ولآدم صديق", ["آدم"], ["يوسف"]) == "لعب [child] مع [friend] ول[child] صديق"
    assert mask_names("Adamant Adam", ["Adam"], []) == "Adamant [child]"
    # Arabic spelling variants: hamza/alef, ta marbuta/ha, alef maqsura/ya, tashkeel, tatweel.
    assert mask_names("لعب احمد", ["أحمد"]) == "لعب [child]"
    assert mask_names("لعب أحمد وإحمد", ["احمد"]) == "لعب [child] و[child]"
    assert mask_names("فاطمه ضحكت", [], ["فاطمة"]) == "[friend] ضحكت"
    assert mask_names("مع مصطفي", [], ["مصطفى"]) == "مع [friend]"
    assert mask_names(f"قال أ{FATHA}ح{SUKUN}م{FATHA}د{DAMMA}", ["أحمد"]) == "قال [child]"
    assert mask_names(f"قال أح{TATWEEL}مد", ["أحمد"]) == "قال [child]"
    assert mask_names("هدية للعباس والعباس", [], ["العباس"]) == "هدية ل[friend] و[friend]"
    assert mask_names("لعباس", [], ["العباس"]) == "لعباس"  # not al-Abbas
    # Hebrew geresh vs apostrophe, niqqud (also on a prefix).
    assert mask_names(f"ג{GERESH}ורג{GERESH} בנה", [], ["ג'ורג'"]) == "[friend] בנה"
    assert mask_names(f"נתתי ל{SHEVA}א{QAMATS}ד{QAMATS}ם", ["אדם"]) == f"נתתי ל{SHEVA}[child]"
    # Latin accents and case.
    assert mask_names("zoe and ZOË and Zoë", ["Zoë"]) == "[child] and [child] and [child]"
    assert mask_names("Zoë came", ["Zoe"]) == "[child] came"
    assert mask_names("O’Neil and o'neil", [], ["O'Neil"]) == "[friend] and [friend]"


def test_masking_name_particles():
    # A particle is masked only with the next word: "בן ארבע" (four years old) and "לבן" stay.
    assert mask_names("הוא בן ארבע, לבן ונועה ובן דוד", [], ["נועה בן דוד"]) == "הוא בן ארבע, לבן ו[friend] ו[friend]"
    assert mask_names("إن شاء الله، عبد الله وحداد", [], ["عبد الله حداد"]) == "إن شاء الله، [friend] و[friend]"
    assert mask_names("Ana, de Souza and the de facto rule", [], ["Ana de Souza"]) == \
        "[friend], [friend] and the de facto rule"
    # A particle that starts a Latin name is the given name itself.
    assert mask_names("Ben came", [], ["Ben Levi"]) == "[friend] came"


def test_masking_adults():
    text = "Mum Rana Haddad said Adam Haddad and teacher Dana helped; the Haddad family came"
    assert mask_names(text, ["Adam Haddad"], [], ["Rana Haddad", "Dana Cohen"]) == \
        "Mum [adult] said [child] and teacher [adult] helped; the [child] family came"  # shared surname: [child]
    # A classmate wins over an adult with the same name.
    assert mask_names("Dana built", [], ["Dana Levi"], ["Dana Cohen"]) == "[friend] built"


def test_masker_handles_a_whole_kindergarten():
    names = [f"Child{i} Family{i}" for i in range(400)]
    mask = name_masker(["Adam Haddad"], names, ["Rana Haddad"])
    text = "Adam played with Child7 and Family399; Rana came. " * 6
    assert mask(text) == "[child] played with [friend] and [friend]; [adult] came. " * 6


def test_first_name_drops_a_surname_in_the_preferred_name():
    child = SimpleNamespace(**{**vars(CHILD), "preferred_name": "Adam Haddad"})
    assert make(child=child).name == "Adam"
    assert first_name({"name": "Adam Haddad", "preferred_name": "haddad"}) == "Adam"
    assert first_name({"name": "Adam Haddad", "preferred_name": "Adi"}) == "Adi"
    assert first_name({"name": "Adam", "preferred_name": None}) == "Adam"


def test_focus_and_current_understanding_mask_the_childs_own_names():
    focus = {**FOCUS, "title": "Adam Haddad joins Noa", "description": "Adam Haddad starts next to Yusuf",
             "plan": {"who": "Mum Rana and teacher Dana with Adam"}}
    ctx = make(focus=focus, adult_names=["Dana Cohen"],
               current_understanding={"summary": "Adam Haddad enjoys building with Noa."})
    assert ctx.focus.title == "[child] joins [friend]"
    assert ctx.focus.description == "[child] starts next to [friend]"
    assert ctx.focus.plan["who"] == "Mum [adult] and teacher [adult] with [child]"
    assert ctx.current_understanding.summary == "[child] enjoys building with [friend]."
    prompt = user_prompt("real_world_activity", ctx)
    for name in ("Haddad", "Rana", "Dana", "Noa", "Yusuf"):
        assert name not in prompt, name
    # The development-review suggestion masks later itself (mask_understanding_inputs).
    raw = make(focus=focus, mask_free_text=False, current_understanding={"summary": "Adam Haddad plays."})
    assert raw.current_understanding.summary == "Adam Haddad plays." and raw.focus.title == "Adam Haddad joins Noa"


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
