"""OpenAI-compatible gateway routes mounted at /v1/*.

Authentication: user API key (Authorization: Bearer lgw_...).
NOT the dashboard JWT — those endpoints live under /api/.
"""
import json
import time
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..deps import get_api_key_user, get_db
from ..models import ApiKey, ModelRow, RequestLog, User, VideoTask  # VideoTask used in get_task
from ..services import cost_service, gateway_service

router = APIRouter(prefix="/v1", tags=["gateway"])


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
            # Extension fields (still OpenAI-compatible since clients ignore unknowns).
            "type": r.type,
            "pricing_mode": r.pricing_mode,
        }
        for r in rows
    ]
    return {"object": "list", "data": data}


# ---------------- POST /v1/chat/completions (non-streaming for M4) ----------------


@router.post("/chat/completions")
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
    gateway_service.require_balance(user)

    request_id = gateway_service.new_request_id()
    provider_client = gateway_service.build_provider(resolved.provider)

    upstream_payload = {**payload, "model": resolved.model.upstream_model}
    upstream_payload.pop("stream", None)  # we control stream

    started = time.perf_counter()
    try:
        resp = await provider_client.chat_completions(upstream_payload, stream=False)
    except Exception as e:
        latency_ms = int((time.perf_counter() - started) * 1000)
        gateway_service.persist_failure(
            db,
            user=user,
            api_key=api_key,
            provider=resolved.provider,
            model=resolved.model,
            request_type="text",
            request_payload=payload,
            response_payload=None,
            request_id=request_id,
            latency_ms=latency_ms,
            http_status=None,
            error_code="upstream_exception",
            error_message=str(e)[:1000],
        )
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {e}")

    latency_ms = int((time.perf_counter() - started) * 1000)

    # Upstream non-2xx → log failure, no debit, surface error.
    if resp.http_status >= 400:
        body_text = resp.body if isinstance(resp.body, (dict, list)) else {"raw": str(resp.body)}
        err_msg = ""
        if isinstance(resp.body, dict):
            err = resp.body.get("error")
            if isinstance(err, dict):
                err_msg = str(err.get("message") or err)
            elif isinstance(err, str):
                err_msg = err
            err_msg = err_msg or str(resp.body.get("message") or "")
        gateway_service.persist_failure(
            db,
            user=user,
            api_key=api_key,
            provider=resolved.provider,
            model=resolved.model,
            request_type="text",
            request_payload=payload,
            response_payload=body_text,
            request_id=request_id,
            latency_ms=latency_ms,
            http_status=resp.http_status,
            error_code=f"upstream_{resp.http_status}",
            error_message=err_msg[:1000] if err_msg else None,
            upstream_request_id=resp.upstream_request_id,
        )
        raise HTTPException(status_code=resp.http_status, detail=body_text)

    body = resp.body if isinstance(resp.body, dict) else {}
    usage = body.get("usage") or {}
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))

    cost, pricing_missing = cost_service.calc_text_cost(
        resolved.model, prompt_tokens, completion_tokens
    )

    log = gateway_service.persist_success(
        db,
        user=user,
        api_key=api_key,
        provider=resolved.provider,
        model=resolved.model,
        request_type="text",
        request_payload=payload,
        response_payload=body,
        upstream_request_id=resp.upstream_request_id,
        request_id=request_id,
        latency_ms=latency_ms,
        http_status=resp.http_status,
        cost=cost,
        pricing_missing=pricing_missing,
        prompt_tokens=prompt_tokens or None,
        completion_tokens=completion_tokens or None,
        total_tokens=total_tokens or None,
    )

    # Rewrite the `model` field in the response to the public name so clients
    # don't accidentally rely on the upstream alias.
    if isinstance(body, dict):
        body = {**body, "model": resolved.model.public_name}
        body.setdefault("id", f"chatcmpl-{request_id}")
        # Add a small extension block for our own gateway metadata. OpenAI clients ignore it.
        body["_gateway"] = {
            "request_id": request_id,
            "log_id": log.id,
            "cost": str(cost),
            "latency_ms": latency_ms,
            "pricing_missing": pricing_missing,
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
    gateway_service.require_balance(user)

    request_id = gateway_service.new_request_id()
    provider_client = gateway_service.build_provider(resolved.provider)

    upstream_payload = {**payload, "model": resolved.model.upstream_model}

    async def event_stream():
        started = time.perf_counter()
        # Aggregate usage from the final chunk (SSE w/ include_usage).
        final_usage: dict[str, Any] | None = None
        upstream_error: dict[str, Any] | None = None
        first_chunk_sent = False
        try:
            async for chunk in provider_client.chat_completions_stream(upstream_payload):
                if chunk.parsed and chunk.parsed.get("_error"):
                    upstream_error = chunk.parsed
                    # Forward error as a synthetic SSE event so the client sees it.
                    err_event = {
                        "error": {
                            "message": chunk.parsed.get("body", "upstream error"),
                            "code": f"upstream_{chunk.parsed.get('_http')}",
                        }
                    }
                    yield (f"data: {json.dumps(err_event)}\n\n").encode()
                    break
                # On each chunk, sniff `usage` (only the last one carries it).
                if chunk.parsed and isinstance(chunk.parsed.get("usage"), dict):
                    final_usage = chunk.parsed["usage"]
                # Rewrite model field in the chunk to public_name for consistency.
                if chunk.parsed and "model" in chunk.parsed:
                    chunk.parsed["model"] = resolved.model.public_name
                    line = (f"data: {json.dumps(chunk.parsed)}\n\n").encode()
                    yield line
                    first_chunk_sent = True
                else:
                    yield chunk.raw_line
                    if chunk.raw_line.startswith(b"data: "):
                        first_chunk_sent = True
        except Exception as e:
            err_event = {"error": {"message": f"upstream exception: {e}", "code": "upstream_exception"}}
            yield (f"data: {json.dumps(err_event)}\n\n").encode()
            upstream_error = {"_http": None, "body": str(e)}
        latency_ms = int((time.perf_counter() - started) * 1000)

        # Persist log + debit AFTER the stream finishes.
        if upstream_error:
            gateway_service.persist_failure(
                db,
                user=user,
                api_key=api_key,
                provider=resolved.provider,
                model=resolved.model,
                request_type="text",
                request_payload=payload,
                response_payload={"error": upstream_error},
                request_id=request_id,
                latency_ms=latency_ms,
                http_status=upstream_error.get("_http"),
                error_code="upstream_stream_error",
                error_message=str(upstream_error.get("body"))[:1000],
            )
        else:
            prompt_tokens = int((final_usage or {}).get("prompt_tokens") or 0)
            completion_tokens = int((final_usage or {}).get("completion_tokens") or 0)
            total_tokens = int(
                (final_usage or {}).get("total_tokens")
                or (prompt_tokens + completion_tokens)
            )
            if final_usage is None:
                # TODO(stream-usage): upstream did not return usage even with
                # include_usage=true — record cost=0 + pricing_missing flag.
                cost = Decimal("0")
                pricing_missing = True
            else:
                cost, pricing_missing = cost_service.calc_text_cost(
                    resolved.model, prompt_tokens, completion_tokens
                )
            gateway_service.persist_success(
                db,
                user=user,
                api_key=api_key,
                provider=resolved.provider,
                model=resolved.model,
                request_type="text",
                request_payload=payload,
                response_payload={"_streamed": True, "usage": final_usage},
                upstream_request_id=None,
                request_id=request_id,
                latency_ms=latency_ms,
                http_status=200,
                cost=cost,
                pricing_missing=pricing_missing,
                prompt_tokens=prompt_tokens or None,
                completion_tokens=completion_tokens or None,
                total_tokens=total_tokens or None,
            )

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


@router.post("/images/generations")
async def images_generations(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
) -> Any:
    user, api_key = auth
    public_name = payload.get("model")
    if not public_name or not isinstance(public_name, str):
        raise HTTPException(status_code=400, detail="Missing 'model' field")
    resolved = gateway_service.resolve_model(db, public_name, expected_type="image")
    gateway_service.require_balance(user)

    request_id = gateway_service.new_request_id()
    provider_client = gateway_service.build_provider(resolved.provider)

    upstream_payload = {**payload, "model": resolved.model.upstream_model}

    started = time.perf_counter()
    try:
        resp = await provider_client.image_generation(upstream_payload)
    except Exception as e:
        latency_ms = int((time.perf_counter() - started) * 1000)
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="image", request_payload=payload, response_payload=None,
            request_id=request_id, latency_ms=latency_ms, http_status=None,
            error_code="upstream_exception", error_message=str(e)[:1000],
        )
        raise HTTPException(status_code=502, detail=f"Upstream image submit failed: {e}")
    latency_ms = int((time.perf_counter() - started) * 1000)

    if resp.http_status >= 400:
        body_text = resp.body if isinstance(resp.body, (dict, list)) else {"raw": str(resp.body)}
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="image", request_payload=payload, response_payload=body_text,
            request_id=request_id, latency_ms=latency_ms, http_status=resp.http_status,
            error_code=f"upstream_{resp.http_status}", error_message=None,
            upstream_request_id=resp.upstream_request_id,
        )
        raise HTTPException(status_code=resp.http_status, detail=body_text)

    # APIMart returns a task_id (image generation is async).
    task_id = provider_client.extract_task_id(resp.body)
    if not task_id:
        # Defensive: upstream did not include a task_id we recognize.
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="image", request_payload=payload, response_payload=resp.body,
            request_id=request_id, latency_ms=latency_ms, http_status=resp.http_status,
            error_code="no_task_id", error_message="Upstream response lacked a recognizable task_id",
            upstream_request_id=resp.upstream_request_id,
        )
        raise HTTPException(status_code=502, detail="Upstream did not return a task_id")

    log, task_row = gateway_service.persist_queued_task(
        db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
        request_type="image", request_payload=payload, response_payload=resp.body,
        upstream_request_id=resp.upstream_request_id, request_id=request_id,
        latency_ms=latency_ms, http_status=resp.http_status, upstream_task_id=task_id,
    )

    return {
        "task_id": f"task_{task_row.id}",
        "status": "queued",
        "type": "image",
        "_gateway": {
            "request_id": request_id,
            "log_id": log.id,
            "upstream_task_id": task_id,
            "latency_ms": latency_ms,
        },
        "raw": resp.body,
    }


# ---------------- POST /v1/videos/generations (async — returns task_id) ----------------


@router.post("/videos/generations")
async def videos_generations(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
) -> Any:
    user, api_key = auth
    public_name = payload.get("model")
    if not public_name or not isinstance(public_name, str):
        raise HTTPException(status_code=400, detail="Missing 'model' field")
    resolved = gateway_service.resolve_model(db, public_name, expected_type="video")
    gateway_service.require_balance(user)

    request_id = gateway_service.new_request_id()
    provider_client = gateway_service.build_provider(resolved.provider)

    upstream_payload = {**payload, "model": resolved.model.upstream_model}

    started = time.perf_counter()
    try:
        resp = await provider_client.video_generation(upstream_payload)
    except Exception as e:
        latency_ms = int((time.perf_counter() - started) * 1000)
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="video", request_payload=payload, response_payload=None,
            request_id=request_id, latency_ms=latency_ms, http_status=None,
            error_code="upstream_exception", error_message=str(e)[:1000],
        )
        raise HTTPException(status_code=502, detail=f"Upstream video submit failed: {e}")
    latency_ms = int((time.perf_counter() - started) * 1000)

    if resp.http_status >= 400:
        body_text = resp.body if isinstance(resp.body, (dict, list)) else {"raw": str(resp.body)}
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="video", request_payload=payload, response_payload=body_text,
            request_id=request_id, latency_ms=latency_ms, http_status=resp.http_status,
            error_code=f"upstream_{resp.http_status}", error_message=None,
            upstream_request_id=resp.upstream_request_id,
        )
        raise HTTPException(status_code=resp.http_status, detail=body_text)

    task_id = provider_client.extract_task_id(resp.body)
    if not task_id:
        gateway_service.persist_failure(
            db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
            request_type="video", request_payload=payload, response_payload=resp.body,
            request_id=request_id, latency_ms=latency_ms, http_status=resp.http_status,
            error_code="no_task_id", error_message="Upstream response lacked a recognizable task_id",
            upstream_request_id=resp.upstream_request_id,
        )
        raise HTTPException(status_code=502, detail="Upstream did not return a task_id")

    log, task_row = gateway_service.persist_queued_task(
        db, user=user, api_key=api_key, provider=resolved.provider, model=resolved.model,
        request_type="video", request_payload=payload, response_payload=resp.body,
        upstream_request_id=resp.upstream_request_id, request_id=request_id,
        latency_ms=latency_ms, http_status=resp.http_status, upstream_task_id=task_id,
    )

    return {
        "task_id": f"task_{task_row.id}",
        "status": "queued",
        "type": "video",
        "_gateway": {
            "request_id": request_id,
            "log_id": log.id,
            "upstream_task_id": task_id,
            "latency_ms": latency_ms,
        },
        "raw": resp.body,
    }


# ---------------- GET /v1/tasks/{task_id} (lazy poll + finalize) ----------------


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    auth: tuple[User, ApiKey] = Depends(get_api_key_user),
) -> Any:
    user, _api_key = auth
    # Accept both "task_<localid>" and bare numeric.
    raw = task_id[5:] if task_id.startswith("task_") else task_id
    try:
        local_id = int(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task_id format")

    task = db.get(VideoTask, local_id)
    if not task or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")

    log = db.get(RequestLog, task.request_log_id) if task.request_log_id else None
    model = db.get(ModelRow, task.model_id) if task.model_id else None
    from ..models import Provider as _Prov

    provider_row = db.get(_Prov, task.provider_id) if task.provider_id else None

    # Terminal already — return as-is.
    if task.status in ("succeeded", "failed"):
        return _task_response(task, log)

    if not provider_row or not model:
        raise HTTPException(status_code=500, detail="Task is missing model/provider")

    provider_client = gateway_service.build_provider(provider_row)
    try:
        result = await provider_client.get_task_status(task.upstream_task_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream task fetch failed: {e}")

    # Update local task row + maybe the request_log.
    task.status = result.status
    if result.status == "succeeded":
        if result.asset_urls:
            task.asset_url = result.asset_urls[0]
        # Finalize the request_log: status=success, cost charged, asset_url set.
        if log and log.status != "success":
            req_type = log.request_type
            if req_type == "video":
                duration = (
                    Decimal(str(result.duration_seconds))
                    if result.duration_seconds is not None
                    else None
                )
                cost, pricing_missing = cost_service.calc_video_cost(model, duration)
                log.video_duration = duration
            else:  # image
                # Default n=1 if not in payload; respect explicit n.
                n = 1
                if isinstance(log.request_payload_json, dict):
                    try:
                        n = int(log.request_payload_json.get("n", 1) or 1)
                    except Exception:
                        n = 1
                cost, pricing_missing = cost_service.calc_image_cost(model, n)
                log.image_count = n
            log.status = "success"
            log.task_status = "succeeded"
            log.cost = cost
            log.asset_url = task.asset_url or (result.asset_urls[0] if result.asset_urls else None)
            if pricing_missing:
                log.error_message = (log.error_message or "") + " pricing_missing=true"
            # Debit + transaction record.
            if cost > 0:
                from ..services import billing_service

                billing_service.debit(
                    db, user.id, cost, request_log_id=log.id,
                    note=f"{req_type}:{model.public_name}",
                )
        db.commit()
    elif result.status == "failed":
        task.error_message = result.error_message
        if log and log.status != "failed":
            log.status = "failed"
            log.task_status = "failed"
            log.error_message = result.error_message
            log.error_code = "upstream_task_failed"
        db.commit()
    else:
        # queued / running — update task_status on the log too.
        if log:
            log.task_status = result.status
        db.commit()

    db.refresh(task)
    if log:
        db.refresh(log)
    return _task_response(task, log)


def _task_response(task: VideoTask, log: RequestLog | None) -> dict[str, Any]:
    return {
        "task_id": f"task_{task.id}",
        "status": task.status,
        "asset_url": task.asset_url,
        "error_message": task.error_message,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "_gateway": {
            "upstream_task_id": task.upstream_task_id,
            "log_id": log.id if log else None,
            "cost": str(log.cost) if log else None,
            "request_type": log.request_type if log else None,
        },
    }
