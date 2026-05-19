from datetime import datetime

from pydantic import BaseModel


class OAuthProvidersStatus(BaseModel):
    google: bool
    github: bool


class OAuthIdentityOut(BaseModel):
    id: int
    provider: str
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OAuthLinkStartResponse(BaseModel):
    redirect_url: str


class OAuthLinkStartRequest(BaseModel):
    return_to: str | None = None
