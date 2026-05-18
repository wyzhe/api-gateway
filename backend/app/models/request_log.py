from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class RequestLog(Base):
    __tablename__ = "request_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    api_key_id: Mapped[int | None] = mapped_column(
        ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True
    )
    provider_id: Mapped[int | None] = mapped_column(
        ForeignKey("providers.id", ondelete="SET NULL"), nullable=True
    )
    model_id: Mapped[int | None] = mapped_column(
        ForeignKey("models.id", ondelete="SET NULL"), nullable=True, index=True
    )
    request_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # text | image | video
    upstream_model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    # success | failed | running | queued
    task_status: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    # queued | running | succeeded | failed

    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    video_duration: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    cost: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False, default=Decimal("0"))
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    upstream_request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_payload_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    response_payload_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    asset_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Snapshot of the model's pricing parameters at the moment this log was charged.
    # Format: {"pricing_mode": "...", "input_price": "...", "output_price": "...", ...}
    # All numeric values stored as strings (Decimal-safe).
    unit_price_snapshot_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Where the token/usage numbers came from: "upstream" | "estimated" | "missing".
    # estimated = pessimistic tiktoken-based fallback for streaming chats that
    # didn't return a usage block. Worker may later reconcile.
    usage_source: Mapped[str | None] = mapped_column(String(16), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
