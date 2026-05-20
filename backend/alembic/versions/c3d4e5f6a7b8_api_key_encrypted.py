"""api_key_encrypted

Revision ID: c3d4e5f6a7b8
Revises: 528793bfe217
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = '528793bfe217'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('api_keys', sa.Column('key_encrypted', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('api_keys', 'key_encrypted')
