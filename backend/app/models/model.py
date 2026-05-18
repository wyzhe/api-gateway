from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ModelRow(Base):
    __tablename__ = "models"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    upstream_model: Mapped[str] = mapped_column(String(120), nullable=False)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False)  # text | image | video | multimodal
    display_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active | disabled
    visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    capabilities: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    max_input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pricing_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    # per_token | per_image | per_second | per_generation
    input_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    output_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    image_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    video_second_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    generation_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    # Cache pricing per Anthropic and OpenAI conventions, expressed per 1M tokens
    # to match input_price / output_price denomination (both are per 1M tokens).
    # - cache_write_price: price per 1M tokens written to prompt cache (Anthropic only)
    # - cache_read_price: price per 1M tokens served from prompt cache (Anthropic + OpenAI cached_tokens)
    cache_write_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    cache_read_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    # Display-only tag for the provider color in the UI (openai/anthropic/gemini/xai/veo/apimart...).
    # Lets us keep multi-color provider tags in the UI while every model still routes through APIMart.
    display_provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
