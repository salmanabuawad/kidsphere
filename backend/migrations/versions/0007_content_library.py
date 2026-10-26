"""Content library: collections and items of ready-made content that admins manage and staff
give to children as drafts.

Hand-written DDL (no autogenerate), like 0001-0006. app/models.py mirrors it. Additive only;
the downgrade drops only these tables.

- ``library_collections``: a named set (title, description, ages), ordered by ``sort_order``,
  draft | published | archived.
- ``library_items``: one story, activity, game or video plan of a collection (``content`` has
  the same shape as ``generated_content.content``), its language, the character name that
  becomes each child's name (``hero``), who it is for (``audience`` child | group), the mode
  and target strength the drafts get, draft | published | archived. Never deleted.

The upgrade loads the Lulu collections from ``0007_library_seed.json`` as published
(``seed(conn)``; the tests call it too, after their per-test TRUNCATE).

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-27
"""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

SEED_FILE = Path(__file__).with_name("0007_library_seed.json")
SEED_HERO = "لولو"


def upgrade() -> None:
    op.execute("""
CREATE TABLE library_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description text CHECK (length(description) <= 500),
  ages text CHECK (length(ages) <= 80),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("""
CREATE TABLE library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES library_collections(id),
  content_type text NOT NULL CHECK (content_type IN ('story','video','digital_game','real_world_activity')),
  language text NOT NULL CHECK (language IN ('ar','he','en')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  content jsonb NOT NULL,
  hero text CHECK (length(hero) BETWEEN 1 AND 40),
  audience text NOT NULL DEFAULT 'child' CHECK (audience IN ('child','group')),
  mode text NOT NULL DEFAULT 'strength_builder' CHECK (mode IN ('strength_builder','growth_support')),
  target_strength text CHECK (target_strength ~ '^[a-z0-9_]{1,40}$'),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""")
    op.execute("CREATE INDEX library_items_collection_idx ON library_items (collection_id, sort_order)")
    seed(op.get_bind())


def seed(conn) -> None:
    """Insert the Lulu collections and items (published)."""
    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    ids = {}
    for order, c in enumerate(data["collections"]):
        ids[c["key"]] = conn.execute(sa.text(
            "INSERT INTO library_collections (title, ages, sort_order, status) "
            "VALUES (:title, :ages, :sort_order, 'published') RETURNING id"
        ), {"title": c["title"], "ages": c.get("ages"), "sort_order": order}).scalar_one()
    for order, item in enumerate(data["items"]):
        conn.execute(sa.text(
            "INSERT INTO library_items (collection_id, content_type, language, title, content, hero, audience, mode, "
            "target_strength, sort_order, status) VALUES (:collection_id, :content_type, 'ar', :title, "
            "CAST(:content AS jsonb), :hero, :audience, :mode, :target_strength, :sort_order, 'published')"
        ), {
            "collection_id": ids[item["collection"]],
            "content_type": item["content_type"],
            "title": item["content"]["title"],
            "content": json.dumps(item["content"], ensure_ascii=False),
            "hero": SEED_HERO,
            "audience": "group" if item["content_type"] == "real_world_activity" else "child",
            "mode": item["mode"],
            "target_strength": item.get("target_strength"),
            "sort_order": order,
        })


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS library_items")
    op.execute("DROP TABLE IF EXISTS library_collections")
