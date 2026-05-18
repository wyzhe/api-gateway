"""HTTP middleware: request_id propagation + structured access logging."""
from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

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
