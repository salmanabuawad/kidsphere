"""Family programs: a structured journey of weekly topics for families (e.g. eight weeks of
"Roots of Resilience"), enrolments per child and the parent's weekly reflection.

Hand-written DDL, like 0001-0011. app/models.py mirrors it. Additive. The upgrade loads
"Roots of Resilience" from ``0012_family_programs_seed.json`` (8 weeks, en/ar/he) as published.

- ``family_programs``: title, description and weeks as {en, ar, he} texts. Each week is
  {content_type, topic, lesson, try_at_home, reflection}. Managed by admins; never deleted
  (archive instead).
- ``family_enrolments``: a child in a program from ``started_on`` (the current week is derived
  from the date). At most one active enrolment per child and program. Deleted with the child.
- ``family_week_reflections``: one row per save for a week: a parent's reflection (result + optional
  note) or the teacher's short guidance for the family (a note). Never sent to the AI.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-10
"""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

SEED_FILE = Path(__file__).with_name("0012_family_programs_seed.json")


def upgrade() -> None:
    op.execute("""
CREATE TABLE family_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title jsonb NOT NULL,
  description jsonb,
  weeks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("""
CREATE TABLE family_enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES family_programs(id),
  started_on date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','stopped')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("CREATE UNIQUE INDEX family_enrolments_active_uq ON family_enrolments (child_id, program_id) "
               "WHERE status = 'active'")
    op.execute("""
CREATE TABLE family_week_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id uuid NOT NULL REFERENCES family_enrolments(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  week smallint NOT NULL CHECK (week BETWEEN 1 AND 12),
  author_role text NOT NULL CHECK (author_role IN ('parent','teacher')),
  result text CHECK (result IN ('worked_well','partly','did_not_work')),
  note text CHECK (note IS NULL OR length(note) BETWEEN 1 AND 1000),
  CHECK (result IS NOT NULL OR note IS NOT NULL),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("CREATE INDEX family_week_reflections_enrolment_idx ON family_week_reflections (enrolment_id, week)")
    seed(op.get_bind())


def seed(conn) -> None:
    """Insert "Roots of Resilience" (published)."""
    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    conn.execute(sa.text(
        "INSERT INTO family_programs (title, description, weeks, status) "
        "VALUES (CAST(:title AS jsonb), CAST(:description AS jsonb), CAST(:weeks AS jsonb), 'published')"
    ), {k: json.dumps(data[k], ensure_ascii=False) for k in ("title", "description", "weeks")})


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS family_week_reflections")
    op.execute("DROP TABLE IF EXISTS family_enrolments")
    op.execute("DROP TABLE IF EXISTS family_programs")
