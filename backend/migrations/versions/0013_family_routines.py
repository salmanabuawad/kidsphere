"""Family routines: picture schedules for a part of the day (morning, bedtime, arrival ...).

Hand-written DDL, like 0001-0012. app/models.py mirrors it. Additive.

- ``family_routines``: a child's routine, a title and 2-12 steps ``[{emoji, label}]``. Made by the
  child's parents or staff (``created_by_role``); presets live in app/data/routines.json. Never
  sent to the AI. Deleted with the child.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-10
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE family_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id),
  created_by_role text NOT NULL CHECK (created_by_role IN ('parent','teacher','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("CREATE INDEX family_routines_child_idx ON family_routines (child_id, created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS family_routines")
