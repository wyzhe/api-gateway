from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    monthly_limit: Decimal | None = Field(default=None, ge=Decimal("0"))
    rate_limit_rpm: int | None = Field(default=None, ge=1)
    rate_limit_tpm: int | None = Field(default=None, ge=1)
    max_concurrent_requests: int | None = Field(default=None, ge=1)


class ApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    # All limit fields below are tri-state: omitted = unchanged, null = remove
    # cap (use default), number = set. Pydantic's `exclude_unset` upstream
    # preserves the distinction.
    monthly_limit: Decimal | None = Field(default=None, ge=Decimal("0"))
    rate_limit_rpm: int | None = Field(default=None, ge=1)
    rate_limit_tpm: int | None = Field(default=None, ge=1)
    max_concurrent_requests: int | None = Field(default=None, ge=1)


class ApiKeyOut(BaseModel):
    id: int
    name: str
    key_prefix: str
    status: str
    monthly_limit: Decimal | None
    rate_limit_rpm: int | None = None
    rate_limit_tpm: int | None = None
    max_concurrent_requests: int | None = None
    mtd_cost: Decimal = Decimal("0")
    last_used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiKeyCreatedOut(ApiKeyOut):
    """Only returned once at creation time — includes the full plaintext key."""
    key: str
