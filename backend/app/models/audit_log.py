from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class AuditLog(Base):
    """Admin-action audit trail.

    One row per mutating admin action. `before` and `after` capture the
    relevant slice of state (not the full row) so the log is readable.
    Written in the SAME DB transaction as the change it records.
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # e.g. "user.recharge", "user.disable", "user.update", "model.update",
    # "model.disable", "provider.update", "key.revoke_other"
    target_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
