from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    display_name: str | None = None
    role: str = Field(default="user", pattern="^(user|admin)$")
    initial_balance: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))


class AdminUserUpdate(BaseModel):
    display_name: str | None = None
    role: str | None = Field(default=None, pattern="^(user|admin)$")
    password: str | None = Field(default=None, min_length=6, max_length=128)


class AdminUserOut(BaseModel):
    id: int
    email: EmailStr
    display_name: str | None
    role: str
    status: str
    balance: Decimal
    email_verified_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
