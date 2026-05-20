from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class ModelOut(BaseModel):
    model_config = {"from_attributes": True, "protected_namespaces": ()}

    id: int
    public_name: str
    upstream_model: str
    provider_id: int
    provider_name: str | None = None
    display_provider: str | None
    type: str
    display_name: str | None
    description: str | None
    status: str
    visible: bool
    capabilities: dict[str, Any] | None
    max_input_tokens: int | None = None
    pricing_mode: str
    input_price: Decimal | None
    output_price: Decimal | None
    cache_write_price: Decimal | None = None
    cache_read_price: Decimal | None = None
    image_price: Decimal | None
    video_second_price: Decimal | None
    generation_price: Decimal | None
    price_markup: Decimal
    created_at: datetime


class ModelCreate(BaseModel):
    model_config = {"protected_namespaces": ()}

    public_name: str = Field(min_length=1, max_length=120)
    upstream_model: str = Field(min_length=1, max_length=120)
    provider_id: int
    type: str = Field(pattern="^(text|image|video|multimodal)$")
    display_name: str | None = None
    description: str | None = None
    status: str = Field(default="active", pattern="^(active|disabled)$")
    visible: bool = True
    capabilities: dict[str, Any] | None = None
    max_input_tokens: int | None = Field(default=None, ge=1)
    display_provider: str | None = None
    pricing_mode: str = Field(pattern="^(per_token|per_image|per_second|per_generation)$")
    input_price: Decimal | None = None
    output_price: Decimal | None = None
    cache_write_price: Decimal | None = Field(default=None, ge=Decimal("0"))
    cache_read_price: Decimal | None = Field(default=None, ge=Decimal("0"))
    image_price: Decimal | None = None
    video_second_price: Decimal | None = None
    generation_price: Decimal | None = None
    price_markup: Decimal = Field(default=Decimal("1"), gt=0)


class ModelUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}

    public_name: str | None = None
    upstream_model: str | None = None
    provider_id: int | None = None
    type: str | None = Field(default=None, pattern="^(text|image|video|multimodal)$")
    display_name: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(active|disabled)$")
    visible: bool | None = None
    capabilities: dict[str, Any] | None = None
    max_input_tokens: int | None = Field(default=None, ge=1)
    display_provider: str | None = None
    pricing_mode: str | None = Field(default=None, pattern="^(per_token|per_image|per_second|per_generation)$")
    input_price: Decimal | None = None
    output_price: Decimal | None = None
    cache_write_price: Decimal | None = Field(default=None, ge=Decimal("0"))
    cache_read_price: Decimal | None = Field(default=None, ge=Decimal("0"))
    image_price: Decimal | None = None
    video_second_price: Decimal | None = None
    generation_price: Decimal | None = None
    price_markup: Decimal | None = Field(default=None, gt=0)
