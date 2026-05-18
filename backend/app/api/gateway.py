"""OpenAI-compatible gateway routes mounted at /v1/*.

Authentication: user API key (Authorization: Bearer lgw_...).
NOT the dashboard JWT — those endpoints live under /api/.
"""
from __future__ import annotations

import json
import time
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..config import get_settings
from ..deps import get_api_key_user, get_db
from ..enums import RequestType, UsageSource
from ..logging_config import get_logger
from ..metrics import gateway_cost_usd_total, gateway_latency_ms, gateway_requests_total, pricing_source_total
from ..models import ApiKey, ModelRow, RequestLog, User, VideoTask
from ..rate_limit import make_limiter
from ..redis_client import get_redis
from ..security import hash_api_key
from ..services import cost_service, gateway_service, task_service, tpm_service
from ..services.token_estimator import (
    count_message_tokens,
    estimate_anthropic_messages_usage,
)

router = APIRouter(prefix="/v1", tags=["gateway"])
log = get_logger(__name__)
_settings = get_settings()

# Hard-coded buffer: gateway rejects at 95% of model.max_input_tokens.
# Reason: tiktoken counts diverge from upstream tokenizers (especially Anthropic)
# by a few percent. 5% guards against false negatives that would otherwise leak
# to the upstream as a confusing 422.
_INPUT_TOKEN_BUFFER = 0.95


def _enforce_input_token_limit(model, prompt_tokens: int) -> None:
    """Raise HTTPException(400) if estimated prompt tokens exceed 95% of
    `model.max_input_tokens`. NULL max_input_tokens means no limit."""
    cap = getattr(model, "max_input_tokens", None)
    if cap is None:
        return
    effective = int(cap * _INPUT_TOKEN_BUFFER)
    if prompt_tokens > effective:
        log.warning(
            "input_token_limit_exceeded",
            model=getattr(model, "public_name", None),
            prompt_tokens=prompt_tokens,
            effective_limit=effective,
            model_cap=cap,
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Input length ({prompt_tokens} tokens) exceeds gateway limit "
                f"({effective} = 95% of model cap {cap}). Reduce prompt size."
            ),
        )


async def _enforce_tpm_limit(api_key: ApiKey, tokens_requested: int) -> tpm_service.TpmHandle:
    """Prededuct `tokens_requested` against the per-api_key TPM budget.

    Returns a handle (always non-None) on success — handle.entry_id is "" when
    the key has no TPM limit configured. Raises 429 with Retry-After: 30 on
    rejection. Callers MUST eventually call `tpm_service.reconcile()` (with
    actual usage) or `tpm_service.release_fully()` (on failure) for handles
    that carry a non-empty entry_id, otherwise the prededuct leaks for the
    full window."""
    redis = get_redis()
    handle = await tpm_service.try_prededuct(
        redis,
        api_key_id=api_key.id,
        tokens=tokens_requested,
        tpm_limit=api_key.rate_limit_tpm,
    )
    if handle is None:
        log.warning(
            "tpm_limit_exceeded",
            api_key_id=api_key.id,
            tokens_requested=tokens_requested,
            tpm_limit=api_key.rate_limit_tpm,
        )
        raise HTTPException(
            status_code=429,
            detail="TPM (tokens-per-minute) limit exceeded for this API key.",
            headers={"Retry-After": "30"},
        )
    return handle


def _actual_total_tokens(usage: dict | None) -> int:
    """Best-effort sum of prompt + completion tokens for TPM reconcile, working
    with either OpenAI (prompt_tokens/completion_tokens) or Anthropic
    (input_tokens/output_tokens) usage shapes."""
    if not usage:
        return 0
    prompt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    completion = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    return prompt + completion


def _extract_cache_tokens(usage: dict | None) -> tuple[int, int]:
    """Read cache_read / cache_write token counts out of either OpenAI or
    Anthropic usage payloads. Returns (cached_tokens, cache_creation_tokens).

    OpenAI shape: usage.prompt_tokens_details.cached_tokens (and 0 for cache_creation)
    Anthropic shape: usage.cache_read_input_tokens / cache_creation_input_tokens
    Returns (0, 0) if usage is missing or malformed."""
    if not usage:
        return 0, 0
    cached = (
        (usage.get("prompt_tokens_details") or {}).get("cached_tokens")
        or usage.get("cache_read_input_tokens")
        or 0
    )
    creation = usage.get("cache_creation_input_tokens") or 0
    return int(cached), int(creation)


async def _api_key_rate_identifier(request: Request) -> str:
    """Rate-limit key for /v1/*: prefer the api key hash; fall back to client IP."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and auth[7:].startswith("lgw_"):
        return f"k:{hash_api_key(auth[7:].strip())}"
    if request.client is None:
        return "ip:unknown"
    return f"ip:{request.client.host}"


_gateway_limiter = make_limiter(
    _settings.rate_limit_gateway_rpm,
    seconds=60,
    identifier=_api_key_rate_identifier,
)


# ---------------- GET /v1/models (OpenAI-compatible) ----------------


@router.get("/models")
def list_models(
    db: Session = Depends(get_db),
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
) -> dict[str, Any]:
    rows = (
        db.query(ModelRow)
        .filter(ModelRow.visible.is_(True), ModelRow.status == "active")
        .order_by(desc(ModelRow.type), ModelRow.public_name)
        .all()
    )
    data = [
        {
            "id": r.public_name,
            "object": "model",
            "created": int(r.created_at.timestamp()),
            "owned_by": "llm-gateway",
            "type": r.type,
            "pricing_mode": r.pricing_mode,
        }
        for r in rows
    ]
    return {"object": "list", "data": data}


# ---------------- POST /v1/chat/completions ----------------


@router.post("/chat/completions", dependencies=[Depends(_gateway_limiter)])
async def chat_completions(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
) -> Any:
    user, api_key = auth
    if payload.get("stream") is True:
        return await _chat_completions_stream(payload, db, auth)

    public_name = payload.get("model")
    if not public_name or not isinstance(public_name, str):
        raise HTTPException(status_code=400, detail="Missing 'model' field")

    resolved = gateway_service.resolve_model(db, public_name, expected_type="text")

    # Pre-authorize a pessimistic upper bound against the monthly cap.
    prompt_est = count_message_tokens(payload.get("messages") or [], resolved.model.public_name)
    _enforce_input_token_limit(resolved.model, prompt_est)
    max_completion = int(payload.get("max_tokens") or payload.get("max_completion_tokens") or 4096)
    tpm_handle = await _enforce_tpm_limit(api_key, prompt_est + max_completion)
    redis = get_redis()
    estimate = cost_service.estimate_text_cost_upper_bound(resolved.model, prompt_est, max_completion)
    try:
        reservation = await gateway_service.preauthorize_spend(
            db, user=user, api_key=api_key, estimated_cost=estimate
        )
    except BaseException:
        await tpm_service.release_fully(redis, tpm_handle)
        raise

    request_id = gateway_service.new_request_id()
    provider_client = gateway_service.build_provider(resolved.provider)

    upstream_payload = {**payload, "model": resolved.model.upstream_model}
    upstream_payload.pop("stream", None)

    started = time.perf_counter()
    try:
        resp = await provider_client.chat_completions(upstream_payload, stream=False)
    except Exception as e:
        latency_ms = int((time.perf_counter() - started) * 1000)
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="text", request_payload=payload, response_payload=None,
            request_id=request_id, latency_ms=latency_ms, http_status=None,
            error_code="upstream_exception", error_message=str(e)[:1000],
        )
        await gateway_service.release_reservation_fully(reservation)
        await tpm_service.release_fully(redis, tpm_handle)
        gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="failed").inc()
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {e}")

    latency_ms = int((time.perf_counter() - started) * 1000)

    if resp.http_status >= 400:
        body_text = resp.body if isinstance(resp.body, (dict, list)) else {"raw": str(resp.body)}
        err_msg = gateway_service.extract_upstream_error_message(resp.body)
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="text", request_payload=payload, response_payload=body_text,
            request_id=request_id, latency_ms=latency_ms, http_status=resp.http_status,
            error_code=f"upstream_{resp.http_status}", error_message=err_msg[:1000] if err_msg else None,
            upstream_request_id=resp.upstream_request_id,
        )
        await gateway_service.release_reservation_fully(reservation)
        await tpm_service.release_fully(redis, tpm_handle)
        gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="upstream_error").inc()
        raise HTTPException(status_code=resp.http_status, detail=_normalize_error_body(body_text))

    body = resp.body if isinstance(resp.body, dict) else {}
    usage = body.get("usage") or {}
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
    cached_tokens, cache_creation_tokens = _extract_cache_tokens(usage)

    cost, pricing_missing = cost_service.calc_text_cost_with_cache(
        resolved.model, prompt_tokens, completion_tokens,
        cached_tokens=cached_tokens,
        cache_creation_tokens=cache_creation_tokens,
    )
    usage_source = (UsageSource.MISSING if pricing_missing else UsageSource.UPSTREAM).value
    pricing_source_total.labels(source=usage_source).inc()

    log_row = gateway_service.persist_success(
        db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
        request_type="text", request_payload=payload, response_payload=body,
        upstream_request_id=resp.upstream_request_id, request_id=request_id,
        latency_ms=latency_ms, http_status=resp.http_status,
        cost=cost, usage_source=usage_source,
        prompt_tokens=prompt_tokens or None, completion_tokens=completion_tokens or None,
        total_tokens=total_tokens or None,
        prompt_cached_tokens=int(cached_tokens) or None,
        prompt_cache_creation_tokens=int(cache_creation_tokens) or None,
    )

    await gateway_service.finalize_reservation(reservation, actual_cost=cost)
    await tpm_service.reconcile(redis, tpm_handle, actual_tokens=prompt_tokens + completion_tokens)
    gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="success").inc()
    gateway_cost_usd_total.labels(type="text", model=resolved.model.public_name).inc(float(cost))
    gateway_latency_ms.labels(type="text", model=resolved.model.public_name).observe(latency_ms)

    if isinstance(body, dict):
        body = {**body, "model": resolved.model.public_name}
        body.setdefault("id", f"chatcmpl-{request_id}")
        body["_gateway"] = {
            "request_id": request_id,
            "log_id": log_row.id,
            "cost": str(cost),
            "latency_ms": latency_ms,
            "pricing_missing": pricing_missing,
            "usage_source": usage_source,
        }
    return body


# ---------------- POST /v1/chat/completions (streaming) ----------------


async def _chat_completions_stream(
    payload: dict[str, Any],
    db: Session,
    auth: tuple[User, ApiKey],
) -> StreamingResponse:
    user, api_key = auth
    public_name = payload.get("model")
    if not public_name or not isinstance(public_name, str):
        raise HTTPException(status_code=400, detail="Missing 'model' field")
    resolved = gateway_service.resolve_model(db, public_name, expected_type="text")

    prompt_est = count_message_tokens(payload.get("messages") or [], resolved.model.public_name)
    _enforce_input_token_limit(resolved.model, prompt_est)
    max_completion = int(payload.get("max_tokens") or payload.get("max_completion_tokens") or 4096)
    tpm_handle = await _enforce_tpm_limit(api_key, prompt_est + max_completion)
    redis = get_redis()
    estimate = cost_service.estimate_text_cost_upper_bound(resolved.model, prompt_est, max_completion)
    try:
        reservation = await gateway_service.preauthorize_spend(
            db, user=user, api_key=api_key, estimated_cost=estimate
        )
    except BaseException:
        await tpm_service.release_fully(redis, tpm_handle)
        raise

    request_id = gateway_service.new_request_id()
    provider_client = gateway_service.build_provider(resolved.provider)

    upstream_payload = {**payload, "model": resolved.model.upstream_model}

    async def event_stream():
        started = time.perf_counter()
        final_usage: dict[str, Any] | None = None
        upstream_error: dict[str, Any] | None = None
        # Capture the preauth estimate in closure so the usage-missing fallback
        # below doesn't have to recount tokens.
        nonlocal_prompt_est = prompt_est
        nonlocal_max_completion = max_completion
        tpm_settled = False
        try:
            try:
                async for chunk in provider_client.chat_completions_stream(upstream_payload):
                    if chunk.parsed and chunk.parsed.get("_error"):
                        upstream_error = chunk.parsed
                        err_event = {
                            "error": {
                                "message": chunk.parsed.get("body", "upstream error"),
                                "code": f"upstream_{chunk.parsed.get('_http')}",
                                "type": "upstream_error",
                            }
                        }
                        yield (f"data: {json.dumps(err_event)}\n\n").encode()
                        break
                    if chunk.parsed and isinstance(chunk.parsed.get("usage"), dict):
                        final_usage = chunk.parsed["usage"]
                    if chunk.parsed and "model" in chunk.parsed:
                        chunk.parsed["model"] = resolved.model.public_name
                        line = (f"data: {json.dumps(chunk.parsed)}\n\n").encode()
                        yield line
                    else:
                        yield chunk.raw_line
            except Exception as e:
                err_event = {"error": {"message": f"upstream exception: {e}", "code": "upstream_exception", "type": "upstream_exception"}}
                yield (f"data: {json.dumps(err_event)}\n\n").encode()
                upstream_error = {"_http": None, "body": str(e)}
            latency_ms = int((time.perf_counter() - started) * 1000)

            if upstream_error:
                gateway_service.persist_failure(
                    db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
                    request_type="text", request_payload=payload,
                    response_payload={"error": upstream_error}, request_id=request_id,
                    latency_ms=latency_ms, http_status=upstream_error.get("_http"),
                    error_code="upstream_stream_error",
                    error_message=str(upstream_error.get("body"))[:1000],
                )
                await gateway_service.release_reservation_fully(reservation)
                await tpm_service.release_fully(redis, tpm_handle)
                tpm_settled = True
                gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="failed").inc()
                return

            usage_source = UsageSource.UPSTREAM.value
            cached_tokens = 0
            cache_creation_tokens = 0
            if final_usage is None:
                # Upstream omitted usage even with include_usage=true. Reuse the
                # preauth token count + max_tokens ceiling as a pessimistic bound.
                prompt_tokens = nonlocal_prompt_est
                completion_tokens = nonlocal_max_completion
                total_tokens = prompt_tokens + completion_tokens
                usage_source = UsageSource.ESTIMATED.value
                log.warning(
                    "stream_usage_missing",
                    model=resolved.model.public_name,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )
            else:
                prompt_tokens = int((final_usage or {}).get("prompt_tokens") or 0)
                completion_tokens = int((final_usage or {}).get("completion_tokens") or 0)
                total_tokens = int(
                    (final_usage or {}).get("total_tokens") or (prompt_tokens + completion_tokens)
                )
                cached_tokens, cache_creation_tokens = _extract_cache_tokens(final_usage)

            cost, pricing_missing = cost_service.calc_text_cost_with_cache(
                resolved.model, prompt_tokens, completion_tokens,
                cached_tokens=cached_tokens,
                cache_creation_tokens=cache_creation_tokens,
            )
            if pricing_missing:
                usage_source = UsageSource.MISSING.value
            pricing_source_total.labels(source=usage_source).inc()

            gateway_service.persist_success(
                db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
                request_type="text", request_payload=payload,
                response_payload={"_streamed": True, "usage": final_usage, "usage_source": usage_source},
                upstream_request_id=None, request_id=request_id, latency_ms=latency_ms,
                http_status=200, cost=cost, usage_source=usage_source,
                prompt_tokens=prompt_tokens or None, completion_tokens=completion_tokens or None,
                total_tokens=total_tokens or None,
                prompt_cached_tokens=int(cached_tokens) or None,
                prompt_cache_creation_tokens=int(cache_creation_tokens) or None,
            )
            await gateway_service.finalize_reservation(reservation, actual_cost=cost)
            await tpm_service.reconcile(redis, tpm_handle, actual_tokens=prompt_tokens + completion_tokens)
            tpm_settled = True
            gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="success").inc()
            gateway_cost_usd_total.labels(type="text", model=resolved.model.public_name).inc(float(cost))
            gateway_latency_ms.labels(type="text", model=resolved.model.public_name).observe(latency_ms)
        finally:
            # Safety net: if any path above bailed before settling TPM (e.g. the
            # client cancelled the streaming response mid-flight, which raises
            # GeneratorExit), release the prededuct so it doesn't leak for the
            # full window.
            if not tpm_settled:
                try:
                    await tpm_service.release_fully(redis, tpm_handle)
                except Exception:
                    pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Gateway-Request-Id": request_id,
        },
    )


# ---------------- POST /v1/messages (Anthropic-compatible) ----------------


@router.post("/messages", dependencies=[Depends(_gateway_limiter)])
async def messages(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
) -> Any:
    """Anthropic Messages API passthrough.

    Same plumbing as /v1/chat/completions (resolve model, preauth spend, persist
    success/failure, snapshot, debit) but uses the Anthropic-shaped payload
    (top-level `system`, `messages`, `max_tokens`, `tools`) and reads usage
    from `usage.{input_tokens, output_tokens}` instead of OpenAI's
    `prompt_tokens/completion_tokens`.
    """
    user, api_key = auth
    if payload.get("stream") is True:
        return await _messages_stream(payload, db, auth)

    public_name = payload.get("model")
    if not public_name or not isinstance(public_name, str):
        raise HTTPException(status_code=400, detail="Missing 'model' field")

    resolved = await gateway_service.resolve_for_request(
        db, public_name, expected_type="text",
        session_key=gateway_service.session_key_for_request(api_key),
    )

    prompt_est, max_completion, _ = estimate_anthropic_messages_usage(
        payload, resolved.model.public_name
    )
    _enforce_input_token_limit(resolved.model, prompt_est)
    tpm_handle = await _enforce_tpm_limit(api_key, prompt_est + max_completion)
    redis = get_redis()
    estimate = cost_service.estimate_text_cost_upper_bound(resolved.model, prompt_est, max_completion)
    try:
        reservation = await gateway_service.preauthorize_spend(
            db, user=user, api_key=api_key, estimated_cost=estimate
        )
    except BaseException:
        await tpm_service.release_fully(redis, tpm_handle)
        raise

    request_id = gateway_service.new_request_id()
    provider_client = gateway_service.build_provider(resolved.provider)

    upstream_payload = {**payload, "model": resolved.model.upstream_model}
    upstream_payload.pop("stream", None)

    started = time.perf_counter()
    try:
        resp = await provider_client.messages(upstream_payload)
    except NotImplementedError:
        await gateway_service.release_reservation_fully(reservation)
        await tpm_service.release_fully(redis, tpm_handle)
        raise HTTPException(
            status_code=501,
            detail=f"Provider '{resolved.provider.name}' does not implement the Messages API",
        )
    except Exception as e:
        latency_ms = int((time.perf_counter() - started) * 1000)
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="text", request_payload=payload, response_payload=None,
            request_id=request_id, latency_ms=latency_ms, http_status=None,
            error_code="upstream_exception", error_message=str(e)[:1000],
        )
        await gateway_service.release_reservation_fully(reservation)
        await tpm_service.release_fully(redis, tpm_handle)
        gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="failed").inc()
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {e}")

    latency_ms = int((time.perf_counter() - started) * 1000)

    if resp.http_status >= 400:
        body_text = resp.body if isinstance(resp.body, (dict, list)) else {"raw": str(resp.body)}
        err_msg = gateway_service.extract_upstream_error_message(resp.body)
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="text", request_payload=payload, response_payload=body_text,
            request_id=request_id, latency_ms=latency_ms, http_status=resp.http_status,
            error_code=f"upstream_{resp.http_status}", error_message=err_msg[:1000] if err_msg else None,
            upstream_request_id=resp.upstream_request_id,
        )
        await gateway_service.release_reservation_fully(reservation)
        await tpm_service.release_fully(redis, tpm_handle)
        gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="upstream_error").inc()
        raise HTTPException(status_code=resp.http_status, detail=_normalize_error_body(body_text))

    body = resp.body if isinstance(resp.body, dict) else {}
    usage = provider_client.extract_messages_usage(body)

    if usage is not None:
        prompt_tokens = usage.input_tokens
        completion_tokens = usage.output_tokens
        usage_source = UsageSource.UPSTREAM.value
        cached_tokens, cache_creation_tokens = _extract_cache_tokens(body.get("usage"))
    else:
        prompt_tokens, completion_tokens = prompt_est, max_completion
        usage_source = UsageSource.ESTIMATED.value
        cached_tokens = 0
        cache_creation_tokens = 0
        log.warning(
            "messages_usage_missing",
            model=resolved.model.public_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )

    cost, pricing_missing = cost_service.calc_text_cost_with_cache(
        resolved.model, prompt_tokens, completion_tokens,
        cached_tokens=cached_tokens,
        cache_creation_tokens=cache_creation_tokens,
    )
    if pricing_missing:
        usage_source = UsageSource.MISSING.value
    pricing_source_total.labels(source=usage_source).inc()

    log_row = gateway_service.persist_success(
        db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
        request_type="text", request_payload=payload, response_payload=body,
        upstream_request_id=resp.upstream_request_id, request_id=request_id,
        latency_ms=latency_ms, http_status=resp.http_status,
        cost=cost, usage_source=usage_source,
        prompt_tokens=prompt_tokens or None, completion_tokens=completion_tokens or None,
        total_tokens=(prompt_tokens + completion_tokens) or None,
        prompt_cached_tokens=int(cached_tokens) or None,
        prompt_cache_creation_tokens=int(cache_creation_tokens) or None,
    )

    await gateway_service.finalize_reservation(reservation, actual_cost=cost)
    await tpm_service.reconcile(redis, tpm_handle, actual_tokens=prompt_tokens + completion_tokens)
    gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="success").inc()
    gateway_cost_usd_total.labels(type="text", model=resolved.model.public_name).inc(float(cost))
    gateway_latency_ms.labels(type="text", model=resolved.model.public_name).observe(latency_ms)

    if isinstance(body, dict):
        # Rewrite model name to the public-facing one so clients don't see the
        # upstream alias.
        body = {**body, "model": resolved.model.public_name}
        body.setdefault("id", f"msg-{request_id}")
        body["_gateway"] = {
            "request_id": request_id,
            "log_id": log_row.id,
            "cost": str(cost),
            "latency_ms": latency_ms,
            "pricing_missing": pricing_missing,
            "usage_source": usage_source,
        }
    return body


async def _messages_stream(
    payload: dict[str, Any],
    db: Session,
    auth: tuple[User, ApiKey],
) -> StreamingResponse:
    user, api_key = auth
    public_name = payload.get("model")
    if not public_name or not isinstance(public_name, str):
        raise HTTPException(status_code=400, detail="Missing 'model' field")
    resolved = await gateway_service.resolve_for_request(
        db, public_name, expected_type="text",
        session_key=gateway_service.session_key_for_request(api_key),
    )

    prompt_est, max_completion, _ = estimate_anthropic_messages_usage(
        payload, resolved.model.public_name
    )
    _enforce_input_token_limit(resolved.model, prompt_est)
    tpm_handle = await _enforce_tpm_limit(api_key, prompt_est + max_completion)
    redis = get_redis()
    estimate = cost_service.estimate_text_cost_upper_bound(resolved.model, prompt_est, max_completion)
    try:
        reservation = await gateway_service.preauthorize_spend(
            db, user=user, api_key=api_key, estimated_cost=estimate
        )
    except BaseException:
        await tpm_service.release_fully(redis, tpm_handle)
        raise

    request_id = gateway_service.new_request_id()
    provider_client = gateway_service.build_provider(resolved.provider)
    upstream_payload = {**payload, "model": resolved.model.upstream_model}

    async def event_stream():
        started = time.perf_counter()
        # Anthropic delivers usage incrementally:
        #   - `message_start` carries `usage.input_tokens` and a placeholder `output_tokens: 1`
        #     as well as `cache_creation_input_tokens` and `cache_read_input_tokens`
        #   - `message_delta` carries cumulative `usage.output_tokens` for the message
        # We collect both and bill from the last seen.
        input_tokens = 0
        output_tokens = 0
        cached_tokens = 0
        cache_creation_tokens = 0
        saw_usage = False
        upstream_error: dict[str, Any] | None = None
        tpm_settled = False
        try:
            try:
                async for chunk in provider_client.messages_stream(upstream_payload):
                    if chunk.parsed and chunk.parsed.get("_error"):
                        upstream_error = chunk.parsed
                        err_event = {
                            "type": "error",
                            "error": {
                                "type": "upstream_error",
                                "message": chunk.parsed.get("body", "upstream error"),
                            },
                        }
                        yield (f"event: error\ndata: {json.dumps(err_event)}\n\n").encode()
                        break
                    if chunk.parsed:
                        ev_type = chunk.parsed.get("type")
                        if ev_type == "message_start":
                            msg = chunk.parsed.get("message") or {}
                            u = msg.get("usage") or {}
                            try:
                                input_tokens = int(u.get("input_tokens") or 0)
                                output_tokens = int(u.get("output_tokens") or 0)
                                cached_tokens, cache_creation_tokens = _extract_cache_tokens(u)
                                saw_usage = True
                            except Exception:
                                pass
                            # Rewrite the model name in the start event.
                            if isinstance(msg, dict):
                                msg["model"] = resolved.model.public_name
                                chunk.parsed["message"] = msg
                                yield (f"event: {ev_type}\ndata: {json.dumps(chunk.parsed)}\n\n").encode()
                                continue
                        elif ev_type == "message_delta":
                            # cache tokens come from message_start only — don't add them in message_delta.
                            # cache_creation_input_tokens / cache_read_input_tokens are reported only in
                            # message_start (Anthropic's streaming protocol). message_delta carries only
                            # output growth; accumulating cache counts here would double-bill cache tokens.
                            u = chunk.parsed.get("usage") or {}
                            try:
                                output_tokens = int(u.get("output_tokens") or output_tokens)
                                saw_usage = True
                            except Exception:
                                pass
                    yield chunk.raw_line
            except Exception as e:
                err_event = {
                    "type": "error",
                    "error": {"type": "upstream_exception", "message": f"upstream exception: {e}"},
                }
                yield (f"event: error\ndata: {json.dumps(err_event)}\n\n").encode()
                upstream_error = {"_http": None, "body": str(e)}
            latency_ms = int((time.perf_counter() - started) * 1000)

            if upstream_error:
                gateway_service.persist_failure(
                    db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
                    request_type="text", request_payload=payload,
                    response_payload={"error": upstream_error}, request_id=request_id,
                    latency_ms=latency_ms, http_status=upstream_error.get("_http"),
                    error_code="upstream_stream_error",
                    error_message=str(upstream_error.get("body"))[:1000],
                )
                await gateway_service.release_reservation_fully(reservation)
                await tpm_service.release_fully(redis, tpm_handle)
                tpm_settled = True
                gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="failed").inc()
                return

            usage_source = UsageSource.UPSTREAM.value
            if not saw_usage:
                input_tokens, output_tokens = prompt_est, max_completion
                cached_tokens = 0
                cache_creation_tokens = 0
                usage_source = UsageSource.ESTIMATED.value
                log.warning(
                    "messages_stream_usage_missing",
                    model=resolved.model.public_name,
                    prompt_tokens=input_tokens,
                    completion_tokens=output_tokens,
                )

            cost, pricing_missing = cost_service.calc_text_cost_with_cache(
                resolved.model, input_tokens, output_tokens,
                cached_tokens=cached_tokens,
                cache_creation_tokens=cache_creation_tokens,
            )
            if pricing_missing:
                usage_source = UsageSource.MISSING.value
            pricing_source_total.labels(source=usage_source).inc()

            gateway_service.persist_success(
                db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
                request_type="text", request_payload=payload,
                response_payload={"_streamed": True, "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens}, "usage_source": usage_source},
                upstream_request_id=None, request_id=request_id, latency_ms=latency_ms,
                http_status=200, cost=cost, usage_source=usage_source,
                prompt_tokens=input_tokens or None, completion_tokens=output_tokens or None,
                total_tokens=(input_tokens + output_tokens) or None,
                prompt_cached_tokens=cached_tokens or None,
                prompt_cache_creation_tokens=cache_creation_tokens or None,
            )
            await gateway_service.finalize_reservation(reservation, actual_cost=cost)
            await tpm_service.reconcile(redis, tpm_handle, actual_tokens=input_tokens + output_tokens)
            tpm_settled = True
            gateway_requests_total.labels(type="text", model=resolved.model.public_name, status="success").inc()
            gateway_cost_usd_total.labels(type="text", model=resolved.model.public_name).inc(float(cost))
            gateway_latency_ms.labels(type="text", model=resolved.model.public_name).observe(latency_ms)
        finally:
            # Safety net: if any path above bailed before settling TPM (e.g. the
            # client cancelled the streaming response mid-flight, which raises
            # GeneratorExit), release the prededuct so it doesn't leak for the
            # full window.
            if not tpm_settled:
                try:
                    await tpm_service.release_fully(redis, tpm_handle)
                except Exception:
                    pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Gateway-Request-Id": request_id,
        },
    )


# ---------------- POST /v1/images/generations (async — returns task_id) ----------------


@router.post("/images/generations", dependencies=[Depends(_gateway_limiter)])
async def images_generations(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
) -> Any:
    user, api_key = auth
    return await gateway_service.submit_async_task(
        db, user=user, api_key=api_key, payload=payload, request_type=RequestType.IMAGE,
    )


# ---------------- POST /v1/videos/generations (async — returns task_id) ----------------


@router.post("/videos/generations", dependencies=[Depends(_gateway_limiter)])
async def videos_generations(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
) -> Any:
    user, api_key = auth
    return await gateway_service.submit_async_task(
        db, user=user, api_key=api_key, payload=payload, request_type=RequestType.VIDEO,
    )


# ---------------- GET /v1/tasks/{task_id} (locked finalize) ----------------


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
) -> Any:
    user, _api_key = auth
    raw = task_id[5:] if task_id.startswith("task_") else task_id
    try:
        local_id = int(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task_id format")

    # Ownership pre-check (without lock): cheap 404 path.
    pre = db.get(VideoTask, local_id)
    if not pre or pre.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")

    outcome = await task_service.finalize_task(db, task_id=local_id, source="client_poll")
    if outcome is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_response(outcome.task, outcome.request_log)


def _task_response(task: VideoTask, log_row: RequestLog | None) -> dict[str, Any]:
    return {
        "task_id": f"task_{task.id}",
        "status": task.status,
        "asset_url": task.asset_url,
        "error_message": task.error_message,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "_gateway": {
            "upstream_task_id": task.upstream_task_id,
            "log_id": log_row.id if log_row else None,
            "cost": str(log_row.cost) if log_row else None,
            "request_type": log_row.request_type if log_row else None,
        },
    }


# ---------------- Helpers ----------------


def _normalize_error_body(body: Any) -> dict[str, Any]:
    """Convert an upstream error body to a consistent OpenAI-style envelope."""
    if isinstance(body, dict) and isinstance(body.get("error"), dict):
        return {"error": body["error"]}
    if isinstance(body, dict):
        return {"error": {"message": str(body.get("message") or body), "type": "upstream_error"}}
    return {"error": {"message": str(body), "type": "upstream_error"}}
