from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, EmailStr, Field, model_validator


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

    @model_validator(mode="before")
    @classmethod
    def _derive_has_password(cls, data: Any) -> Any:
        """Inject ``has_password`` derived from ``password_hash``.

        Works for both dict inputs and ORM instances. By introspecting
        ``cls.model_fields`` we stay forward-compatible: new fields on
        ``UserOut`` flow through automatically without amending this hook.
        """
        if isinstance(data, dict):
            if "has_password" not in data and "password_hash" in data:
                data = dict(data)
                data["has_password"] = data.pop("password_hash") is not None
            return data
        # ORM instance: build a dict containing each declared field, computing
        # ``has_password`` from the source ``password_hash`` attribute.
        if hasattr(data, "password_hash"):
            out: dict[str, Any] = {}
            for field_name in cls.model_fields:
                if field_name == "has_password":
                    out["has_password"] = getattr(data, "password_hash", None) is not None
                else:
                    out[field_name] = getattr(data, field_name, None)
            return out
        return data


class PasswordChangeRequest(BaseModel):
    current_password: str | None = None
    new_password: str = Field(min_length=1)


class PasswordChangeResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_expires_in: int


LoginResponse.model_rebuild()
