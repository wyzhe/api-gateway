from datetime import datetime
from decimal import Decimal
from typing import Any

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
    has_password: bool
    email_verified_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj: Any, *args, **kwargs):
        if hasattr(obj, "password_hash"):
            data = {
                "id": obj.id,
                "email": obj.email,
                "display_name": obj.display_name,
                "role": obj.role,
                "status": obj.status,
                "balance": obj.balance,
                "has_password": obj.password_hash is not None,
                "email_verified_at": obj.email_verified_at,
                "created_at": obj.created_at,
            }
            return super().model_validate(data, *args, **kwargs)
        return super().model_validate(obj, *args, **kwargs)


class PasswordChangeRequest(BaseModel):
    current_password: str | None = None
    new_password: str = Field(min_length=1)


class PasswordChangeResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_expires_in: int


LoginResponse.model_rebuild()
