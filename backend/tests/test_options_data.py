"""Data checks for backend/app/data/options.json (WP-04).

Standard library + pytest only: no app imports and no database, so this runs
before (and independently of) the rest of the backend.
"""

import json
import re
from pathlib import Path

import pytest

OPTIONS_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "options.json"
LANGS = ("en", "ar", "he")
KEY_RE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
NUMERIC_RE = re.compile(r"\d+\s*%|\bscore\b|\bpoints\b", re.IGNORECASE)
ALLOWED_ITEM_FIELDS = {"key", "icon", "category", "label", "short"}
ARABIC_RE = re.compile("[؀-ۿ]")
HEBREW_RE = re.compile("[֐-׿]")

# Lists other packages code against. Exact key sets where the spec fixes them,
# a minimum count where the spec gives examples.
EXACT_KEYS = {
    "genders": ["girl", "boy", "unspecified"],
    "strengths": [
        "imagination", "curiosity", "communication", "vocabulary", "memory", "creativity",
        "building", "drawing", "music", "movement", "problem_solving", "independence",
        "empathy", "humor", "persistence", "leadership", "observation", "social_connection",
    ],
    "interests": [
        "pretend_play", "cars_transportation", "construction", "blocks", "drawing", "crafts",
        "music", "dancing", "stories", "books", "outdoor_play", "animals", "nature", "sports",
        "puzzles", "technology", "water", "cooking", "social_games",
    ],
    "frustration_reactions": [
        "cries", "shouts", "moves_away", "asks_adult_help", "asks_for_hug", "needs_quiet_time",
        "takes_time_to_calm", "throws_or_pushes", "becomes_silent", "other",
    ],
    "calming_helps": [
        "adult_reassurance", "hug", "quiet_space", "movement", "explanation", "visual_support",
        "advance_preparation", "familiar_routine", "music", "favorite_object", "humor",
        "time_alone", "other",
    ],
    "transition_reactions": [
        "transitions_easily", "needs_preparation", "needs_reminder", "needs_adult_support",
        "resists", "becomes_upset", "depends_on_situation",
    ],
    "social": [
        "initiates_play", "joins_existing_play", "waits_for_others", "prefers_familiar_children",
        "often_plays_independently", "enjoys_group_activities", "needs_adult_support_to_join",
        "learning_turn_taking", "handles_conflict_well", "needs_help_with_conflict",
    ],
    "independence_areas": [
        "eating", "drinking", "toilet", "washing_hands", "dressing", "shoes", "tidying_toys",
        "keeping_belongings", "starting_activity", "finishing_activity",
    ],
    "support_levels": ["independent", "some_support", "significant_support", "not_observed"],
    "sensitivities": [
        "noise", "touch", "clothing", "textures", "dirt", "strong_smells", "bright_lights",
        "crowded_spaces", "movement", "certain_foods", "messy_play",
    ],
    "priority_categories": [
        "emotional", "social", "language", "communication", "independence", "attention",
        "motor", "learning", "transitions", "confidence", "other",
    ],
    "content_results": ["worked_well", "partly", "did_not_work"],
    "review_statuses": [
        "improving", "some_improvement", "no_clear_change", "needs_more_observation",
        "no_longer_needed",
    ],
    "validation_statuses": [
        "supported", "partially_supported", "needs_more_observation", "may_need_refinement",
    ],
    "content_types": ["story", "video", "digital_game", "real_world_activity", "pack"],
    "modes": ["strength_builder", "growth_support"],
    "game_templates": [
        "multiple_choice", "match_pairs", "sequence", "emotion_choice", "categorize",
        "what_happens_next", "story_builder",
    ],
    "relations": ["mother", "father", "guardian", "other"],
}

REQUIRED_SUBSETS = {
    "languages": ["ar", "he", "en", "ru", "am", "fr", "es", "other"],
    "communication": [
        "expresses_needs_verbally", "uses_full_sentences", "asks_questions",
        "tells_about_experiences", "describes_events", "listens_to_others",
        "takes_turns_in_conversation", "uses_gestures",
        "sometimes_communicates_through_behavior", "needs_adult_support",
    ],
    "observation_contexts": [
        "arrival", "free_play", "group_time", "structured_activity", "yard", "meal", "art",
        "transition", "end_of_day",
    ],
    "strength_targets": [
        "storytelling", "confidence", "language", "creativity", "problem_solving",
        "imagination", "curiosity", "memory", "building", "empathy",
    ],
    "focus_suggestions": [
        "joining_group_play", "expressing_frustration_in_words", "managing_transitions",
        "taking_turns", "listening_during_story_time", "asking_for_help",
        "dressing_independently", "trying_new_activities", "completing_tasks",
        "participating_in_group_activities",
    ],
    "motivators": ["praise", "special_role", "helping_adults", "new_challenges", "movement_breaks"],
    "describe_words": [
        "curious", "kind", "energetic", "gentle", "funny", "thoughtful", "creative",
        "determined", "shy_at_first",
    ],
    "sad_helps": ["other"],
    "transition_helps": ["other"],
}

REQUIRED_LISTS = sorted(set(EXACT_KEYS) | set(REQUIRED_SUBSETS))


@pytest.fixture(scope="module")
def raw() -> bytes:
    return OPTIONS_PATH.read_bytes()


@pytest.fixture(scope="module")
def data(raw):
    return json.loads(raw.decode("utf-8"))


@pytest.fixture(scope="module")
def lists(data):
    return data["lists"]


def _labels(item):
    """Yield (lang, text) for every label and short label of an item."""
    for field in ("label", "short"):
        for lang, text in (item.get(field) or {}).items():
            yield lang, text


def _banned(data, group):
    terms = data["banned_terms"][group]
    return [t.lower() for lang in LANGS for t in terms[lang]]


def _find_banned(text, terms, allow):
    lowered = text.lower()
    for phrase in allow:
        lowered = lowered.replace(phrase, " ")
    return [t for t in terms if t in lowered]


def test_file_is_utf8_without_bom_and_lf(raw):
    assert not raw.startswith(b"\xef\xbb\xbf"), "options.json must not start with a BOM"
    assert b"\r\n" not in raw, "options.json must use LF line endings"
    raw.decode("utf-8")


def test_top_level_shape(data):
    assert isinstance(data["lists"], dict)
    banned = data["banned_terms"]
    for group in ("clinical", "child_deficit", "allow_phrases"):
        for lang in LANGS:
            terms = banned[group][lang]
            assert isinstance(terms, list) and terms, f"banned_terms.{group}.{lang} is empty"
            assert all(isinstance(t, str) and t.strip() == t and t for t in terms)
            assert len(set(terms)) == len(terms), f"duplicate in banned_terms.{group}.{lang}"


def test_spec_section_2_terms_are_banned(data):
    clinical = _banned(data, "clinical")
    for term in ("diagnosis", "disorder", "adhd", "autism", "pathology", "deficit", "developmental delay"):
        assert term in clinical
    deficit = _banned(data, "child_deficit")
    for term in ("weakness", "failure", "score", "points"):
        assert term in deficit


@pytest.mark.parametrize("name", REQUIRED_LISTS)
def test_required_list_exists(lists, name):
    assert name in lists, f"missing list {name}"
    assert isinstance(lists[name], list) and lists[name]


@pytest.mark.parametrize("name", sorted(EXACT_KEYS))
def test_exact_keys(lists, name):
    assert [i["key"] for i in lists[name]] == EXACT_KEYS[name]


@pytest.mark.parametrize("name", sorted(REQUIRED_SUBSETS))
def test_required_keys_present(lists, name):
    keys = {i["key"] for i in lists[name]}
    missing = set(REQUIRED_SUBSETS[name]) - keys
    assert not missing, f"{name} is missing {sorted(missing)}"


def test_items_are_well_formed(lists):
    for name, items in lists.items():
        assert KEY_RE.match(name), f"list name {name!r} is not snake_case"
        keys = [i.get("key") for i in items]
        assert len(keys) == len(set(keys)), f"duplicate keys in {name}"
        for item in items:
            where = f"{name}.{item.get('key')}"
            assert set(item) <= ALLOWED_ITEM_FIELDS, f"unexpected fields in {where}: {set(item) - ALLOWED_ITEM_FIELDS}"
            assert isinstance(item["key"], str) and KEY_RE.match(item["key"]), f"bad key {where}"
            assert set(item["label"]) == set(LANGS), f"{where} label must have exactly en/ar/he"
            for lang in LANGS:
                text = item["label"][lang]
                assert isinstance(text, str) and text.strip(), f"empty {lang} label in {where}"
                assert text == text.strip(), f"{where} {lang} label has surrounding whitespace"
            if "icon" in item:
                assert isinstance(item["icon"], str) and item["icon"].strip(), f"empty icon in {where}"
            if "short" in item:
                assert set(item["short"]) == set(LANGS), f"{where} short must have exactly en/ar/he"
                assert all(isinstance(v, str) and v.strip() for v in item["short"].values())


def test_labels_use_the_right_script(lists):
    for name, items in lists.items():
        for item in items:
            for lang, text in _labels(item):
                where = f"{name}.{item['key']} ({lang})"
                if lang == "he":
                    assert not ARABIC_RE.search(text), f"Arabic characters in Hebrew label {where}"
                    assert HEBREW_RE.search(text), f"Hebrew label without Hebrew text {where}"
                if lang == "ar":
                    assert not HEBREW_RE.search(text), f"Hebrew characters in Arabic label {where}"
                    assert ARABIC_RE.search(text), f"Arabic label without Arabic text {where}"
                if lang == "en":
                    assert not (ARABIC_RE.search(text) or HEBREW_RE.search(text)), f"non-Latin English label {where}"


def test_support_levels_have_short_labels(lists):
    shorts = {i["key"]: i["short"] for i in lists["support_levels"]}
    assert set(shorts) == set(EXACT_KEYS["support_levels"])
    assert shorts["some_support"]["en"] == "With support"
    assert shorts["significant_support"]["en"] == "Difficult"
    # The observation model's three-level scale maps onto the same keys.
    assert shorts["independent"]["he"] == "עצמאי/ת"
    assert shorts["some_support"]["he"] == "בתיווך"
    assert shorts["significant_support"]["he"] == "מתקשה"


def test_attention_category_uses_neutral_label(lists):
    attention = next(i for i in lists["priority_categories"] if i["key"] == "attention")
    assert attention["label"]["en"] == "Focus & persistence"
    assert attention["label"]["he"] == "ריכוז והתמדה"
    assert attention["label"]["ar"] == "التركيز والمثابرة"


def test_focus_suggestion_categories_exist(lists):
    categories = {i["key"] for i in lists["priority_categories"]}
    used = set()
    for item in lists["focus_suggestions"]:
        assert item.get("category") in categories, f"focus_suggestions.{item['key']} has unknown category"
        used.add(item["category"])
    # Every real category offers at least one suggestion.
    assert categories - {"other"} <= used
    for name, items in lists.items():
        if name == "focus_suggestions":
            continue
        for item in items:
            if "category" in item:
                assert item["category"] in categories, f"{name}.{item['key']} has unknown category"


def test_no_banned_or_numeric_terms_in_labels(data, lists):
    terms = _banned(data, "clinical") + _banned(data, "child_deficit")
    allow = [p.lower() for lang in LANGS for p in data["banned_terms"]["allow_phrases"][lang]]
    problems = []
    for name, items in lists.items():
        for item in items:
            for lang, text in _labels(item):
                hits = _find_banned(text, terms, allow)
                if hits:
                    problems.append(f"{name}.{item['key']} ({lang}) {text!r}: {hits}")
                if NUMERIC_RE.search(text):
                    problems.append(f"{name}.{item['key']} ({lang}) {text!r}: numeric/score wording")
    assert not problems, "\n".join(problems)


def test_allow_phrases_do_not_hide_plain_banned_terms(data):
    """The matcher itself: allowed phrases pass, the bare banned term still fails."""
    terms = _banned(data, "clinical") + _banned(data, "child_deficit")
    allow = [p.lower() for lang in LANGS for p in data["banned_terms"]["allow_phrases"][lang]]
    assert _find_banned("Problem solving and نقاط القوة and פתרון בעיות", terms, allow) == []
    assert _find_banned("You got 3 points!", terms, allow) == ["points"]
    assert "adhd" in _find_banned("Possible ADHD", terms, allow)
    assert "הפרעה" in _find_banned("ייתכן שיש הפרעה", terms, allow)
    assert "اضطراب" in _find_banned("قد يكون لديه اضطراب", terms, allow)
