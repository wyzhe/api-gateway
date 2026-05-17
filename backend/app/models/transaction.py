from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class BalanceTransaction(Base):
    __tablename__ = "balance_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False)  # recharge | debit | refund | adjustment
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    balance_before: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    request_log_id: Mapped[int | None] = mapped_column(
        ForeignKey("request_logs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
