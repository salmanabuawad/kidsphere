"""What may never reach an AI payload (COVERAGE-MATRIX §7, X-26..X-31; WP2-AI acceptance).

For every registry item with ``ai_policy`` 'never' (backend/app/data/source/*.json), plus a
built-in list of the matrix's never-fields (so the policy is guarded even while a registry is
missing), a unique marker is written straight into that field of one child's data. Content
generation and both analysis calls (understanding, functional summary) then run with a spy
provider. No marker may appear in ``generated_content.generation_input``,
``ai_suggestions.input`` or any captured provider request.

Also: no surname, parent name, classmate name, phone or e-mail in any payload; analysis payloads
use ``[child]`` and never the first or preferred name, and the displayed output has the name back;
referral wording from the provider is rejected (template fallback); stored suggestions are listed
for staff only and resolve once.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app import vocab
from app.ai import claude_provider
from app.ai.context import build_context
from app.ai.prompts import FUNCTIONAL_SUMMARY_SYSTEM_PROMPT, UNDERSTANDING_SYSTEM_PROMPT
from app.ai.service import draft_functional_summary, resolve_suggestion, suggest_understanding
from app.config import settings
from app.models import (
    AiSuggestion,
    ChildProfile,
    Class,
    DevelopmentReview,
    FocusArea,
    FunctionalSummary,
    GeneratedContent,
    Observation,
)

# The matrix's never-fields (COVERAGE-MATRIX §2): parent free text and family/health answers, the
# teacher's private notes and texts, observation free texts, plan.who, follow-up and summary texts,
# identity fields. Item notes are not registry rows of their own, so they are listed here.
BUILTIN_NEVER = [
    "PP.who.appreciate", "PP.who.describe_words", "PP.who.what_attracts", "PP.who.parents",
    "PP.joy.happy_safe_successful", "PP.joy.likes_at_home", "PP.emotions.when_sad_text",
    "PP.emotions.calming_notes", "PP.emotions.new_situations", "PP.emotions.overwhelm_teacher_should_know",
    "PP.separation.transition_object", "PP.social.conflict_reaction", "PP.social.significant_friends",
    "PP.social.what_helps_socially", "PP.communication.teacher_should_know", "PP.communication.home_language",
    "PP.independence.still_helping", "PP.independence.routines_to_keep", "PP.health.sleep", "PP.health.food",
    "PP.health.sensory", "PP.health.medical", "PP.behaviour.boundaries_at_home", "PP.behaviour.what_works",
    "PP.behaviour.what_does_not_work", "PP.behaviour.helps_cooperation", "PP.expectations.most_important",
    "PP.expectations.develop.emotional.text", "PP.partnership.communication_matters",
    "PP.partnership.family_context", "PP.heart.message",
    "QB.remember", "QB.may_be_difficult", "QB.question_for_parent",
    "TA.emotional.items.calms_after_frustration.note", "TA.emotional.fields.what_makes_it_harder",
    "TA.social.fields.main_observation", "TA.language.fields.language_examples",
    "TA.gross_motor.fields.avoidance_details", "TA.fine_motor.fields.support_area_text",
    "TA.independence.items.toilet.note", "TA.sensory.items.noise.reaction_text", "TA.sensory.fields.when_too_much_text",
    "TA.daily_routine.stages.<stage>.succeeds", "TA.daily_routine.stages.<stage>.difficult",
    "TA.priority_needs.needs[].seeing", "TA.priority_needs.needs[].already_tried",
    "TAH.period_note", "TAH.filled_by_text", "TAH.child_snapshot.name",
    "OBS.note", "OBS.details.when_detail.with_whom", "OBS.details.when_detail.before_event",
    "OBS.details.when_detail.after_event", "OBS.details.what_changed", "OBS.details.documentation",
    "OBS.details.what_we_did", "OBS.details.needs.text",
    "FA.plan.who", "DR.follow_up.involvement.note", "DR.follow_up.improvement.note",
    "FS.main_needs", "FS.follow_up_with_parents", "CH.parent_contact", "CL.kindergarten",
]
# The first or preferred name is allowed in content generation (OQ-4); checked separately below.
NAME_STORAGE = {"CH.name", "CH.preferred_name"}
STAGE = "arrival"

FIRST, SURNAME, PREFERRED = "Adam", "Haddad", "Adi"
PARENT, CLASSMATE = "Rana Haddad", "Omar Saleh"
SECOND_PARENT = "Yusuf Khalil"  # named only in the questionnaire (PP.who.parents), no account
PHONE, EMAIL = "050-7654321", "rana.h@example.com"


# --------------------------------------------------------------------------- markers


def _marker(ident: str) -> str:
    return "ZQX" + re.sub(r"[^A-Za-z0-9]", "", ident).upper() + "QZ"


def never_items() -> list[tuple[str, str]]:
    """(id, storage) of every never-item: registries first, then the built-in list."""
    out = []
    for name, registry in vocab.source_model().items():
        for item in (registry or {}).get("items") or []:
            policy = str(item.get("ai_policy") or "").strip().split(" ")[0].lower()
            storage = item.get("storage")
            if policy == "never" and isinstance(storage, str):
                out.append((str(item.get("id") or storage), storage))
    out += [(f"B{i:02d}", s) for i, s in enumerate(BUILTIN_NEVER, start=1)]
    return out


def _parts(storage: str) -> list[str]:
    token = storage.split()[0] if storage.split() else ""
    token = re.sub(r"\{[^}]*\}|\([^)]*\)", "", token).strip(".,;")
    token = token.replace("<stage>", STAGE).replace("<s>", STAGE).replace("<stimulus>", "noise")
    return [p for p in token.split(".") if p]


def _put(root: dict, keys: list[str], marker: str) -> bool:
    """Write ``marker`` at ``keys`` (creating dicts/lists); a dict already there gets a marker key."""
    if not keys:
        return False
    node = root
    for i, key in enumerate(keys):
        last = i == len(keys) - 1
        m = re.fullmatch(r"(\w+)\[(\d*)\]", key)
        if m:
            items = node.get(m.group(1))
            if not isinstance(items, list):
                items = node[m.group(1)] = []
            index = int(m.group(2) or 0)
            while len(items) <= index:
                items.append({})
            if last:
                items[index] = marker
                return True
            if not isinstance(items[index], dict):
                items[index] = {}
            node = items[index]
            continue
        if last:
            if isinstance(node.get(key), dict):
                node[key]["zz_" + marker] = marker
            else:
                node[key] = marker
            return True
        if not isinstance(node.get(key), dict):
            node[key] = {}
        node = node[key]
    return False


TEXT_COLUMNS = {
    "TAH": {"period_note", "filled_by_text"},
    "OBS": {"note"},
    "FS": {"general_description", "adaptations", "follow_up_with_parents", "team_recommendations"},
    "CH": {"parent_contact", "parent_name"},
    "CL": {"kindergarten"},
    "DR": {"summary"},
}
JSON_COLUMNS = {"TAH": {"child_snapshot"}, "OBS": {"details", "attributes"}, "FA": {"plan"}, "DR": {"follow_up"},
                "FS": {"main_needs", "main_strengths"}}


def write_markers(rows: dict) -> list[tuple[str, str, str]]:
    """Write a marker into every never-field it can resolve; returns (id, storage, marker) written."""
    docs = {
        "PP": rows["profile_parent"], "TP": rows["profile_teacher"], "TA": rows["cache"],
        "TAH": rows["tah_json"], "OBS": rows["obs_json"], "FA": rows["fa_json"], "DR": rows["dr_json"],
        "FS": rows["fs_json"],
    }
    written = []
    items = sorted(never_items(), key=lambda it: -len(_parts(it[1])))
    for ident, storage in items:
        if storage.split(" ")[0] in NAME_STORAGE:
            continue
        parts = _parts(storage)
        if len(parts) < 2 and parts[:1] != ["PQM"]:
            continue
        prefix, rest = parts[0], parts[1:]
        marker = _marker(ident)
        ok = False
        if prefix == "PP" and rest:
            ok = _put(docs["PP"], ["sections", *rest], marker)
        elif prefix == "TP" and rest:
            ok = _put(docs["TP"], ["sections", *rest], marker)
        elif prefix == "QB" and rest:
            ok = _put(docs["TP"], ["sections", "bridge", *rest], marker)
        elif prefix == "PQM":
            ok = _put(docs["PP"], ["questionnaire", *(rest or ["zz"])], marker)
        elif prefix == "TA" and len(rest) >= 2:
            ok = _put(docs["TA"], [rest[0], "data", *rest[1:]], marker)
        elif prefix in TEXT_COLUMNS and len(rest) == 1 and rest[0] in TEXT_COLUMNS[prefix]:
            rows["columns"].setdefault(prefix, {})[rest[0]] = marker
            ok = True
        elif prefix in JSON_COLUMNS and rest[0] in JSON_COLUMNS[prefix]:
            ok = _put(docs[prefix], rest, marker)
        if ok:
            written.append((ident, storage, marker))
    return written


# --------------------------------------------------------------------------- the spy provider


def _understanding_answer():
    return {
        "summary": "[child] appears to enjoy building with [friend].",
        "strengths": [{"key": "building", "label": "Building"}], "interests": [], "what_helps": [],
        "areas_for_support": ["Joining shared play"], "adaptations": "Start with one friend.",
        "next_steps": "Invite one friend to build.", "baseline_validation": [], "focus_review": [],
        "possible_patterns": ["[child] may find it easier to join after a short preparation."],
        "next_observation_questions": [{"domain": "social", "question": "When does [child] join play most easily?"}],
    }


def _summary_answer():
    return {
        "general_description": "[child] takes part in building and joins one friend at a time.",
        "main_strengths": {"items": [{"key": "building", "label": "Building"}], "text": None},
        "main_needs": {"items": ["Joining a group"], "text": None},
        "adaptations": "A short preparation before free play.",
        "team_recommendations": "Use the same short phrase across the team.",
        "possible_patterns": [], "next_observation_questions": [],
    }


class SpyClaude:
    """Records every request; answers analysis calls with the given outputs and content calls with
    something invalid (the template is used, the request is still captured)."""

    def __init__(self, understanding=None, summary=None):
        self.understanding = understanding or _understanding_answer()
        self.summary = summary or _summary_answer()
        self.calls: list[dict] = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        system = kwargs.get("system")
        if system == UNDERSTANDING_SYSTEM_PROMPT:
            text = json.dumps(self.understanding, ensure_ascii=False)
        elif system == FUNCTIONAL_SUMMARY_SYSTEM_PROMPT:
            text = json.dumps(self.summary, ensure_ascii=False)
        else:
            text = "not json"
        return SimpleNamespace(stop_reason="end_turn", model=kwargs.get("model"),
                               content=[SimpleNamespace(type="text", text=text)],
                               usage=SimpleNamespace(input_tokens=1, output_tokens=1))

    def dumps(self, system_too: bool = False) -> list[str]:
        """Each request as the raw prompt text the provider received (no JSON escaping)."""
        out = []
        for call in self.calls:
            parts = []
            for message in call.get("messages") or []:
                content = message.get("content")
                parts.append(content if isinstance(content, str)
                             else json.dumps(content, ensure_ascii=False, default=str))
            out.append("\n".join(parts) + ((call.get("system") or "") if system_too else ""))
        return out


@pytest.fixture
def spy(monkeypatch):
    fake = SpyClaude()
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(claude_provider, "make_client", lambda: fake)
    return fake


# --------------------------------------------------------------------------- the child


def _cache() -> dict:
    return {
        "emotional": {"status": "in_progress", "data": {"items": {
            "calms_after_frustration": {"level": "some_support"}}, "fields": {
            "what_helps_calm": {"items": [{"key": "quiet_corner"}, {"key": "adult_reassurance"}]}}}},
        "social": {"status": "in_progress", "data": {"items": {"initiates_contact": {"level": "independent"},
                                                               "joins_group_play": {"level": "some_support"}}}},
        "independence": {"status": "in_progress", "data": {"items": {"dressing": {"level": "some_support"},
                                                                     "toilet": {"level": "independent"}}}},
        "sensory": {"status": "in_progress", "data": {"items": {"noise": {"effect": "affects"}}}},
        "daily_routine": {"status": "in_progress", "data": {"stages": {STAGE: {
            "support_needed": {"helps": ["advance_preparation"]}, "what_helps": {"helps": ["visual_support"]}}}}},
        "priority_needs": {"status": "in_progress", "data": {"needs": [{
            "area": "social", "what_helped": {"helps": ["adult_mediation"]}}]}},
    }


@pytest.fixture
def marked(db, make_child, klass, teacher, parent, make_assessment):
    """Adam Haddad ("Adi"), a classmate, and a marker in every never-field."""
    child = make_child(klass, parents=[parent], name=f"{FIRST} {SURNAME}", preferred_name=PREFERRED,
                       parent_name=PARENT, gender="boy", main_language="en")
    make_child(klass, name=CLASSMATE)
    profile = db.scalar(select(ChildProfile).where(ChildProfile.child_id == child.id))
    focus = FocusArea(child_id=child.id, category="social", suggestion_key="joining_group_play",
                      title="Joining group play", description="Starts next to Omar at the block corner", status="active",
                      plan={"what_we_will_do": "Build the garage together", "frequency": "Twice a week"},
                      created_by=teacher.id)
    db.add(focus)
    db.flush()
    rows = {
        "profile_parent": dict(profile.parent_perspective or {}), "profile_teacher": dict(profile.teacher_perspective or {}),
        "cache": _cache(), "tah_json": {"child_snapshot": {"name": f"{FIRST} {SURNAME}"}},
        "obs_json": {"details": {"what_i_see": "x", "needs": {"helps": ["visual_support"]}},
                     "attributes": {"frequency": "often", "duration_minutes": 5}},
        "fa_json": {"plan": dict(focus.plan)}, "dr_json": {"follow_up": {}}, "fs_json": {"main_needs": {"items": []}},
        "columns": {},
    }
    written = write_markers(rows)
    # Two parents named in the questionnaire; the second has no account (PQ-INTRO-02: masked as [adult]).
    who = rows["profile_parent"].setdefault("sections", {}).setdefault("who", {})
    named = [p for p in who.get("parents") or [] if isinstance(p, dict)] if isinstance(who.get("parents"), list) else []
    who["parents"] = [*named, {"name": PARENT}, {"name": SECOND_PARENT}]

    profile.parent_perspective = rows["profile_parent"]
    profile.teacher_perspective = rows["profile_teacher"]
    profile.strengths = [{"key": "building", "sources": ["teacher"]}, {"key": "imagination", "sources": ["parent"]}]
    profile.interests = [{"key": "cars_transportation", "sources": ["parent"]}]
    profile.what_helps = [{"key": "adult_mediation", "list": "what_helps", "sources": ["teacher"]}]
    # Parent-reported sensitivities, including a health one: never "avoid".
    profile.sensitivities = [{"key": "certain_foods", "sources": ["parent"]}, {"key": "touch", "sources": ["parent"]}]
    profile.current_understanding = {"summary": "Adam Haddad enjoys building with Omar.", "adaptations": "One friend first."}
    cols = rows["columns"]
    child.parent_contact = cols.get("CH", {}).get("parent_contact") or f"{PHONE} {EMAIL}"
    if "CL" in cols:
        db.get(Class, klass.id).kindergarten = cols["CL"]["kindergarten"]
    focus.plan = {**rows["fa_json"]["plan"]}
    tah = cols.get("TAH", {})
    make_assessment(child, created_by=teacher, domains=rows["cache"], child_snapshot=rows["tah_json"]["child_snapshot"],
                    period_note=tah.get("period_note"), filled_by_text=tah.get("filled_by_text"))
    now = datetime.now(timezone.utc)
    db.add_all([
        Observation(child_id=child.id, focus_area_id=focus.id, observed_at=now - timedelta(days=1),
                    observation=f"Adi asked Omar to build a road; mum called from {PHONE} ({EMAIL}).",
                    note=cols.get("OBS", {}).get("note"), details=rows["obs_json"]["details"],
                    attributes=rows["obs_json"]["attributes"], context="free_play", support_level="some_support",
                    domains=["social", "independence", "emotional"], created_by=teacher.id),
        Observation(child_id=child.id, observed_at=now - timedelta(hours=2), observation="Adam Haddad put on his coat.",
                    domains=["independence"], context="arrival", created_by=teacher.id),
        Observation(child_id=child.id, focus_area_id=focus.id, observed_at=now - timedelta(hours=3),
                    observation="Yusuf brought Adam late; Adam joined the block corner after a while.",
                    details={"did_it_change": "partly", "plan_ref": {"focus_area_id": str(focus.id)}},
                    domains=["social"], context="free_play", support_level="some_support", created_by=teacher.id),
        DevelopmentReview(child_id=child.id, summary=cols.get("DR", {}).get("summary") or "A review.",
                          understanding={"summary": "x"}, follow_up=rows["dr_json"]["follow_up"], created_by=teacher.id),
        FunctionalSummary(child_id=child.id, source="manual", main_needs=rows["fs_json"]["main_needs"],
                          created_by=teacher.id, **{k: v for k, v in cols.get("FS", {}).items()}),
    ])
    db.commit()
    return SimpleNamespace(child=child, focus=focus, profile=profile, written=written)


def run_everything(db, client, marked, spy, teacher):
    child, focus = marked.child, marked.focus
    url = f"/api/children/{child.id}/content/generate"
    r = client.post(url, json={"mode": "growth_support", "content_type": "story", "focus_area_id": str(focus.id)})
    assert r.status_code == 201, r.text
    content_id = r.json()["content"]["id"]
    assert client.post(f"/api/content/{content_id}/regenerate", json={"instruction": "Call 0501112233"}).status_code == 200
    r = client.post(url, json={"mode": "strength_builder", "content_type": "pack", "target_strength": "building"})
    assert r.status_code == 201, r.text

    db.expire_all()
    profile = db.scalar(select(ChildProfile).where(ChildProfile.child_id == child.id))
    observations = db.scalars(select(Observation).where(Observation.child_id == child.id)
                              .order_by(Observation.observed_at)).all()
    focus_rows = db.scalars(select(FocusArea).where(FocusArea.child_id == child.id, FocusArea.status == "active")).all()
    baseline_items = [{"list": "strengths", "key": "building", "custom": None, "label": "Building"},
                      {"list": "support_needs", "key": "certain_foods", "custom": None, "label": "Certain foods"},
                      {"list": "support_needs", "key": "dressing", "custom": None, "label": "Dressing / undressing"},
                      {"list": "focus", "key": str(focus.id), "custom": None, "label": focus.title}]
    ctx = build_context(child=child, profile=profile, mode=None, content_type="understanding", language="en",
                        current_understanding=profile.current_understanding, mask_free_text=False)
    understanding, u_row = suggest_understanding(db, child, teacher, ctx, observations, focus_rows, baseline_items,
                                                 client=spy)
    db.commit()
    draft, s_row = draft_functional_summary(db, child, "en", teacher, client=spy)
    db.commit()
    return understanding, u_row, draft, s_row


def payload_texts(db, child_id, spy) -> dict[str, list[str]]:
    db.expire_all()
    gi = [json.dumps(r.generation_input, ensure_ascii=False) for r in
          db.scalars(select(GeneratedContent).where(GeneratedContent.child_id == child_id))]
    ais = [json.dumps(r.input, ensure_ascii=False) for r in
           db.scalars(select(AiSuggestion).where(AiSuggestion.child_id == child_id))]
    return {"generation_input": gi, "ai_suggestions.input": ais, "provider requests": spy.dumps()}


# --------------------------------------------------------------------------- tests


def test_never_fields_never_reach_any_payload(db, teacher_client, teacher, marked, spy):
    assert len(marked.written) >= len(BUILTIN_NEVER) - 2, [s for _, s, _ in marked.written]
    run_everything(db, teacher_client, marked, spy, teacher)
    texts = payload_texts(db, marked.child.id, spy)
    assert len(texts["generation_input"]) >= 4 and len(texts["ai_suggestions.input"]) == 2
    assert len(texts["provider requests"]) >= 5
    leaks = [(where, ident, storage) for ident, storage, marker in marked.written
             for where, docs in texts.items() for doc in docs if marker in doc]
    assert leaks == []


def test_identity_and_contact_details_never_reach_any_payload(db, teacher_client, teacher, marked, spy):
    understanding, u_row, draft, s_row = run_everything(db, teacher_client, marked, spy, teacher)
    texts = payload_texts(db, marked.child.id, spy)
    everything = [doc for docs in texts.values() for doc in docs]
    for forbidden in (SURNAME, "Rana", "Omar", "Saleh", "Yusuf", "Khalil", PHONE, EMAIL, "0501112233", "2022-08-05", "certain_foods"):
        assert not [doc for doc in everything if forbidden in doc], forbidden

    # Analysis payloads are de-identified: [child], never the first or preferred name (X-31).
    analysis = texts["ai_suggestions.input"] + [d for d in spy.dumps() if '"name": "[child]"' in d]
    assert len(analysis) >= 4
    for doc in analysis:
        assert "[child]" in doc and FIRST not in doc and PREFERRED not in doc
    # No AI payload ever gets the child's real name: content generation sends [child] too.
    assert texts["generation_input"]
    for doc in texts["generation_input"]:
        assert '"name": "[child]"' in doc and FIRST not in doc and PREFERRED not in doc

    # The teacher sees the name back.
    assert understanding.suggestion.summary == "Adi appears to enjoy building with a friend."
    assert understanding.suggestion.possible_patterns == ["Adi may find it easier to join after a short preparation."]
    assert understanding.provider == "claude" and understanding.suggestion_id == str(u_row.id)
    assert draft["general_description"].startswith("Adi takes part")
    assert draft["main_strengths"] == {"items": [{"key": "building"}], "text": None}
    for absent in ("follow_up_with_parents", "involvement"):
        assert absent not in draft
    assert u_row.output["summary"].startswith("Adi") and s_row.output["general_description"].startswith("Adi")


def test_domains_are_minimised_and_recorded(db, teacher_client, teacher, marked, spy):
    understanding, u_row, draft, s_row = run_everything(db, teacher_client, marked, spy, teacher)
    db.expire_all()
    rows = db.scalars(select(GeneratedContent).where(GeneratedContent.child_id == marked.child.id)).all()
    growth = [r for r in rows if r.mode == "growth_support"][0]
    # A social focus (joining group play) sends only the social and play blocks.
    assert set(growth.generation_input["domains"]) <= {"social", "play"}
    assert "social" in growth.generation_input["domains"]
    assert growth.generation_input["avoid"] == ["noise"]  # teacher-observed only, never certain_foods/touch
    sb = [r for r in rows if r.mode == "strength_builder"]
    assert sb and all(set(r.generation_input["domains"]) <= {"fine_motor", "play"} for r in sb)
    # Analysis: the domains with data, stored with the suggestion.
    assert u_row.domains and set(u_row.domains) <= set(vocab.keys("ai_domains"))
    assert {"social", "independence", "emotional"} <= set(u_row.domains)
    assert s_row.domains and understanding.domains == list(u_row.domains)
    # Independence levels go to the analysis only because independence has data in the period.
    assert "dressing" in json.dumps(u_row.input)


def test_referral_from_the_provider_falls_back_to_the_template(db, teacher_client, teacher, marked, monkeypatch):
    bad_u = {**_understanding_answer(), "next_steps": "Consider a referral to a specialist."}
    bad_s = {**_summary_answer(), "team_recommendations": "מומלץ על הפניה לגורם מקצועי."}
    fake = SpyClaude(understanding=bad_u, summary=bad_s)
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(claude_provider, "make_client", lambda: fake)
    understanding, u_row, draft, s_row = run_everything(db, teacher_client, marked, fake, teacher)
    assert (understanding.provider, understanding.fallback_reason) == ("template", "AI_UNSAFE_OUTPUT")
    assert (s_row.provider, s_row.fallback_reason, s_row.is_template) == ("template", "AI_UNSAFE_OUTPUT", True)
    shown = json.dumps([understanding.suggestion.model_dump(), draft, u_row.output, s_row.output], ensure_ascii=False)
    assert "referral" not in shown and "הפניה" not in shown


def test_suggestions_are_listed_for_staff_and_resolve_once(db, teacher_client, parent_client, other_teacher_client,
                                                           teacher, marked, spy):
    child = marked.child
    understanding, u_row, draft, s_row = run_everything(db, teacher_client, marked, spy, teacher)
    url = f"/api/children/{child.id}/ai-suggestions"
    data = teacher_client.get(url).json()["suggestions"]
    assert [s["kind"] for s in data] == ["functional_summary", "understanding"]
    assert all(s["outcome"] == "pending" and s["provenance"] == ["ai_suggested"] for s in data)
    assert data[1]["input"]["child"]["name"] == "[child]" and data[1]["domains"] == list(u_row.domains)
    assert [s["kind"] for s in teacher_client.get(url, params={"kind": "understanding"}).json()["suggestions"]] == [
        "understanding"]
    assert teacher_client.get(url, params={"kind": "nope"}).status_code == 400
    assert parent_client.get(url).status_code == 404
    assert other_teacher_client.get(url).status_code == 404

    # The next suggest of a kind discards the earlier pending one (lazily, §7.9).
    ctx = build_context(child=child, profile=marked.profile, mode=None, content_type="understanding", language="en",
                        mask_free_text=False)
    _, second = suggest_understanding(db, child, teacher, ctx, [], [], [], client=spy)
    db.commit()
    db.refresh(u_row)
    assert u_row.outcome == "discarded" and u_row.resolved_at is not None
    resolved = resolve_suggestion(db, second.id, child_id=child.id, outcome="accepted",
                                  used_by_type="development_review", used_by_id=None)
    db.commit()
    assert resolved.outcome == "accepted" and resolved.resolved_at is not None
    assert resolve_suggestion(db, second.id, child_id=child.id, outcome="edited") is None  # only once
    assert resolve_suggestion(db, "not-a-uuid", child_id=child.id, outcome="edited") is None
    with pytest.raises(ValueError):
        resolve_suggestion(db, s_row.id, child_id=child.id, outcome="pending")


def test_stage_e_result_and_plan_reach_the_analysis(db, teacher_client, teacher, marked, spy):
    """OM-D14-09/10, X-38: did_it_change (key only) and the plan it applied feed the review."""
    understanding, u_row, draft, s_row = run_everything(db, teacher_client, marked, spy, teacher)
    for row in (u_row, s_row):
        observed = [o for o in row.input.get("observations_since_baseline") or row.input.get("observations") or []
                    if o.get("changed")]
        assert observed and observed[0]["changed"] == "partly", row.kind
        assert observed[0]["plan_focus_area_id"] == str(marked.focus.id)


def test_observation_entry_carries_stage_e_keys_only():
    from app.ai.gather import observation_entry

    row = Observation(id=None, observed_at=None, observation="Built a tower.", domains=["social"],
                      details={"did_it_change": "yes", "what_changed": "SECRETCHANGE", "documentation": "SECRETDOC",
                               "plan_ref": {"focus_area_id": "f1", "version_seq": 2}})
    entry = observation_entry(row)
    assert entry["changed"] == "yes" and entry["plan_focus_area_id"] == "f1"
    assert "SECRET" not in json.dumps(entry, default=str)
    row.details = {"did_it_change": "maybe"}
    assert "changed" not in observation_entry(row)


def test_promoted_need_text_never_reaches_any_payload(db, teacher_client, teacher, marked, spy):
    """OM-D13-02: promoting a D13 need copies 'what exactly do we see' into plan.need; it stays out."""
    from app.ai.gather import current_assessment

    cycle = current_assessment(db, marked.child.id)
    marker = cycle.domains["priority_needs"]["data"]["needs"][0]["seeing"]
    assert marker.startswith("ZQX")
    r = teacher_client.post(f"/api/teacher-assessments/{cycle.id}/needs/0/focus", json={"title": "Joining a group"})
    assert r.status_code == 201, r.text
    promoted = r.json()["focus_area"]
    assert promoted["plan"]["need"] == marker  # stored for the teacher
    r = teacher_client.post(f"/api/children/{marked.child.id}/content/generate",
                            json={"mode": "growth_support", "content_type": "story", "focus_area_id": promoted["id"]})
    assert r.status_code == 201, r.text
    db.expire_all()
    child = db.get(type(marked.child), marked.child.id)
    draft_functional_summary(db, child, "en", teacher, client=spy)
    db.commit()
    texts = payload_texts(db, marked.child.id, spy)
    assert texts["generation_input"] and texts["ai_suggestions.input"]
    assert not [doc for docs in texts.values() for doc in docs if marker in doc]
