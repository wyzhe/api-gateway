"""APIMart provider adapter.

ALL APIMart-specific knowledge lives in this file. Business code never sees
APIMart paths, headers, response wrappers, or status-value casing.

Docs (verified 2026-05): https://docs.apimart.ai/
- Chat:  POST /v1/chat/completions    (OpenAI-compatible, sync + SSE stream)
- Image: POST /v1/images/generations  (ASYNC — returns task_id, poll /v1/tasks)
- Video: POST /v1/videos/generations  (ASYNC — wrapped {code, data:[{task_id, status}]})
- Task:  GET  /v1/tasks/{task_id}     (status: pending|processing|completed|failed|cancelled)
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx

from ..config import get_settings
from ..metrics import upstream_latency_ms
from ._sse import parse_sse_line
from .base import BaseProvider, ProviderResponse, ProviderStreamChunk, ProviderTaskResult

PATH_CHAT = "/chat/completions"
PATH_MESSAGES = "/messages"
PATH_IMAGES = "/images/generations"
PATH_VIDEOS = "/videos/generations"
PATH_TASK = "/tasks/{task_id}"

TASK_STATUS_MAP = {
    "pending": "queued",
    "processing": "running",
    "completed": "succeeded",
    "failed": "failed",
    "cancelled": "failed",
}

_HTTPX_CLIENT: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _HTTPX_CLIENT
    if _HTTPX_CLIENT is None:
        settings = get_settings()
        timeout = httpx.Timeout(
            connect=settings.apimart_timeout_connect,
            read=settings.apimart_timeout_read,
            write=settings.apimart_timeout_write,
            pool=10.0,
        )
        limits = httpx.Limits(max_keepalive_connections=20, max_connections=100, keepalive_expiry=30.0)
        # Retries only for idempotent transport-level failures (DNS / connect / read).
        # Non-idempotent POSTs (generation submissions) are NOT auto-retried here.
        transport = httpx.AsyncHTTPTransport(retries=2)
        _HTTPX_CLIENT = httpx.AsyncClient(timeout=timeout, limits=limits, transport=transport)
    return _HTTPX_CLIENT


async def close_client() -> None:
    global _HTTPX_CLIENT
    if _HTTPX_CLIENT is not None:
        try:
            await _HTTPX_CLIENT.aclose()
        except Exception:
            pass
        _HTTPX_CLIENT = None


class APIMartProvider(BaseProvider):
    name = "apimart"

    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    @staticmethod
    def _request_id(resp: httpx.Response) -> str | None:
        for h in ("x-request-id", "x-apimart-request-id", "x-upstream-request-id"):
            if h in resp.headers:
                return resp.headers[h]
        return None

    # ---------------- Chat ----------------

    async def chat_completions(
        self,
        payload: dict[str, Any],
        *,
        stream: bool = False,
    ) -> ProviderResponse:
        with upstream_latency_ms.labels(provider=self.name, operation="chat").time():
            resp = await _client().post(
                self._url(PATH_CHAT),
                headers=self._headers(),
                json={**payload, "stream": False},
            )
        body = resp.json() if resp.content else {}
        return ProviderResponse(
            http_status=resp.status_code,
            body=body,
            upstream_request_id=self._request_id(resp),
        )

    async def chat_completions_stream(
        self,
        payload: dict[str, Any],
    ) -> AsyncIterator[ProviderStreamChunk]:
        body = {**payload, "stream": True}
        opts = dict(body.get("stream_options") or {})
        opts.setdefault("include_usage", True)
        body["stream_options"] = opts

        async with _client().stream(
            "POST",
            self._url(PATH_CHAT),
            headers={**self._headers(), "Accept": "text/event-stream"},
            json=body,
        ) as resp:
            if resp.status_code != 200:
                err = await resp.aread()
                yield ProviderStreamChunk(
                    raw_line=b"data: " + err + b"\n\n",
                    parsed={"_error": True, "_http": resp.status_code, "body": err.decode(errors="replace")},
                )
                return
            async for raw_line in resp.aiter_lines():
                yield parse_sse_line(raw_line)

    # ---------------- Anthropic Messages API ----------------

    async def messages(self, payload: dict[str, Any]) -> ProviderResponse:
        with upstream_latency_ms.labels(provider=self.name, operation="messages").time():
            resp = await _client().post(
                self._url(PATH_MESSAGES),
                headers=self._headers(),
                json={**payload, "stream": False},
            )
        body = resp.json() if resp.content else {}
        return ProviderResponse(
            http_status=resp.status_code,
            body=body,
            upstream_request_id=self._request_id(resp),
        )

    async def messages_stream(
        self,
        payload: dict[str, Any],
    ) -> AsyncIterator[ProviderStreamChunk]:
        body = {**payload, "stream": True}
        async with _client().stream(
            "POST",
            self._url(PATH_MESSAGES),
            headers={**self._headers(), "Accept": "text/event-stream"},
            json=body,
        ) as resp:
            if resp.status_code != 200:
                err = await resp.aread()
                yield ProviderStreamChunk(
                    raw_line=b"data: " + err + b"\n\n",
                    parsed={"_error": True, "_http": resp.status_code, "body": err.decode(errors="replace")},
                )
                return
            # Anthropic SSE events have BOTH `event: <name>` and `data: {...}` lines.
            # We forward both verbatim and only parse `data:` lines for usage extraction.
            async for raw_line in resp.aiter_lines():
                yield parse_sse_line(raw_line)

    # ---------------- Image (async) ----------------

    async def image_generation(self, payload: dict[str, Any]) -> ProviderResponse:
        with upstream_latency_ms.labels(provider=self.name, operation="image_submit").time():
            resp = await _client().post(
                self._url(PATH_IMAGES),
                headers=self._headers(),
                json=payload,
            )
        return ProviderResponse(
            http_status=resp.status_code,
            body=(resp.json() if resp.content else {}),
            upstream_request_id=self._request_id(resp),
        )

    # ---------------- Video (async) ----------------

    async def video_generation(self, payload: dict[str, Any]) -> ProviderResponse:
        with upstream_latency_ms.labels(provider=self.name, operation="video_submit").time():
            resp = await _client().post(
                self._url(PATH_VIDEOS),
                headers=self._headers(),
                json=payload,
            )
        return ProviderResponse(
            http_status=resp.status_code,
            body=(resp.json() if resp.content else {}),
            upstream_request_id=self._request_id(resp),
        )

    def extract_task_id(self, submission_body: dict[str, Any] | list) -> str | None:
        if not isinstance(submission_body, dict):
            return None
        data = submission_body.get("data")
        if isinstance(data, list) and data and isinstance(data[0], dict):
            for k in ("task_id", "id"):
                if k in data[0]:
                    return str(data[0][k])
        for k in ("task_id", "id"):
            if k in submission_body:
                return str(submission_body[k])
        return None

    # ---------------- Task status ----------------

    async def get_task_status(self, task_id: str) -> ProviderTaskResult:
        with upstream_latency_ms.labels(provider=self.name, operation="task_status").time():
            resp = await _client().get(
                self._url(PATH_TASK.format(task_id=task_id)),
                headers=self._headers(),
            )
        body: dict[str, Any] = resp.json() if resp.content else {}

        payload = body["data"] if isinstance(body, dict) and isinstance(body.get("data"), dict) else body

        raw_status = (payload.get("status") if isinstance(payload, dict) else None) or ""
        norm = TASK_STATUS_MAP.get(raw_status.lower(), "running" if raw_status else "queued")

        asset_urls: list[str] = []
        duration: float | None = None
        if isinstance(payload, dict):
            result = payload.get("result") or {}
            if isinstance(result, dict):
                for v in result.get("videos") or []:
                    if isinstance(v, dict):
                        url = v.get("url")
                        if isinstance(url, str):
                            asset_urls.append(url)
                        elif isinstance(url, list) and url:
                            asset_urls.extend(u for u in url if isinstance(u, str))
                        if duration is None:
                            for k in ("duration", "length", "seconds"):
                                if k in v and isinstance(v[k], (int, float)):
                                    duration = float(v[k])
                                    break
                for im in result.get("images") or []:
                    if isinstance(im, dict):
                        url = im.get("url")
                        if isinstance(url, str):
                            asset_urls.append(url)
                        elif isinstance(url, list) and url:
                            asset_urls.extend(u for u in url if isinstance(u, str))

        error_msg = None
        if norm == "failed" and isinstance(payload, dict):
            error_msg = payload.get("error_message") or payload.get("message") or str(payload.get("error") or "")

        return ProviderTaskResult(
            status=norm,
            raw_status=raw_status or None,
            asset_urls=asset_urls,
            duration_seconds=duration,
            error_message=error_msg or None,
            raw_body=body if isinstance(body, dict) else None,
        )
