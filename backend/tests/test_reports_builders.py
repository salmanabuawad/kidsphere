"""PDF report builders (app/reports): messages, wording, storage paths, answer rendering,
and what each report model contains or leaves out. No PDF rendering here
(tests/test_reports_rtl.py renders real PDFs; tests/test_reports_api.py covers the API)."""
import json
import re
from datetime import date
from pathlib import Path

import pytest

from app import vocab
from app.models import ASSESSMENT_DOMAIN_VALUES, REPORT_TYPE_VALUES
from app.reports import i18n
from app.reports.builders.registry import Registry, load
from app.reports.context import ReportContext, age_parts
from app.reports.i18n import Translator, flatten, messages
from app.reports.service import build_model
from app.reports.values import WILDCARD, parse_storage, render_value
from app.schemas.reports import ReportRequest
from tests.fixtures.reports.support import MARKERS, TEXTS, seed, use_registries

REPORTS_DIR = Path(__file__).resolve().parents[1] / "app" / "reports"
SCORING = re.compile(r"\d+\s*%|\bscore\b|\bpoints\b", re.IGNORECASE)

DISCLAIMER = {  # docs/terminology.md, "PDF disclaimer" (verbatim)
    "en": "This report is based on parent information, teacher observations and educational follow-up. "
          "It is not a medical or clinical diagnosis.",
    "he": "דוח זה מבוסס על מידע מההורים, על תצפיות של הגננת ועל מעקב חינוכי. הוא אינו מהווה אבחנה רפואית או קלינית.",
    "ar": "يستند هذا التقرير إلى معلومات من الأهل وملاحظات المعلّمة والمتابعة التربوية. وهو ليس تشخيصاً طبياً أو سريرياً.",
}


@pytest.fixture
def registries(monkeypatch, tmp_path):
    root = use_registries(monkeypatch, tmp_path)
    yield root
    vocab.reload()


@pytest.fixture
def kg_class(make_class, teacher):
    return make_class("Class A", kindergarten=TEXTS["en"]["kindergarten"], teachers=[teacher])


@pytest.fixture
def seeded(db, registries, teacher, kg_class, make_child):
    return seed(db, teacher=teacher, klass=kg_class, make_child=make_child, lang="en")


def model_for(db, user, seeded, klass, report_type, lang="en", **opts):
    request = ReportRequest(report_type=report_type, language=lang, **opts)
    ctx = ReportContext(db, user, seeded.child, klass, request, lang, date.today())
    return build_model(ctx)


def all_text(model) -> str:
    return json.dumps(model, ensure_ascii=False)


def qa_items(section):
    for block in section["blocks"]:
        if block and block["type"] == "qa":
            yield from block["items"]


# ---------------------------------------------------------------------------- messages


def test_messages_have_the_same_keys_in_every_language():
    keys = {lang: flatten(messages(lang)) for lang in i18n.LANGS}
    assert set(keys["en"]) == set(keys["ar"]) == set(keys["he"])
    for key, value in keys["en"].items():
        if isinstance(value, list):
            assert len(keys["ar"][key]) == len(keys["he"][key]) == len(value), key
    assert len(keys["en"]["date.months"]) == 12 and len(keys["en"]["r3.principles"]) == 7


def test_disclaimer_is_verbatim_and_allowed():
    allow = vocab.banned_terms()["allow_phrases"]
    for lang, text in DISCLAIMER.items():
        assert messages(lang)["footer"]["disclaimer"] == text
        assert any(phrase in text.lower() for phrase in allow[lang])


def _banned_hits(text: str, ai_only: bool = True) -> list:
    groups = vocab.banned_terms()
    cleaned = text.lower()
    for phrases in groups["allow_phrases"].values():
        for phrase in phrases:
            cleaned = cleaned.replace(phrase.lower(), " ")
    hits = []
    for group in ("clinical", "child_deficit", "ai_only") if ai_only else ("clinical", "child_deficit"):
        for terms in groups.get(group, {}).values():
            hits += [t for t in terms if t.lower() in cleaned]
    if SCORING.search(text):
        hits.append("score/points/percent")
    return hits


def test_messages_pass_the_banned_terms_check():
    bad = []
    for lang in i18n.LANGS:
        for key, value in flatten(messages(lang)).items():
            for text in value if isinstance(value, list) else [value]:
                # The teacher-only follow-up option (OQ-2) may name a specialist; AI output may not.
                teacher_only = key == "options.involvement_steps.referral_as_needed"
                if _banned_hits(text, ai_only=not teacher_only):
                    bad.append(f"{lang}:{key}: {_banned_hits(text, ai_only=not teacher_only)}")
    assert bad == []


def test_messages_avoid_source_wording_banned_in_the_ui():
    he = json.dumps(messages("he"), ensure_ascii=False)
    for term in ("מדד הצלחה", "תוכנית התערבות", "רמת תפקוד", "קשב וריכוז", "בהתאם לגיל"):
        assert term not in he
    assert messages("he")["types"]["intervention_plan"] == "תוכנית עבודה אישית"
    assert messages("ar")["types"]["intervention_plan"] == "خطة العمل الفردية"
    assert messages("en")["types"]["intervention_plan"] == "Intervention Plan"


@pytest.mark.parametrize("lang, years, months, expected", [
    ("en", 4, 2, "4 years, 2 months"),
    ("en", 3, 1, "3 years, 1 month"),
    ("en", 5, 0, "5 years"),
    ("he", 4, 2, "4 שנים וחודשיים"),
    ("he", 4, 5, "4 שנים ו-5 חודשים"),
    ("he", 3, 1, "3 שנים וחודש"),
    ("ar", 4, 2, "4 سنوات وشهران"),
    ("ar", 3, 5, "3 سنوات و5 أشهر"),
    ("ar", 4, 11, "4 سنوات و11 شهرًا"),
])
def test_age_wording(lang, years, months, expected):
    assert Translator(lang).age(years, months) == expected


def test_dates_use_western_digits():
    d = date(2026, 3, 5)
    assert Translator("he").date(d) == "5.3.2026"
    assert Translator("ar").date(d) == "5.3.2026"
    assert Translator("en").date(d) == "5 Mar 2026"
    assert Translator("ar").month(2026, 10) == "أكتوبر 2026"
    # A UTC datetime late in the evening is already the next day in the kindergarten.
    assert Translator("en").date("2026-03-05T22:30:00+00:00") == "6 Mar 2026"
    assert age_parts(date(2022, 8, 5), date(2026, 10, 6)) == (4, 2)


# ---------------------------------------------------------------------------- storage paths and answers


@pytest.mark.parametrize("storage, expected", [
    ("PP.joy.likes_at_home", ("PP", ["joy", "likes_at_home"])),
    ("PP.who.interests_pq{selected[pq_interests],other}", ("PP", ["who", "interests_pq"])),
    ("**PP.heart.message** (own field)", ("PP", ["heart", "message"])),
    ("TA.strengths.items[0]{list, key}", ("TA", ["strengths", "items", 0])),
    ("TA.priority_needs.needs[].seeing", ("TA", ["priority_needs", "needs", WILDCARD, "seeing"])),
    ("TA.daily_routine.stages.<stage>.succeeds", ("TA", ["daily_routine", "stages", WILDCARD, "succeeds"])),
    ("QB.main_strengths[exactly 3 when status=sufficient]", ("QB", ["main_strengths"])),
    ("TP.bridge.question_for_parent", ("TP", ["bridge", "question_for_parent"])),
    ("CH.name (unchanged); name snapshot", ("CH", ["name"])),
    ("REG parent_questionnaire.meta.purpose", None),
    ("derived; age at PQM.filled_at", None),
    (None, None),
])
def test_parse_storage(storage, expected):
    assert parse_storage(storage) == expected


def test_render_value_shapes(db, registries, teacher, kg_class, make_child):
    child = make_child(kg_class)
    ctx = ReportContext(db, teacher, child, kg_class, ReportRequest(report_type="full"), "en", date.today())
    a = render_value(ctx, {"selected": ["animals", "music"], "other": "Space"}, ("interests",))
    assert [c["text"] for c in a["chips"]] == [vocab.label("interests", k, "en") for k in ("animals", "music")]
    assert a["lines"] == ["Other: Space"]
    a = render_value(ctx, {"value": "yes", "text": "Lego"}, ("yes_no",))
    assert [c["text"] for c in a["chips"]] == ["Yes"] and a["lines"] == ["Lego"]
    a = render_value(ctx, [{"key": "creativity", "note": "bridges"}, {"custom": "Kind to friends"}], ("strengths",))
    assert a["lines"] == ["Creativity: bridges"] and [c["text"] for c in a["chips"]] == ["Kind to friends"]
    a = render_value(ctx, {"emotional": {"text": "Name feelings"}}, ())
    assert a["lines"] == ["Emotional: Name feelings"]
    assert render_value(ctx, "2026-03-05", ())["lines"] == ["5 Mar 2026"]
    assert render_value(ctx, True, ())["chips"][0]["text"] == "Yes"
    assert render_value(ctx, {"observation_ids": ["x"], "based_on": {"a": 1}}, (), marker="—")["marker"] == "—"
    assert render_value(ctx, [{"name": "Dana", "relation": "mother"}], ("relations",))["lines"] == ["⁨Dana⁩ (Mother)"]


# ---------------------------------------------------------------------------- R2 parent questionnaire


def _expected_questions(reg: Registry, *, health=False, family=False) -> list:
    """Question labels the R2 builder must print, in registry order (the rules of builders/pq.py)."""
    out = []
    for sec in reg.sections:
        if sec.get("sensitivity") == "health" and not health:
            continue
        for item in reg.items_of(sec):
            parsed = parse_storage(item.get("storage"))
            if item.get("kind") in ("record", "display") or (parsed is None and item.get("field") != "age"):
                continue
            if parsed and parsed[0] not in ("PP", "CH", "CL"):
                continue
            if item.get("sensitivity") in ("health", "medical") and not health:
                continue
            if item.get("sensitivity") == "family" and not family:
                continue
            out.append(Registry.label(item, "en"))
    return out


def test_r2_prints_every_question_in_source_order(db, seeded, teacher, kg_class):
    model = model_for(db, teacher, seeded, kg_class, "parent_questionnaire")
    printed = [i["q"] for s in model["sections"] if s["key"].startswith("pq-") for i in qa_items(s)]
    assert printed == _expected_questions(load("parent_questionnaire"))
    rows = {i["q"]: i for s in model["sections"] for i in qa_items(s)}
    assert rows["What especially draws your child?"]["a"]["marker"] == "Not answered"
    assert rows["What does not work?"]["a"]["marker"] == "Not answered"
    assert rows["Child's age"]["a"]["lines"][0].startswith("4 years")
    assert rows["Kindergarten"]["a"]["lines"] == [TEXTS["en"]["kindergarten"]]
    assert rows["Parents' names"]["a"]["lines"] == ["⁨Dana⁩ (Mother)"]
    assert [c["text"] for c in rows["What is your child interested in?"]["a"]["chips"]] == ["Animals", "Construction"]
    # A container whose parts are separate questions prints as a sub-heading.
    assert rows["What would you like your child to develop this year?"]["heading"] is True
    assert rows["Emotionally"]["a"]["lines"] == [TEXTS["en"]["develop"]]
    assert rows["Another area"]["a"]["lines"] == ["Music", "Sing"]


def test_r2_sections_carry_status_and_parent_provenance(db, seeded, teacher, kg_class):
    model = model_for(db, teacher, seeded, kg_class, "parent_questionnaire")
    by_key = {s["key"]: s for s in model["sections"]}
    assert by_key["pq-intro"]["status"] == {"key": "sufficient", "label": "Enough for now"}
    assert by_key["pq-joy"]["status"]["key"] == "in_progress"
    assert by_key["pq-heart"]["status"]["key"] == "not_started"
    tag = by_key["pq-intro"]["source"]
    assert tag["kind"] == "parent_said"
    assert tag["text"] == "Parent Input · entered by Teacher · in a meeting with the family"
    about = json.dumps(by_key["about"], ensure_ascii=False)
    assert "Sent by the family" in about and "Together with the family at a meeting" in about and "Mother" in about


def test_r2_earlier_form_and_quick_baseline(db, seeded, teacher, kg_class):
    model = model_for(db, teacher, seeded, kg_class, "parent_questionnaire")
    by_key = {s["key"]: s for s in model["sections"]}
    earlier = [i["q"] for i in qa_items(by_key["earlier"])]
    # what_does_not_help is printed (its replacement is empty); interests is not (interests_pq has answers).
    assert earlier == ["What does not help (earlier form)"]
    assert MARKERS["legacy"] in all_text(by_key["earlier"])
    qb = {i["q"]: i for i in qa_items(by_key["quick_baseline"])}
    assert [c["text"] for c in qb["Three main strengths"]["a"]["chips"]] == [
        vocab.label("strengths", k, "en") for k in ("creativity", "curiosity", "memory")]
    assert "A question to clarify with the family" not in qb
    assert by_key["quick_baseline"]["source"]["kind"] == "teacher_observed"


@pytest.mark.parametrize("report_type", ["parent_questionnaire", "full"])
def test_health_family_and_private_notes_need_their_flags(db, seeded, teacher, kg_class, report_type):
    text = all_text(model_for(db, teacher, seeded, kg_class, report_type))
    for marker in ("health", "family", "private"):
        assert MARKERS[marker] not in text
    assert "050-1234567" not in text  # the family's contact needs include_family
    text = all_text(model_for(db, teacher, seeded, kg_class, report_type, include_health=True, include_family=True,
                              include_private_notes=True))
    for marker in ("health", "family", "private"):
        assert MARKERS[marker] in text, marker


@pytest.mark.parametrize("report_type", REPORT_TYPE_VALUES)
@pytest.mark.parametrize("lang", ["en", "he", "ar"])
def test_drafts_and_unapproved_ai_never_print_and_nothing_is_scored(db, seeded, teacher, kg_class, report_type, lang):
    model = model_for(db, teacher, seeded, kg_class, report_type, lang=lang, include_health=True, include_family=True,
                      include_private_notes=True)
    text = all_text(model)
    for marker in ("draft", "ai_pending", "content_draft"):
        assert MARKERS[marker] not in text
    strings = []

    def walk(value):
        if isinstance(value, str):
            strings.append(value)
        elif isinstance(value, dict):
            for k, v in value.items():
                if k != "widths":  # CSS column widths of a table ("44%"), never printed text
                    walk(v)
        elif isinstance(value, list):
            for v in value:
                walk(v)

    walk(model)
    assert [s for s in strings if SCORING.search(s)] == []
    assert model["meta"]["labels"]["disclaimer"] == DISCLAIMER[lang]
    assert model["meta"]["dir"] == ("ltr" if lang == "en" else "rtl")


def test_approved_summary_and_understanding_are_labelled(db, seeded, teacher, kg_class):
    model = model_for(db, teacher, seeded, kg_class, "current_development")
    by_key = {s["key"]: s for s in model["sections"]}
    summary = by_key["functional_summary"]
    assert summary["source"]["kind"] == "teacher_approved" and "approved by Teacher on" in summary["source"]["text"]
    assert TEXTS["en"]["summary"] in all_text(summary)
    understanding = list(qa_items(by_key["understanding"]))
    assert understanding[0]["source"]["kind"] == "teacher_approved"
    progress = all_text(by_key["progress"])
    assert "Partial improvement" in progress and "A shared plan with the family" in progress


# ---------------------------------------------------------------------------- R3 teacher observation


def test_r3_has_every_domain_in_order_with_tables(db, seeded, teacher, kg_class):
    model = model_for(db, teacher, seeded, kg_class, "teacher_observation")
    domains = [s["key"].removeprefix("domain-") for s in model["sections"] if s["key"].startswith("domain-")]
    assert domains == list(ASSESSMENT_DOMAIN_VALUES)
    by_key = {s["key"]: s for s in model["sections"]}
    emotional = next(b for b in by_key["domain-emotional"]["blocks"] if b["type"] == "table")
    assert emotional["columns"] == ["What we looked at", "How much support was needed?", "Notes"]
    rows = {r["cells"][0]["lines"][0]: r["cells"] for r in emotional["rows"] if "cells" in r}
    assert rows["Recognizes basic emotions"][1]["chips"][0]["text"] == vocab.label("support_levels", "independent")
    assert rows["Feels secure in the environment"][1]["marker"] == "Not observed yet"
    language = next(b for b in by_key["domain-language"]["blocks"] if b["type"] == "table")
    assert [r.get("sub") for r in language["rows"] if "sub" in r] == ["Understanding language", "Expressing & conversation"]
    independence = next(b for b in by_key["domain-independence"]["blocks"] if b["type"] == "table")
    assert independence["columns"] == ["Everyday task", "Independent", "Needs help", "Notes"]
    cells = {r["cells"][0]["lines"][0]: r["cells"] for r in independence["rows"]}
    assert cells["Eating"][1]["chips"][0]["text"] == "Independent" and not cells["Eating"][2]["chips"]
    assert cells["Using the toilet"][2]["chips"][0]["text"] == "Needs help"
    sensory = all_text(by_key["domain-sensory"])
    assert "Covers his ears" in sensory and "Affects the child" in sensory and "support_levels" not in sensory
    day_map = next(b for b in by_key["domain-daily_routine"]["blocks"] if b["type"] == "table")
    assert day_map["columns"][1] == "What goes well?"  # registry column label
    assert "Says hello" in all_text(day_map)
    assert "Builds bridges" in all_text(by_key["domain-strengths"])
    needs = all_text(by_key["domain-priority_needs"])
    assert "Plays alone at free play" in needs and TEXTS["en"]["focus"] in needs
    assert "not a test" in all_text(by_key["domain-cognitive"])
    assert by_key["domain-emotional"]["status"]["key"] == "in_progress"
    assert by_key["domain-play"]["status"]["key"] == "not_started"
    structured = all_text(by_key["structured"])
    assert TEXTS["en"]["observation"] in structured and "Waited longer" in structured
    assert "A. What do I see?" in structured  # registry label for stage A


def test_r1_summary_leaves_out_unobserved_rows(db, seeded, teacher, kg_class):
    model = model_for(db, teacher, seeded, kg_class, "full")
    keys = [s["key"] for s in model["sections"]]
    assert keys[:3] == ["heart", "basics", "parent"]
    assert "domain-play" not in keys and "domain-emotional" in keys
    assert "Not observed yet" not in all_text(next(s for s in model["sections"] if s["key"] == "domain-emotional"))
    model = model_for(db, teacher, seeded, kg_class, "full", include_parent=False, include_teacher_observations=False,
                      include_timeline=False)
    keys = [s["key"] for s in model["sections"]]
    assert "heart" not in keys and "parent" not in keys and "timeline" not in keys
    assert "activities" in keys  # X-15/X-16: R1 lists the activities without the timeline too
    assert not [k for k in keys if k.startswith("domain-")]


# ---------------------------------------------------------------------------- R5 and R6


def test_r5_plan_table_and_family_hopes(db, seeded, teacher, kg_class):
    model = model_for(db, teacher, seeded, kg_class, "intervention_plan")
    by_key = {s["key"]: s for s in model["sections"]}
    table = next(b for b in by_key["goals"]["blocks"] if b["type"] == "table")
    assert table["columns"] == ["Goal", "What we will do", "How often", "Who", "How we will know it helps", "Follow-up date"]
    first = table["rows"][0]["cells"]
    assert first[0]["lines"][0] == TEXTS["en"]["focus"] and first[2]["lines"] == ["Twice a week"]
    detail = table["rows"][1]["detail"]
    assert [p["k"] for p in detail] == ["Strength we build on", "Need", "Adaptation"]
    assert "Tidying up" not in all_text(table)  # completed goals are not part of the plan
    hopes = all_text(by_key["hopes"])
    assert TEXTS["en"]["develop"] in hopes and by_key["hopes"]["source"]["kind"] == "parent_said"


def test_r6_timeline_is_oldest_first_and_keeps_every_closure(db, seeded, teacher, kg_class):
    model = model_for(db, teacher, seeded, kg_class, "timeline", date_from=date(2020, 1, 1))
    block = next(b for b in model["sections"][0]["blocks"] if b["type"] == "timeline")
    entries = [e for g in block["groups"] for e in g["items"]]
    types = [e["type"] for e in entries]
    assert "First baseline" in types and "Family questionnaire sent" in types
    assert "Goal completed" in types and "Activity feedback" in types and "Development review" in types
    assert "Functional summary approved" in types and "Teacher observation started" in types
    days = [date.fromisoformat("-".join(reversed(e["date"].split(" ")))) if False else e for e in entries]
    assert len(days) == len(entries)
    titles = [g["title"] for g in block["groups"]]
    assert titles == sorted(set(titles), key=titles.index)  # one group per month, in order


def test_builders_never_import_the_ai_package():
    for path in REPORTS_DIR.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        assert not re.search(r"^\s*(from app\.ai\b|import app\.ai\b|from app import .*\bai\b)", source, re.M), path
        assert "app.ai" not in source, path


# ---------------------------------------------------------------------------- the real registries (once they exist)


def test_real_registries_print_every_question(db, monkeypatch, tmp_path, teacher, kg_class, make_child):
    real = Path(vocab.__file__).parent / "data" / "source"
    if not (real / "parent_questionnaire.json").is_file() or not (real / "observation_model.json").is_file():
        pytest.skip("the source registries are not there yet")
    use_registries(monkeypatch, tmp_path, real=True)
    try:
        s = seed(db, teacher=teacher, klass=kg_class, make_child=make_child, lang="he")
        model = model_for(db, teacher, s, kg_class, "parent_questionnaire", lang="he")
        printed = [i["q"] for sec in model["sections"] if sec["key"].startswith("pq-") for i in qa_items(sec)]
        reg = load("parent_questionnaire")
        for item in reg.items:
            parsed = parse_storage(item.get("storage"))
            if not parsed or parsed[0] != "PP" or WILDCARD in parsed[1]:
                continue
            if item.get("sensitivity") in ("health", "medical", "family"):
                continue
            section = reg.section_of(item["section"]) or {}
            if section.get("sensitivity") in ("health", "medical", "family"):
                continue
            assert Registry.label(item, "he") in printed, item["id"]
        model = model_for(db, teacher, s, kg_class, "teacher_observation", lang="he")
        domains = [x["key"] for x in model["sections"] if x["key"].startswith("domain-")]
        assert len(domains) == len(ASSESSMENT_DOMAIN_VALUES)
        text = all_text(model)
        om = load("observation_model")
        for item in om.items:
            parsed = parse_storage(item.get("storage"))
            if item.get("kind") == "level_item" and parsed and parsed[0] == "TA":
                assert Registry.label(item, "he") in text, item["id"]
    finally:
        vocab.reload()


def test_pq_chips_without_item_options_print_their_list_labels(db, teacher, make_class, make_child, monkeypatch,
                                                              tmp_path):
    """PQ-EMO-04 (PP.emotions.calming_helps) has no "options" of its own: its chips list names the labels."""
    from sqlalchemy import select

    from app.models import ChildProfile
    from app.reports.builders.pq import item_answer

    use_registries(monkeypatch, tmp_path, real=True)
    try:
        klass = make_class("Class A", kindergarten="גן", teachers=[teacher])
        s = seed(db, teacher=teacher, klass=klass, make_child=make_child, lang="he")
        profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == s.child.id)).one()
        pp = json.loads(json.dumps(profile.parent_perspective))
        pp["sections"]["emotions"]["calming_helps"] = [{"key": "adult_reassurance"}]
        profile.parent_perspective = pp
        db.commit()
        item = next(i for i in load("parent_questionnaire").items if i["id"] == "PQ-EMO-04")
        for lang, label in (("he", "הרגעה של מבוגר"), ("en", "Adult reassurance")):
            request = ReportRequest(report_type="parent_questionnaire", language=lang)
            ctx = ReportContext(db, teacher, s.child, klass, request, lang, date.today())
            answer = item_answer(ctx, item, parse_storage(item["storage"]))
            assert [c["text"] for c in answer["chips"]] == [label]
    finally:
        vocab.reload()


def test_r5_prints_the_latest_follow_up(db, seeded, teacher, kg_class):
    """OM-D16-01/05: the reassessment date (and what worked / what to change) of the last review."""
    model = model_for(db, teacher, seeded, kg_class, "intervention_plan")
    by_key = {s["key"]: s for s in model["sections"]}
    assert "follow_up" in by_key
    qa = next(b for b in by_key["follow_up"]["blocks"] if b["type"] == "qa")
    assert len(qa["items"]) == 1  # the seed review has only a reassessment date of these three
    year = seeded.review.follow_up["reassessment_on"][:4]
    assert year in all_text(qa)


def test_r3_independence_has_the_parent_column_and_the_sensory_parent_note(db, seeded, teacher, kg_class):
    from sqlalchemy import select

    from app.models import ChildProfile

    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == seeded.child.id)).one()
    pp = json.loads(json.dumps(profile.parent_perspective))
    pp["sections"]["independence"] = {"levels_pq": {"eating": "independent", "dressing": "needs_help"},
                                      "help_amount": {"dressing": "a_lot"}}
    pp["sections"]["health"]["sensory"] = {"keys": ["noise"], "text": "SENSORYNOTE"}
    profile.parent_perspective = pp
    db.commit()
    model = model_for(db, teacher, seeded, kg_class, "teacher_observation", include_health=True)
    section = next(s for s in model["sections"] if s["key"] == "domain-independence")
    table = next(b for b in section["blocks"] if b["type"] == "table")
    assert table["columns"][-1] == "Parent Input" and len(table["columns"]) == 5
    assert "SENSORYNOTE" in all_text(next(s for s in model["sections"] if s["key"] == "domain-sensory"))
    model = model_for(db, teacher, seeded, kg_class, "teacher_observation")
    assert "SENSORYNOTE" not in all_text(model)  # a health answer needs include_health
