from datetime import datetime

from pydantic import BaseModel, Field


class ProviderOut(BaseModel):
    id: int
    name: str
    display_name: str
    base_url: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProviderUpdate(BaseModel):
    display_name: str | None = None
    base_url: str | None = None
    status: str | None = Field(default=None, pattern="^(active|disabled)$")
