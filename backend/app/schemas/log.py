from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel


class RequestLogSummary(BaseModel):
    """List/table view — omits heavy JSON payloads."""

    model_config = {"from_attributes": True, "protected_namespaces": ()}

    id: int
    user_id: int
    api_key_id: int | None
    api_key_prefix: str | None = None
    provider_id: int | None
    model_id: int | None
    model_name: str | None = None
    request_type: str
    upstream_model: str | None
    status: str
    task_status: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    image_count: int | None
    video_duration: Decimal | None
    cost: Decimal
    latency_ms: int | None
    http_status: int | None
    request_id: str | None
    error_code: str | None
    error_message: str | None
    asset_url: str | None
    created_at: datetime


class RequestLogDetail(RequestLogSummary):
    upstream_request_id: str | None
    request_payload_json: dict[str, Any] | list | None
    response_payload_json: dict[str, Any] | list | None
