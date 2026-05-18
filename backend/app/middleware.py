"""HTTP middleware: request_id propagation + structured access logging."""
from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from .logging_config import get_logger, request_id_var


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assigns or honors X-Request-ID; binds it to logging contextvar and the response header."""

    HEADER = "X-Request-ID"

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get(self.HEADER) or f"req_{uuid.uuid4().hex[:24]}"
        token = request_id_var.set(rid)
        # Also expose on request.state for handlers that want it.
        request.state.request_id = rid
        try:
            response: Response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers[self.HEADER] = rid
        return response


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Single-line JSON access log per request (path, status, latency)."""

    def __init__(self, app, logger_name: str = "access"):
        super().__init__(app)
        self.log = get_logger(logger_name)

    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        # Skip noisy probes.
        path = request.url.path
        is_probe = path in {"/healthz", "/readyz", "/metrics"}
        try:
            response = await call_next(request)
        except Exception:
            latency_ms = int((time.perf_counter() - started) * 1000)
            self.log.exception(
                "http_error",
                method=request.method,
                path=path,
                latency_ms=latency_ms,
            )
            raise
        latency_ms = int((time.perf_counter() - started) * 1000)
        if not is_probe:
            self.log.info(
                "http_request",
                method=request.method,
                path=path,
                status=response.status_code,
                latency_ms=latency_ms,
            )
        return response


class BodySizeLimitMiddleware:
    """Reject requests whose body exceeds `max_bytes`.

    Two-stage check:
    1. If `Content-Length` is present and > max_bytes, return 413 immediately.
    2. Otherwise, count bytes as they stream in and abort once we cross the cap.

    Implemented as raw ASGI middleware (not BaseHTTPMiddleware) so we can
    abort streaming as soon as the cap is crossed, without buffering the
    entire body just to size-check it. On the success path we do buffer
    the body (bounded by max_bytes) and replay it to the downstream app.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.log = get_logger(__name__)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Stage 1: trust Content-Length when present.
        cl = next(
            (v for k, v in scope.get("headers", []) if k == b"content-length"),
            None,
        )
        if cl is not None:
            try:
                cl_int = int(cl)
                if cl_int > self.max_bytes:
                    self.log.warning(
                        "body_too_large",
                        path=scope.get("path"),
                        max_bytes=self.max_bytes,
                        received_bytes=cl_int,
                    )
                    await PlainTextResponse(
                        "Request body too large.",
                        status_code=413,
                    )(scope, receive, send)
                    return
            except ValueError:
                pass

        # Stage 2: stream-count and replay.
        received = 0
        body_chunks: list[bytes] = []
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] == "http.request":
                chunk = message.get("body", b"")
                received += len(chunk)
                if received > self.max_bytes:
                    self.log.warning(
                        "body_too_large",
                        path=scope.get("path"),
                        max_bytes=self.max_bytes,
                        received_bytes=received,
                    )
                    await PlainTextResponse(
                        "Request body too large.",
                        status_code=413,
                    )(scope, receive, send)
                    return
                body_chunks.append(chunk)
                more_body = message.get("more_body", False)
            else:
                # http.disconnect (client gone) or unknown message type: abort without
                # forwarding a partial body to the downstream app.
                return

        joined = b"".join(body_chunks)
        sent = False

        async def replay_receive():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": joined, "more_body": False}
            return {"type": "http.disconnect"}

        await self.app(scope, replay_receive, send)
