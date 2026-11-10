"""Class sessions: a teacher runs a library item (or any group activity) with children of a class,
then notes how each child did; the notes are observations (``source = 'session'``).

Hand-written DDL (no autogenerate), like 0001-0008. app/models.py mirrors it. Additive, except
that two observation CHECKs are widened; the downgrade drops the new objects, deletes the session
observations and puts the original CHECKs back.

- ``class_sessions``: class, the library item (NULL when none), title, the day it was held.
  Deleted with the class.
- ``class_session_children``: who took part. Deleted with the session or the child.
- ``observations.session_id``: the session an observation belongs to (one per child and session).
  ``observations.source`` also allows 'session', whose text is optional like content feedback.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-27
"""
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  library_item_id uuid REFERENCES library_items(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  held_on date NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("CREATE INDEX class_sessions_class_idx ON class_sessions (class_id, held_on DESC)")
    op.execute("""
CREATE TABLE class_session_children (
  session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, child_id)
)
""")
    op.execute("ALTER TABLE observations ADD COLUMN session_id uuid REFERENCES class_sessions(id) ON DELETE SET NULL")
    op.execute("CREATE UNIQUE INDEX observations_session_child_uq ON observations (session_id, child_id) WHERE session_id IS NOT NULL")
    op.execute("ALTER TABLE observations DROP CONSTRAINT observations_source_check")
    op.execute("ALTER TABLE observations ADD CONSTRAINT observations_source_check "
               "CHECK (source IN ('quick','content_feedback','session'))")
    op.execute("ALTER TABLE observations DROP CONSTRAINT observations_text_required")
    op.execute("ALTER TABLE observations ADD CONSTRAINT observations_text_required "
               "CHECK (source IN ('content_feedback','session') OR observation IS NOT NULL)")


def downgrade() -> None:
    op.execute("DELETE FROM observations WHERE source = 'session'")
    op.execute("ALTER TABLE observations DROP CONSTRAINT observations_text_required")
    op.execute("ALTER TABLE observations ADD CONSTRAINT observations_text_required "
               "CHECK (source = 'content_feedback' OR observation IS NOT NULL)")
    op.execute("ALTER TABLE observations DROP CONSTRAINT observations_source_check")
    op.execute("ALTER TABLE observations ADD CONSTRAINT observations_source_check "
               "CHECK (source IN ('quick','content_feedback'))")
    op.execute("DROP INDEX IF EXISTS observations_session_child_uq")
    op.execute("ALTER TABLE observations DROP COLUMN IF EXISTS session_id")
    op.execute("DROP TABLE IF EXISTS class_session_children")
    op.execute("DROP TABLE IF EXISTS class_sessions")
