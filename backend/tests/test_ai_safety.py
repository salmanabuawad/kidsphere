"""Wording safety: clinical terms everywhere, deficit terms in child-facing text, URLs, scores."""
import pytest

from app.ai.safety import check_content, child_facing_fields, find_unsafe_text


def story(**over):
    data = {
        "title": "The Little Lion",
        "goal": "Supports joining group play.",
        "story": ["The lion loved to run.", "They played together."],
        "questions": ["What did the lion say?", "How did he feel?"],
        "teacher_note": "Read slowly.",
    }
    data.update(over)
    return data


STORY_FIELDS = child_facing_fields("story")


@pytest.mark.parametrize("term", ["diagnosis", "ADHD", "on the spectrum", "تشخيص", "اضطراب", "אבחנה", "הפרעת קשב"])
def test_clinical_term_in_teacher_note_is_flagged(term):
    issues = check_content(story(teacher_note=f"Possible {term} here."), STORY_FIELDS)
    assert issues and issues[0].startswith("teacher_note:")


@pytest.mark.parametrize("text", ["ההפרעה של הילד", "قد يكون والتوحد", "Signs of Autism."])
def test_clinical_substrings_with_prefixes(text):
    assert find_unsafe_text(text, child_facing=False)


@pytest.mark.parametrize("term", ["weakness", "failure", "ضعيف", "فشل", "חולשה", "כישלון"])
def test_deficit_term_flagged_in_child_facing_but_allowed_in_teacher_note(term):
    assert check_content(story(story=[f"A story about {term}.", "Ending."]), STORY_FIELDS)
    assert check_content(story(teacher_note=f"Avoid words like {term} with the child."), STORY_FIELDS) == []


@pytest.mark.parametrize("text", [
    "Problem solving with blocks: the lion finds a clever way.",
    "Oh no! What is the problem?",
    "פתרון בעיות עם קוביות",
    "حل المشكلات بالمكعبات",
    "نقاط القوة عند الطفل",
    "Let's appoint a helper and look at the viewpoint.",
])
def test_allow_phrases_pass_in_child_facing_text(text):
    assert find_unsafe_text(text, child_facing=True) == []


@pytest.mark.parametrize("text", ["Visit www.example.com", "see https://kids.example.org/x", "toys.com is fun"])
def test_urls_flagged_everywhere(text):
    assert find_unsafe_text(text, child_facing=False)
    assert find_unsafe_text(text, child_facing=True)


@pytest.mark.parametrize("text", ["You got 3 points!", "Your score is high", "Social skills: 73%", "80 % done"])
def test_scores_flagged_in_child_facing(text):
    assert find_unsafe_text(text, child_facing=True)


def test_numbers_are_fine_without_percent():
    assert find_unsafe_text("Count down together: 3, 2, 1!", child_facing=True) == []


def test_find_unsafe_text_walks_nested_data():
    issues = find_unsafe_text({"a": ["fine", {"b": "a deficit"}], "c": "ok"}, child_facing=False)
    assert issues == ['a.b: uses the clinical term "deficit"']


def test_pack_child_facing_paths():
    fields = child_facing_fields("pack")
    assert {"story.story", "game.rounds", "discussion_prompts", "activity.instructions"} <= fields
    assert "story.teacher_note" not in fields and "activity.what_to_observe" not in fields
    data = {"story": story(teacher_note="weakness is a word we avoid")}
    assert check_content(data, fields) == []
    data = {"story": story(story=["weakness", "x"])}
    assert check_content(data, fields)[0].startswith("story.story:")


def test_understanding_has_no_child_facing_fields_but_clinical_still_checked():
    assert child_facing_fields("understanding") == set()
    assert check_content({"summary": "may need support"}, set()) == []
    assert check_content({"summary": "looks like a disorder"}, set())


# --------------------------------------------------------------------------- AI output rules (X-30)


@pytest.mark.parametrize("text", [
    "We recommend a referral to a specialist.",
    "Consider a specialist evaluation.",
    "מומלץ על הפניה לגורם מקצועי",
    "כדאי להפנות את הילד",
    "نوصي بإحالة الطفل",
    "ينصح بتحويله إلى أخصائي",
])
def test_referral_wording_is_banned_in_ai_output_only(text):
    assert find_unsafe_text(text, child_facing=False, ai=True)
    # Teacher input is never checked against ai_only: the teacher may choose referral_as_needed.
    assert find_unsafe_text(text, child_facing=False) == []


def test_prefer_and_preferences_are_not_referral_wording():
    assert find_unsafe_text("Adam prefers blocks; his preferences are clear.", child_facing=False, ai=True) == []


@pytest.mark.parametrize("term", ["weakness", "failure", "ضعيف", "חולשה"])
def test_deficit_terms_are_banned_in_teacher_facing_ai_text(term):
    data = story(teacher_note=f"Notice the {term} here.")
    assert check_content(data, STORY_FIELDS) == []  # a teacher's own note
    issues = check_content(data, STORY_FIELDS, ai=True)
    assert issues and issues[0].startswith("teacher_note:")


def test_percentages_are_banned_in_teacher_facing_ai_text():
    assert find_unsafe_text("Joined in 80% of the time", child_facing=False, ai=True)
    assert find_unsafe_text("Joined in 80% of the time", child_facing=False) == []


def test_ai_rules_keep_the_disclaimer_and_allow_phrases():
    assert find_unsafe_text("Problem solving with blocks.", child_facing=False, ai=True) == []
    assert find_unsafe_text("نقاط القوة عند الطفل", child_facing=False, ai=True) == []


@pytest.mark.parametrize("text", [
    # The teacher-only involvement_steps.referral_as_needed labels (OQ-2, X-30).
    "Involve a specialist if needed",
    "שיתוף גורם מקצועי לפי הצורך",
    "إشراك مختص عند الحاجة",
    # Suggesting a professional in other words.
    "Consider a speech therapist",
    "consult a psychologist",
    "Occupational therapy may help",
    "כדאי לפנות לקלינאית תקשורת",
    "يُنصح بأخصائي نطق",
])
def test_involving_a_professional_is_banned_in_ai_output_only(text):
    from app.ai.safety import text_issues

    assert text_issues(text, False, ai=True)
    assert text_issues(text, False, ai=False) == []


@pytest.mark.parametrize("text", ["وصف مختصر", "המטפלת בגן עזרה לו"])
def test_short_summary_and_caregiver_are_not_professional_wording(text):
    from app.ai.safety import text_issues

    assert text_issues(text, False, ai=True) == []
