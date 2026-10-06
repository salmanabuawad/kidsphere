"""People in the child's life: one ``child_people`` table and ``generated_content.people``.

Hand-written DDL (no autogenerate), like 0001-0003. app/models.py mirrors it.
Additive only: one new table and one new column with a default. The downgrade
drops only them (uploaded photo files of people stay in UPLOAD_DIR/people).

- ``child_people``: someone a story, game or video may include (grandfather,
  sister, a friend, a pet). ``relation`` is a ``person_relations`` vocabulary key
  (validated by app.vocab, like every vocabulary key), ``display_name`` what the
  child calls them (1-40 characters), ``photo_path`` an optional photo stored like
  the child photo. Deleted with the child.
- ``generated_content.people``: ``[{token, person_id, relation}]``, the people in
  that content. The AI sees only the token and the relation.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-06
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE child_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  relation text NOT NULL,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 40),
  photo_path text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("CREATE INDEX child_people_child_idx ON child_people (child_id, created_at)")
    op.execute("ALTER TABLE generated_content ADD COLUMN people jsonb NOT NULL DEFAULT '[]'::jsonb")


def downgrade() -> None:
    op.execute("ALTER TABLE generated_content DROP COLUMN IF EXISTS people")
    op.execute("DROP TABLE IF EXISTS child_people")
