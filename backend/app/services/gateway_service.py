"""Shared helpers for the /v1/* gateway endpoints.

Responsibilities:
- Resolve a `public_name` from the user payload to a (ModelRow, Provider) pair.
- Build the upstream provider adapter for the current request.
- Pre-authorize spend against the monthly cap via reservation_service (Redis).
- Persist request_logs atomically with debit (single transaction, FOR UPDATE).
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_settings
from ..enums import RequestType
from ..logging_config import get_logger
from ..models import ApiKey, ModelRow, Provider, RequestLog, User
from ..providers import APIMartProvider, BaseProvider, DeepSeekProvider
from ..redis_client import get_redis
from ..utils.redact import redact
from ..utils.time import month_start_utc
from . import billing_service, cost_service, provider_selector, reservation_service
from .reservation_service import Reservation

settings = get_settings()
log = get_logger(__name__)


@dataclass
class ResolvedModel:
    model: ModelRow
    provider: Provider


def resolve_model(db: Session, public_name: str, expected_type: str | None = None) -> ResolvedModel:
    """Look up the model by public_name; reject if missing/disabled or wrong type.

    Provider selection here is the default (model.provider_id). For requests
    that participate in session stickiness, use `resolve_for_request()` instead.
    """
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


async def resolve_for_request(
    db: Session,
    public_name: str,
    *,
    expected_type: str | None = None,
    session_key: str | None = None,
) -> ResolvedModel:
    """Like resolve_model but routes the provider through `provider_selector`,
    honoring per-session stickiness when a second provider exists."""
    base = resolve_model(db, public_name, expected_type=expected_type)
    if session_key is None:
        return base
    chosen = await provider_selector.pick_provider_async_helper(
        db, base.model, session_key=session_key
    )
    return ResolvedModel(model=base.model, provider=chosen)


def session_key_for_request(api_key: ApiKey) -> str:
    """Session-stickiness identifier for a given API key. Today we use the
    api key id; future: optionally combine with a client-supplied `chat_id`."""
    return f"k{api_key.id}"


def build_provider(provider: Provider) -> BaseProvider:
    if provider.name == "apimart":
        if not settings.apimart_api_key:
            raise HTTPException(status_code=500, detail="APIMART_API_KEY is not configured")
        return APIMartProvider(base_url=provider.base_url, api_key=settings.apimart_api_key)
    if provider.name == "deepseek":
        if not settings.deepseek_api_key:
            raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY is not configured")
        return DeepSeekProvider(base_url=provider.base_url, api_key=settings.deepseek_api_key)
    raise HTTPException(status_code=501, detail=f"Provider '{provider.name}' not implemented")


def new_request_id() -> str:
    return f"req_{uuid.uuid4().hex[:24]}"


def extract_upstream_error_message(body: object) -> str:
    """Best-effort extraction of a human-readable error message from an
    upstream response body."""
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            return str(err.get("message") or err)[:300]
        return str(body.get("message") or body.get("detail") or body)[:300]
    return str(body)[:300]


def require_balance(user: User) -> None:
    if Decimal(user.balance) <= 0:
        raise HTTPException(
            status_code=402, detail="Insufficient balance. Ask admin to add credit."
        )


def mtd_cost_for_api_key(db: Session, api_key_id: int) -> Decimal:
    """Month-to-date cost charged through this API key (UTC month)."""
    total = (
        db.query(func.coalesce(func.sum(RequestLog.cost), Decimal("0")))
        .filter(RequestLog.api_key_id == api_key_id, RequestLog.created_at >= month_start_utc())
        .scalar()
    )
    return Decimal(total or 0)


def mtd_cost_for_api_keys(db: Session, api_key_ids: list[int]) -> dict[int, Decimal]:
    """Single-query MTD cost for many keys at once. Missing keys return 0."""
    if not api_key_ids:
        return {}
    rows = (
        db.query(RequestLog.api_key_id, func.coalesce(func.sum(RequestLog.cost), Decimal("0")))
        .filter(
            RequestLog.api_key_id.in_(api_key_ids),
            RequestLog.created_at >= month_start_utc(),
        )
        .group_by(RequestLog.api_key_id)
        .all()
    )
    return {kid: Decimal(c or 0) for kid, c in rows}


# ---------------- Spend pre-authorization ----------------


async def preauthorize_spend(
    db: Session,
    *,
    user: User,
    api_key: ApiKey,
    estimated_cost: Decimal,
) -> Reservation | None:
    """Balance check + Redis-backed monthly-cap reservation.

    Returns a `Reservation` to be released by `finalize_reservation()` after the
    request resolves. Returns None if no reservation was needed (free model or
    no monthly cap).

    Raises HTTP 402/429 on rejection.
    """
    require_balance(user)
    if api_key.monthly_limit is None or estimated_cost <= 0:
        return None

    monthly_limit = Decimal(api_key.monthly_limit)
    redis = get_redis()
    try:
        reservation, status = await reservation_service.try_reserve(
            redis, api_key_id=api_key.id,
            reservation_amount=estimated_cost, monthly_limit=monthly_limit,
            strict=settings.is_production,
        )
        if status == "needs_init":
            committed_mtd = mtd_cost_for_api_key(db, api_key.id)
            if committed_mtd >= monthly_limit:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"API key monthly limit reached: spent ${committed_mtd} of "
                        f"${monthly_limit}. Raise the limit or rotate the key."
                    ),
                )
            reservation = await reservation_service.init_and_reserve(
                redis, api_key_id=api_key.id,
                committed_mtd=committed_mtd, reservation_amount=estimated_cost,
                monthly_limit=monthly_limit, strict=settings.is_production,
            )
            if reservation is None:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"API key monthly limit would be exceeded by this request "
                        f"(est ${estimated_cost} on top of ${committed_mtd} of ${monthly_limit})."
                    ),
                )
        elif status == "rejected":
            raise HTTPException(
                status_code=429,
                detail=(
                    f"API key monthly limit would be exceeded by this request "
                    f"(est ${estimated_cost} on top of ${monthly_limit} cap)."
                ),
            )
    except reservation_service.ReservationBackendUnavailable as exc:
        log.error("reservation_backend_unavailable", error=str(exc))
        raise HTTPException(status_code=503, detail="Spend reservation backend unavailable")
    return reservation


async def finalize_reservation(
    reservation: Reservation | None, *, actual_cost: Decimal
) -> None:
    if reservation is None:
        return
    await reservation_service.release(get_redis(), reservation, actual_cost=actual_cost)


async def release_reservation_fully(reservation: Reservation | None) -> None:
    if reservation is None:
        return
    await reservation_service.force_release_full(get_redis(), reservation)


def mark_key_used(db: Session, api_key: ApiKey) -> None:
    api_key.last_used_at = datetime.now(timezone.utc)


# ---------------- Persist helpers ----------------


def _payloads_for_log(
    request_type: str,
    request_payload: dict[str, Any] | list | None,
    response_payload: dict[str, Any] | list | None,
) -> tuple[Any, Any]:
    """Decide the (request, response) JSON to store on a request_log row.

    Text logs persist neither: the prompt/answer is the dominant request_logs
    bloat source and carries no billing/audit value. Image/video logs keep
    both — task_service backfills cost params (n, duration) from the request.
    """
    if request_type == RequestType.TEXT:
        return None, None
    return (
        redact(request_payload),
        response_payload if isinstance(response_payload, (dict, list)) else None,
    )


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
    usage_source: str,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
    image_count: int | None = None,
    video_duration: Decimal | None = None,
    asset_url: str | None = None,
    task_status: str | None = None,
    prompt_cached_tokens: int | None = None,
    prompt_cache_creation_tokens: int | None = None,
) -> RequestLog:
    """Single transaction: insert request_log (with price snapshot) + debit +
    update api_key.last_used_at.

    `usage_source` is one of `UsageSource` values. `missing` implies cost=0
    (no model pricing); `estimated` means we filled in from tiktoken because
    upstream omitted usage. Both annotate the log for downstream auditing.
    """
    note_parts: list[str] = []
    if usage_source == "missing":
        note_parts.append("pricing_missing=true")
    elif usage_source == "estimated":
        note_parts.append("pricing_estimated=true")
    req_json, resp_json = _payloads_for_log(request_type, request_payload, response_payload)
    log_row = RequestLog(
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
        prompt_cached_tokens=prompt_cached_tokens,
        prompt_cache_creation_tokens=prompt_cache_creation_tokens,
        image_count=image_count,
        video_duration=video_duration,
        cost=cost,
        latency_ms=latency_ms,
        http_status=http_status,
        request_id=request_id,
        upstream_request_id=upstream_request_id,
        request_payload_json=req_json,
        response_payload_json=resp_json,
        asset_url=asset_url,
        unit_price_snapshot_json=cost_service.price_snapshot(model),
        usage_source=usage_source,
        error_message=" ".join(note_parts) or None,
    )
    db.add(log_row)
    db.flush()
    mark_key_used(db, api_key)
    if cost > 0:
        billing_service.debit(
            db, user.id, cost, request_log_id=log_row.id, note=f"{request_type}:{model.public_name}"
        )
    db.commit()
    db.refresh(log_row)
    return log_row


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
    req_json, resp_json = _payloads_for_log(request_type, request_payload, response_payload)
    log_row = RequestLog(
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
        request_payload_json=req_json,
        response_payload_json=resp_json,
        unit_price_snapshot_json=cost_service.price_snapshot(model) if model else None,
    )
    db.add(log_row)
    db.flush()
    mark_key_used(db, api_key)
    db.commit()
    db.refresh(log_row)
    return log_row


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

    cost=0 here; gets charged when the task succeeds via the locked
    finalize path in `task_service.finalize_task`.
    """
    from ..models import VideoTask

    req_json, resp_json = _payloads_for_log(request_type, request_payload, response_payload)
    log_row = RequestLog(
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
        request_payload_json=req_json,
        response_payload_json=resp_json,
        unit_price_snapshot_json=cost_service.price_snapshot(model),
    )
    db.add(log_row)
    db.flush()
    mark_key_used(db, api_key)
    task = VideoTask(
        user_id=user.id,
        api_key_id=api_key.id,
        request_log_id=log_row.id,
        provider_id=provider.id,
        model_id=model.id,
        upstream_task_id=upstream_task_id or "",
        status="queued",
    )
    db.add(task)
    db.commit()
    db.refresh(log_row)
    db.refresh(task)
    return log_row, task


# ---------------- High-level async submit (image / video) ----------------


async def submit_async_task(
    db: Session,
    *,
    user: User,
    api_key: ApiKey,
    payload: dict[str, Any],
    request_type: RequestType,
) -> dict[str, Any]:
    """End-to-end submit flow shared by /v1/images/generations and
    /v1/videos/generations."""
    public_name = payload.get("model")
    if not public_name or not isinstance(public_name, str):
        raise HTTPException(status_code=400, detail="Missing 'model' field")
    resolved = resolve_model(db, public_name, expected_type=request_type.value)

    # Pre-authorize: estimate upper bound and reserve against the monthly cap.
    if request_type is RequestType.IMAGE:
        n = 1
        try:
            n = int(payload.get("n", 1) or 1)
        except Exception:
            n = 1
        estimate = cost_service.estimate_image_cost_upper_bound(resolved.model, n)
    else:
        try:
            requested_duration = int(payload.get("duration") or 0) or None
        except Exception:
            requested_duration = None
        estimate = cost_service.estimate_video_cost_upper_bound(resolved.model, requested_duration)
    reservation = await preauthorize_spend(db, user=user, api_key=api_key, estimated_cost=estimate)

    request_id = new_request_id()
    provider_client = build_provider(resolved.provider)
    upstream_payload = {**payload, "model": resolved.model.upstream_model}

    upstream_call = (
        provider_client.image_generation
        if request_type is RequestType.IMAGE
        else provider_client.video_generation
    )

    started = time.perf_counter()
    try:
        resp = await upstream_call(upstream_payload)
    except Exception as e:
        latency_ms = int((time.perf_counter() - started) * 1000)
        persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider,
            model=resolved.model, request_type=request_type.value,
            request_payload=payload, response_payload=None, request_id=request_id,
            latency_ms=latency_ms, http_status=None, error_code="upstream_exception",
            error_message=str(e)[:1000],
        )
        await release_reservation_fully(reservation)
        raise HTTPException(status_code=502, detail=f"Upstream {request_type.value} submit failed: {e}")
    latency_ms = int((time.perf_counter() - started) * 1000)

    if resp.http_status >= 400:
        body_text = resp.body if isinstance(resp.body, (dict, list)) else {"raw": str(resp.body)}
        persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider,
            model=resolved.model, request_type=request_type.value,
            request_payload=payload, response_payload=body_text, request_id=request_id,
            latency_ms=latency_ms, http_status=resp.http_status,
            error_code=f"upstream_{resp.http_status}", error_message=None,
            upstream_request_id=resp.upstream_request_id,
        )
        await release_reservation_fully(reservation)
        raise HTTPException(status_code=resp.http_status, detail=body_text)

    task_id = provider_client.extract_task_id(resp.body)
    if not task_id:
        persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider,
            model=resolved.model, request_type=request_type.value,
            request_payload=payload, response_payload=resp.body, request_id=request_id,
            latency_ms=latency_ms, http_status=resp.http_status,
            error_code="no_task_id",
            error_message="Upstream response lacked a recognizable task_id",
            upstream_request_id=resp.upstream_request_id,
        )
        await release_reservation_fully(reservation)
        raise HTTPException(status_code=502, detail="Upstream did not return a task_id")

    log_row, task_row = persist_queued_task(
        db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
        request_type=request_type.value, request_payload=payload, response_payload=resp.body,
        upstream_request_id=resp.upstream_request_id, request_id=request_id,
        latency_ms=latency_ms, http_status=resp.http_status, upstream_task_id=task_id,
    )
    # Keep the reservation in place: actual debit will fire from finalize_task.
    # The reservation is intentionally NOT released here.
    # (The arq worker reconciles tasks on a schedule; the reservation TTL is 32d so we don't leak.)
    return {
        "task_id": f"task_{task_row.id}",
        "status": "queued",
        "type": request_type.value,
        "_gateway": {
            "request_id": request_id,
            "log_id": log_row.id,
            "upstream_task_id": task_id,
            "latency_ms": latency_ms,
        },
        "raw": resp.body,
    }
