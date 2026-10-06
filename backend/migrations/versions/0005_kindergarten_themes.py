"""Kindergarten themes: one ``kindergarten_themes`` table.

Hand-written DDL (no autogenerate), like 0001-0004. app/models.py mirrors it.
Additive only: one new table. The downgrade drops only it.

- ``kindergarten_themes``: ``kindergarten`` text primary key (the name shared by
  ``classes.kindergarten``), ``theme`` (a ``kindergarten_themes`` vocabulary key,
  validated by app.vocab), ``updated_by`` (the admin) and ``updated_at``. A
  kindergarten without a row uses the default look.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-06
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE kindergarten_themes (
  kindergarten text PRIMARY KEY CHECK (length(kindergarten) BETWEEN 1 AND 200),
  theme text NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS kindergarten_themes")
