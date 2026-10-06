"""Data checks for backend/app/data/options.json and the list fragments in
backend/app/data/lists/*.json (merged into the lists by app/vocab.py).

Standard library + pytest only: no app imports and no database, so this runs
before (and independently of) the rest of the backend.
"""

import json
import re
from pathlib import Path

import pytest

DATA_DIR = Path(__file__).resolve().parents[1] / "app" / "data"
OPTIONS_PATH = DATA_DIR / "options.json"
FRAGMENT_PATHS = sorted((DATA_DIR / "lists").glob("*.json"))
LANGS = ("en", "ar", "he")
KEY_RE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
NUMERIC_RE = re.compile(r"\d+\s*%|\bscore\b|\bpoints\b", re.IGNORECASE)
ALLOWED_ITEM_FIELDS = {"key", "icon", "category", "label", "short"}
BANNED_GROUPS = ("clinical", "child_deficit", "ai_only", "allow_phrases")
ARABIC_RE = re.compile("[؀-ۿ]")
HEBREW_RE = re.compile("[֐-׿]")

# The PDF footer disclaimer (SPEC-UPDATE; docs/terminology.md). It names what the
# report is not, so the clause with the banned word is in allow_phrases (OQ-3).
DISCLAIMERS = {
    "en": "This report is based on parent information, teacher observations and educational follow-up. "
          "It is not a medical or clinical diagnosis.",
    "he": "דוח זה מבוסס על מידע מההורים, על תצפיות של הגננת ועל מעקב חינוכי. הוא אינו מהווה אבחנה רפואית או קלינית.",
    "ar": "يستند هذا التقرير إلى معلومات من الأهل وملاحظات المعلّمة والمتابعة التربوية. وهو ليس تشخيصاً طبياً أو سريرياً.",
}

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
        "organizing_belongings", "keeping_belongings", "starting_activity", "finishing_activity",
    ],
    "contact_preferences": ["personal_conversation", "phone", "message", "meeting", "other"],
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
    # The people in the child's life that content may include (services/people.py).
    "person_relations": [
        "mother", "father", "grandmother", "grandfather", "sister", "brother", "aunt", "uncle", "cousin",
        "friend", "pet", "other",
    ],
    # lists/common.json (COVERAGE-MATRIX §3.3.7)
    "section_statuses": ["not_started", "in_progress", "sufficient", "review_later"],
    "provenance": ["parent_said", "teacher_observed", "ai_suggested", "teacher_approved"],
    "ai_domains": [
        "emotional", "social", "communication", "language", "executive_function", "play",
        "gross_motor", "fine_motor", "independence", "sensory", "cognitive", "daily_routine",
    ],
    "observation_domains": [
        "emotional", "social", "language", "executive_function", "play", "gross_motor",
        "fine_motor", "independence", "sensory", "cognitive", "daily_routine", "strengths",
        "priority_needs",
    ],
    "yes_no": ["yes", "no"],
    "yes_no_sometimes": ["yes", "no", "sometimes"],
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
    "hope_child_feels": [
        "safe", "loved", "belonging", "independent", "capable", "happy", "socially_accepted", "curious",
    ],
}

REQUIRED_LISTS = sorted(set(EXACT_KEYS) | set(REQUIRED_SUBSETS))


@pytest.fixture(scope="module")
def raw() -> bytes:
    return OPTIONS_PATH.read_bytes()


@pytest.fixture(scope="module")
def data(raw):
    return json.loads(raw.decode("utf-8"))


@pytest.fixture(scope="module")
def fragments():
    return {path.name: json.loads(path.read_text(encoding="utf-8")) for path in FRAGMENT_PATHS}


@pytest.fixture(scope="module")
def lists(data, fragments):
    """The merged lists, as app/vocab.py builds them (options.json first, then fragments by file name)."""
    merged = dict(data["lists"])
    for fragment in fragments.values():
        lists_ = fragment.get("lists") if isinstance(fragment, dict) else None
        for name, items in (lists_ if isinstance(lists_, dict) else {}).items():
            merged.setdefault(name, items)
    return merged


def _labels(item):
    """Yield (lang, text) for every label and short label of an item."""
    for field in ("label", "short"):
        for lang, text in (item.get(field) or {}).items():
            yield lang, text


def _banned(data, group):
    terms = data["banned_terms"][group]
    return [t.lower() for lang in LANGS for t in terms[lang]]


def _allow(data):
    return [p.lower() for lang in LANGS for p in data["banned_terms"]["allow_phrases"][lang]]


def _find_banned(text, terms, allow):
    lowered = text.lower()
    for phrase in allow:
        lowered = lowered.replace(phrase, " ")
    return [t for t in terms if t in lowered]


@pytest.mark.parametrize("path", [OPTIONS_PATH, *FRAGMENT_PATHS], ids=lambda p: p.name)
def test_files_are_utf8_without_bom_and_lf(path):
    raw = path.read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf"), f"{path.name} must not start with a BOM"
    assert b"\r\n" not in raw, f"{path.name} must use LF line endings"
    raw.decode("utf-8")


def test_top_level_shape(data):
    assert isinstance(data["lists"], dict)
    banned = data["banned_terms"]
    assert set(banned) == set(BANNED_GROUPS)
    for group in BANNED_GROUPS:
        for lang in LANGS:
            terms = banned[group][lang]
            assert isinstance(terms, list) and terms, f"banned_terms.{group}.{lang} is empty"
            assert all(isinstance(t, str) and t.strip() == t and t for t in terms)
            assert len(set(terms)) == len(terms), f"duplicate in banned_terms.{group}.{lang}"


def test_common_fragment_exists():
    assert "common.json" in {p.name for p in FRAGMENT_PATHS}


def test_fragments_hold_only_new_lists(data, fragments):
    seen = {name: "options.json" for name in data["lists"]}
    for file_name, fragment in fragments.items():
        assert isinstance(fragment, dict) and set(fragment) == {"lists"}, f"{file_name} must hold only {{'lists': ...}}"
        assert isinstance(fragment["lists"], dict) and fragment["lists"], f"{file_name} has no lists"
        for name, items in fragment["lists"].items():
            assert name not in seen, f"list {name!r} in {file_name} is already defined in {seen[name]}"
            assert isinstance(items, list) and items, f"{file_name}: list {name!r} is empty"
            seen[name] = file_name


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


def test_source_document_labels(lists):
    """COVERAGE-MATRIX §3.3.7 edits (source wording) and the OQ-3 neutral domain labels."""
    label = {(name, i["key"]): i["label"] for name, items in lists.items() for i in items}
    assert label[("contact_preferences", "meeting")]["he"] == "פגישה מסודרת"
    assert label[("hope_child_feels", "safe")]["he"] == "בטוח/ה"
    assert label[("independence_areas", "dressing")]["en"] == "Dressing / undressing"
    assert label[("independence_areas", "dressing")]["he"] == "לבוש והפשטה"
    assert label[("independence_areas", "organizing_belongings")]["he"] == "סידור חפצים"
    assert label[("ai_domains", "executive_function")]["he"] == "ריכוז, התמדה וארגון"
    assert label[("observation_domains", "sensory")]["en"] == "Things in the environment that may affect the child"
    assert label[("observation_domains", "priority_needs")]["en"] == "Where to focus next"


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


# Teacher-only options (OQ-2): the AI-only referral terms do not apply to their labels.
TEACHER_ONLY_OPTIONS = {("involvement_steps", "referral_as_needed")}


def test_no_banned_or_numeric_terms_in_labels(data, lists):
    terms = _banned(data, "clinical") + _banned(data, "child_deficit") + _banned(data, "ai_only")
    allow = _allow(data)
    problems = []
    for name, items in lists.items():
        for item in items:
            for lang, text in _labels(item):
                hits = _find_banned(text, terms, allow)
                if (name, item["key"]) in TEACHER_ONLY_OPTIONS:  # OQ-2: only the teacher picks it; AI never
                    hits = [h for h in hits if h not in _banned(data, "ai_only")]
                if hits:
                    problems.append(f"{name}.{item['key']} ({lang}) {text!r}: {hits}")
                if NUMERIC_RE.search(text):
                    problems.append(f"{name}.{item['key']} ({lang}) {text!r}: numeric/score wording")
    assert not problems, "\n".join(problems)


def test_allow_phrases_do_not_hide_plain_banned_terms(data):
    """The matcher itself: allowed phrases pass, the bare banned term still fails."""
    terms = _banned(data, "clinical") + _banned(data, "child_deficit")
    allow = _allow(data)
    assert _find_banned("Problem solving and نقاط القوة and פתרון בעיות", terms, allow) == []
    assert _find_banned("You got 3 points!", terms, allow) == ["points"]
    assert "adhd" in _find_banned("Possible ADHD", terms, allow)
    assert "הפרעה" in _find_banned("ייתכן שיש הפרעה", terms, allow)
    assert "اضطراب" in _find_banned("قد يكون لديه اضطراب", terms, allow)
    assert "diagnosis" in _find_banned("A diagnosis of the child", terms, allow)


@pytest.mark.parametrize("lang", LANGS)
def test_the_pdf_disclaimer_passes_only_through_its_allow_phrase(data, lang):
    terms = _banned(data, "clinical") + _banned(data, "child_deficit")
    text = DISCLAIMERS[lang]
    assert _find_banned(text, terms, []), "the disclaimer names a banned word"
    assert _find_banned(text, terms, _allow(data)) == []
    assert not NUMERIC_RE.search(text)
    own = [p for p in data["banned_terms"]["allow_phrases"][lang] if p.lower() in text.lower()]
    assert own, f"no {lang} allow phrase is part of the {lang} disclaimer"


def test_ai_only_terms_catch_referral_wording_without_false_positives(data):
    ai_only = _banned(data, "ai_only")
    allow = _allow(data)
    for text in ("We recommend a referral for further support.", "It may help to refer the child to a specialist.",
                 "The child could be referred for a specialist evaluation.",
                 "מומלץ לשקול הפנייה לגורם מקצועי", "כדאי להפנות את הילד", "نوصي بإحالة الطفل",
                 "يُنصح بتحويله إلى أخصائي"):
        assert _find_banned(text, ai_only, allow), text
    for text in ("She prefers quiet play and preferred the blue blocks.", "Contact preferences: phone",
                 "Referring back to the story, he smiled.", "הילדה העדיפה לשחק בפינה השקטה ובחרה בהפניית מבט",
                 "يفضّل اللعب الهادئ في الحالة العادية رغم استحالة الخروج"):
        assert _find_banned(text, ai_only, allow) == [], text
