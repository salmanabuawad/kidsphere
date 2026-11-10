"""Family questionnaires: a parent's short questionnaire at the start (baseline) and the end of a
family journey (app/data/pilot_questionnaire.json).

Hand-written DDL, like 0001-0013. app/models.py mirrors it. Additive.

- ``family_questionnaires``: one row per answer set: the enrolment, ``kind`` baseline|end, the
  answers ``{question_key: option_key}`` (descriptive, never scored) and who answered. A new answer
  set replaces nothing: the newest of each kind counts. Deleted with the enrolment or the child.
  Never sent to the AI.

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-10
"""
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE family_questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id uuid NOT NULL REFERENCES family_enrolments(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('baseline','end')),
  answers jsonb NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("CREATE INDEX family_questionnaires_enrolment_idx ON family_questionnaires (enrolment_id, kind, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS family_questionnaires")
