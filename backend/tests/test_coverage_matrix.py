"""The coverage-matrix walk (COVERAGE-MATRIX.md, X-64; SPEC-UPDATE step 10).

Every ``| PQ-``, ``| OM-`` and ``| X-`` row of docs/mvp-refocus/COVERAGE-MATRIX.md is
parsed and checked against the implementation:

- the row IDs are exactly the source-registry IDs (backend/app/data/source/*.json) plus
  X-01..X-64; nothing is listed twice and nothing is unmapped;
- every status is ``covered``, ``partial`` or ``missing``;
- every registry storage path resolves to a real Pydantic field (profile section model,
  bridge, questionnaire record, assessment domain model, observation details/attributes,
  focus plan, FollowUpIn, SummaryIn) or a real column in app.models, and every ``REG``
  path to a real registry, list or UI message;
- the matrix *AI* column equals the registry ``ai_policy``;
- every registry label (and every option of its list) exists in en, ar and he;
- every registry item with a PDF entry prints its stored value (each option as its label, each
  free text as itself) in EVERY report its PDF cell names, on a fully filled child whose free
  texts are distinct sentinels; every option row prints its label with that option stored;
- the matrix PDF column names the same reports as the registry ``pdf``.
"""
import copy
import json
import re
import typing
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import BaseModel
from sqlalchemy import select

from app import models, vocab
from app.config import APP_DIR
from app.models import ASSESSMENT_DOMAIN_VALUES
from app.reports.builders.registry import Registry, load
from app.reports.context import ReportContext
from app.reports.service import build_model
from app.reports.values import (
    INTERNAL_KEYS,
    KEY_LISTS,
    TEXT_KEYS,
    WILDCARD,
    get_path,
    item_lists,
    parse_storage,
    render_value,
)
from app.schemas import assessments as assessment_schema
from app.schemas import profile as profile_schema
from app.schemas.focus import FocusPlan
from app.schemas.functional_summaries import SummaryIn
from app.schemas.observations import ObservationAttributes, ObservationDetails
from app.schemas.reports import ReportRequest
from app.schemas.reviews import FollowUpIn
from tests.fixtures.reports.support import seed, use_registries
from tests.test_assessments import full_document

REPO = APP_DIR.parent.parent
MATRIX = REPO / "docs" / "mvp-refocus" / "COVERAGE-MATRIX.md"
SOURCE = APP_DIR / "data" / "source"
MESSAGES = REPO / "frontend" / "src" / "i18n" / "messages"
REGISTRY_NAMES = ("parent_questionnaire", "observation_model")
X_IDS = {f"X-{n:02d}" for n in range(1, 65)}
STATUSES = {"covered", "partial", "missing"}
AI_POLICIES = {"never", "label", "domain", "n/a"}
LANGS = ("en", "ar", "he")
COLUMNS = ("id", "source", "question", "status", "today", "target", "ui", "api", "pdf", "ai")
REPORT_TYPES = {"R1": "full", "R2": "parent_questionnaire", "R3": "teacher_observation",
                "R4": "current_development", "R5": "intervention_plan", "R6": "timeline"}


# --------------------------------------------------------------------------- parsing


def _cells(line: str) -> list[str]:
    """The cells of one table row; ``\\|`` is a literal pipe inside a cell."""
    protected = line.strip().replace("\\|", "\x00")
    return [c.strip().replace("\x00", "|") for c in protected.split("|")[1:-1]]


def matrix_rows() -> list[dict]:
    rows = []
    for number, line in enumerate(MATRIX.read_text(encoding="utf-8").splitlines(), 1):
        if re.match(r"\| (PQ-|OM-|X-)", line):
            cells = _cells(line)
            assert len(cells) == len(COLUMNS), f"line {number}: {len(cells)} cells"
            rows.append({**dict(zip(COLUMNS, cells)), "line": number})
    return rows


ROWS = matrix_rows()
BY_ID = {r["id"]: r for r in ROWS}


def registries() -> dict:
    return {name: json.loads((SOURCE / f"{name}.json").read_text(encoding="utf-8")) for name in REGISTRY_NAMES}


REGS = registries()


def entries(name: str | None = None):
    """(registry name, entry kind 'section'|'item', entry) for every registry entry."""
    for reg_name, reg in REGS.items():
        if name and reg_name != name:
            continue
        for s in reg["sections"]:
            yield reg_name, "section", s
        for i in reg["items"]:
            yield reg_name, "item", i


# --------------------------------------------------------------------------- IDs and statuses


def test_every_source_registry_is_walked():
    assert sorted(p.stem for p in SOURCE.glob("*.json")) == sorted(REGISTRY_NAMES)


def test_matrix_ids_are_unique():
    ids = [r["id"] for r in ROWS]
    assert len(ids) == len(set(ids)), sorted({i for i in ids if ids.count(i) > 1})


def test_matrix_ids_equal_the_registry_ids_plus_the_cross_cutting_list():
    registry_ids = set()
    groups = []
    for name, kind, entry in entries():
        # The observation-model sections only group items; their headings are one matrix row
        # (OM-D00-HDR, storage "REG observation_model.sections") and the domain-title items.
        if name == "observation_model" and kind == "section":
            groups.append(entry)
            continue
        registry_ids.add(entry["id"])
    matrix_ids = set(BY_ID)
    assert not registry_ids - matrix_ids, f"registry IDs without a matrix row: {sorted(registry_ids - matrix_ids)}"
    unmapped = matrix_ids - registry_ids - X_IDS
    assert not unmapped, f"matrix IDs without a registry or X entry: {sorted(unmapped)}"
    assert X_IDS <= matrix_ids, sorted(X_IDS - matrix_ids)
    om_items = REGS["observation_model"]["items"]
    assert any(i["id"] == "OM-D00-HDR" and i["storage"] == "REG observation_model.sections" for i in om_items)
    for section in groups:
        assert section["id"] not in matrix_ids, section["id"]
        assert any(i["section"] == section["key"] for i in om_items), f"empty section {section['id']}"
        if section.get("domain"):
            titles = [i for i in om_items if i["section"] == section["key"] and i["kind"] == "domain_title"]
            assert len(titles) == 1, section["id"]


def test_every_status_is_known():
    bad = [(r["id"], r["status"]) for r in ROWS if r["status"] not in STATUSES]
    assert not bad, bad


def test_summary_counts_match_the_rows():
    """§1.1 totals equal the rows (so the summary can never drift from the tables)."""
    text = MATRIX.read_text(encoding="utf-8")
    total = re.search(r"\| \*\*Total\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \|", text)
    assert total, "the §1.1 Total row is missing"
    counts = [len(ROWS)] + [sum(r["status"] == s for r in ROWS) for s in ("covered", "partial", "missing")]
    assert [int(g) for g in total.groups()] == counts


# --------------------------------------------------------------------------- storage paths


def _models_in(annotation) -> list[type[BaseModel]]:
    """Every BaseModel class inside an annotation (Optional, list, dict, Annotated, unions)."""
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return [annotation]
    return [m for arg in typing.get_args(annotation) for m in _models_in(arg)]


def resolve_model(model: type[BaseModel], parts: list) -> str | None:
    """None when ``parts`` is a path of fields of ``model``, else the reason.

    A list index steps into the list's element model (already current); a wildcard ("each",
    e.g. ``<stage>``) also steps into every field of a keyed object such as DayStages."""
    current = [model]
    for n, part in enumerate(parts):
        if isinstance(part, int):
            continue
        if part == WILDCARD:
            current = current + [x for m in current for f in m.model_fields.values() for x in _models_in(f.annotation)]
            continue
        fields = [m.model_fields[part] for m in current if part in m.model_fields]
        if not fields:
            return f"{'/'.join(m.__name__ for m in current)} has no field {part!r}"
        current = [x for f in fields for x in _models_in(f.annotation)]
        rest = [p for p in parts[n + 1:] if p != WILDCARD and not isinstance(p, int)]
        if not current and rest:
            return f"{part!r} is a plain value; cannot resolve {rest}"
        if not current:
            return None
    return None


def _column(model, name: str) -> bool:
    return name in model.__table__.columns.keys()


SNAPSHOT_KEYS = ("name", "preferred_name", "birth_date", "age_at_fill", "class_id", "class_name", "kindergarten",
                 "teacher_name")


def resolve_reg(storage: str, owner: str) -> str | None:
    rest = storage[len("REG"):].strip()
    if rest.startswith("i18n "):
        ns, _, key = rest[len("i18n "):].partition(".")
        for lang in LANGS:
            path = MESSAGES / lang / f"{ns}.json"
            if not path.is_file():
                return f"missing {path}"
            node = json.loads(path.read_text(encoding="utf-8"))
            for part in key.split("."):
                node = node.get(part) if isinstance(node, dict) else None
            if not isinstance(node, str) or not node.strip():
                return f"no UI string {ns}.{key} in {lang}"
        return None
    if rest.startswith("subgroup "):
        key = rest[len("subgroup "):]
        return None if any(i.get("subgroup") == key for i in REGS["observation_model"]["items"]) else f"no subgroup {key}"
    if rest.startswith("guidance "):  # the guidance text is the registry item itself (kind "guidance")
        domain = rest[len("guidance "):].partition(".")[0]
        found = any(i["kind"] == "guidance" and i.get("domain") == domain for i in REGS["observation_model"]["items"])
        return None if found else f"no guidance item for {domain}"
    head, _, path = rest.partition(".")
    if head in REGS:
        reg_name, parts = head, path.split(".") if path else []
    elif head == "meta":
        reg_name, parts = owner, ["meta", *path.split(".")]
    elif vocab.lists().get(head) is not None:
        return None if vocab.is_valid(head, path) else f"no option {path} in list {head}"
    else:
        return f"unknown registry text {storage!r}"
    node = REGS[reg_name]
    if parts[:1] == ["sections"]:
        if len(parts) == 1:
            return None if node["sections"] else "no sections"
        return None if any(s["key"] == parts[1] for s in node["sections"]) else f"no section {parts[1]}"
    for part in parts:
        node = node.get(part) if isinstance(node, dict) else None
        if node is None:
            return f"{reg_name} has no {'.'.join(parts)}"
    return None


def resolve(storage: str | None, owner: str) -> str | None:
    """None when the storage path resolves, else the reason."""
    if not storage:
        return "no storage"
    if storage.startswith("REG"):
        return resolve_reg(storage, owner)
    if storage == "PQM":
        return None
    parsed = parse_storage(storage)
    if not parsed:
        return f"unparsed storage {storage!r}"
    root, parts = parsed
    if root == "PP":
        section = profile_schema.SECTION_MODELS.get(parts[0]) if parts else None
        return resolve_model(section, parts[1:]) if section else f"no profile section {parts[:1]}"
    if root in ("TP", "QB"):
        rest = parts[1:] if root == "TP" else parts
        if root == "TP" and parts[:1] != ["bridge"]:
            return f"teacher storage outside the bridge: {parts}"
        return resolve_model(profile_schema.BridgeSection, rest)
    if root == "PQM":
        return resolve_model(profile_schema.QuestionnaireRecord, parts)
    if root == "CH":
        return None if _column(models.Child, parts[0]) else f"no children.{parts[0]}"
    if root == "CL":
        return None if _column(models.Class, parts[0]) else f"no classes.{parts[0]}"
    if root == "TAH":
        if not _column(models.TeacherAssessment, parts[0]):
            return f"no teacher_assessments.{parts[0]}"
        if parts[0] == "child_snapshot" and len(parts) > 1 and parts[1] not in SNAPSHOT_KEYS:
            return f"no child_snapshot.{parts[1]}"
        if parts[0] == "domains" and len(parts) > 1:
            if parts[1] not in ASSESSMENT_DOMAIN_VALUES:
                return f"no assessment domain {parts[1]}"
            if len(parts) > 2 and not _column(models.TeacherAssessmentEntry, parts[2]):
                return f"no teacher_assessment_entries.{parts[2]}"
        return None
    if root == "TA":
        if parts[:1] == ["items"]:  # the level format of every rated item (OM-LEVEL): each item domain
            rated = (*assessment_schema.ITEM_DOMAINS, "independence")
            problems = [resolve_model(assessment_schema.DOMAIN_MODELS[d], ["items", WILDCARD, *parts[1:]]) for d in rated]
            return next((p for p in problems if p), None)
        model = assessment_schema.DOMAIN_MODELS.get(parts[0]) if parts else None
        return resolve_model(model, parts[1:]) if model else f"no assessment domain {parts[:1]}"
    sub_models = {
        "OBS": (models.Observation, {"details": ObservationDetails, "attributes": ObservationAttributes}),
        "FA": (models.FocusArea, {"plan": FocusPlan}),
        "DR": (models.DevelopmentReview, {"follow_up": FollowUpIn}),
        "FS": (models.FunctionalSummary, {"main_strengths": SummaryIn, "main_needs": SummaryIn}),
    }
    if root in sub_models:
        table, nested = sub_models[root]
        if not parts or not _column(table, parts[0]):
            return f"no {table.__tablename__}.{parts[:1]}"
        if len(parts) > 1:
            model = nested.get(parts[0])
            if model is None:
                return f"{table.__tablename__}.{parts[0]} has no schema"
            return resolve_model(model, parts[1:] if model is not SummaryIn else parts)
        return None
    return f"unknown root {root}"


def test_every_storage_path_resolves():
    problems = []
    for name, kind, entry in entries():
        storage = entry.get("storage")
        if kind == "section":
            if name == "parent_questionnaire":
                data_section = entry.get("data_section")
                if entry["key"] == "meta":
                    continue
                if entry["kind"] == "teacher":
                    problem = resolve(storage or f"TP.{data_section}", name)
                elif data_section not in profile_schema.SECTION_MODELS:
                    problem = f"no profile section {data_section}"
                else:
                    problem = None
            else:
                problem = None if not entry.get("domain") or entry["domain"] in ASSESSMENT_DOMAIN_VALUES else "domain"
        else:
            problem = resolve(storage, name)
        if problem:
            problems.append(f"{entry['id']} {storage!r}: {problem}")
    assert not problems, "unresolved storage paths:\n" + "\n".join(problems)


def test_the_resolver_rejects_unknown_paths():
    assert resolve("PP.joy.nope", "parent_questionnaire")
    assert resolve("TA.social.items.flying", "observation_model")
    assert resolve("OBS.details.nothing", "observation_model")
    assert resolve("FS.not_a_column", "observation_model")
    assert resolve("DR.follow_up.nope", "observation_model")
    assert resolve("REG meta.nope", "observation_model")
    assert resolve("TAH.child_snapshot.surname", "observation_model")
    assert resolve("PP.joy.likes_at_home", "parent_questionnaire") is None
    assert resolve("TA.priority_needs.needs[i].seeing", "observation_model") is None


# --------------------------------------------------------------------------- AI policy and labels


def _ai_token(cell: str) -> str:
    match = re.match(r"n/a|never|label|domain", cell)
    return match.group(0) if match else cell


def test_ai_column_matches_the_registry_policy():
    problems = []
    for name, kind, entry in entries():
        row = BY_ID.get(entry["id"])
        if row is None:
            continue
        policy = entry.get("ai_policy")
        if policy is None:  # a parent-questionnaire section: static heading, or never when it is sensitive
            policy = "never" if entry.get("sensitivity") in ("health", "medical", "family") else "n/a"
        assert policy in AI_POLICIES, entry["id"]
        if _ai_token(row["ai"]) != policy:
            problems.append(f"{entry['id']}: registry {policy!r}, matrix {row['ai']!r}")
    assert not problems, "\n".join(problems)


def test_every_label_exists_in_every_language():
    problems = []
    for name, kind, entry in entries():
        label = entry.get("label")
        for lang in LANGS:
            if not (isinstance(label, dict) and isinstance(label.get(lang), str) and label[lang].strip()):
                problems.append(f"{entry['id']}: label.{lang}")
        options = entry.get("options")
        if isinstance(options, str) and kind == "item":
            listed = vocab.lists().get(options)
            if listed is None:
                problems.append(f"{entry['id']}: unknown list {options}")
                continue
            for option in listed:
                for lang in LANGS:
                    if not str((option.get("label") or {}).get(lang) or "").strip():
                        problems.append(f"{entry['id']}: {options}.{option['key']} label.{lang}")
    assert not problems, "\n".join(problems)


# --------------------------------------------------------------------------- PDF


@pytest.fixture
def real_registries(monkeypatch, tmp_path):
    use_registries(monkeypatch, tmp_path, real=True)
    yield
    vocab.reload()


def _strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _strings(v)


SENTINEL_PROTECTED = INTERNAL_KEYS | {"status", "kind", "mode", "entry_mode", "relation", "seen_in", "time", "date",
                                      "key", "level", "effect", "area", "domain", "domains", "contexts", "helps",
                                      "selected", "keys", "value", "frequency", "intensity", "activity",
                                      "did_it_change", "languages", "flags", "attendees", "strength_keys"}


# Keys whose value is always free text, even when it happens to spell an option key ("story").
FREE_TEXT_KEYS = frozenset(TEXT_KEYS) | {"custom", "other", "what_i_see", "what_we_did", "what_changed", "documentation",
                                         "what_worked", "what_to_change", "message", "name"}
# Registry rows whose printed form is their own text (guidance, rules, layout), not a stored value.
TEXT_ROW_KINDS = {"rule", "principle", "principle_line", "record", "guidance", "heading", "helper", "meta",
                  "domain_title", "format", "subgroup", "display", "intro"}


def _all_option_keys() -> set:
    return {o["key"] for options in vocab.lists().values() for o in options if isinstance(o, dict) and o.get("key")}


class Sentinels:
    """Distinct free-text values ("ZS0001Q", …): a builder that prints the wrong field (or none)
    can no longer pass on a text that happens to appear elsewhere."""

    def __init__(self):
        self.n = 0
        self.keys = _all_option_keys()

    def next(self) -> str:
        self.n += 1
        return f"ZS{self.n:04d}Q"

    def free(self, text, key) -> bool:
        if not isinstance(text, str) or not text.strip() or key in SENTINEL_PROTECTED:
            return False
        if re.fullmatch(r"[\d:.\-T+Z ]+", text):
            return False
        return key in FREE_TEXT_KEYS or text not in self.keys

    def apply(self, obj, key=None):
        if isinstance(obj, dict):
            return {k: self.apply(v, k) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self.apply(v, key) for v in obj]
        return self.next() if self.free(obj, key) else obj


def _filler(item: dict, sentinels: Sentinels):
    """A value for an empty registry field, by its kind: option chips plus a text, a yes/no with a
    text, or a text."""
    lists = item_lists(item)
    chips = item.get("chips") if isinstance(item.get("chips"), dict) else {}
    if not lists and isinstance(chips.get("options"), str):
        lists = (chips["options"],)
    kind = str(item.get("kind") or "")
    last = str(item.get("storage") or "").split(" ")[0].split(".")[-1]
    if last in FREE_TEXT_KEYS or kind == "other_text":
        return sentinels.next()
    if kind == "level_row" and lists and vocab.lists().get(lists[0]):
        return vocab.lists()[lists[0]][0]["key"]
    if kind.startswith("yes_no"):
        return {"value": "yes", "text": sentinels.next()}
    if lists and vocab.lists().get(lists[0]):
        first = vocab.lists()[lists[0]][0]["key"]
        return {"items": [{"key": first}], "text": sentinels.next()}
    return sentinels.next()


def _fill_section(sections: dict, items, sentinels: Sentinels, root_parts=()) -> None:
    """Every empty registry field under ``sections`` gets a filler (PP / QB)."""
    for item in items:
        parsed = parse_storage(item.get("storage"))
        if parsed is None or not item.get("pdf"):
            continue
        root, parts = parsed
        if root != "PP" or len(parts) < 2 or any(p == WILDCARD or isinstance(p, int) for p in parts):
            continue
        if str(item.get("kind")) in TEXT_ROW_KINDS | {"parents", "child_fact"}:
            continue
        node = sections
        for part in parts[:-1]:
            if node.get(part) in (None, "", [], {}):
                node[part] = {}
            node = node[part]
            if not isinstance(node, dict):
                break
        if not isinstance(node, dict):
            continue
        sections[parts[0]].pop("not_answered", None)
        if node.get(parts[-1]) in (None, "", [], {}):
            node[parts[-1]] = _filler(item, sentinels)


def _fill_everything(db, s, teacher):
    """On top of the report seed: every domain document in full, a structured observation with
    every A–E field, a review with the whole Domain 16 block, an approved functional summary with
    every Domain 17 field and the quick-baseline field the seed leaves empty. Every questionnaire
    field the seed leaves empty gets a value, and every free text is a distinct sentinel."""
    sentinels = Sentinels()
    now = datetime.now(timezone.utc)
    obs = models.Observation(
        child_id=s.child.id, source="quick", observed_at=now, context="yard",
        observation="Climbed the ladder after watching a friend.", support_level="some_support",
        focus_area_id=s.focus.id, created_by=teacher.id,
        details=sentinels.apply({"what_i_see": "Watched first, then climbed", "when_detail": {
            "time": "11:00", "activity": "yard", "activity_text": "Climbing frame", "with_whom": "Two friends",
            "before_event": "Snack time", "after_event": "Story time"},
            "needs": {"helps": ["visual_support", "movement"], "text": "A turn order"},
            "what_we_did": "Showed a picture of the turns", "did_it_change": "yes",
            "what_changed": "Waited for his turn", "documentation": "Photo of the turn card",
            "plan_ref": {"focus_area_id": str(s.focus.id), "version_seq": 1}}),
        attributes={"frequency": "often", "duration_minutes": 7, "intensity": "moderate"})
    db.add(obs)
    db.flush()
    for domain in ASSESSMENT_DOMAIN_VALUES:
        db.add(models.TeacherAssessmentEntry(
            assessment_id=s.cycle.id, child_id=s.child.id, domain=domain, status="sufficient",
            data=sentinels.apply(full_document(domain, str(obs.id))), entered_by=teacher.id,
            entered_by_name=teacher.name, entered_role="teacher"))
    profile = db.scalars(select(models.ChildProfile).where(models.ChildProfile.child_id == s.child.id)).one()
    pp = sentinels.apply(copy.deepcopy(profile.parent_perspective))
    _fill_section(pp["sections"], REGS["parent_questionnaire"]["items"], sentinels)
    profile.parent_perspective = pp
    # The quick baseline's main strengths are in the merged list (the API keeps them in step).
    strengths = [x for x in profile.strengths or [] if x.get("key") != "memory"]
    profile.strengths = [*strengths, {"key": "memory", "sources": ["teacher"], "main": True}]
    tp = sentinels.apply(copy.deepcopy(profile.teacher_perspective))
    bridge = tp["sections"]["bridge"]
    bridge["may_be_difficult"] = sentinels.next()
    bridge["remember"] = [{"text": sentinels.next()} for _ in range(3)]
    bridge["calms_helps"] = {"items": [{"key": "hug"}], "text": sentinels.next()}
    bridge["first_area_to_observe"] = {"domain": "social", "note": sentinels.next()}
    profile.teacher_perspective = tp
    focus = db.get(models.FocusArea, s.focus.id)
    focus.plan = sentinels.apply(dict(focus.plan or {}))
    db.add(models.DevelopmentReview(
        child_id=s.child.id, review_date=date.today(), summary=sentinels.next(), ai_suggested=False,
        understanding={"summary": sentinels.next()}, focus_review=[],
        follow_up=sentinels.apply({
            "reassessment_on": (date.today() + timedelta(days=30)).isoformat(),
            "improvement": {"level": "partial", "note": "Joins in with one friend"},
            "areas": {"domains": ["social", "play"], "focus_area_ids": [str(s.focus.id)], "text": "Free play"},
            "what_worked": "The block corner", "what_to_change": "Shorter group times",
            "involvement": {"key": "joint_plan", "note": "Agree a shared plan at the next meeting"}}),
        created_by=teacher.id, created_at=now))
    db.add(models.FunctionalSummary(
        child_id=s.child.id, general_description=sentinels.next(), source="manual", status="approved",
        main_strengths={"items": [{"key": "creativity"}], "text": sentinels.next()},
        main_needs={"items": [sentinels.next()], "text": sentinels.next()}, adaptations=sentinels.next(),
        follow_up_with_parents=sentinels.next(), team_recommendations=sentinels.next(),
        approved_by=teacher.id, approved_at=now, created_by=teacher.id))
    db.commit()
    return SimpleNamespace(obs=obs)


# --------------------------------------------------------------------------- PDF: the values


def _codes(pdf) -> list[str]:
    """The report codes an item must print in. All the flags are on in this walk, so a code marked
    conditional ("R1 (include_health)") is required too."""
    return list(dict.fromkeys(re.findall(r"R[1-6]", pdf or "")))


def _values_at(obj, parts) -> list:
    """Every value at ``parts``; a wildcard steps into each element of a list or dict."""
    if not parts:
        return [obj]
    part, rest = parts[0], parts[1:]
    if part == WILDCARD:
        children = obj if isinstance(obj, list) else list(obj.values()) if isinstance(obj, dict) else []
        return [v for child in children for v in _values_at(child, rest)]
    if isinstance(obj, list) and not isinstance(part, int):  # "needs.area": each element
        return [v for child in obj for v in _values_at(child, parts)]
    found = get_path(obj, [part])
    return [] if found is None else _values_at(found, rest)


def stored_values(db, s, filled, root: str, parts: list) -> list | None:
    """The stored value(s) of a storage path on the filled child; None for roots not walked here."""
    db.expire_all()
    profile = db.scalars(select(models.ChildProfile).where(models.ChildProfile.child_id == s.child.id)).one()
    if root == "PP":
        return _values_at(profile.parent_perspective.get("sections") or {}, parts)
    if root == "PQM":
        return _values_at(profile.parent_perspective.get("questionnaire") or {}, parts)
    if root == "QB":
        return _values_at(profile.teacher_perspective["sections"].get("bridge") or {}, parts)
    if root == "TP":
        return _values_at(profile.teacher_perspective.get("sections") or {}, parts)
    if root == "TA":
        if not parts or parts[0] not in ASSESSMENT_DOMAIN_VALUES:
            return None
        entry = db.scalars(select(models.TeacherAssessmentEntry).where(
            models.TeacherAssessmentEntry.assessment_id == s.cycle.id,
            models.TeacherAssessmentEntry.domain == parts[0]).order_by(
            models.TeacherAssessmentEntry.entered_at.desc(), models.TeacherAssessmentEntry.id.desc())).first()
        return _values_at(entry.data if entry else {}, parts[1:])
    rows = {
        "OBS": lambda: db.get(models.Observation, filled.obs.id),
        "FA": lambda: db.get(models.FocusArea, s.focus.id),
        "DR": lambda: db.scalars(select(models.DevelopmentReview).where(
            models.DevelopmentReview.child_id == s.child.id).order_by(models.DevelopmentReview.created_at.desc())).first(),
        "FS": lambda: db.scalars(select(models.FunctionalSummary).where(
            models.FunctionalSummary.child_id == s.child.id, models.FunctionalSummary.status == "approved")
            .order_by(models.FunctionalSummary.approved_at.desc())).first(),
    }
    if root in rows and parts:
        row = rows[root]()
        return _values_at(getattr(row, parts[0], None), parts[1:])
    return None


def _atoms(ctx, value, lists, key=None) -> list[tuple[str, ...]]:
    """What printing ``value`` must show: each option as its label, each text as itself, each date
    in the report's format. One tuple per atom = its acceptable spellings."""
    out = []
    if isinstance(value, dict):
        if isinstance(value.get("list"), str):  # a strength slot names its own list
            lists = (value["list"], *lists)
        for k, v in value.items():
            if k in INTERNAL_KEYS:
                continue
            out += _atoms(ctx, v, tuple(KEY_LISTS.get(k, ())) + tuple(lists), k)
        return out
    if isinstance(value, list):
        for v in value:
            out += _atoms(ctx, v, lists, key)
        return out
    if isinstance(value, bool) or value is None or value == "":
        return out
    if key == "level" and value == "not_observed":  # nothing was observed: no value to print
        return out
    if key in FREE_TEXT_KEYS and isinstance(value, str):
        return [(value.strip(),)]
    rendered = render_value(ctx, value, lists)
    texts = [c["text"] for c in rendered["chips"]] + rendered["lines"]
    if isinstance(value, str) and texts == [value] and value in _all_option_keys():
        # An option key that is not in the item's lists (or the key's own lists): no label to expect.
        return out
    return [(t,) for t in texts]


def _report_texts(db, s, klass, codes) -> dict:
    texts = {}
    for code in codes:
        request = ReportRequest(report_type=REPORT_TYPES[code], language="en", include_health=True,
                                include_family=True, include_private_notes=True, include_parent=True,
                                include_teacher_observations=True, include_timeline=True)
        ctx = ReportContext(db, s.teacher, s.child, klass, request, "en", date.today())
        model = build_model(ctx)
        texts[code] = "\n".join(_strings(model))
        if code == "R2":
            texts["about-block"] = any(sec["key"] == "about" and sec["blocks"] for sec in model["sections"])
    return texts


def _label_emitted(name: str, entry: dict, texts: dict, codes: list) -> bool:
    """Registry text, derived values and layout rows: the label (or the registry text) reaches
    every report the item names."""
    pool = [texts[c] for c in codes]
    label = Registry.label(entry, "en")
    kind, storage = entry.get("kind"), str(entry.get("storage") or "")
    if all(label in t for t in pool):
        return True
    if kind == "format":  # "Item / How much support was needed? / Notes" = the table's column headers
        parts = [p.strip() for p in label.split(" / ")]
        return len(parts) > 1 and all(all(p in t for p in parts) for t in pool)
    if kind == "record" and storage.startswith("PQM"):
        return codes == ["R2"] and texts["about-block"]
    if storage == "REG observation_model.sections":
        titles = [Registry.label(s, "en") for s in REGS["observation_model"]["sections"] if s.get("domain")]
        return all(all(t in p for t in titles) for p in pool)
    if storage.startswith("REG "):
        parts = storage.split(" ", 1)[1].split(".")
        node = REGS[name]
        for part in parts[1:] if parts[0] in REGS else parts:
            node = node.get(part) if isinstance(node, dict) else None
        value = node.get("en") if isinstance(node, dict) else None
        return bool(value) and all(value in t for t in pool)
    return False


VALUE_ROOTS = ("PP", "PQM", "QB", "TP", "TA", "OBS", "FA", "DR", "FS")


@pytest.fixture
def filled(db, real_registries, teacher, make_class, make_child):
    klass = make_class("Class A", kindergarten="Sunflower Kindergarten", teachers=[teacher])
    s = seed(db, teacher=teacher, klass=klass, make_child=make_child, lang="en")
    s.teacher, s.klass = teacher, klass
    s.filled = _fill_everything(db, s, teacher)
    return s


def _ctx(db, s, code="R3"):
    request = ReportRequest(report_type=REPORT_TYPES[code], language="en", include_health=True, include_family=True,
                            include_private_notes=True)
    return ReportContext(db, s.teacher, s.child, s.klass, request, "en", date.today())


def test_every_registry_item_with_a_pdf_entry_prints_its_stored_value(db, filled):
    """For every registry item with a PDF entry: its stored value on a fully filled child (every
    free text a distinct sentinel) is printed in EVERY report its PDF cell names: each option as
    its label, each text as itself. Registry text and layout rows print their label instead."""
    s = filled
    texts = _report_texts(db, s, s.klass, list(REPORT_TYPES))
    ctx = _ctx(db, s)
    missing = []
    for name, kind, entry in entries():
        codes = _codes(entry.get("pdf"))
        if kind != "item" or not codes or entry.get("kind") == "option":
            continue
        parsed = parse_storage(entry.get("storage"))
        values = None
        if parsed and parsed[0] in VALUE_ROOTS and entry.get("kind") not in TEXT_ROW_KINDS:
            values = stored_values(db, s, s.filled, *parsed)
        if values is None:
            if not _label_emitted(name, entry, texts, codes):
                missing.append(f"{entry['id']} {entry.get('pdf')!r}: label {Registry.label(entry, 'en')!r}")
            continue
        chips = entry.get("chips") if isinstance(entry.get("chips"), dict) else {}
        lists = item_lists(entry) or ((chips["options"],) if isinstance(chips.get("options"), str) else ())
        atoms = [a for v in values for a in _atoms(ctx, v, lists)]
        if entry.get("storage") == "OBS.details.plan_ref":  # printed as the plan's focus title
            atoms = [(s.focus.title,)] if values else []
        if entry.get("storage") == "OBS.details.did_it_change":  # printed with the stage-E wording
            atoms = [(ctx.tr(f"r3.change_{v}"),) for v in values if v in ("yes", "partly", "no")]
        if not atoms:
            missing.append(f"{entry['id']} {entry.get('storage')!r}: nothing stored on the filled child")
            continue
        for code in codes:
            lost = [a[0] for a in atoms if not any(spelling in texts[code] for spelling in a)]
            if lost:
                missing.append(f"{entry['id']} {code} ({entry.get('pdf')!r}): {lost[:4]}")
    assert not missing, f"{len(missing)} registry values are not printed:\n" + "\n".join(missing)


def _put_option(db, s, entry) -> None:
    """Store the option of an option row (one record per option): a new teacher-observation entry,
    the observation's stage-C helps, or a new review's involvement step."""
    storage, key = entry["storage"], entry["option_key"]
    if storage.startswith("TA.priority_needs.needs"):
        data = copy.deepcopy(full_document("priority_needs", str(s.filled.obs.id)))
        data["needs"][0]["area"] = key
        db.add(models.TeacherAssessmentEntry(
            assessment_id=s.cycle.id, child_id=s.child.id, domain="priority_needs", status="sufficient", data=data,
            entered_by=s.teacher.id, entered_by_name=s.teacher.name, entered_role="teacher"))
    elif storage == "OBS.details.needs.helps":
        obs = db.get(models.Observation, s.filled.obs.id)
        obs.details = {**obs.details, "needs": {"helps": [key], "text": ""}}
    elif storage == "DR.follow_up.involvement.key":
        db.add(models.DevelopmentReview(
            child_id=s.child.id, review_date=date.today(), summary="A look.", ai_suggested=False,
            understanding={"summary": "x"}, focus_review=[], follow_up={"involvement": {"key": key}},
            created_by=s.teacher.id, created_at=datetime.now(timezone.utc)))
    else:
        raise AssertionError(f"no way to store option row {entry['id']} ({storage})")
    db.commit()


def test_every_option_row_prints_its_label(db, filled):
    """Option rows (D13 areas, D14-C helps, D16-07 steps): with that option stored, its label is
    printed in every report the row names."""
    s = filled
    ctx = _ctx(db, s)
    missing = []
    for name, kind, entry in entries():
        codes = _codes(entry.get("pdf"))
        if kind != "item" or entry.get("kind") != "option" or not codes:
            continue
        _put_option(db, s, entry)
        texts = _report_texts(db, s, s.klass, codes)
        label = ctx.option_label(item_lists(entry), entry["option_key"])
        assert label, entry["id"]
        missing += [f"{entry['id']} {code}: {label!r}" for code in codes if label not in texts[code]]
    assert not missing, "\n".join(missing)


def test_matrix_pdf_cells_name_the_registry_reports():
    """The matrix PDF column and the registry ``pdf`` name the same reports (R1–R6)."""
    problems = []
    for name, kind, entry in entries():
        row = BY_ID.get(entry["id"])
        if row is None or kind != "item":
            continue
        registry_codes = set(_codes(entry.get("pdf")))
        matrix_codes = set(_codes(row["pdf"]))
        if registry_codes != matrix_codes:
            problems.append(f"{entry['id']}: registry {entry.get('pdf')!r}, matrix {row['pdf']!r}")
    assert not problems, f"{len(problems)} PDF cells differ:\n" + "\n".join(problems)
