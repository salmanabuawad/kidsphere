"""Admin settings: one ``app_settings`` table (key -> JSON value).

Hand-written DDL (no autogenerate), like 0001 and 0002. app/models.py mirrors it.
Additive only: one new table, nothing existing changes. The downgrade drops only it.

- ``app_settings``: ``key`` text primary key (a section: general, ai, reports),
  ``value`` jsonb NOT NULL, ``updated_by`` (the admin who saved it) and ``updated_at``.
  Read and written only through ``app/services/settings.py``, which fills in the
  typed defaults for anything missing. The AI section may hold the Anthropic API
  key; no API ever returns it.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-06
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app_settings")
