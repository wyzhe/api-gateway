from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_expires_in: int  # seconds
    user: "UserOut"


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=8)


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_expires_in: int


class UserOut(BaseModel):
    id: int
    email: EmailStr
    display_name: str | None
    role: str
    status: str
    balance: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


LoginResponse.model_rebuild()
