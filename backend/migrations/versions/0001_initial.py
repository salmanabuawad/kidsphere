"""Initial schema: the 14 MVP tables, CHECKs, indexes and the immutable-baseline trigger.

Hand-written DDL (no autogenerate). app/models.py mirrors it.

Revision ID: 0001
Revises:
Create Date: 2026-10-05
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SUPPORT = "('independent','some_support','significant_support','not_observed')"

UPGRADE = f"""
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 2 AND 200),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','teacher','parent')),
  language text NOT NULL DEFAULT 'ar' CHECK (language IN ('ar','he','en')),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kindergarten text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kindergarten, name)
);

CREATE TABLE class_teachers (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, user_id)
);
CREATE INDEX class_teachers_user_id_idx ON class_teachers (user_id);

CREATE TABLE children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  preferred_name text,
  birth_date date NOT NULL,
  gender text CHECK (gender IN ('girl','boy','unspecified')),
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  main_language text NOT NULL,
  additional_languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  photo_path text,
  parent_name text,
  parent_contact text,
  archived_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX children_class_id_active_idx ON children (class_id) WHERE archived_at IS NULL;

CREATE TABLE child_parents (
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, user_id)
);
CREATE INDEX child_parents_user_id_idx ON child_parents (user_id);

CREATE TABLE child_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL UNIQUE REFERENCES children(id) ON DELETE CASCADE,
  parent_perspective jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  teacher_perspective jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  motivators jsonb NOT NULL DEFAULT '[]'::jsonb,
  what_helps jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensitivities jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_understanding jsonb,
  wizard_step smallint NOT NULL DEFAULT 1 CHECK (wizard_step >= 1),
  wizard_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  baseline_data jsonb NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX baselines_child_id_idx ON baselines (child_id, created_at);

-- Baselines are history: never updated, and deleted only together with their child.
CREATE FUNCTION baselines_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'baselines are immutable; insert a new baseline instead';
  END IF;
  IF EXISTS (SELECT 1 FROM children WHERE id = OLD.child_id) THEN
    RAISE EXCEPTION 'baselines can only be deleted together with their child';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER baselines_immutable BEFORE UPDATE OR DELETE ON baselines
  FOR EACH ROW EXECUTE FUNCTION baselines_immutable();

CREATE TABLE focus_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  category text NOT NULL,
  suggestion_key text,
  title text NOT NULL,
  description text,
  plan jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  close_reason text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX focus_areas_child_id_idx ON focus_areas (child_id);
CREATE INDEX focus_areas_active_idx ON focus_areas (child_id) WHERE status = 'active';

CREATE TABLE generated_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  focus_area_id uuid REFERENCES focus_areas(id) ON DELETE SET NULL,
  pack_id uuid,
  mode text NOT NULL CHECK (mode IN ('strength_builder','growth_support')),
  content_type text NOT NULL CHECK (content_type IN ('story','video','digital_game','real_world_activity')),
  language text NOT NULL CHECK (language IN ('ar','he','en')),
  title text NOT NULL,
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','completed','archived')),
  shared_with_parent boolean NOT NULL DEFAULT false,
  generation_input jsonb NOT NULL,
  ai_provider text NOT NULL,
  ai_model text,
  is_template boolean NOT NULL,
  variant integer NOT NULL DEFAULT 0 CHECK (variant >= 0),
  video_status text CHECK (video_status IN ('script_ready','generating','ready','failed')),
  video_provider text,
  video_external_job_id text,
  video_url text,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generated_content_child_status_idx ON generated_content (child_id, status);
CREATE INDEX generated_content_pack_id_idx ON generated_content (pack_id) WHERE pack_id IS NOT NULL;

CREATE TABLE observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  focus_area_id uuid REFERENCES focus_areas(id) ON DELETE SET NULL,
  content_id uuid REFERENCES generated_content(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'quick' CHECK (source IN ('quick','content_feedback')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  area text,
  context text,
  observation text CHECK (observation IS NULL OR length(observation) BETWEEN 1 AND 4000),
  support_level text CHECK (support_level IN {SUPPORT}),
  what_helped jsonb,
  note text,
  details jsonb,
  client_request_id text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT observations_text_required CHECK (source = 'content_feedback' OR observation IS NOT NULL),
  CONSTRAINT observations_client_request_uq UNIQUE (created_by, client_request_id)
);
CREATE INDEX observations_child_observed_idx ON observations (child_id, observed_at DESC);
CREATE INDEX observations_focus_area_idx ON observations (focus_area_id) WHERE focus_area_id IS NOT NULL;

CREATE TABLE content_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES generated_content(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('worked_well','partly','did_not_work')),
  support_level text CHECK (support_level IN {SUPPORT}),
  observation text CHECK (observation IS NULL OR length(observation) <= 4000),
  what_helped jsonb,
  observation_id uuid REFERENCES observations(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_feedback_content_id_idx ON content_feedback (content_id);
CREATE INDEX content_feedback_child_id_idx ON content_feedback (child_id, created_at);

CREATE TABLE development_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  review_date date NOT NULL DEFAULT current_date,
  summary text NOT NULL,
  focus_review jsonb NOT NULL DEFAULT '[]'::jsonb,
  baseline_validation jsonb NOT NULL DEFAULT '[]'::jsonb,
  understanding jsonb NOT NULL,
  ai_suggested boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX development_reviews_child_idx ON development_reviews (child_id, created_at);

-- No foreign keys: audit rows outlive what they describe.
CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  object_type text,
  object_id uuid,
  child_id uuid,
  metadata jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_child_idx ON audit_log (child_id, created_at);
CREATE INDEX audit_log_action_idx ON audit_log (action, created_at);
"""

DOWNGRADE = """
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS development_reviews;
DROP TABLE IF EXISTS content_feedback;
DROP TABLE IF EXISTS observations;
DROP TABLE IF EXISTS generated_content;
DROP TABLE IF EXISTS focus_areas;
DROP TABLE IF EXISTS baselines;
DROP FUNCTION IF EXISTS baselines_immutable();
DROP TABLE IF EXISTS child_profiles;
DROP TABLE IF EXISTS child_parents;
DROP TABLE IF EXISTS children;
DROP TABLE IF EXISTS class_teachers;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
"""


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


def downgrade() -> None:
    for stmt in _statements(DOWNGRADE):
        op.execute(stmt)
