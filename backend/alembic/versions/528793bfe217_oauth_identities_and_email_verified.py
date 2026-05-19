"""oauth_identities_and_email_verified

Revision ID: 528793bfe217
Revises: b2c3d4e5f6a7
Create Date: 2026-05-19 16:08:23.043006

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '528793bfe217'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'oauth_identities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=16), nullable=False),
        sa.Column('provider_subject', sa.String(length=255), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'provider', 'provider_subject', name='uq_oauth_provider_subject'
        ),
    )
    op.create_index(
        op.f('ix_oauth_identities_user_id'),
        'oauth_identities',
        ['user_id'],
        unique=False,
    )
    op.create_index(
        'ix_oauth_user_provider',
        'oauth_identities',
        ['user_id', 'provider'],
        unique=False,
    )
    op.add_column(
        'users',
        sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column(
        'users',
        'password_hash',
        existing_type=sa.VARCHAR(length=255),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'users',
        'password_hash',
        existing_type=sa.VARCHAR(length=255),
        nullable=False,
    )
    op.drop_column('users', 'email_verified_at')
    op.drop_index('ix_oauth_user_provider', table_name='oauth_identities')
    op.drop_index(
        op.f('ix_oauth_identities_user_id'), table_name='oauth_identities'
    )
    op.drop_table('oauth_identities')
