"""Family and home: parent-child home activities and parents' home reflections.

Hand-written DDL (no autogenerate), like 0001-0009. app/models.py mirrors it. Additive, except that
the generated_content content_type CHECK is widened; the downgrade deletes the home activities and
puts the original CHECK back.

- ``generated_content.content_type`` also allows 'home_activity': a short activity a parent does
  with the child at home (draft -> teacher approval -> shared with the parent, like any content).
- ``home_reflections``: a parent's "How did it go at home?" on content shared with them
  (result worked_well|partly|did_not_work, optional short note). Parent-reported, never an
  observation, never sent to the AI. Deleted with the content or the child.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-10
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE generated_content DROP CONSTRAINT generated_content_content_type_check")
    op.execute("ALTER TABLE generated_content ADD CONSTRAINT generated_content_content_type_check "
               "CHECK (content_type IN ('story','video','digital_game','real_world_activity','home_activity'))")
    op.execute("""
CREATE TABLE home_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES generated_content(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('worked_well','partly','did_not_work')),
  note text CHECK (note IS NULL OR length(note) BETWEEN 1 AND 1000),
  client_request_id text CHECK (client_request_id IS NULL OR length(client_request_id) BETWEEN 1 AND 100),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("CREATE INDEX home_reflections_child_idx ON home_reflections (child_id, created_at DESC)")
    op.execute("CREATE INDEX home_reflections_content_idx ON home_reflections (content_id, created_at DESC)")
    op.execute("CREATE UNIQUE INDEX home_reflections_request_uq ON home_reflections (created_by, client_request_id) "
               "WHERE client_request_id IS NOT NULL")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS home_reflections")
    op.execute("DELETE FROM generated_content WHERE content_type = 'home_activity'")
    op.execute("ALTER TABLE generated_content DROP CONSTRAINT generated_content_content_type_check")
    op.execute("ALTER TABLE generated_content ADD CONSTRAINT generated_content_content_type_check "
               "CHECK (content_type IN ('story','video','digital_game','real_world_activity'))")
