"""Library media: pictures, clips, narration and music attached to library items.

Hand-written DDL (no autogenerate), like 0001-0007. app/models.py mirrors it. Additive only;
the downgrade drops only these objects (files under UPLOAD_DIR/library stay).

- ``library_items.goals``: what an item builds, ``[{key}|{custom}]`` with focus_suggestions keys.
- ``library_items.suits``: which children it suits, ``[{list, key}|{custom}]`` with keys of the
  profile lists in services/library.SUITS_LISTS (positive, everyday wording only). The upgrade
  fills both for the Lulu items (``seed(conn)``).

- ``library_media``: one file per (item, slot). Slots: ``cover`` (image), ``music`` (audio),
  ``page:N`` (story page picture), ``narration:N`` (story page audio), ``step:N`` (activity step
  picture or clip). ``path`` is relative to UPLOAD_DIR and never sent to clients; files are served
  by GET /api/library/media/{id} after the access check. ``alt`` and ``credit`` (source and
  licence) are free text written by an admin, never about a child.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-27
"""
import json

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE library_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES library_items(id),
  slot text NOT NULL CHECK (slot ~ '^(cover|music|page:[0-9]{1,2}|narration:[0-9]{1,2}|step:[0-9]{1,2})$'),
  kind text NOT NULL CHECK (kind IN ('image','audio','video')),
  path text NOT NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  alt text CHECK (length(alt) <= 300),
  credit text CHECK (length(credit) <= 300),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, slot)
)
""")
    op.execute("ALTER TABLE library_items ADD COLUMN goals jsonb NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE library_items ADD COLUMN suits jsonb NOT NULL DEFAULT '[]'::jsonb")
    seed(op.get_bind())


# The Lulu collections (0007): what they build and which children they suit.
SEED = {
    "لولو والغيمة الصغيرة": (
        [{"key": "calming_after_frustration"}, {"key": "asking_for_help"}],
        [{"list": "describe_words", "key": "shy_at_first"}, {"list": "morning_separation", "key": "needs_time"},
         {"list": "transition_reactions", "key": "needs_preparation"}],
    ),
    "لولو والسرّ السحري للقوة الداخلية": (
        [{"key": "coping_with_mistakes"}, {"key": "asking_for_help"}, {"key": "joining_group_play"}],
        [{"list": "social", "key": "needs_adult_support_to_join"}, {"list": "social", "key": "often_plays_independently"},
         {"list": "frustration_reactions", "key": "moves_away"}],
    ),
}


def seed(conn) -> None:
    """Goals and suits of the Lulu items, by collection title."""
    for title, (goals, suits) in SEED.items():
        conn.execute(sa.text(
            "UPDATE library_items SET goals = CAST(:goals AS jsonb), suits = CAST(:suits AS jsonb) "
            "WHERE collection_id IN (SELECT id FROM library_collections WHERE title = :title)"
        ), {"goals": json.dumps(goals), "suits": json.dumps(suits), "title": title})


def downgrade() -> None:
    op.execute("ALTER TABLE library_items DROP COLUMN IF EXISTS suits")
    op.execute("ALTER TABLE library_items DROP COLUMN IF EXISTS goals")
    op.execute("DROP TABLE IF EXISTS library_media")
