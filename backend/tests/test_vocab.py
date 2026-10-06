import json

import pytest

from app import vocab
from app.config import APP_DIR, settings
from app.models import AI_DOMAIN_VALUES, ASSESSMENT_DOMAIN_VALUES, SECTION_STATUS_VALUES

REAL_OPTIONS = APP_DIR / "data" / "options.json"


@pytest.fixture(autouse=True)
def _sample(sample_options):
    return sample_options


def _item(key, en):
    return {"key": key, "label": {"en": en, "ar": "عربي", "he": "עברית"}}


@pytest.fixture
def catalog(tmp_path, monkeypatch):
    """A temporary options.json + lists/ folder; returns a writer for fragments."""
    (tmp_path / "options.json").write_text(json.dumps({
        "lists": {"alpha": [_item("a1", "A one")]},
        "banned_terms": {"clinical": {"en": ["diagnosis"]}},
    }), encoding="utf-8")
    (tmp_path / "lists").mkdir()
    monkeypatch.setattr(settings, "options_path", tmp_path / "options.json")
    vocab.reload()

    def write(name, data):
        (tmp_path / "lists" / name).write_text(json.dumps(data), encoding="utf-8")
        vocab.reload()

    yield write
    vocab.reload()


@pytest.fixture
def real_catalog(monkeypatch):
    monkeypatch.setattr(settings, "options_path", REAL_OPTIONS)
    vocab.reload()
    yield
    vocab.reload()


def test_lists_are_returned_as_in_the_file():
    lists = vocab.lists()
    assert set(lists) == {"strengths", "interests", "support_levels", "focus_suggestions", "partial_labels"}
    assert lists["strengths"][0] == {"key": "imagination", "icon": "✨",
                                     "label": {"en": "Imagination", "ar": "الخيال", "he": "דמיון"}}


def test_keys_and_is_valid():
    assert vocab.keys("support_levels") == ["independent", "some_support", "significant_support", "not_observed"]
    assert vocab.is_valid("strengths", "building")
    assert not vocab.is_valid("strengths", "cars_transportation")
    assert not vocab.is_valid("strengths", "")


def test_unknown_list_fails_loudly():
    with pytest.raises(KeyError):
        vocab.keys("no_such_list")
    with pytest.raises(KeyError):
        vocab.is_valid("no_such_list", "x")


def test_labels_with_fallbacks():
    assert vocab.label("interests", "animals", "ar") == "الحيوانات"
    assert vocab.label("interests", "animals", "he") == "בעלי חיים"
    assert vocab.label("interests", "animals") == "Animals"
    assert vocab.label("partial_labels", "only_english", "he") == "Only English"
    assert vocab.label("interests", "unknown_key", "ar") == "unknown_key"
    # Items with flat en/ar/he fields are read too.
    assert vocab.label("focus_suggestions", "flat_format_item", "he") == "פריט"


def test_item_and_category():
    assert vocab.item("focus_suggestions", "joining_group_play")["category"] == "social"
    assert vocab.item("focus_suggestions", "nope") is None


def test_banned_terms():
    assert vocab.banned_terms()["en"] == ["diagnosis", "disorder"]


# --------------------------------------------------------------------------- list fragments


def test_fragments_are_merged_after_the_main_file(catalog):
    catalog("b_plan.json", {"lists": {"gamma": [_item("g1", "G one")]}})
    catalog("a_common.json", {"lists": {"beta": [_item("b1", "B one"), _item("b2", "B two")]}})
    assert list(vocab.lists()) == ["alpha", "beta", "gamma"]  # main file first, then fragments by file name
    assert vocab.keys("beta") == ["b1", "b2"]
    assert vocab.is_valid("gamma", "g1") and not vocab.is_valid("gamma", "b1")
    assert vocab.label("beta", "b2", "he") == "עברית"
    assert vocab.banned_terms() == {"clinical": {"en": ["diagnosis"]}}  # only from options.json


def test_a_list_can_be_defined_only_once(catalog):
    catalog("x.json", {"lists": {"alpha": [_item("a2", "A two")]}})
    with pytest.raises(ValueError, match="'alpha' is defined twice"):
        vocab.lists()
    catalog("x.json", {"lists": {"beta": []}})
    catalog("y.json", {"lists": {"beta": []}})
    with pytest.raises(ValueError, match="defined twice"):
        vocab.keys("beta")


@pytest.mark.parametrize("bad", [{"lists": {}, "banned_terms": {}}, {"beta": []}, {"lists": []}, []])
def test_a_fragment_holds_only_lists(catalog, bad):
    catalog("x.json", bad)
    with pytest.raises(ValueError, match="must hold only"):
        vocab.lists()


def test_no_lists_folder_means_no_fragments(tmp_path, monkeypatch):
    (tmp_path / "options.json").write_text(json.dumps({"lists": {"alpha": [_item("a1", "A")]}}), encoding="utf-8")
    monkeypatch.setattr(settings, "options_path", tmp_path / "options.json")
    vocab.reload()
    assert list(vocab.lists()) == ["alpha"]


def test_real_catalog_merges_the_common_fragment(real_catalog):
    raw = json.loads(REAL_OPTIONS.read_text(encoding="utf-8"))
    lists = vocab.lists()
    assert list(lists)[: len(raw["lists"])] == list(raw["lists"])  # options.json lists unchanged, first
    assert vocab.keys("ai_domains") == list(AI_DOMAIN_VALUES)
    assert vocab.keys("observation_domains") == list(ASSESSMENT_DOMAIN_VALUES)
    assert vocab.keys("section_statuses") == list(SECTION_STATUS_VALUES)
    assert vocab.keys("provenance") == ["parent_said", "teacher_observed", "ai_suggested", "teacher_approved"]
    assert vocab.keys("yes_no") == ["yes", "no"]
    assert vocab.keys("yes_no_sometimes") == ["yes", "no", "sometimes"]
    assert set(vocab.banned_terms()) == {"clinical", "child_deficit", "ai_only", "allow_phrases"}
    assert vocab.label("independence_areas", "dressing") == "Dressing / undressing"


def test_options_endpoint_serves_the_merged_lists(real_catalog, teacher_client, parent_client):
    for c in (teacher_client, parent_client):
        r = c.get("/api/options")
        assert r.status_code == 200
        lists = r.json()["lists"]
        assert "strengths" in lists and "section_statuses" in lists and "ai_domains" in lists
        assert "banned_terms" not in r.json()
