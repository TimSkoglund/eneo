"""add edited_answer to questions

Revision ID: 7919c02426e7
Revises: 20251119_e5_berget
Create Date: 2025-12-12 10:49:57.475080
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7919c02426e7"
down_revision = "20251119_e5_berget"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ✅ NYTT: lägg till kolumnen som ska spara redigerade svar
    op.add_column("questions", sa.Column("edited_answer", sa.Text(), nullable=True))


def downgrade() -> None:
    # ✅ NYTT: ta bort kolumnen om vi backar migrationen
    op.drop_column("questions", "edited_answer")
