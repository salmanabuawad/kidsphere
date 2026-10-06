"""Source documents: version history, teacher assessments, AI suggestions,
functional summaries, the PDF export log, plan follow-up columns and the backfill.

Hand-written DDL (no autogenerate), like 0001. app/models.py mirrors it.
The plan is docs/mvp-refocus/COVERAGE-MATRIX.md §3.

Additive only: no column is dropped, renamed or retyped, and existing JSON is
only extended with new keys. The downgrade drops only the objects added here
(the JSON keys added by the backfill stay; the 0001 code ignores them).

New objects
- ``kidsphere_append_only()``: shared guard. Rows are history: UPDATE always
  raises, DELETE raises unless the row's child is already gone (the child's
  ON DELETE CASCADE still works).
- ``ai_suggestions`` (only pending -> accepted/edited/discarded may be updated;
  input and output never change), ``record_versions`` (append-only),
  ``teacher_assessments`` (one open and one initial cycle per child; a closed
  cycle is immutable), ``teacher_assessment_entries`` (append-only; inserts only
  into an open cycle, which they lock FOR NO KEY UPDATE), ``functional_summaries``
  (only draft -> approved), ``report_exports`` (append-only).
- ``focus_areas``: follow_up_on, assessment_id, source_need, plus a DEFERRABLE
  INITIALLY DEFERRED constraint trigger: at most 3 active focus areas per child
  at COMMIT (it locks the child row before counting).
- ``observations``: domains text[] (the 12 AI domains; GIN index), attributes.
- ``development_reviews``: follow_up, ai_suggestion_id.
- ``generated_content``: deleted_at, deleted_by (only drafts can be soft-deleted).

Guards that a service may hit in a race raise SQLSTATE 23514 (check_violation)
with a CONSTRAINT name that app/errors.py maps to an error code:
``focus_areas_max_active`` -> FOCUS_LIMIT, ``teacher_assessments_closed`` ->
ASSESSMENT_CLOSED, ``functional_summaries_approved`` -> SUMMARY_APPROVED (and
the unique index ``teacher_assessments_one_open_uq`` -> ASSESSMENT_OPEN).

Data steps (``backfill``; idempotent, no deletes, run again safely):
1. observations.domains from area.
2. focus_areas.follow_up_on from a valid ISO plan.review_on.
3. record_versions seq 1 (via 'backfill') for every observation, focus area and
   non-archived content row: the row as JSON minus id, child_id, created_by,
   created_at and updated_at (the same keys app/services/history.snapshot drops).
4. Per child_profiles row: record_versions seq 1 for every profile section of
   both perspectives (entity_key '<perspective>:<section>', data = the section,
   who/when from the section's last ``entered`` stamp, else the profile's
   updated_at); then ``parent_perspective.questionnaire`` and each perspective's
   ``section_status`` are added **only when absent** (jsonb ``||``, so every
   existing key stays byte-identical). The new canonical questionnaire keys are
   not guessed from the lossy legacy keys.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-06
"""
import json
import re
import uuid
from datetime import date, datetime, timezone

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _in(values) -> str:
    return "(" + ",".join(f"'{v}'" for v in values) + ")"


def _array(values) -> str:
    return "ARRAY[" + ",".join(f"'{v}'" for v in values) + "]::text[]"


AI_DOMAINS = ("emotional", "social", "communication", "language", "executive_function", "play",
              "gross_motor", "fine_motor", "independence", "sensory", "cognitive", "daily_routine")
ASSESSMENT_DOMAINS = ("emotional", "social", "language", "executive_function", "play", "gross_motor",
                      "fine_motor", "independence", "sensory", "cognitive", "daily_routine", "strengths",
                      "priority_needs")
SECTION_STATUSES = ("not_started", "in_progress", "sufficient", "review_later")
VIA = ("backfill", "self", "on_behalf", "meeting", "manual", "review", "assessment",
       "generated", "regenerated", "edited", "status", "system")
REPORT_TYPES = ("full", "parent_questionnaire", "teacher_observation", "current_development",
                "intervention_plan", "timeline")

UPGRADE = f"""
CREATE FUNCTION kidsphere_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION USING MESSAGE = TG_TABLE_NAME || ' rows are append-only; insert a new row instead';
  END IF;
  IF EXISTS (SELECT 1 FROM children WHERE id = OLD.child_id) THEN
    RAISE EXCEPTION USING MESSAGE = TG_TABLE_NAME || ' rows can only be deleted together with their child';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TABLE ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('understanding','functional_summary','observation_questions')),
  provider text NOT NULL,
  model text,
  is_template boolean NOT NULL,
  fallback_reason text,
  domains text[] NOT NULL DEFAULT '{{}}',
  input jsonb NOT NULL,
  output jsonb NOT NULL,
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','accepted','edited','discarded')),
  used_by_type text CHECK (used_by_type IN ('development_review','functional_summary')),
  used_by_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT ai_suggestions_domains_chk CHECK (domains <@ {_array(AI_DOMAINS)})
);
CREATE INDEX ai_suggestions_child_idx ON ai_suggestions (child_id, kind, created_at);

CREATE FUNCTION ai_suggestions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.outcome <> 'pending' OR NEW.outcome = 'pending'
       OR (NEW.child_id, NEW.kind, NEW.provider, NEW.model, NEW.is_template, NEW.fallback_reason,
           NEW.domains, NEW.input, NEW.output, NEW.created_by, NEW.created_at)
          IS DISTINCT FROM
          (OLD.child_id, OLD.kind, OLD.provider, OLD.model, OLD.is_template, OLD.fallback_reason,
           OLD.domains, OLD.input, OLD.output, OLD.created_by, OLD.created_at) THEN
      RAISE EXCEPTION 'ai_suggestions: only a pending suggestion can be resolved (accepted, edited or discarded), and what was sent and returned never changes';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM children WHERE id = OLD.child_id) THEN
    RAISE EXCEPTION 'ai_suggestions rows can only be deleted together with their child';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER ai_suggestions_guard BEFORE UPDATE OR DELETE ON ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION ai_suggestions_guard();

CREATE TABLE record_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('profile_section','observation','focus_area','content')),
  entity_id uuid,
  entity_key text NOT NULL DEFAULT '',
  seq integer NOT NULL CHECK (seq >= 1),
  data jsonb NOT NULL,
  changed_by uuid REFERENCES users(id),
  changed_by_name text,
  changed_role text CHECK (changed_role IN ('admin','teacher','parent','system')),
  reported_by text CHECK (reported_by IN ('parent','teacher')),
  via text NOT NULL CHECK (via IN {_in(VIA)}),
  review_id uuid REFERENCES development_reviews(id),
  ai_suggestion_id uuid REFERENCES ai_suggestions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_versions_entity_chk CHECK (
    (entity_type = 'profile_section' AND entity_id IS NULL AND entity_key <> '')
    OR (entity_type <> 'profile_section' AND entity_id IS NOT NULL))
);
CREATE UNIQUE INDEX record_versions_seq_uq ON record_versions
  (child_id, entity_type, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), entity_key, seq);
CREATE INDEX record_versions_child_idx ON record_versions (child_id, entity_type, created_at);
CREATE INDEX record_versions_entity_idx ON record_versions (entity_id, seq) WHERE entity_id IS NOT NULL;
CREATE TRIGGER record_versions_append_only BEFORE UPDATE OR DELETE ON record_versions
  FOR EACH ROW EXECUTE FUNCTION kidsphere_append_only();

CREATE TABLE teacher_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial','reassessment')),
  previous_id uuid REFERENCES teacher_assessments(id),
  filled_on date NOT NULL DEFAULT current_date,
  period_from date,
  period_to date,
  period_note text CHECK (period_note IS NULL OR length(period_note) <= 500),
  teacher_id uuid REFERENCES users(id),
  filled_by_text text CHECK (filled_by_text IS NULL OR length(filled_by_text) <= 200),
  child_snapshot jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  domains jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES users(id),
  closed_at timestamptz,
  CONSTRAINT teacher_assessments_period_chk CHECK (period_from IS NULL OR period_to IS NULL OR period_from <= period_to),
  CONSTRAINT teacher_assessments_closed_chk CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX teacher_assessments_one_open_uq ON teacher_assessments (child_id) WHERE status = 'open';
CREATE UNIQUE INDEX teacher_assessments_one_initial_uq ON teacher_assessments (child_id) WHERE kind = 'initial';
CREATE INDEX teacher_assessments_child_idx ON teacher_assessments (child_id, filled_on);

CREATE FUNCTION teacher_assessments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'closed' THEN
      RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'teacher_assessments_closed',
        MESSAGE = 'closed teacher assessments are immutable; start a reassessment';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM children WHERE id = OLD.child_id) THEN
    RAISE EXCEPTION 'teacher assessments can only be deleted together with their child';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER teacher_assessments_guard BEFORE UPDATE OR DELETE ON teacher_assessments
  FOR EACH ROW EXECUTE FUNCTION teacher_assessments_guard();

CREATE TABLE teacher_assessment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES teacher_assessments(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN {_in(ASSESSMENT_DOMAINS)}),
  status text NOT NULL CHECK (status IN {_in(SECTION_STATUSES)}),
  data jsonb NOT NULL,
  entered_by uuid REFERENCES users(id),
  entered_by_name text,
  entered_role text NOT NULL CHECK (entered_role IN ('admin','teacher')),
  entered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teacher_assessment_entries_latest_idx ON teacher_assessment_entries (assessment_id, domain, entered_at DESC);
CREATE INDEX teacher_assessment_entries_child_idx ON teacher_assessment_entries (child_id, entered_at);

CREATE FUNCTION teacher_assessment_entries_open() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cycle record;
BEGIN
  SELECT status, child_id INTO cycle FROM teacher_assessments WHERE id = NEW.assessment_id FOR NO KEY UPDATE;
  IF FOUND THEN
    IF cycle.status <> 'open' THEN
      RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'teacher_assessments_closed',
        MESSAGE = 'cannot add entries to a closed teacher assessment';
    END IF;
    IF cycle.child_id <> NEW.child_id THEN
      RAISE EXCEPTION 'teacher assessment entries must belong to the child of their assessment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER teacher_assessment_entries_open BEFORE INSERT ON teacher_assessment_entries
  FOR EACH ROW EXECUTE FUNCTION teacher_assessment_entries_open();
CREATE TRIGGER teacher_assessment_entries_append_only BEFORE UPDATE OR DELETE ON teacher_assessment_entries
  FOR EACH ROW EXECUTE FUNCTION kidsphere_append_only();

CREATE TABLE functional_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  supersedes_id uuid REFERENCES functional_summaries(id),
  review_id uuid REFERENCES development_reviews(id),
  assessment_id uuid REFERENCES teacher_assessments(id),
  general_description text CHECK (general_description IS NULL OR length(general_description) <= 4000),
  main_strengths jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  main_needs jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  adaptations text CHECK (adaptations IS NULL OR length(adaptations) <= 2000),
  follow_up_with_parents text CHECK (follow_up_with_parents IS NULL OR length(follow_up_with_parents) <= 1000),
  team_recommendations text CHECK (team_recommendations IS NULL OR length(team_recommendations) <= 1000),
  source text NOT NULL CHECK (source IN ('manual','ai_draft')),
  ai_suggestion_id uuid REFERENCES ai_suggestions(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT functional_summaries_approved_chk
    CHECK ((status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT functional_summaries_ai_chk CHECK (source = 'manual' OR ai_suggestion_id IS NOT NULL)
);
CREATE INDEX functional_summaries_child_idx ON functional_summaries (child_id, created_at);

CREATE FUNCTION functional_summaries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'approved' THEN
      RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'functional_summaries_approved',
        MESSAGE = 'this functional summary is already approved; save a new version instead';
    END IF;
    IF NEW.status <> 'approved'
       OR (NEW.general_description, NEW.main_strengths, NEW.main_needs, NEW.adaptations,
           NEW.follow_up_with_parents, NEW.team_recommendations, NEW.source, NEW.ai_suggestion_id,
           NEW.supersedes_id, NEW.child_id, NEW.created_by, NEW.created_at)
          IS DISTINCT FROM
          (OLD.general_description, OLD.main_strengths, OLD.main_needs, OLD.adaptations,
           OLD.follow_up_with_parents, OLD.team_recommendations, OLD.source, OLD.ai_suggestion_id,
           OLD.supersedes_id, OLD.child_id, OLD.created_by, OLD.created_at) THEN
      RAISE EXCEPTION 'functional summaries are immutable; save a new version instead';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM children WHERE id = OLD.child_id) THEN
    RAISE EXCEPTION 'functional summaries can only be deleted together with their child';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER functional_summaries_guard BEFORE UPDATE OR DELETE ON functional_summaries
  FOR EACH ROW EXECUTE FUNCTION functional_summaries_guard();

CREATE TABLE report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN {_in(REPORT_TYPES)}),
  language text NOT NULL CHECK (language IN ('ar','he','en')),
  generated_by uuid REFERENCES users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  date_range daterange,
  options jsonb NOT NULL DEFAULT '{{}}'::jsonb
);
CREATE INDEX report_exports_child_idx ON report_exports (child_id, generated_at DESC);
CREATE TRIGGER report_exports_append_only BEFORE UPDATE OR DELETE ON report_exports
  FOR EACH ROW EXECUTE FUNCTION kidsphere_append_only();

ALTER TABLE focus_areas
  ADD COLUMN follow_up_on date,
  ADD COLUMN assessment_id uuid REFERENCES teacher_assessments(id) ON DELETE SET NULL,
  ADD COLUMN source_need jsonb;
CREATE INDEX focus_areas_assessment_idx ON focus_areas (assessment_id) WHERE assessment_id IS NOT NULL;

CREATE FUNCTION focus_areas_max_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM 1 FROM children WHERE id = NEW.child_id FOR NO KEY UPDATE;
    IF (SELECT count(*) FROM focus_areas WHERE child_id = NEW.child_id AND status = 'active') > 3 THEN
      RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'focus_areas_max_active',
        MESSAGE = 'FOCUS_LIMIT: at most 3 active focus areas per child';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER focus_areas_max_active AFTER INSERT OR UPDATE OF status ON focus_areas
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION focus_areas_max_active();

ALTER TABLE observations
  ADD COLUMN domains text[] NOT NULL DEFAULT '{{}}',
  ADD COLUMN attributes jsonb,
  ADD CONSTRAINT observations_domains_chk CHECK (domains <@ {_array(AI_DOMAINS)});
CREATE INDEX observations_domains_gin ON observations USING gin (domains);

ALTER TABLE development_reviews
  ADD COLUMN follow_up jsonb,
  ADD COLUMN ai_suggestion_id uuid REFERENCES ai_suggestions(id);

ALTER TABLE generated_content
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES users(id),
  ADD CONSTRAINT generated_content_soft_delete_chk CHECK (deleted_at IS NULL OR status = 'draft');
CREATE INDEX generated_content_live_idx ON generated_content (child_id, status) WHERE deleted_at IS NULL;
"""

DOWNGRADE = """
DROP TRIGGER IF EXISTS focus_areas_max_active ON focus_areas;
DROP FUNCTION IF EXISTS focus_areas_max_active();
DROP INDEX IF EXISTS generated_content_live_idx;
ALTER TABLE generated_content DROP CONSTRAINT IF EXISTS generated_content_soft_delete_chk;
ALTER TABLE generated_content DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE generated_content DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE development_reviews DROP COLUMN IF EXISTS ai_suggestion_id;
ALTER TABLE development_reviews DROP COLUMN IF EXISTS follow_up;
DROP INDEX IF EXISTS observations_domains_gin;
ALTER TABLE observations DROP CONSTRAINT IF EXISTS observations_domains_chk;
ALTER TABLE observations DROP COLUMN IF EXISTS attributes;
ALTER TABLE observations DROP COLUMN IF EXISTS domains;
DROP INDEX IF EXISTS focus_areas_assessment_idx;
ALTER TABLE focus_areas DROP COLUMN IF EXISTS source_need;
ALTER TABLE focus_areas DROP COLUMN IF EXISTS assessment_id;
ALTER TABLE focus_areas DROP COLUMN IF EXISTS follow_up_on;
DROP TABLE IF EXISTS report_exports;
DROP TABLE IF EXISTS functional_summaries;
DROP FUNCTION IF EXISTS functional_summaries_guard();
DROP TABLE IF EXISTS teacher_assessment_entries;
DROP FUNCTION IF EXISTS teacher_assessment_entries_open();
DROP TABLE IF EXISTS teacher_assessments;
DROP FUNCTION IF EXISTS teacher_assessments_guard();
DROP TABLE IF EXISTS record_versions;
DROP TABLE IF EXISTS ai_suggestions;
DROP FUNCTION IF EXISTS ai_suggestions_guard();
DROP FUNCTION IF EXISTS kidsphere_append_only();
"""

# --------------------------------------------------------------------------- data steps

# observations.area (priority_categories) -> the AI domains; 'other' and NULL stay empty.
AREA_DOMAINS = {
    "emotional": ("emotional",),
    "social": ("social",),
    "language": ("language",),
    "communication": ("communication",),
    "attention": ("executive_function",),
    "motor": ("gross_motor", "fine_motor"),
    "independence": ("independence",),
    "learning": ("cognitive",),
    "transitions": ("daily_routine",),
    "confidence": ("emotional",),
}

DOMAINS_SQL = (
    "UPDATE observations SET domains = CASE area "
    + " ".join(f"WHEN '{area}' THEN {_array(domains)}" for area, domains in AREA_DOMAINS.items())
    + f" END WHERE cardinality(domains) = 0 AND area IN {_in(AREA_DOMAINS)}"
)

# The same keys app/services/history.SNAPSHOT_EXCLUDE drops.
_DROP = "ARRAY['id','child_id','created_by','created_at','updated_at']"

VERSIONS_SQL = [
    f"""
    INSERT INTO record_versions (child_id, entity_type, entity_id, entity_key, seq, data,
                                 changed_by, changed_by_name, changed_role, via, created_at)
    SELECT t.child_id, '{entity_type}', t.id, '', 1, to_jsonb(t) - {_DROP},
           t.created_by, u.name, coalesce(u.role, 'system'), 'backfill', t.updated_at
    FROM {table} t
    LEFT JOIN users u ON u.id = t.created_by
    WHERE {where}
      AND NOT EXISTS (SELECT 1 FROM record_versions rv
                      WHERE rv.entity_type = '{entity_type}' AND rv.entity_id = t.id)
    """
    for entity_type, table, where in (
        ("observation", "observations", "true"),
        ("focus_area", "focus_areas", "true"),
        ("content", "generated_content", "t.status <> 'archived'"),
    )
]

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
STAFF_ROLES = ("admin", "teacher")
ROLES = ("admin", "teacher", "parent")


def _has_data(value) -> bool:
    """True when a JSON value holds an answer (empty strings, lists and objects do not)."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, dict):
        return any(_has_data(v) for v in value.values())
    if isinstance(value, list):
        return any(_has_data(v) for v in value)
    return True  # numbers and booleans are answers


def _stamps(entered, section=None) -> list[dict]:
    if not isinstance(entered, dict):
        return []
    lists = [entered.get(section)] if section is not None else list(entered.values())
    return [s for lst in lists if isinstance(lst, list) for s in lst if isinstance(s, dict)]


def _parse_ts(value) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _user_id(value, users: dict) -> uuid.UUID | None:
    try:
        uid = uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None
    return uid if uid in users else None


def _iso(dt) -> str | None:  # UTC, like the app's stamps
    return dt.astimezone(timezone.utc).isoformat() if dt is not None else None


def _backfill_follow_up_on(bind) -> None:
    rows = bind.execute(sa.text(
        "SELECT id, plan->>'review_on' FROM focus_areas "
        "WHERE follow_up_on IS NULL AND plan->>'review_on' IS NOT NULL"
    )).all()
    for fid, review_on in rows:
        text = review_on.strip()
        if not ISO_DATE.match(text):
            continue
        try:
            day = date.fromisoformat(text)
        except ValueError:
            continue
        bind.execute(sa.text("UPDATE focus_areas SET follow_up_on = :day WHERE id = :id AND follow_up_on IS NULL"),
                     {"day": day, "id": fid})


INSERT_SECTION = sa.text(
    "INSERT INTO record_versions (child_id, entity_type, entity_key, seq, data, changed_by, changed_by_name, "
    "changed_role, reported_by, via, created_at) "
    "VALUES (:child_id, 'profile_section', :key, 1, CAST(:data AS jsonb), :changed_by, :changed_by_name, "
    ":changed_role, :reported_by, 'backfill', :created_at)"
)
ADD_KEYS = {
    "parent": sa.text("UPDATE child_profiles SET parent_perspective = parent_perspective || CAST(:add AS jsonb) "
                      "WHERE id = :id AND jsonb_typeof(parent_perspective) = 'object'"),
    "teacher": sa.text("UPDATE child_profiles SET teacher_perspective = teacher_perspective || CAST(:add AS jsonb) "
                       "WHERE id = :id AND jsonb_typeof(teacher_perspective) = 'object'"),
}


def _questionnaire(doc: dict, sections: dict) -> dict | None:
    """Record metadata for a questionnaire someone already started; None when never started."""
    wizard = doc.get("wizard") if isinstance(doc.get("wizard"), dict) else {}
    completed = wizard.get("completed_at")
    stamps = _stamps(doc.get("entered"))
    if not (completed or stamps or _has_data(sections)):
        return None
    out = {
        "status": "submitted" if completed else "draft",
        "entry_mode": "on_behalf" if any(s.get("role") in STAFF_ROLES for s in stamps) else "self",
        "migrated": True,
    }
    if completed:
        out["submitted_at"] = completed
    return out


def _section_status(doc: dict, sections: dict, updated_at) -> dict:
    out = {}
    for name, value in sections.items():
        if not _has_data(value):
            continue
        stamps = _stamps(doc.get("entered"), name)
        last = stamps[-1] if stamps else {}
        out[name] = {"status": "in_progress", "by": last.get("by"), "at": last.get("at") or _iso(updated_at),
                     "derived": True}
    return out


def _backfill_profiles(bind) -> None:
    users = {row[0]: row[1] for row in bind.execute(sa.text("SELECT id, name FROM users"))}
    done = {(row[0], row[1]) for row in bind.execute(sa.text(
        "SELECT child_id, entity_key FROM record_versions WHERE entity_type = 'profile_section'"))}
    profiles = bind.execute(sa.text(
        "SELECT id, child_id, parent_perspective, teacher_perspective, updated_at FROM child_profiles ORDER BY created_at"
    )).all()
    for pid, child_id, parent_doc, teacher_doc, updated_at in profiles:
        for which, doc in (("parent", parent_doc), ("teacher", teacher_doc)):
            if not isinstance(doc, dict):
                continue
            sections = doc.get("sections") if isinstance(doc.get("sections"), dict) else {}
            for name, value in sections.items():
                key = f"{which}:{name}"
                if (child_id, key) in done:
                    continue
                stamps = _stamps(doc.get("entered"), name)
                last = stamps[-1] if stamps else {}
                role = last.get("role") if last.get("role") in ROLES else "system"
                reported = last.get("reported_by") if last.get("reported_by") in ("parent", "teacher") else which
                bind.execute(INSERT_SECTION, {
                    "child_id": child_id,
                    "key": key,
                    "data": json.dumps(value, ensure_ascii=False),
                    "changed_by": _user_id(last.get("by"), users),
                    "changed_by_name": last.get("by_name") if isinstance(last.get("by_name"), str) else None,
                    "changed_role": role,
                    "reported_by": reported,
                    "created_at": _parse_ts(last.get("at")) or updated_at,
                })
                done.add((child_id, key))
            add = {}
            if which == "parent" and "questionnaire" not in doc:
                questionnaire = _questionnaire(doc, sections)
                if questionnaire is not None:
                    add["questionnaire"] = questionnaire
            if "section_status" not in doc:
                statuses = _section_status(doc, sections, updated_at)
                if statuses:
                    add["section_status"] = statuses
            if add:
                bind.execute(ADD_KEYS[which], {"id": pid, "add": json.dumps(add, ensure_ascii=False)})


def backfill(bind) -> None:
    """Every data step of this revision. Idempotent: running it again changes nothing."""
    bind.execute(sa.text(DOMAINS_SQL))
    _backfill_follow_up_on(bind)
    for sql in VERSIONS_SQL:
        bind.execute(sa.text(sql))
    _backfill_profiles(bind)


# --------------------------------------------------------------------------- alembic


def _statements(sql: str) -> list[str]:
    """Split DDL into single statements (keeps $$-quoted function bodies intact)."""
    out, buf, in_body = [], [], False
    for line in sql.splitlines():
        if not in_body and (not line.strip() or line.strip().startswith("--")):
            continue
        buf.append(line)
        if line.count("$$") % 2:
            in_body = not in_body
        if not in_body and line.rstrip().endswith(";"):
            out.append("\n".join(buf))
            buf = []
    assert not buf and not in_body, "unterminated statement"
    return out


def upgrade() -> None:
    for stmt in _statements(UPGRADE):
        op.execute(stmt)
    backfill(op.get_bind())


def downgrade() -> None:
    for stmt in _statements(DOWNGRADE):
        op.execute(stmt)
