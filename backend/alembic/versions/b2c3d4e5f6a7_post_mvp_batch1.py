"""post_mvp_batch1: cache pricing, max_input_tokens, tpm/concurrency limits, cached token columns

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- models: max context window + cache pricing ---
    op.add_column("models", sa.Column("max_input_tokens", sa.Integer(), nullable=True))
    op.add_column(
        "models",
        sa.Column("cache_write_price", sa.Numeric(precision=18, scale=8), nullable=True),
    )
    op.add_column(
        "models",
        sa.Column("cache_read_price", sa.Numeric(precision=18, scale=8), nullable=True),
    )

    # --- api_keys: TPM limit + concurrency cap ---
    op.add_column("api_keys", sa.Column("rate_limit_tpm", sa.Integer(), nullable=True))
    op.add_column("api_keys", sa.Column("max_concurrent_requests", sa.Integer(), nullable=True))

    # --- request_logs: cached token accounting ---
    op.add_column("request_logs", sa.Column("prompt_cached_tokens", sa.Integer(), nullable=True))
    op.add_column(
        "request_logs",
        sa.Column("prompt_cache_creation_tokens", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("request_logs", "prompt_cache_creation_tokens")
    op.drop_column("request_logs", "prompt_cached_tokens")

    op.drop_column("api_keys", "max_concurrent_requests")
    op.drop_column("api_keys", "rate_limit_tpm")

    op.drop_column("models", "cache_read_price")
    op.drop_column("models", "cache_write_price")
    op.drop_column("models", "max_input_tokens")
