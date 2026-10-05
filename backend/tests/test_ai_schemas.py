"""Output models: limits, extra='forbid', semantic validators and provider schemas."""
import anthropic
import pytest
from pydantic import ValidationError

from app import vocab
from app.ai.schemas import (
    GAME_MODELS,
    GAME_TEMPLATES,
    REVIEW_STATUSES,
    VALIDATION_STATUSES,
    ActivityOut,
    PackOut,
    ProfileItem,
    StoryOut,
    UnderstandingSuggestion,
    VideoPlanOut,
    game_adapter,
    pack_model,
)
from app.ai.service import provider_model

STORY = {
    "title": "The Little Lion",
    "goal": "Supports joining group play.",
    "story": ["The lion loved to run.", "The lion asked to play.", "They played together."],
    "questions": ["What did the lion say?", "How did he feel?", "What would you say?"],
    "teacher_note": "Read slowly.",
    "illustrations": ["🦁", "💬", "😊"],
}
ACTIVITY = {
    "title": "Build the Garage Together",
    "goal": "Joining group play",
    "duration_minutes": 15,
    "materials": ["Blocks"],
    "instructions": ["Invite two children.", "Build together."],
    "what_to_observe": ["Did the child initiate?"],
    "adaptation": "Play as the first partner.",
}


def choice(label, emoji="🙂"):
    return {"label": label, "emoji": emoji}


def mc(answer=0, labels=("A", "B", "C")):
    return {
        "template": "multiple_choice",
        "title": "Choose",
        "rounds": [{"question": "Which?", "choices": [choice(x) for x in labels],
                    "correct_or_preferred_answer": answer, "explanation": "Nice try!"}],
    }


def video(duration=60):
    scene = {"description": "A lion", "narration": "The lion runs.", "visual_prompt": "Soft illustration"}
    return {"title": "Lion", "learning_goal": "Play", "script": "The lion runs.", "scenes": [scene, scene],
            "duration_seconds": duration}


def test_story_and_activity_valid():
    StoryOut.model_validate(STORY)
    ActivityOut.model_validate(ACTIVITY)


def test_extra_keys_are_forbidden():
    with pytest.raises(ValidationError):
        StoryOut.model_validate({**STORY, "rating": 5})
    with pytest.raises(ValidationError):
        game_adapter.validate_python({**mc(), "secret": 1})


@pytest.mark.parametrize("field,value", [
    ("story", ["one"]),
    ("story", ["p"] * 7),
    ("questions", ["q"]),
    ("questions", ["q1", "q2", "q3", "q4", "q5"]),
    ("title", ""),
    ("title", "x" * 121),
    ("illustrations", ["🦁"] * 7),
])
def test_story_limits(field, value):
    with pytest.raises(ValidationError):
        StoryOut.model_validate({**STORY, field: value})


def test_activity_duration_limits():
    with pytest.raises(ValidationError):
        ActivityOut.model_validate({**ACTIVITY, "duration_minutes": 0})
    with pytest.raises(ValidationError):
        ActivityOut.model_validate({**ACTIVITY, "instructions": ["only one"]})


def test_game_answer_must_be_a_choice_index():
    assert game_adapter.validate_python(mc(2)).template == "multiple_choice"
    assert game_adapter.validate_python(mc(None)).rounds[0].correct_or_preferred_answer is None
    for bad in (3, -1):
        with pytest.raises(ValidationError):
            game_adapter.validate_python(mc(bad))


def test_game_choice_labels_unique():
    with pytest.raises(ValidationError):
        game_adapter.validate_python(mc(0, ("A", "a", "B")))


def test_unknown_template_rejected():
    with pytest.raises(ValidationError):
        game_adapter.validate_python({**mc(), "template": "shooter"})


def test_categorize_semantics():
    base = {
        "template": "categorize",
        "title": "Sort",
        "categories": [{"key": "animals", "label": "Animals"}, {"key": "cars", "label": "Cars"}],
        "items": [
            {"label": "Cow", "category": "animals"}, {"label": "Bee", "category": "animals"},
            {"label": "Bus", "category": "cars"}, {"label": "Train", "category": "cars"},
        ],
    }
    game_adapter.validate_python(base)
    unknown = {**base, "items": base["items"][:3] + [{"label": "Moon", "category": "space"}]}
    with pytest.raises(ValidationError):
        game_adapter.validate_python(unknown)
    unused = {**base, "categories": base["categories"] + [{"key": "music", "label": "Music"}]}
    with pytest.raises(ValidationError):
        game_adapter.validate_python(unused)
    dup = {**base, "items": base["items"][:3] + [{"label": "cow", "category": "cars"}]}
    with pytest.raises(ValidationError):
        game_adapter.validate_python(dup)


def test_sequence_and_match_pairs_unique():
    seq = {"template": "sequence", "title": "Order", "items": [choice("One"), choice("Two"), choice("Three")]}
    game_adapter.validate_python(seq)
    with pytest.raises(ValidationError):
        game_adapter.validate_python({**seq, "items": [choice("One"), choice("Two"), choice("One")]})
    pairs = {"template": "match_pairs", "title": "Pairs", "pairs": [
        {"left": choice("Bee"), "right": choice("Honey")}, {"left": choice("Cow"), "right": choice("Milk")}]}
    game_adapter.validate_python(pairs)
    with pytest.raises(ValidationError):
        game_adapter.validate_python({**pairs, "pairs": [pairs["pairs"][0], pairs["pairs"][0]]})


def test_story_builder_shape():
    step = {"prompt": "Choose an animal", "choices": [choice("Lion"), choice("Owl")]}
    sb = {"template": "story_builder", "title": "Build a story", "steps": [step, step, step],
          "closing_prompt": "Now tell your story!"}
    game_adapter.validate_python(sb)
    with pytest.raises(ValidationError):
        game_adapter.validate_python({**sb, "steps": [step, step]})
    with pytest.raises(ValidationError):
        game_adapter.validate_python({k: v for k, v in sb.items() if k != "closing_prompt"})


def test_video_duration_between_30_and_90():
    VideoPlanOut.model_validate(video(30))
    VideoPlanOut.model_validate(video(90))
    for bad in (29, 91):
        with pytest.raises(ValidationError):
            VideoPlanOut.model_validate(video(bad))


def test_pack_story_needs_exactly_three_questions():
    pack = {"story": STORY, "activity": ACTIVITY, "game": mc(), "discussion_prompts": ["a", "b", "c"]}
    assert PackOut.model_validate(pack).video is None
    with pytest.raises(ValidationError):
        PackOut.model_validate({**pack, "story": {**STORY, "questions": STORY["questions"][:2]}})
    with pytest.raises(ValidationError):
        PackOut.model_validate({**pack, "discussion_prompts": ["a", "b"]})
    PackOut.model_validate({**pack, "video": video()})


def test_profile_item_key_xor_custom():
    ProfileItem.model_validate({"key": "imagination", "label": "Imagination"})
    ProfileItem.model_validate({"custom": "Loves trains", "label": "Loves trains"})
    with pytest.raises(ValidationError):
        ProfileItem.model_validate({"label": "x"})
    with pytest.raises(ValidationError):
        ProfileItem.model_validate({"key": "imagination", "custom": "x", "label": "x"})


def test_understanding_statuses():
    data = {
        "summary": "Adam appears to enjoy building.", "strengths": [], "interests": [], "what_helps": [],
        "areas_for_support": [], "adaptations": "Keep it short.", "next_steps": "Observe.",
        "baseline_validation": [{"list": "strengths", "key": "building", "label": "Building",
                                 "status": "supported", "note": "Seen often.", "observation_ids": ["1"]}],
        "focus_review": [{"focus_area_id": "f1", "status": "improving", "note": "More initiation."}],
    }
    UnderstandingSuggestion.model_validate(data)
    bad = {**data, "focus_review": [{"focus_area_id": "f1", "status": "73%", "note": "x"}]}
    with pytest.raises(ValidationError):
        UnderstandingSuggestion.model_validate(bad)


def test_vocabulary_lists_match_schema_literals():
    assert set(vocab.keys("game_templates")) == set(GAME_TEMPLATES) == set(GAME_MODELS)
    assert set(vocab.keys("validation_statuses")) == set(VALIDATION_STATUSES)
    assert set(vocab.keys("review_statuses")) == set(REVIEW_STATUSES)


def _walk(node):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


@pytest.mark.parametrize("kind,template,video_on", [
    ("story", None, False), ("real_world_activity", None, False), ("video", None, False),
    ("understanding", None, False), ("pack", "story_builder", True), ("pack", "categorize", False),
    *[("digital_game", t, False) for t in GAME_TEMPLATES],
])
def test_provider_schema_via_sdk_transform(kind, template, video_on):
    model = provider_model(kind, template, video_on)
    schema = anthropic.transform_schema(model)
    objects = [n for n in _walk(schema) if n.get("type") == "object"]
    assert objects
    for obj in objects:
        assert obj.get("additionalProperties") is False
    # Length limits are not sent as hard constraints; Pydantic re-enforces them after the call.
    assert not [n for n in _walk(schema) if {"maxLength", "maxItems"} & set(n)]


def test_pack_model_fixes_game_template():
    model = pack_model("sequence")
    pack = {"story": STORY, "activity": ACTIVITY, "game": mc(), "discussion_prompts": ["a", "b", "c"]}
    with pytest.raises(ValidationError):
        model.model_validate(pack)
