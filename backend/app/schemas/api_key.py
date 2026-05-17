from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    monthly_limit: Decimal | None = None


class ApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    monthly_limit: Decimal | None = None


class ApiKeyOut(BaseModel):
    id: int
    name: str
    key_prefix: str
    status: str
    monthly_limit: Decimal | None
    last_used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiKeyCreatedOut(ApiKeyOut):
    """Only returned once at creation time — includes the full plaintext key."""
    key: str
