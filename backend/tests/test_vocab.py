import pytest

from app import vocab


@pytest.fixture(autouse=True)
def _sample(sample_options):
    return sample_options


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
