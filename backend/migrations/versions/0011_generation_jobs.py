"""Generation jobs: content generation that runs after the response (local AI can be slow).

Hand-written DDL, like 0001-0010. app/models.py mirrors it. Additive.

- ``generation_jobs``: one content request (the GenerateIn body), its status
  pending|running|done|failed, the ids it produced (``result``) and an error code. Runs inside the
  API process, one at a time (services/generation_jobs.py): no queue service, no worker.
  Deleted with the child.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-10
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  request jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  result jsonb,
  error_code text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
)
""")
    op.execute("CREATE INDEX generation_jobs_child_idx ON generation_jobs (child_id, created_at DESC)")
    op.execute("CREATE INDEX generation_jobs_open_idx ON generation_jobs (status) WHERE status IN ('pending','running')")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS generation_jobs")
