"""WP2-TO: the observation-model registry and the teacher full observation API
(cycles, append-only domain documents, history, close, reassessment, apply, D13 → focus)."""
import json
import re
import uuid
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import select

from app import vocab
from app.config import APP_DIR
from app.models import AuditLog, ChildProfile, FocusArea, RecordVersion, TeacherAssessmentEntry
from app.schemas.assessments import (
    DAY_STAGES,
    DOMAIN_FIELDS,
    DOMAIN_ITEMS,
    DOMAINS,
    ITEM_DOMAINS,
    NEED_FIELDS,
    SENSORY_STIMULI,
    STAGE_FIELDS,
)

REGISTRY_PATH = APP_DIR / "data" / "source" / "observation_model.json"
REGISTRY = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
ITEMS = REGISTRY["items"]
LANGS = ("en", "ar", "he")
ARABIC_RE = re.compile("[؀-ۿ]")
HEBREW_RE = re.compile("[֐-׿]")
NUMERIC_RE = re.compile(r"\d+\s*%|\bscore\b|\bpoints\b", re.IGNORECASE)
AGE_NORM = ("בהתאם לגיל", "מותאם לגיל", "תואם גיל", "age-appropriate", "age appropriate", "for their age",
            "for his age", "for her age", "حسب العمر", "المناسب لعمره", "مناسب لعمره", "مناسبة لعمره")
LEVELS = ("independent", "some_support", "significant_support", "not_observed")
AI_POLICIES = ("never", "label", "domain", "n/a")
SENSITIVITIES = ("none", "third_party", "family", "health", "medical")


def items_of(domain, kind):
    return [i for i in ITEMS if i.get("domain") == domain and i["kind"] == kind]


# --------------------------------------------------------------------------- registry


def test_registry_shape_and_ids():
    raw = REGISTRY_PATH.read_bytes()
    assert b"\r\n" not in raw and not raw.startswith(b"\xef\xbb\xbf")
    assert set(REGISTRY) == {"meta", "sections", "items"}
    ids = [i["id"] for i in ITEMS]
    assert len(ids) == len(set(ids)) == 239
    assert all(re.fullmatch(r"OM-(D\d\d-[0-9A-Za-z]+|LEVEL)", i) for i in ids)
    for expected in ("OM-D00-HDR", "OM-D00-26b", "OM-LEVEL", "OM-D03-R", "OM-D03-E", "OM-D13-01k", "OM-D14-08g",
                     "OM-D14-01h", "OM-D16-07d", "OM-D17-06", "OM-D99-02"):
        assert expected in ids
    section_keys = [s["key"] for s in REGISTRY["sections"]]
    assert len(section_keys) == len(set(section_keys))
    assert [s["order"] for s in REGISTRY["sections"]] == sorted(s["order"] for s in REGISTRY["sections"])
    for domain in DOMAINS:
        assert domain in section_keys
        assert len(items_of(domain, "domain_title")) == 1
    for item in ITEMS:
        assert item["section"] in section_keys, item["id"]
        assert item["ai_policy"] in AI_POLICIES, item["id"]
        assert item["sensitivity"] in SENSITIVITIES, item["id"]
        assert item["storage"] and item["source_he"], item["id"]
        assert isinstance(item["order"], int)
        if item.get("options"):
            assert item["options"] in vocab.lists(), f"{item['id']}: unknown list {item['options']}"
    by_section = {}
    for item in ITEMS:
        by_section.setdefault(item["section"], []).append(item["order"])
    assert all(orders == list(range(1, len(orders) + 1)) for orders in by_section.values())


# Teacher-only rows (OQ-2): their labels are checked without the AI-only referral terms.
TEACHER_ONLY_IDS = {"OM-D16-07d"}


def test_registry_labels_are_kidsphere_wording():
    banned = vocab.banned_terms()
    terms = [t.lower() for group in ("clinical", "child_deficit", "ai_only") for lang in LANGS for t in banned[group][lang]]
    ai_only = {t.lower() for lang in LANGS for t in banned["ai_only"][lang]}
    allow = [p.lower() for lang in LANGS for p in banned["allow_phrases"][lang]]
    problems = []
    entries = [(i["id"], i["label"]) for i in ITEMS] + [(s["id"], s["label"]) for s in REGISTRY["sections"]]
    entries += [(f"meta.{k}", v) for k, v in REGISTRY["meta"].items() if isinstance(v, dict) and set(v) == set(LANGS)]
    for where, label in entries:
        assert set(label) == set(LANGS), where
        for lang in LANGS:
            text = label[lang]
            assert isinstance(text, str) and text.strip() == text and text, (where, lang)
            if lang == "he":
                assert HEBREW_RE.search(text) and not ARABIC_RE.search(text), (where, text)
            elif lang == "ar":
                assert ARABIC_RE.search(text) and not HEBREW_RE.search(text), (where, text)
            else:
                assert not (ARABIC_RE.search(text) or HEBREW_RE.search(text)), (where, text)
            cleaned = text.lower()
            for phrase in allow:
                cleaned = cleaned.replace(phrase, " ")
            hits = [t for t in terms if t in cleaned]
            if where in TEACHER_ONLY_IDS:  # OQ-2: a teacher-only option may name a specialist; AI output never
                hits = [t for t in hits if t not in ai_only]
            if hits:
                problems.append(f"{where} ({lang}): {hits}")
            if NUMERIC_RE.search(text) or any(a in text.lower() for a in AGE_NORM):
                problems.append(f"{where} ({lang}): numeric or age-norm wording {text!r}")
    assert not problems, "\n".join(problems)


def test_registry_matches_the_domain_schemas():
    for domain, keys in DOMAIN_ITEMS.items():
        assert tuple(i["item_key"] for i in items_of(domain, "level_item")) == keys, domain
    assert tuple(i["item_key"] for i in items_of("sensory", "sensory_item")) == SENSORY_STIMULI
    assert tuple(i["item_key"] for i in items_of("daily_routine", "stage")) == DAY_STAGES
    assert tuple(i["field"] for i in items_of("daily_routine", "stage_column")) == STAGE_FIELDS
    for domain, fields in DOMAIN_FIELDS.items():
        assert tuple(i["field"] for i in items_of(domain, "field")) == fields, domain
    assert tuple(i["field"] for i in items_of("priority_needs", "need_field")) == NEED_FIELDS
    assert len(items_of("strengths", "strength_slot")) == 5
    for item in ITEMS:
        if item["kind"] == "level_item":
            assert item["storage"] == f"TA.{item['domain']}.items.{item['item_key']}"
            assert item["options"] == "support_levels" and item["ai_policy"] == "domain"
            expected = "communication" if item["id"] in ("OM-D03-11", "OM-D03-12", "OM-D03-13", "OM-D03-14") else item["domain"]
            assert item["ai_domain"] == expected, item["id"]
        if item["kind"] == "field":
            assert item["storage"] == f"TA.{item['domain']}.fields.{item['field']}"
    assert {i["item_key"] for i in items_of("independence", "level_item")} == set(vocab.keys("independence_areas")) - {
        "tidying_toys", "starting_activity", "finishing_activity"}
    assert all(i.get("scale") == "binary" for i in items_of("independence", "level_item"))
    assert [i["item_key"] for i in ITEMS if i.get("note_first")] == ["curiosity_exploration"]
    assert {i["subgroup"] for i in items_of("language", "level_item")} == {"receptive", "expressive_social"}
    assert all(set(vocab.keys("observation_contexts")) >= {i["item_key"]} for i in items_of("daily_routine", "stage"))
    sensitivities = set(vocab.keys("sensitivities"))
    assert all(i["maps_to"] in sensitivities for i in items_of("sensory", "sensory_item"))


def test_registry_options_and_list_fragment_agree():
    principles = [i for i in ITEMS if i["kind"] == "principle"]
    assert [i["option_key"] for i in principles] == vocab.keys("observation_principles")
    assert len(principles) == 7
    areas = [i for i in ITEMS if i["kind"] == "option" and i["options"] == "need_areas"]
    assert [i["option_key"] for i in areas] == vocab.keys("need_areas")
    assert len(areas) == 11
    for item in areas:
        listed = vocab.item("need_areas", item["option_key"])
        assert listed.get("category") == item.get("maps_to"), item["id"]
        assert listed["label"] == item["label"], item["id"]
    assert vocab.item("need_areas", "behaviour").get("category") is None
    assert vocab.label("need_areas", "behaviour", "he") == "התמודדות במצבים יומיומיים"
    assert vocab.keys("sensory_effects") == ["affects", "sometimes", "no_visible_effect", "not_observed"]
    assert vocab.keys("observation_frequency") == ["once", "sometimes", "often", "most_of_the_time"]
    stage_c = [i["option_key"] for i in ITEMS if i["id"].startswith("OM-D14-08") and i["kind"] == "option"]
    assert stage_c == ["adult_mediation", "reduced_stimulation", "short_instruction", "visual_support", "movement",
                       "positive_reinforcement", "advance_preparation"]
    assert all(vocab.is_valid("what_helps", k) for k in stage_c)
    involvement = [i["option_key"] for i in ITEMS if i["id"].startswith("OM-D16-07") and i["kind"] == "option"]
    assert involvement == ["none", "consultation", "joint_plan", "referral_as_needed"]


def test_source_model_endpoint_serves_the_registry(teacher_client, parent_client):
    for c in (teacher_client, parent_client):
        r = c.get("/api/source-model")
        assert r.status_code == 200
        assert r.json()["observation_model"] == REGISTRY


# --------------------------------------------------------------------------- full documents per domain

FIELD_VALUES = {
    ("emotional", "what_makes_it_harder"): {"text": "Loud transitions", "contexts": ["transition", "yard"]},
    ("emotional", "what_helps_calm"): {"items": [{"key": "hug"}, {"custom": "Humming a song"}], "text": "A quiet corner"},
    ("social", "main_observation"): {"text": "Plays next to others first", "observation_ids": ["<obs>"]},
    ("language", "language_examples"): {"text": "\"Can we build this together?\""},
    ("executive_function", "attention_span"): {
        "by_context": [{"context": "group_time", "approx_minutes": 5, "note": "story"},
                       {"context": "free_play", "approx_minutes": 20}],
        "text": "Longer with blocks"},
    ("play", "preferred_play"): {"items": [{"key": "construction"}, {"custom": "Trains"}], "text": "Builds roads"},
    ("gross_motor", "avoids_physical_activity"): "no",
    ("gross_motor", "avoidance_details"): "Enjoys the yard",
    ("fine_motor", "strengths"): {"items": [{"key": "drawing"}], "text": "Careful lines"},
    ("fine_motor", "support_area_text"): "Cutting along a line",
    ("sensory", "when_too_much_text"): "Covers his ears and moves away",
    ("sensory", "what_helps_regulate"): {"helps": [{"key": "reduced_stimulation"}], "text": "The quiet corner"},
    ("strengths", "prominent_interests"): {"items": [{"key": "animals"}], "text": "Dinosaurs"},
}
EFFECTS = ("affects", "sometimes", "no_visible_effect", "not_observed")
NEED_AREAS = ("emotional", "social", "language", "communication", "attention", "motor", "cognitive", "independence",
              "sensory", "behaviour", "adapting_to_setting")


def _subst(value, obs_id):
    return json.loads(json.dumps(value).replace("<obs>", obs_id))


def full_document(domain: str, obs_id: str, variant: str = "") -> dict:
    """Every item, field and stage of a domain (from the registry) with a value."""
    fields = {i["field"]: _subst(FIELD_VALUES[(domain, i["field"])], obs_id) for i in items_of(domain, "field")}
    if domain in ITEM_DOMAINS:
        items = {}
        for n, item in enumerate(items_of(domain, "level_item")):
            rating = {"level": LEVELS[n % 4], "note": f"note {n}{variant}"}
            if n == 0:
                rating.update(seen_in="free_play", observation_ids=[obs_id])
            items[item["item_key"]] = rating
        doc = {"items": items, "strengths_here": [{"key": "building"}, {"custom": "Kind to friends"}]}
        if fields:
            doc["fields"] = fields
        return doc
    if domain == "independence":
        return {"items": {i["item_key"]: {"level": LEVELS[n % 2], "note": f"n{n}{variant}"}
                          for n, i in enumerate(items_of(domain, "level_item"))}}
    if domain == "sensory":
        return {"items": {i["item_key"]: {"effect": EFFECTS[n % 4], "reaction_text": f"reaction {n}{variant}",
                                          "helps": [{"key": "movement"}, {"custom": "Headphones"}]}
                          for n, i in enumerate(items_of(domain, "sensory_item"))},
                "fields": fields}
    if domain == "daily_routine":
        columns = {c["field"] for c in items_of(domain, "stage_column")}
        stages = {}
        for i in items_of(domain, "stage"):
            stage = {"succeeds": f"Says hello{variant}", "difficult": "Waiting",
                     "support_needed": {"helps": [{"key": "adult_mediation"}], "text": "A hand to hold"},
                     "what_helps": {"helps": [{"key": "visual_support"}], "text": "The picture schedule"},
                     "observation_ids": [obs_id]}
            assert set(stage) - {"observation_ids"} == columns
            stages[i["item_key"]] = stage
        return {"stages": stages}
    if domain == "strengths":
        slots = [{"list": "strengths", "key": "building", "note": f"Tall towers{variant}", "observation_ids": [obs_id]},
                 {"list": "interests", "key": "animals"},
                 {"list": "strengths", "custom": "Kind to younger children"},
                 {"list": "strengths", "key": "music"},
                 {"list": "strengths", "key": "humor"}]
        assert len(slots) == len(items_of(domain, "strength_slot"))
        return {"items": slots, "fields": fields}
    if domain == "priority_needs":
        needs = []
        for area in ("social", "independence", "sensory"):
            need = {"area": area, "seeing": f"Waits at the edge of play{variant}", "how_often": "Most mornings",
                    "situations": {"contexts": ["free_play", "yard"], "text": "With new children"},
                    "what_seems_harder": "Many children at once", "already_tried": "Inviting a friend",
                    "what_helped": {"helps": [{"key": "adult_mediation"}], "text": "Starting with one friend"}}
            assert set(need) - {"area"} == set(NEED_FIELDS)
            needs.append(need)
        return {"needs": needs}
    raise AssertionError(domain)


def covered(domain: str, doc: dict) -> None:
    """Every registry storage path of the domain has a value in the stored document."""
    for item in ITEMS:
        if item.get("domain") != domain:
            continue
        kind = item["kind"]
        if kind in ("level_item", "sensory_item"):
            assert item["item_key"] in doc["items"], item["id"]
        elif kind == "field":
            assert item["field"] in doc["fields"], item["id"]
        elif kind == "stage":
            assert item["item_key"] in doc["stages"], item["id"]
        elif kind == "stage_column":
            assert all(item["field"] in stage for stage in doc["stages"].values()), item["id"]
        elif kind == "strength_slot":
            assert doc["items"][item["slot"] - 1], item["id"]
        elif kind == "need_field":
            assert all(item["field"] in need for need in doc["needs"]), item["id"]


# --------------------------------------------------------------------------- helpers


def cycles_url(child):
    return f"/api/children/{child.id}/teacher-assessments"


def start(c, child, **body):
    r = c.post(cycles_url(child), json=body)
    assert r.status_code == 201, r.text
    return r.json()["assessment"]


def put(c, aid, domain, data, status="in_progress"):
    return c.put(f"/api/teacher-assessments/{aid}/domains/{domain}", json={"status": status, "data": data})


def actions(db):
    db.expire_all()
    return [a for (a,) in db.execute(select(AuditLog.action).order_by(AuditLog.id)).all()]


# --------------------------------------------------------------------------- API


def test_every_item_field_and_stage_round_trips_and_every_save_appends(teacher_client, teacher, child,
                                                                      make_observation, db):
    obs_id = str(make_observation(child, "Built a tower", teacher).id)
    aid = start(teacher_client, child)["id"]
    for domain in DOMAINS:
        doc = full_document(domain, obs_id)
        covered(domain, doc)
        r = put(teacher_client, aid, domain, doc, status="sufficient")
        assert r.status_code == 200, (domain, r.text)
        out = r.json()
        assert out["domain"] == domain and out["status"] == "sufficient" and out["data"] == doc
        assert out["provenance"] == ["teacher_observed"] and out["updated_by_name"] == teacher.name
    current = teacher_client.get(cycles_url(child)).json()["current"]
    assert current["id"] == aid and set(current["domains"]) == set(DOMAINS)
    for domain in DOMAINS:
        got = current["domains"][domain]
        assert got["status"] == "sufficient" and got["data"] == full_document(domain, obs_id), domain
        assert got["updated_by_name"] == teacher.name and got["provenance"] == ["teacher_observed"]

    # Every PUT appends; the history returns all earlier versions, newest first.
    for domain in DOMAINS:
        assert put(teacher_client, aid, domain, full_document(domain, obs_id, " (v2)"), "review_later").status_code == 200
        history = teacher_client.get(f"/api/teacher-assessments/{aid}/domains/{domain}/history")
        assert history.status_code == 200
        entries = history.json()["entries"]
        assert [e["status"] for e in entries] == ["review_later", "sufficient"], domain
        assert entries[0]["data"] == full_document(domain, obs_id, " (v2)")
        assert entries[1]["data"] == full_document(domain, obs_id)
        assert entries[0]["entered_by_name"] == teacher.name and entries[0]["entered_role"] == "teacher"
    db.expire_all()
    assert len(db.scalars(select(TeacherAssessmentEntry).where(TeacherAssessmentEntry.assessment_id == uuid.UUID(aid))).all()) == 26
    got = teacher_client.get(f"/api/teacher-assessments/{aid}").json()["assessment"]
    assert got["domains"]["social"]["status"] == "review_later"
    assert got["domains"]["social"]["data"] == full_document("social", obs_id, " (v2)")


def test_every_need_area_is_accepted(teacher_client, child):
    aid = start(teacher_client, child)["id"]
    for n in range(0, len(NEED_AREAS), 3):
        needs = [{"area": a, "seeing": a} for a in NEED_AREAS[n:n + 3]]
        r = put(teacher_client, aid, "priority_needs", {"needs": needs})
        assert r.status_code == 200, r.text
        assert [x["area"] for x in r.json()["data"]["needs"]] == list(NEED_AREAS[n:n + 3])


def test_unrated_items_are_not_stored_and_status_defaults(teacher_client, child):
    aid = start(teacher_client, child)["id"]
    r = teacher_client.put(f"/api/teacher-assessments/{aid}/domains/social", json={"data": {
        "items": {"initiates_contact": {"level": "independent"}, "waits_for_turn": {}, "accepts_boundaries": {"note": ""},
                  "shows_empathy": {"level": "not_observed"}},
        "fields": {"main_observation": {"text": "  "}}}})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_progress"
    assert r.json()["data"] == {"items": {"initiates_contact": {"level": "independent"},
                                          "shows_empathy": {"level": "not_observed"}}}
    # Curiosity is note-first: a note without a level is fine.
    r = put(teacher_client, aid, "cognitive", {"items": {"curiosity_exploration": {"note": "Asks why about everything"}}})
    assert r.status_code == 200 and r.json()["data"]["items"]["curiosity_exploration"] == {"note": "Asks why about everything"}


@pytest.mark.parametrize("domain,data", [
    ("social", {"items": {"flies_a_kite": {"level": "independent"}}}),
    ("social", {"items": {"initiates_contact": {"level": "brilliant"}}}),
    ("social", {"items": {"initiates_contact": {"level": "independent", "score": 3}}}),
    ("social", {"items": {"initiates_contact": {"note": "x" * 501}}}),
    ("social", {"items": {"initiates_contact": {"seen_in": "party"}}}),
    ("social", {"fields": {"what_helps_calm": {"text": "x"}}}),
    ("social", {"strengths_here": ["flying"]}),
    ("emotional", {"fields": {"what_helps_calm": {"items": ["magic_words"]}}}),
    ("emotional", {"fields": {"what_makes_it_harder": {"contexts": ["moon"]}}}),
    ("executive_function", {"fields": {"attention_span": {"by_context": [{"context": "yard", "approx_minutes": 91}]}}}),
    ("executive_function", {"fields": {"attention_span": {"by_context": [{"approx_minutes": 5}]}}}),
    ("gross_motor", {"fields": {"avoids_physical_activity": "maybe"}}),
    ("independence", {"items": {"eating": {"level": "independent", "note": "x" * 301}}}),
    ("independence", {"items": {"tidying_toys": {"level": "independent"}}}),
    ("sensory", {"items": {"noise": {"level": "significant_support"}}}),
    ("sensory", {"items": {"noise": {"effect": "strong"}}}),
    ("sensory", {"items": {"thunder": {"effect": "affects"}}}),
    ("daily_routine", {"stages": {"nap_time": {"succeeds": "x"}}}),
    ("daily_routine", {"stages": {"arrival": {"support_needed": {"helps": ["magic"]}}}}),
    ("strengths", {"items": [{"list": "strengths", "key": "flying"}]}),
    ("strengths", {"items": [{"list": "strengths", "key": "music", "custom": "Sings"}]}),
    ("strengths", {"items": [{"list": "weaknesses", "key": "music"}]}),
    ("strengths", {"items": [{"key": k} for k in ("music", "humor", "empathy", "memory", "building", "drawing")]}),
    ("priority_needs", {"needs": [{"area": a} for a in ("social", "emotional", "language", "motor")]}),
    ("priority_needs", {"needs": [{"area": "social"}, {"area": "social"}]}),
    ("priority_needs", {"needs": [{"area": "adhd"}]}),
    ("priority_needs", {"needs": [{"seeing": "no area"}]}),
    ("priority_needs", {"needs": [{"area": "social", "how_often": "x" * 301}]}),
])
def test_domain_validation(teacher_client, child, domain, data, db):
    aid = start(teacher_client, child)["id"]
    r = put(teacher_client, aid, domain, data)
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "VALIDATION"
    assert all(d["path"].startswith("data") for d in r.json()["error"]["details"])
    db.expire_all()
    assert db.scalars(select(TeacherAssessmentEntry)).all() == []


def test_bad_status_domain_and_links(teacher_client, child, other_child, make_observation, make_focus_area, teacher):
    aid = start(teacher_client, child)["id"]
    assert teacher_client.put(f"/api/teacher-assessments/{aid}/domains/social",
                              json={"status": "done", "data": {}}).status_code == 400
    assert teacher_client.put(f"/api/teacher-assessments/{aid}/domains/communication",
                              json={"data": {}}).status_code == 400
    foreign = str(make_observation(other_child, "Elsewhere", teacher).id)
    r = put(teacher_client, aid, "social", {"fields": {"main_observation": {"observation_ids": [foreign]}}})
    assert r.status_code == 400
    focus = make_focus_area(other_child)
    r = put(teacher_client, aid, "priority_needs", {"needs": [{"area": "social", "focus_area_id": str(focus.id)}]})
    assert r.status_code == 400


def test_warnings_never_block(teacher_client, child):
    aid = start(teacher_client, child)["id"]
    r = put(teacher_client, aid, "social", {"items": {"initiates_contact": {"level": "some_support",
                                                                           "note": "Maybe a diagnosis is needed"}}})
    assert r.status_code == 200
    warnings = r.json()["warnings"]
    assert [w["code"] for w in warnings] == ["wording"]
    assert warnings[0]["path"] == "items.initiates_contact.note"
    r = put(teacher_client, aid, "strengths", {"items": [{"key": "music"}, {"key": "humor"}]}, status="sufficient")
    assert r.status_code == 200
    assert [w["code"] for w in r.json()["warnings"]] == ["strengths_below_3"]
    r = put(teacher_client, aid, "strengths", {"items": [{"key": "music"}, {"key": "humor"}, {"list": "interests", "key": "animals"}]})
    assert r.json()["warnings"] == []


def test_cycle_header_snapshot_and_one_open_cycle(teacher_client, admin_client, teacher, admin, parent, child,
                                                 make_class, db):
    cycle = start(teacher_client, child, filled_on="2025-10-06", period_from="2025-09-01", period_to="2025-10-06",
                  period_note="First month", filled_by_text="Rana and the assistant")
    assert cycle["kind"] == "initial" and cycle["number"] == 1 and cycle["status"] == "open"
    assert cycle["previous_id"] is None and cycle["domains"] == {} and cycle["need_focus_areas"] == []
    assert (cycle["filled_on"], cycle["period_from"], cycle["period_to"]) == ("2025-10-06", "2025-09-01", "2025-10-06")
    assert cycle["teacher_id"] == str(teacher.id) and cycle["teacher_name"] == teacher.name
    assert cycle["filled_by_text"] == "Rana and the assistant" and cycle["period_note"] == "First month"
    snap = cycle["child_snapshot"]
    assert snap["name"] == "Adam" and snap["birth_date"] == "2022-08-05"
    assert snap["age_at_fill"] == {"years": 3, "months": 2}
    assert (snap["class_name"], snap["kindergarten"], snap["teacher_name"]) == ("Class A", "Sunflower KG", teacher.name)

    r = teacher_client.post(cycles_url(child), json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ASSESSMENT_OPEN"

    listed = teacher_client.get(cycles_url(child)).json()
    assert listed["current"]["id"] == cycle["id"] and listed["earlier"] == []

    patch = f"/api/teacher-assessments/{cycle['id']}"
    assert teacher_client.patch(patch, json={"period_from": "2026-11-01"}).status_code == 400
    assert teacher_client.patch(patch, json={"teacher_id": str(parent.id)}).status_code == 400
    assert teacher_client.patch(patch, json={"filled_on": "2030-01-01"}).status_code == 400
    assert teacher_client.patch(patch, json={"unknown": 1}).status_code == 400
    # The child moved to another class: the snapshot follows while the cycle is open.
    new_class = make_class("Class C", kindergarten="Olive KG", teachers=[teacher])
    child.class_id = new_class.id
    db.commit()
    r = admin_client.patch(patch, json={"teacher_id": str(admin.id), "period_note": "Two months"})
    assert r.status_code == 200, r.text
    out = r.json()["assessment"]
    assert out["teacher_name"] == admin.name and out["period_note"] == "Two months"
    assert (out["child_snapshot"]["kindergarten"], out["child_snapshot"]["teacher_name"]) == ("Olive KG", admin.name)
    assert teacher_client.post(cycles_url(child), json={"kind": "initial"}).status_code == 409


def test_closed_cycle_is_read_only_and_reassessment_copies_forward(teacher_client, child, db):
    first = start(teacher_client, child)
    aid = first["id"]
    social = {"items": {"initiates_contact": {"level": "some_support", "note": "With a friend"}}}
    strengths = {"items": [{"list": "strengths", "key": "music"}]}
    assert put(teacher_client, aid, "social", social, "sufficient").status_code == 200
    assert put(teacher_client, aid, "strengths", strengths, "review_later").status_code == 200
    r = teacher_client.post(f"/api/teacher-assessments/{aid}/close")
    assert r.status_code == 200 and r.json()["assessment"]["status"] == "closed"
    assert r.json()["assessment"]["closed_at"]

    for resp in (
        teacher_client.patch(f"/api/teacher-assessments/{aid}", json={"period_note": "late"}),
        put(teacher_client, aid, "social", social),
        teacher_client.post(f"/api/teacher-assessments/{aid}/close"),
    ):
        assert resp.status_code == 409 and resp.json()["error"]["code"] == "ASSESSMENT_CLOSED"
    # Still readable, with its history.
    assert teacher_client.get(f"/api/teacher-assessments/{aid}").json()["assessment"]["domains"]["social"]["data"] == social
    assert len(teacher_client.get(f"/api/teacher-assessments/{aid}/domains/social/history").json()["entries"]) == 1

    assert teacher_client.post(cycles_url(child), json={"kind": "initial"}).status_code == 409
    second = start(teacher_client, child, copy_forward=True)
    assert second["kind"] == "reassessment" and second["number"] == 2 and second["previous_id"] == aid
    carried = second["domains"]
    assert set(carried) == {"social", "strengths"}
    for domain, doc in (("social", social), ("strengths", strengths)):
        assert carried[domain]["status"] == "in_progress"
        data = dict(carried[domain]["data"])
        tag = data.pop("carried_from")
        assert data == doc
        assert tag["assessment_id"] == aid and tag["entry_id"] == first_entry(db, aid, domain)
        assert tag["filled_on"] == first["filled_on"]
    # A carried document can be saved back as is (the tag is part of the shape).
    assert put(teacher_client, second["id"], "social", carried["social"]["data"]).status_code == 200

    listed = teacher_client.get(cycles_url(child)).json()
    assert listed["current"]["id"] == second["id"]
    assert [(e["id"], e["kind"], e["number"], e["status"]) for e in listed["earlier"]] == [(aid, "initial", 1, "closed")]
    assert teacher_client.get(f"/api/teacher-assessments/{aid}").json()["assessment"]["domains"]["social"]["data"] == social

    plain_close = teacher_client.post(f"/api/teacher-assessments/{second['id']}/close")
    assert plain_close.status_code == 200
    third = start(teacher_client, child)
    assert third["kind"] == "reassessment" and third["domains"] == {} and third["previous_id"] == second["id"]
    assert actions(db).count("assessment.create") == 3


def first_entry(db, aid, domain):
    db.expire_all()
    row = db.scalars(select(TeacherAssessmentEntry).where(TeacherAssessmentEntry.assessment_id == uuid.UUID(aid),
                                                          TeacherAssessmentEntry.domain == domain)
                     .order_by(TeacherAssessmentEntry.entered_at)).first()
    return str(row.id)


def test_need_becomes_a_current_focus(teacher_client, teacher, child, make_focus_area, db):
    aid = start(teacher_client, child)["id"]
    needs = {"needs": [
        {"area": "social", "seeing": "Waits at the edge of play", "how_often": "Most mornings"},
        {"area": "behaviour", "seeing": "Pushes when the line is long"},
        {"area": "sensory"},
    ]}
    assert put(teacher_client, aid, "priority_needs", needs).status_code == 200
    focus_url = f"/api/teacher-assessments/{aid}/needs/{{}}/focus"

    r = teacher_client.post(focus_url.format(0), json={})
    assert r.status_code == 201, r.text
    focus = r.json()["focus_area"]
    assert focus["title"] == "Social" and focus["category"] == "social" and focus["status"] == "active"
    assert focus["plan"] == {"need": "Waits at the edge of play"}
    db.expire_all()
    row = db.get(FocusArea, uuid.UUID(focus["id"]))
    assert row.assessment_id == uuid.UUID(aid)
    assert row.source_need == {"assessment_id": aid, "index": 0, "area": "social"}
    versions = db.scalars(select(RecordVersion).where(RecordVersion.entity_id == row.id)).all()
    assert [(v.seq, v.via, v.changed_by) for v in versions] == [(1, "assessment", teacher.id)]
    assert versions[0].data["source_need"] == row.source_need and versions[0].data["plan"] == row.plan

    again = teacher_client.post(focus_url.format(0), json={})
    assert again.status_code == 409 and again.json()["error"]["code"] == "DUPLICATE"
    behaviour = teacher_client.post(focus_url.format(1), json={})
    assert behaviour.status_code == 400 and behaviour.json()["error"]["details"][0]["path"] == "title"
    named = teacher_client.post(focus_url.format(1), json={"title": "Waiting in line calmly"})
    assert named.status_code == 201
    assert named.json()["focus_area"]["category"] == "other" and named.json()["focus_area"]["title"] == "Waiting in line calmly"
    assert teacher_client.post(focus_url.format(3), json={}).status_code == 404
    assert teacher_client.post(focus_url.format(0), json={"category": "space"}).status_code == 400

    cycle = teacher_client.get(f"/api/teacher-assessments/{aid}").json()["assessment"]
    assert [(n["index"], n["area"], n["status"]) for n in cycle["need_focus_areas"]] == [(0, "social", "active"),
                                                                                        (1, "behaviour", "active")]
    make_focus_area(child, title="Third goal")
    limit = teacher_client.post(focus_url.format(2), json={"title": "Noisy rooms"})
    assert limit.status_code == 409 and limit.json()["error"]["code"] == "FOCUS_LIMIT"
    db.expire_all()
    assert len(db.scalars(select(FocusArea).where(FocusArea.child_id == child.id)).all()) == 3
    assert actions(db).count("assessment.need_focus") == 2


def test_need_focus_respects_the_limit_with_three_active(teacher_client, child, make_focus_area):
    aid = start(teacher_client, child)["id"]
    assert put(teacher_client, aid, "priority_needs", {"needs": [{"area": "language", "seeing": "Short sentences"}]}).status_code == 200
    for n in range(3):
        make_focus_area(child, title=f"Goal {n}")
    r = teacher_client.post(f"/api/teacher-assessments/{aid}/needs/0/focus", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "FOCUS_LIMIT"


def test_apply_merges_into_profile_lists_and_recompute_keeps_them(teacher_client, teacher, child, db):
    from app.services.profiles import recompute_lists

    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.strengths = [{"key": "building", "sources": ["teacher"], "added_by": None, "added_at": None}]
    db.commit()
    aid = start(teacher_client, child)["id"]
    r = teacher_client.post(f"/api/teacher-assessments/{aid}/apply", json={
        "list": "strengths", "domain": "strengths", "items": ["building", {"custom": "Kind to younger children"}]})
    assert r.status_code == 200, r.text
    assert r.json()["added"] == 1
    r = teacher_client.post(f"/api/teacher-assessments/{aid}/apply", json={
        "list": "what_helps", "domain": "emotional",
        "items": [{"key": "hug", "list": "calming_helps"}, "visual_support"]})
    assert r.status_code == 200, r.text
    r = teacher_client.post(f"/api/teacher-assessments/{aid}/apply", json={
        "list": "interests", "domain": "play", "items": [{"key": "construction"}]})
    assert r.status_code == 200

    via = {"assessment_id": aid}
    db.expire_all()
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    building, kind = profile.strengths
    assert building["key"] == "building" and building["sources"] == ["teacher", "observation"]
    assert building["via"] == {**via, "domain": "strengths"}
    assert kind["custom"] == "Kind to younger children" and kind["sources"] == ["observation"]
    assert kind["added_by"] == str(teacher.id)
    assert [(i["key"], i["list"], i["sources"]) for i in profile.what_helps] == [
        ("hug", "calming_helps", ["observation"]), ("visual_support", "what_helps", ["observation"])]
    assert profile.interests[0]["key"] == "construction" and profile.interests[0]["via"]["domain"] == "play"

    # Recomputing the lists from the perspectives keeps every teacher-observed item.
    recompute_lists(profile, None, datetime.now(timezone.utc))
    db.commit()
    db.expire_all()
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    assert [(i.get("key") or i.get("custom"), i["sources"]) for i in profile.strengths] == [
        ("building", ["observation"]), ("Kind to younger children", ["observation"])]
    assert profile.strengths[0]["via"]["assessment_id"] == aid
    assert len(profile.what_helps) == 2 and len(profile.interests) == 1

    for body in ({"list": "strengths", "domain": "strengths", "items": ["flying"]},
                 {"list": "strengths", "domain": "strengths", "items": []},
                 {"list": "strengths", "domain": "strengths", "items": [{"key": "music", "list": "interests"}]},
                 {"list": "what_helps", "domain": "sensory", "items": [{"key": "hug", "list": "strengths"}]},
                 {"list": "sensitivities", "domain": "sensory", "items": ["noise"]},
                 {"list": "interests", "domain": "space", "items": ["animals"]}):
        assert teacher_client.post(f"/api/teacher-assessments/{aid}/apply", json=body).status_code == 400, body
    assert actions(db).count("assessment.apply") == 3


def test_staff_only_and_scope(teacher_client, parent_client, other_teacher_client, other_parent_client, admin_client,
                              client, child, db):
    aid = start(teacher_client, child)["id"]
    assert put(teacher_client, aid, "priority_needs", {"needs": [{"area": "social"}]}).status_code == 200
    calls = [
        ("get", cycles_url(child), None),
        ("post", cycles_url(child), {}),
        ("get", f"/api/teacher-assessments/{aid}", None),
        ("patch", f"/api/teacher-assessments/{aid}", {"period_note": "x"}),
        ("put", f"/api/teacher-assessments/{aid}/domains/social", {"data": {}}),
        ("get", f"/api/teacher-assessments/{aid}/domains/social/history", None),
        ("post", f"/api/teacher-assessments/{aid}/close", None),
        ("post", f"/api/teacher-assessments/{aid}/apply", {"list": "strengths", "domain": "strengths", "items": ["music"]}),
        ("post", f"/api/teacher-assessments/{aid}/needs/0/focus", {}),
    ]
    for c in (parent_client, other_teacher_client, other_parent_client):
        for method, path, body in calls:
            r = getattr(c, method)(path, **({"json": body} if body is not None else {}))
            assert r.status_code == 404, (method, path, r.status_code)
    for method, path, body in calls:
        r = getattr(client, method)(path, **({"json": body} if body is not None else {}))
        assert r.status_code == 401, (method, path)
    assert teacher_client.get(f"/api/teacher-assessments/{uuid.uuid4()}").status_code == 404
    assert teacher_client.get("/api/teacher-assessments/not-a-uuid").status_code == 404
    assert admin_client.get(f"/api/teacher-assessments/{aid}").status_code == 200
    db.expire_all()
    assert len(db.scalars(select(TeacherAssessmentEntry)).all()) == 1


def test_audit_holds_ids_and_keys_only(teacher_client, child, db):
    aid = start(teacher_client, child, period_note="Secret note about the family")["id"]
    put(teacher_client, aid, "emotional", {"items": {"feels_secure": {"level": "independent", "note": "Private words"}}})
    teacher_client.patch(f"/api/teacher-assessments/{aid}", json={"period_note": "Another private note"})
    teacher_client.post(f"/api/teacher-assessments/{aid}/close")
    db.expire_all()
    rows = db.execute(select(AuditLog.action, AuditLog.meta).order_by(AuditLog.id)).all()
    assert [a for a, _ in rows] == ["assessment.create", "assessment.domain_update", "assessment.update", "assessment.close"]
    assert rows[1][1]["domain"] == "emotional" and rows[1][1]["status"] == "in_progress"
    assert rows[2][1] == {"fields": ["period_note"]}
    assert all("ecret" not in str(m) and "rivate" not in str(m) for _, m in rows)


def test_age_on():
    from app.services.assessments import age_on

    assert age_on(date(2022, 8, 5), date(2026, 10, 6)) == {"years": 4, "months": 2}
    assert age_on(date(2022, 8, 5), date(2026, 8, 4)) == {"years": 3, "months": 11}
    assert age_on(date(2022, 8, 5), date(2022, 8, 1)) == {"years": 0, "months": 0}
