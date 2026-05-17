"""Shared helpers for the /v1/* gateway endpoints.

Responsibilities:
- Resolve a `public_name` from the user payload to a (ModelRow, Provider) pair.
- Build the APIMartProvider instance for the current request.
- Persist request_logs atomically with debit (single transaction, FOR UPDATE).
"""
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import ApiKey, ModelRow, Provider, RequestLog, User
from ..providers import APIMartProvider
from . import billing_service

settings = get_settings()


@dataclass
class ResolvedModel:
    model: ModelRow
    provider: Provider


def resolve_model(db: Session, public_name: str, expected_type: str | None = None) -> ResolvedModel:
    """Look up the model by public_name; reject if missing/disabled or wrong type."""
    row = (
        db.query(ModelRow)
        .filter(ModelRow.public_name == public_name)
        .one_or_none()
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Model '{public_name}' not found")
    if row.status != "active" or not row.visible:
        raise HTTPException(status_code=403, detail=f"Model '{public_name}' is not available")
    if expected_type and row.type != expected_type and row.type != "multimodal":
        raise HTTPException(
            status_code=400,
            detail=f"Model '{public_name}' is type={row.type}, expected {expected_type}",
        )
    provider = db.get(Provider, row.provider_id)
    if not provider:
        raise HTTPException(status_code=500, detail="Provider missing for model")
    if provider.status != "active":
        raise HTTPException(status_code=503, detail=f"Provider '{provider.name}' disabled")
    return ResolvedModel(model=row, provider=provider)


def build_provider(provider: Provider) -> APIMartProvider:
    # MVP only ships the APIMart adapter. Future: switch on provider.name.
    if provider.name != "apimart":
        raise HTTPException(status_code=501, detail=f"Provider '{provider.name}' not implemented")
    if not settings.apimart_api_key:
        raise HTTPException(status_code=500, detail="APIMART_API_KEY is not configured")
    return APIMartProvider(base_url=provider.base_url, api_key=settings.apimart_api_key)


def new_request_id() -> str:
    return f"req_{uuid.uuid4().hex[:24]}"


def require_balance(user: User) -> None:
    if Decimal(user.balance) <= 0:
        raise HTTPException(
            status_code=402, detail="Insufficient balance. Ask admin to add credit."
        )


def mark_key_used(db: Session, api_key: ApiKey) -> None:
    api_key.last_used_at = datetime.now(timezone.utc)


def persist_success(
    db: Session,
    *,
    user: User,
    api_key: ApiKey,
    provider: Provider,
    model: ModelRow,
    request_type: str,
    request_payload: dict[str, Any] | list,
    response_payload: dict[str, Any] | list,
    upstream_request_id: str | None,
    request_id: str,
    latency_ms: int,
    http_status: int,
    cost: Decimal,
    pricing_missing: bool,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
    image_count: int | None = None,
    video_duration: Decimal | None = None,
    asset_url: str | None = None,
    task_status: str | None = None,
) -> RequestLog:
    """Single transaction: insert request_log + debit + update api_key.last_used_at."""
    log = RequestLog(
        user_id=user.id,
        api_key_id=api_key.id,
        provider_id=provider.id,
        model_id=model.id,
        request_type=request_type,
        upstream_model=model.upstream_model,
        status="success",
        task_status=task_status,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        image_count=image_count,
        video_duration=video_duration,
        cost=cost,
        latency_ms=latency_ms,
        http_status=http_status,
        request_id=request_id,
        upstream_request_id=upstream_request_id,
        request_payload_json=request_payload if isinstance(request_payload, (dict, list)) else None,
        response_payload_json=response_payload if isinstance(response_payload, (dict, list)) else None,
        asset_url=asset_url,
        error_message=("pricing_missing=true" if pricing_missing else None),
    )
    db.add(log)
    db.flush()  # need log.id for the debit transaction row
    mark_key_used(db, api_key)
    if cost > 0:
        billing_service.debit(
            db, user.id, cost, request_log_id=log.id, note=f"{request_type}:{model.public_name}"
        )
    db.commit()
    db.refresh(log)
    return log


def persist_failure(
    db: Session,
    *,
    user: User,
    api_key: ApiKey,
    provider: Provider | None,
    model: ModelRow | None,
    request_type: str,
    request_payload: dict[str, Any] | list | None,
    response_payload: dict[str, Any] | list | None,
    request_id: str,
    latency_ms: int,
    http_status: int | None,
    error_code: str | None,
    error_message: str | None,
    upstream_request_id: str | None = None,
) -> RequestLog:
    """No debit on failure. Just write the log."""
    log = RequestLog(
        user_id=user.id,
        api_key_id=api_key.id,
        provider_id=provider.id if provider else None,
        model_id=model.id if model else None,
        request_type=request_type,
        upstream_model=model.upstream_model if model else None,
        status="failed",
        cost=Decimal("0"),
        latency_ms=latency_ms,
        http_status=http_status,
        request_id=request_id,
        upstream_request_id=upstream_request_id,
        error_code=error_code,
        error_message=error_message,
        request_payload_json=request_payload if isinstance(request_payload, (dict, list)) else None,
        response_payload_json=response_payload if isinstance(response_payload, (dict, list)) else None,
    )
    db.add(log)
    db.flush()
    mark_key_used(db, api_key)
    db.commit()
    db.refresh(log)
    return log


def persist_queued_task(
    db: Session,
    *,
    user: User,
    api_key: ApiKey,
    provider: Provider,
    model: ModelRow,
    request_type: str,
    request_payload: dict[str, Any] | list,
    response_payload: dict[str, Any] | list,
    upstream_request_id: str | None,
    request_id: str,
    latency_ms: int,
    http_status: int,
    upstream_task_id: str | None,
) -> tuple[RequestLog, "VideoTask"]:
    """For async submissions (image/video) that returned a task_id.

    cost=0 here; gets charged when the task succeeds via /v1/tasks/{id} polling.
    Inserts both the RequestLog and the VideoTask in a single transaction.
    """
    from ..models import VideoTask  # local import keeps the module dependency graph flat

    log = RequestLog(
        user_id=user.id,
        api_key_id=api_key.id,
        provider_id=provider.id,
        model_id=model.id,
        request_type=request_type,
        upstream_model=model.upstream_model,
        status="running",
        task_status="queued",
        cost=Decimal("0"),
        latency_ms=latency_ms,
        http_status=http_status,
        request_id=request_id,
        upstream_request_id=upstream_request_id or upstream_task_id,
        request_payload_json=request_payload if isinstance(request_payload, (dict, list)) else None,
        response_payload_json=response_payload if isinstance(response_payload, (dict, list)) else None,
    )
    db.add(log)
    db.flush()  # need log.id for the task FK
    mark_key_used(db, api_key)
    task = VideoTask(
        user_id=user.id,
        api_key_id=api_key.id,
        request_log_id=log.id,
        provider_id=provider.id,
        model_id=model.id,
        upstream_task_id=upstream_task_id or "",
        status="queued",
    )
    db.add(task)
    db.commit()
    db.refresh(log)
    db.refresh(task)
    return log, task
