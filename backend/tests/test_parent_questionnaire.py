"""WP2-PQ: the complete parent questionnaire (COVERAGE-MATRIX §2.1, §3.3.1–§3.3.2, §4.1).

Registry completeness and wording, a write/read round trip for every PQ-* item,
not_answered, the legacy projection (every row of §3.3.2), history (record_versions),
the questionnaire record (submit, meeting mode) and access rules.
"""
import copy
import json
import re
from datetime import datetime, timezone

import pytest
from pydantic import BaseModel
from sqlalchemy import select

from app import models, vocab
from app.config import APP_DIR
from app.models import AuditLog, Child, ChildProfile, RecordVersion
from app.schemas import profile as schema

REGISTRY_PATH = APP_DIR / "data" / "source" / "parent_questionnaire.json"
LANGS = ("en", "ar", "he")
NUMERIC_RE = re.compile(r"\d+\s*%|\bscore\b|\bpoints\b", re.IGNORECASE)
ARABIC_RE = re.compile("[؀-ۿ]")
HEBREW_RE = re.compile("[֐-׿]")


def _ids(prefix, n):
    return [f"{prefix}-{i:02d}" for i in range(1, n + 1)]


EXPECTED_IDS = set(
    _ids("PQ-META", 3) + _ids("PQ-SEC", 13) + _ids("PQ-INTRO", 9) + _ids("PQ-JOY", 4) + _ids("PQ-EMO", 7)
    + _ids("PQ-SEP", 3) + _ids("PQ-SOC", 5) + _ids("PQ-COM", 6) + _ids("PQ-IND", 11) + _ids("PQ-HLT", 4)
    + _ids("PQ-BEH", 4) + _ids("PQ-TRN", 3) + _ids("PQ-EXP", 10) + _ids("PQ-PRT", 4) + ["PQ-HRT-01"]
    + _ids("PQ-TCH", 9)
)
AI_POLICIES = {"never", "label", "domain", "n/a"}
SENSITIVITIES = {"none", "third_party", "family", "health", "medical"}


@pytest.fixture(scope="module")
def registry():
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def url(child):
    return f"/api/children/{child.id}/profile"


def history_url(child, **q):
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    return f"/api/children/{child.id}/profile/history" + (f"?{qs}" if qs else "")


def get_path(data, path):
    cur = data
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def set_path(data, path, value):
    parts = path.split(".")
    cur = data
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = value


def versions(db, child, key=None):
    db.expire_all()
    stmt = select(RecordVersion).where(RecordVersion.child_id == child.id).order_by(RecordVersion.id)
    if key:
        stmt = stmt.where(RecordVersion.entity_key == key)
    return db.scalars(stmt).all()


# --------------------------------------------------------------------------- registry


def test_registry_has_every_pq_id_once(registry):
    ids = [s["id"] for s in registry["sections"]] + [i["id"] for i in registry["items"]]
    assert len(ids) == len(set(ids)), "duplicate ids"
    assert set(ids) == EXPECTED_IDS
    assert len(ids) == 96


def test_registry_entries_are_complete(registry):
    section_keys = {s["key"] for s in registry["sections"]}
    item_ids = {i["id"] for i in registry["items"]}
    assert [s["order"] for s in registry["sections"]] == sorted(s["order"] for s in registry["sections"])
    for item in registry["items"]:
        where = item["id"]
        assert item["section"] in section_keys, where
        assert isinstance(item["order"], int), where
        assert item["kind"], where
        assert item["storage"], where
        assert item["ai_policy"] in AI_POLICIES, where
        assert item["sensitivity"] in SENSITIVITIES, where
        assert item["pdf"], where
        assert item["source_he"] and HEBREW_RE.search(item["source_he"]), where
        assert item.get("step") in (*range(1, 10), "QB"), where
        if item.get("part_of"):
            assert item["part_of"] in item_ids, where
        options = item.get("options")
        for name in [options] if isinstance(options, str) else options or []:
            assert vocab.keys(name), f"{where}: unknown option list {name}"
    # Every source section of the questionnaire is a step of the 9-step wizard, in source order.
    steps = registry["meta"]["steps"]
    assert [s["step"] for s in steps] == list(range(1, 10))
    parent_sections = [s["key"] for s in registry["sections"] if s["kind"] == "parent"]
    assert [k for s in steps for k in s["sections"] if k not in ()] == ["intro", "intro", "joy", "emotions", "separation",
                                                                        "social", "communication", "independence",
                                                                        "health", "behaviour", "transitions",
                                                                        "expectations", "partnership", "heart"]
    assert len(parent_sections) == 13


def _labels(registry):
    """Every user-facing label of the registry (never source_he)."""
    meta = registry["meta"]
    for key in ("title", "audience", "purpose", "motto"):
        yield f"meta.{key}", meta[key]
    for s in meta["steps"]:
        yield f"meta.steps.{s['step']}", s["label"]
    for entry in meta["legacy"]:
        yield f"meta.legacy.{entry['field']}", entry["label"]
    for s in registry["sections"]:
        for key in ("label", "notice", "intro"):
            if key in s:
                yield f"{s['id']}.{key}", s[key]
    for item in registry["items"]:
        for key in ("label", "text_label", "area_label", "notice", "hint"):
            if key in item:
                yield f"{item['id']}.{key}", item[key]


def test_registry_labels_are_trilingual_and_use_kidsphere_wording(registry):
    banned = vocab.banned_terms()
    terms = [t.lower() for group in ("clinical", "child_deficit", "ai_only") for lang in LANGS for t in banned[group][lang]]
    allow = [p.lower() for lang in LANGS for p in banned["allow_phrases"][lang]]
    problems = []
    for where, label in _labels(registry):
        assert set(label) == set(LANGS), where
        for lang in LANGS:
            text = label[lang]
            assert isinstance(text, str) and text.strip() == text and text, f"{where} {lang}"
            if lang == "he":
                assert HEBREW_RE.search(text) and not ARABIC_RE.search(text), f"{where} he"
            if lang == "ar":
                assert ARABIC_RE.search(text) and not HEBREW_RE.search(text), f"{where} ar"
            if lang == "en":
                assert not (ARABIC_RE.search(text) or HEBREW_RE.search(text)), f"{where} en"
            lowered = text.lower()
            for phrase in allow:
                lowered = lowered.replace(phrase, " ")
            hits = [t for t in terms if t in lowered]
            if hits or NUMERIC_RE.search(text):
                problems.append(f"{where} ({lang}) {text!r}: {hits}")
    assert not problems, "\n".join(problems)


def _resolve_model(model: type[BaseModel], parts: list[str]) -> bool:
    for i, part in enumerate(parts):
        field = model.model_fields.get(part)
        if field is None:
            return False
        if i == len(parts) - 1:
            return True
        ann = field.annotation
        nested = [a for a in getattr(ann, "__args__", ()) if isinstance(a, type) and issubclass(a, BaseModel)]
        if isinstance(ann, type) and issubclass(ann, BaseModel):
            nested = [ann]
        if not nested:
            return False
        model = nested[0]
    return True


def test_every_storage_path_resolves(registry):
    for entry in [*registry["sections"], *registry["items"]]:
        storage = entry.get("storage")
        if not storage or storage.startswith("REG"):
            continue
        head, _, rest = storage.partition(".")
        parts = rest.split(".") if rest else []
        if head == "PP":
            assert _resolve_model(schema.SECTION_MODELS[parts[0]], parts[1:]), storage
        elif head == "TP":
            assert parts[0] == "bridge" and (len(parts) == 1 or _resolve_model(schema.BridgeSection, parts[1:])), storage
        elif head == "PQM":
            assert not parts or _resolve_model(schema.QuestionnaireRecord, parts), storage
        elif head == "CH":
            assert parts[0] in models.Child.__table__.columns.keys(), storage
        elif head == "CL":
            assert parts[0] in models.Class.__table__.columns.keys(), storage
        else:  # pragma: no cover
            pytest.fail(f"unknown storage {storage}")


def test_registry_legacy_list_matches_the_server_rules(registry):
    legacy = {e["field"]: tuple(e["replaced_by"]) for e in registry["meta"]["legacy"]}
    server = {f"{section}.{field}": replaced_by for section, fields in schema.PARENT_LEGACY_KEYS.items()
              for field, replaced_by in fields.items()}
    assert legacy == server


def test_parent_questionnaire_lists(registry):
    assert [i["key"] for i in vocab.lists()["pq_interests"]][:11] == [
        "pretend_play", "cars_transport", "building_assembly", "drawing_crafts", "music_singing", "dance_movement",
        "stories_books", "outdoor_play", "animals", "social_games", "screen_games"]
    assert len(vocab.keys("pq_frustration_reactions")) == 8
    assert vocab.keys("pq_morning_separation") == ["easily", "needs_time", "very_difficult", "varies"]
    assert len(vocab.keys("pq_social_contact")) == 6 and len(vocab.keys("pq_express_needs")) == 6
    assert vocab.keys("pq_degree") == ["very_much", "sometimes", "a_little"]
    assert vocab.keys("pq_stop_activity") == ["easily", "needs_preparation", "resists", "cries_or_angry", "very_difficult"]
    assert vocab.keys("health_food_flags") == ["allergy", "preference", "eating_difficulty"]


# --------------------------------------------------------------------------- round trip for every item


def _sample(item):
    """A valid answer for one registry item, written at its own field path."""
    kind = item["kind"]
    opts = item.get("options")
    first = vocab.keys(opts)[:2] if isinstance(opts, str) and kind not in ("text",) else []
    if kind == "text":
        return f"Answer for {item['id']} · תשובה · إجابة"
    if kind == "items":
        return [{"key": first[0]}, {"custom": "Brave heart"}]
    if kind == "choice_other":
        keys = [k for k in vocab.keys(opts) if k != "other"][:2]
        if vocab.is_valid(opts, "other"):
            keys.append("other")
        return {"selected": keys, "other": f"Other for {item['id']}"}
    if kind == "yes_no_text":
        return {"value": "yes", "text": f"Details for {item['id']}"}
    if kind == "yes_no_text_keys":
        return {"value": "yes", "text": "Builds tall towers", item["keys_field"]: ["building", "music"]}
    if kind == "single":
        return vocab.keys(opts)[1]
    if kind == "text_keys":
        return {"text": f"Text for {item['id']}", item.get("keys_field", "keys"): first}
    if kind == "multi_exclusive":
        return {"selected": [k for k in vocab.keys(opts) if k not in item.get("exclusive", [])][:2]}
    if kind == "home_language":
        return {"value": "yes", "languages": ["ru", "other"], "other_text": "Tigrinya"}
    if kind == "levels_table":
        return {"eating": "independent", "drinking": "needs_help", "toilet": "independent", "washing_hands": "independent",
                "dressing": "needs_help", "shoes": "needs_help", "tidying_toys": "independent",
                "keeping_belongings": "independent"}
    if kind == "develop":
        return {"emotional": {"text": "Name feelings"}, "social": {"text": "Join play"}, "language": {"text": "Tell stories"},
                "motor": {"text": "Use scissors"}, "independence": {"text": "Dress alone"},
                "other": {"area": "Music", "text": "Keep a rhythm"}}
    if kind == "parents":
        return [{"name": "Dana Levi", "relation": "mother"}, {"name": "Omar Levi", "relation": "father"}]
    if kind == "text_chips":
        return f"Words for {item['id']}"
    return None


def _section_answers(registry):
    """{data section: (section data, [(item id, field path, value)])} for every PP item."""
    out: dict[str, tuple[dict, list]] = {}
    for item in registry["items"]:
        storage = item["storage"]
        if not storage.startswith("PP.") or item.get("part_of"):
            continue
        section = storage.split(".")[1]
        value = _sample(item)
        assert value is not None, item["id"]
        data, checks = out.setdefault(section, ({}, []))
        set_path(data, item["field"], value)
        checks.append((item["id"], item["field"], value))
        if item["kind"] == "text_chips":
            chips = item["chips"]
            chip_value = [{"key": vocab.keys(chips["options"])[0]}]
            data[chips["field"]] = chip_value
            checks.append((item["id"], chips["field"], chip_value))
    # The parts (other texts, the 8 independence rows, the Q38 boxes) live inside their parent's value.
    for item in registry["items"]:
        if item.get("part_of") and item["storage"].startswith("PP."):
            section = item["storage"].split(".")[1]
            data, checks = out[section]
            checks.append((item["id"], item["field"], get_path(data, item["field"])))
    return out


def test_every_pp_item_round_trips(parent_client, teacher_client, child, registry):
    answers = _section_answers(registry)
    covered = set()
    for section, (data, checks) in answers.items():
        r = parent_client.patch(url(child), json={"section": section, "data": data})
        assert r.status_code == 200, (section, r.text)
        stored = r.json()["parent_perspective"]["sections"][section]
        for item_id, field, value in checks:
            assert value is not None, item_id
            assert get_path(stored, field) == value, (item_id, field)
            covered.add(item_id)
    pp_items = {i["id"] for i in registry["items"] if i["storage"].startswith("PP.")}
    assert covered == pp_items
    staff = teacher_client.get(url(child)).json()
    for section, (data, checks) in answers.items():
        for item_id, field, value in checks:
            assert get_path(staff["parent_perspective"]["sections"][section], field) == value, item_id


def test_not_answered_lists_skipped_fields(parent_client, child):
    r = parent_client.patch(url(child), json={"section": "joy", "data": {
        "happy_safe_successful": "Being outside", "not_answered": ["likes_at_home", "persists_at", "happy_safe_successful"]}})
    assert r.status_code == 200, r.text
    joy = r.json()["parent_perspective"]["sections"]["joy"]
    assert joy["not_answered"] == ["likes_at_home", "persists_at"]  # an answered field is never "skipped"
    for bad in (["sleep"], ["not_answered"], ["happy"]):
        r = parent_client.patch(url(child), json={"section": "joy", "data": {"not_answered": bad}})
        assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION"
    r = parent_client.patch(url(child), json={"section": "heart", "data": {"not_answered": ["message"]}})
    assert r.json()["parent_perspective"]["sections"]["heart"] == {"not_answered": ["message"]}


def test_text_answers_up_to_4000(parent_client, child):
    assert parent_client.patch(url(child), json={"section": "heart", "data": {"message": "x" * 4000}}).status_code == 200
    r = parent_client.patch(url(child), json={"section": "heart", "data": {"message": "x" * 4001}})
    assert r.status_code == 400 and r.json()["error"]["details"][0]["path"].startswith("data.message")


def test_validation_of_questionnaire_shapes(parent_client, child):
    cases = [
        ("who", {"interests_pq": {"selected": ["dragons"]}}),
        ("transitions", {"stopping_activity": {"selected": ["easily", "resists"]}}),
        ("transitions", {"preparation_helps": "maybe"}),
        ("communication", {"home_language": {"value": "yes", "languages": ["klingon"]}}),
        ("health", {"food": {"flags": ["candy"]}}),
        ("independence", {"levels_pq": {"eating": "some_support"}}),
        ("independence", {"levels_pq": {"flying": "independent"}}),
        ("joy", {"special_ability": {"strength_keys": ["juggling"]}}),
        ("expectations", {"develop": {"cooking": {"text": "x"}}}),
        ("who", {"parents": [{"name": "", "relation": "mother"}]}),
        ("partnership", {"contact_channels": {"selected": ["pigeon"]}}),
    ]
    for section, data in cases:
        r = parent_client.patch(url(child), json={"section": section, "data": data})
        assert r.status_code == 400, (section, data, r.text)


def test_other_text_selects_other(parent_client, child):
    r = parent_client.patch(url(child), json={"section": "partnership", "data": {
        "contact_channels": {"selected": ["phone"], "other": "WhatsApp voice note"}}})
    assert r.json()["parent_perspective"]["sections"]["partnership"]["contact_channels"] == {
        "selected": ["phone", "other"], "other": "WhatsApp voice note"}


# --------------------------------------------------------------------------- legacy projection (§3.3.2)


def patch(client, child, section, data, **extra):
    r = client.patch(url(child), json={"section": section, "data": data, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def sections_of(body):
    return body["parent_perspective"]["sections"]


def item_keys(items):
    return [i.get("key") if isinstance(i, dict) and i.get("key") else i if isinstance(i, str) else {"custom": i.get("custom")}
            for i in items]


def test_projection_interests(parent_client, child):
    body = patch(parent_client, child, "who", {"interests_pq": {"selected": ["drawing_crafts", "stories_books", "screen_games"],
                                                                "other": "Trains"}})
    who = sections_of(body)["who"]
    assert item_keys(who["interests"]) == ["drawing", "crafts", "stories", "books", "technology", {"custom": "Trains"}]
    assert who["interests_pq"]["selected"] == ["drawing_crafts", "stories_books", "screen_games", "other"]
    body = patch(parent_client, child, "who", {"interests_pq": {"selected": ["stories_books", "cars_transport", "building_assembly"]}})
    assert item_keys(sections_of(body)["who"]["interests"]) == ["stories", "books", "cars_transportation", "construction"]


def test_projection_reaches_the_merged_lists_with_parent_source(parent_client, teacher_client, child):
    patch(parent_client, child, "who", {"interests_pq": {"selected": ["animals", "music_singing"]}})
    staff = teacher_client.get(url(child)).json()
    assert {i["key"]: i["sources"] for i in staff["interests"]} == {"animals": ["parent"], "music": ["parent"]}
    assert all(i["provenance"] == [{"label": "parent_said"}] for i in staff["interests"])


def test_projection_frustration(parent_client, child):
    body = patch(parent_client, child, "emotions", {"frustration_pq": {
        "selected": ["cries", "shouts", "moves_away", "turns_to_adult", "asks_for_hug", "hard_to_calm", "outburst"],
        "other": "Hides under the table"}})
    assert item_keys(sections_of(body)["emotions"]["frustration_reactions"]) == [
        "cries", "shouts", "moves_away", "asks_adult_help", "asks_for_hug", "takes_time_to_calm", "other",
        {"custom": "Hides under the table"}]


def test_projection_morning_separation(parent_client, child):
    body = patch(parent_client, child, "separation", {"morning": "very_difficult"})
    assert sections_of(body)["emotions"] == {"morning_separation": "needs_a_lot_of_support"}
    for answer, legacy in (("easily", "easy"), ("needs_time", "needs_time"), ("varies", "varies")):
        body = patch(parent_client, child, "separation", {"morning": answer})
        assert sections_of(body)["emotions"]["morning_separation"] == legacy
    body = patch(parent_client, child, "separation", {"not_answered": ["morning"]})
    assert "morning_separation" not in sections_of(body)["emotions"]


def test_projection_transition_helps_union(parent_client, child):
    patch(parent_client, child, "separation", {"what_helps_entry": {"text": "A goodbye song", "keys": ["goodbye_routine", "favorite_object"]}})
    body = patch(parent_client, child, "transitions", {"preparation_helps": "yes",
                                                       "which_preparation": {"keys": ["countdown_timer", "favorite_object"]}})
    assert item_keys(sections_of(body)["emotions"]["transition_helps"]) == ["goodbye_routine", "favorite_object", "countdown_timer"]
    # favorite_object is still named in Q14, so dropping it from Q35 keeps it.
    body = patch(parent_client, child, "transitions", {"preparation_helps": "yes", "which_preparation": {"keys": []}})
    assert item_keys(sections_of(body)["emotions"]["transition_helps"]) == ["goodbye_routine", "favorite_object"]


def test_projection_stopping_activity_strongest(parent_client, child):
    body = patch(parent_client, child, "transitions", {"stopping_activity": {"selected": ["needs_preparation", "cries_or_angry"]}})
    assert sections_of(body)["emotions"]["transition_reaction"] == "becomes_upset"
    for selected, legacy in ((["very_difficult", "resists"], "needs_adult_support"), (["resists"], "resists"),
                             (["needs_preparation"], "needs_preparation"), (["easily"], "transitions_easily")):
        body = patch(parent_client, child, "transitions", {"stopping_activity": {"selected": selected}})
        assert sections_of(body)["emotions"]["transition_reaction"] == legacy


def test_projection_social_and_communication(parent_client, child):
    body = patch(parent_client, child, "social", {"contact_pq": {
        "selected": ["initiates", "waits_to_be_approached", "prefers_alone", "familiar_children", "needs_mediation"]}})
    assert sections_of(body)["social"]["social"] == [
        "initiates_play", "waits_for_others", "often_plays_independently", "prefers_familiar_children",
        "needs_adult_support_to_join"]
    body = patch(parent_client, child, "communication", {"expresses_needs": {
        "selected": ["words", "sentences", "gestures", "crying_behaviour", "turns_to_adult"]}, "tells_experiences": "sometimes"})
    assert sections_of(body)["social"]["communication"] == [
        "expresses_needs_verbally", "uses_full_sentences", "uses_gestures", "sometimes_communicates_through_behavior",
        "needs_adult_support", "tells_about_experiences"]
    body = patch(parent_client, child, "communication", {"expresses_needs": {"selected": ["words"]}, "tells_experiences": "a_little"})
    assert sections_of(body)["social"]["communication"] == ["expresses_needs_verbally"]


def test_projection_independence_levels(parent_client, child, db):
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.parent_perspective = {"sections": {"independence": {"levels": {"shoes": "significant_support", "toilet": "independent"},
                                                                "notes": "Old note"}}, "entered": {}}
    db.commit()
    body = patch(parent_client, child, "independence", {"levels_pq": {"eating": "independent", "dressing": "needs_help",
                                                                      "shoes": "needs_help", "drinking": "needs_help"},
                                                        "help_amount": {"drinking": "a_lot"}, "notes": "Still writable"})
    ind = sections_of(body)["independence"]
    assert ind["levels"] == {"shoes": "significant_support", "toilet": "independent", "eating": "independent",
                             "dressing": "some_support", "drinking": "significant_support"}
    assert ind["notes"] == "Still writable"  # the earlier note stays writable until Q24/Q25 are answered
    body = patch(parent_client, child, "independence", {"levels_pq": {"eating": "independent", "dressing": "needs_help",
                                                                      "shoes": "independent"},
                                                        "still_helping": "Buttons", "notes": "Overwritten?"})
    ind = sections_of(body)["independence"]
    assert ind["levels"] == {"shoes": "independent", "toilet": "independent", "eating": "independent",
                             "dressing": "some_support"}
    assert ind["notes"] == "Still writable"


def test_projection_health_sensory_keys(parent_client, child, db):
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.parent_perspective = {"sections": {"environment": {"items": [
        {"key": "noise", "what_happens": "Covers ears", "what_helps": [{"key": "quiet_space"}]}]}}, "entered": {}}
    db.commit()
    body = patch(parent_client, child, "health", {"sensory": {"text": "Labels in clothes bother her", "keys": ["clothing", "noise"]}})
    items = sections_of(body)["environment"]["items"]
    assert items == [{"key": "noise", "what_happens": "Covers ears", "what_helps": [{"key": "quiet_space"}]},
                     {"key": "clothing", "what_helps": []}]
    body = patch(parent_client, child, "health", {"sensory": {"keys": []}})
    assert sections_of(body)["environment"]["items"] == [
        {"key": "noise", "what_happens": "Covers ears", "what_helps": [{"key": "quiet_space"}]}]


def test_projection_expectations(parent_client, child):
    body = patch(parent_client, child, "expectations", {
        "most_important": "He is shy at first", "hope_child_feels": {"selected": ["safe", "loved"], "other": "Proud"},
        "develop": {"social": {"text": "Join group play"}, "motor": {"text": ""}, "other": {"area": "Music"}}})
    pr = sections_of(body)["priorities"]
    assert pr == {"one_thing_to_know": "He is shy at first", "hope_child_feels": ["safe", "loved"],
                  "parent_priorities": ["social", "other"]}
    body = patch(parent_client, child, "heart", {"message": "She sings when she is happy"})
    assert sections_of(body)["priorities"]["one_thing_to_know"] == "He is shy at first"  # the heart message is never copied


def test_projection_home_language_union(parent_client, child, db):
    db.get(Child, child.id).additional_languages = ["en"]
    db.commit()
    patch(parent_client, child, "communication", {"home_language": {"value": "yes", "languages": ["ru", "ar", "en"]}})
    db.expire_all()
    assert db.get(Child, child.id).additional_languages == ["en", "ru"]  # main language 'ar' is not "additional"
    patch(parent_client, child, "communication", {"home_language": {"value": "no", "languages": []}})
    db.expire_all()
    assert db.get(Child, child.id).additional_languages == ["en", "ru"]  # never removed
    rows = db.scalars(select(AuditLog).where(AuditLog.action == "child.update")).all()
    assert len(rows) == 1 and rows[0].meta == {"fields": ["additional_languages"], "via": "questionnaire"}


def test_parent_names_fill_an_empty_parent_name_only(parent_client, child, db):
    db.get(Child, child.id).parent_name = None
    db.commit()
    patch(parent_client, child, "who", {"parents": [{"name": "Dana Levi", "relation": "mother"}, {"name": "Avi Levi"}]})
    db.expire_all()
    assert db.get(Child, child.id).parent_name == "Dana Levi"  # = the first entry
    patch(parent_client, child, "who", {"parents": [{"name": "Avi Levi"}]})
    db.expire_all()
    assert db.get(Child, child.id).parent_name == "Dana Levi"  # never replaced once set
    rows = db.scalars(select(AuditLog).where(AuditLog.action == "child.update")).all()
    assert len(rows) == 1 and rows[0].meta == {"fields": ["parent_name"], "via": "questionnaire"}


def test_earlier_form_answers_stay_until_answered_again(parent_client, child, db):
    legacy = {
        "who": {"interests": [{"key": "blocks"}], "strengths": [{"key": "music"}]},
        "emotions": {"morning_separation": "needs_time", "frustration_reactions": [{"key": "becomes_silent"}],
                     "what_does_not_help": "Shouting"},
        "priorities": {"parent_priorities": ["confidence"], "one_thing_to_know": "Old answer"},
    }
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.parent_perspective = {"sections": copy.deepcopy(legacy), "entered": {}}
    db.commit()
    body = patch(parent_client, child, "emotions", {"new_situations": "Watches first"})
    emotions = sections_of(body)["emotions"]
    assert emotions["morning_separation"] == "needs_time" and emotions["what_does_not_help"] == "Shouting"
    body = patch(parent_client, child, "who", {"interests_pq": {"selected": ["animals"]}, "interests": [{"key": "sports"}]})
    assert item_keys(sections_of(body)["who"]["interests"]) == ["blocks", "animals"]  # the client's legacy value is ignored
    body = patch(parent_client, child, "separation", {"what_helps_entry": {"text": "A hug"}})
    assert sections_of(body)["emotions"]["morning_separation"] == "needs_time"  # Q13 itself was not answered
    assert sections_of(body)["priorities"] == legacy["priorities"]


# --------------------------------------------------------------------------- history


def test_each_section_save_inserts_one_version(parent_client, teacher_client, parent, teacher, child, db):
    patch(parent_client, child, "joy", {"likes_at_home": "Lego"})
    rows = versions(db, child, "parent:joy")
    assert len(rows) == 1
    assert (rows[0].seq, rows[0].reported_by, rows[0].via, rows[0].changed_role) == (1, "parent", "self", "parent")
    assert rows[0].data == {"likes_at_home": "Lego"}
    assert len(versions(db, child)) == 1

    patch(teacher_client, child, "joy", {"likes_at_home": "Lego and trains"}, perspective="parent")
    patch(teacher_client, child, "joy", {"likes_at_home": "Lego, trains"}, perspective="parent",
          questionnaire={"entry_mode": "meeting"})
    rows = versions(db, child, "parent:joy")
    assert [(r.seq, r.via, r.changed_role, r.reported_by) for r in rows] == [
        (1, "self", "parent", "parent"), (2, "on_behalf", "teacher", "parent"), (3, "meeting", "teacher", "parent")]
    # The same data again: no new version, no new stamp.
    body = patch(teacher_client, child, "joy", {"likes_at_home": "Lego, trains"}, perspective="parent")
    assert len(versions(db, child, "parent:joy")) == 3
    stamps = body["parent_perspective"]["entered"]["joy"]
    assert [(s["mode"], s["version_seq"], s["role"]) for s in stamps] == [
        ("self", 1, "parent"), ("on_behalf", 2, "teacher"), ("meeting", 3, "teacher")]

    r = teacher_client.get(history_url(child, perspective="parent", section="joy"))
    assert r.status_code == 200, r.text
    hist = r.json()
    assert [v["data"]["likes_at_home"] for v in hist["versions"]] == ["Lego", "Lego and trains", "Lego, trains"]
    assert [v["via"] for v in hist["versions"]] == ["self", "on_behalf", "meeting"]
    assert hist["versions"][0]["changed_by_name"] == parent.name and hist["versions"][1]["changed_by_name"] == teacher.name
    # The family's first answer is kept although it was edited twice.
    assert versions(db, child, "parent:joy")[0].data == {"likes_at_home": "Lego"}


def test_history_initial_is_the_state_at_the_first_submission(parent_client, teacher_client, child):
    patch(parent_client, child, "heart", {"message": "First words"})
    r = parent_client.patch(url(child), json={"section": "heart", "data": {"message": "Sent words"},
                                              "questionnaire": {"submit": True}})
    assert r.status_code == 200
    patch(teacher_client, child, "heart", {"message": "Edited later"}, perspective="parent")
    hist = teacher_client.get(history_url(child, section="heart")).json()
    assert [v["data"]["message"] for v in hist["versions"]] == ["First words", "Sent words", "Edited later"]
    assert hist["initial"]["parent:heart"] == 2
    assert [v["initial"] for v in hist["versions"]] == [False, True, False]
    assert hist["questionnaire_status"] == "submitted" and hist["submitted_at"]
    everything = teacher_client.get(history_url(child)).json()
    assert {v["key"] for v in everything["versions"]} == {"parent:heart", "parent:_questionnaire"}


def test_history_access(client, parent_client, other_teacher_client, teacher_client, child):
    assert client.get(history_url(child)).status_code == 401
    assert parent_client.get(history_url(child)).status_code == 404
    assert other_teacher_client.get(history_url(child)).status_code == 404
    assert teacher_client.get(history_url(child, perspective="nobody")).status_code == 400
    assert teacher_client.get(history_url(child, section="nonsense")).status_code == 400


# --------------------------------------------------------------------------- questionnaire record


def test_submit_questionnaire(parent_client, teacher_client, parent, child, db):
    patch(parent_client, child, "who", {"describe_words": [{"key": "curious"}]})
    body = parent_client.get(url(child)).json()
    q = body["questionnaire"]
    assert q["status"] == "draft" and q["entry_mode"] == "self" and q["filled_at"] == datetime.now(timezone.utc).date().isoformat()
    assert re.fullmatch(r"\d{4}-\d{4}", q["school_year"])
    assert body["parent_perspective"]["section_status"]["who"]["status"] == "in_progress"

    r = parent_client.patch(url(child), json={"questionnaire": {"submit": True}, "wizard_step": 10})
    assert r.status_code == 200, r.text
    body = r.json()
    q = body["questionnaire"]
    assert q["status"] == "submitted" and q["submitted_at"] and q["submitted_by"] == str(parent.id)
    assert body["wizard"]["completed_at"] and body["wizard"]["step"] == 10
    assert body["parent_perspective"]["section_status"]["who"]["status"] == "sufficient"
    rows = versions(db, child, "parent:_questionnaire")
    assert len(rows) == 1 and rows[0].data["status"] == "submitted"
    assert rows[0].data["child_snapshot"]["name"] == "Adam" and rows[0].data["child_snapshot"]["kindergarten"] == "Sunflower KG"
    assert db.scalars(select(AuditLog).where(AuditLog.action == "questionnaire.submit")).one().meta == {"mode": "self"}

    again = parent_client.patch(url(child), json={"questionnaire": {"submit": True}}).json()["questionnaire"]
    assert again["submitted_at"] == q["submitted_at"] and again["resubmitted_at"]


def test_meeting_mode_records_date_and_attendees(teacher_client, parent_client, child, db):
    r = teacher_client.patch(url(child), json={"perspective": "parent", "section": "heart", "data": {"message": "Hello"},
                                               "questionnaire": {"meeting": {"date": "2026-09-14", "attendees": ["mother", "father"]}}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["questionnaire"]["entry_mode"] == "meeting"
    assert body["questionnaire"]["meeting"] == {"date": "2026-09-14", "attendees": ["mother", "father"]}
    stamp = body["parent_perspective"]["entered"]["heart"][-1]
    assert stamp["mode"] == "meeting" and stamp["reported_by"] == "parent" and stamp["role"] == "teacher"
    rows = versions(db, child, "parent:_questionnaire")
    assert len(rows) == 1 and rows[0].via == "meeting"
    # Parents cannot claim staff modes; staff cannot claim the family filled it in.
    assert parent_client.patch(url(child), json={"questionnaire": {"entry_mode": "on_behalf"}}).status_code == 403
    assert parent_client.patch(url(child), json={"questionnaire": {"meeting": {"date": "2026-09-14"}}}).status_code == 403
    assert teacher_client.patch(url(child), json={"questionnaire": {"entry_mode": "self"}}).status_code == 400


def test_staff_on_behalf_uses_the_questionnaire_step(teacher_client, child):
    r = teacher_client.patch(url(child), json={"perspective": "parent", "section": "joy", "data": {"likes_at_home": "Puzzles"},
                                               "wizard_step": 3})
    body = r.json()
    assert body["parent_perspective"]["wizard"]["step"] == 3
    assert body["wizard"]["step"] == 1  # the staff wizard did not move
    assert body["questionnaire"]["entry_mode"] == "on_behalf"


def test_section_status(parent_client, child):
    body = patch(parent_client, child, "behaviour", {"what_works": "Choices"})
    assert body["parent_perspective"]["section_status"]["behaviour"]["status"] == "in_progress"
    r = parent_client.patch(url(child), json={"section": "behaviour", "status": "review_later"})
    assert r.status_code == 200
    assert r.json()["parent_perspective"]["section_status"]["behaviour"]["status"] == "review_later"
    assert r.json()["parent_perspective"]["sections"]["behaviour"] == {"what_works": "Choices"}  # status only


# --------------------------------------------------------------------------- access


def test_parent_access_rules(parent_client, other_parent_client, teacher_client, child):
    patch(parent_client, child, "health", {"sleep": "Wakes up at night", "medical": {"value": "yes", "text": "Inhaler"}})
    own = parent_client.get(url(child)).json()
    assert own["parent_perspective"]["sections"]["health"]["medical"]["text"] == "Inhaler"
    assert "teacher_perspective" not in own
    r = parent_client.patch(url(child), json={"section": "bridge", "data": {"may_be_difficult": "x"}})
    assert r.status_code == 403
    r = parent_client.patch(url(child), json={"perspective": "teacher", "section": "bridge", "data": {}})
    assert r.status_code == 403
    assert other_parent_client.get(url(child)).status_code == 404
    assert other_parent_client.patch(url(child), json={"section": "heart", "data": {"message": "x"}}).status_code == 404
    # Staff read the family's health answers; the questionnaire sections are parent-perspective only.
    staff = teacher_client.get(url(child)).json()
    assert staff["parent_perspective"]["sections"]["health"]["sleep"] == "Wakes up at night"
    r = teacher_client.patch(url(child), json={"perspective": "teacher", "section": "heart", "data": {"message": "x"}})
    assert r.status_code == 400 and r.json()["error"]["details"][0]["path"] == "section"


def test_staff_entry_shows_entered_by_in_provenance(teacher_client, teacher, child):
    patch(teacher_client, child, "who", {"interests_pq": {"selected": ["animals"]}}, perspective="parent",
          questionnaire={"entry_mode": "meeting"})
    staff = teacher_client.get(url(child)).json()
    assert staff["interests"][0]["provenance"] == [{"label": "parent_said", "entered_by": teacher.name, "mode": "meeting"}]
    assert staff["section_status"]["parent"]["who"]["status"] == "in_progress"
    assert staff["questionnaire"]["entry_mode"] == "meeting"


def test_joy_strength_keys_join_the_strengths(parent_client, teacher_client, child):
    patch(parent_client, child, "joy", {"special_ability": {"value": "yes", "text": "Draws animals", "strength_keys": ["drawing"]}})
    staff = teacher_client.get(url(child)).json()
    assert [(i["key"], i["sources"]) for i in staff["strengths"]] == [("drawing", ["parent"])]
