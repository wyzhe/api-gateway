"""trim text log payloads

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # One-time backfill: text request logs no longer store request/response
    # payloads. Clear them from existing rows so the table stops carrying
    # historical prompt/answer text. Batched via autocommit_block so a large
    # request_logs table is not locked for the whole migration.
    batch = sa.text(
        """
        UPDATE request_logs
        SET request_payload_json = NULL, response_payload_json = NULL
        WHERE id IN (
            SELECT id FROM request_logs
            WHERE request_type = 'text'
              AND (request_payload_json IS NOT NULL
                   OR response_payload_json IS NOT NULL)
            LIMIT 5000
        )
        """
    )
    with op.get_context().autocommit_block():
        conn = op.get_bind()
        while conn.execute(batch).rowcount:
            pass


def downgrade() -> None:
    # Irreversible: the historical payloads have been permanently deleted.
    pass
