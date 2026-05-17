"""APIMart provider adapter.

ALL APIMart-specific knowledge lives in this file. Business code never sees
APIMart paths, headers, response wrappers, or status-value casing.

Docs (verified 2026-05): https://docs.apimart.ai/
- Chat:  POST /v1/chat/completions    (OpenAI-compatible, sync + SSE stream)
- Image: POST /v1/images/generations  (ASYNC — returns task_id, poll /v1/tasks)
- Video: POST /v1/videos/generations  (ASYNC — wrapped {code, data:[{task_id, status}]})
- Task:  GET  /v1/tasks/{task_id}     (status: pending|processing|completed|failed|cancelled)
"""
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .base import BaseProvider, ProviderResponse, ProviderStreamChunk, ProviderTaskResult

# ---- Endpoint paths (single source of truth for APIMart) ----
PATH_CHAT = "/chat/completions"
PATH_IMAGES = "/images/generations"
PATH_VIDEOS = "/videos/generations"
PATH_TASK = "/tasks/{task_id}"

# APIMart task status -> our internal task_status vocabulary.
TASK_STATUS_MAP = {
    "pending": "queued",
    "processing": "running",
    "completed": "succeeded",
    "failed": "failed",
    "cancelled": "failed",
}

DEFAULT_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)


class APIMartProvider(BaseProvider):
    name = "apimart"

    def __init__(self, base_url: str, api_key: str) -> None:
        # Strip trailing slash so PATH_* concat cleanly.
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
        # APIMart may surface upstream request IDs via standard headers. Be lenient.
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
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.post(
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
        # Force include_usage so the final SSE event contains usage for billing.
        body = {**payload, "stream": True}
        opts = dict(body.get("stream_options") or {})
        opts.setdefault("include_usage", True)
        body["stream_options"] = opts

        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            async with client.stream(
                "POST",
                self._url(PATH_CHAT),
                headers={**self._headers(), "Accept": "text/event-stream"},
                json=body,
            ) as resp:
                if resp.status_code != 200:
                    # Surface the error body as a single chunk for the gateway layer.
                    err = await resp.aread()
                    yield ProviderStreamChunk(
                        raw_line=b"data: " + err + b"\n\n",
                        parsed={"_error": True, "_http": resp.status_code, "body": err.decode(errors="replace")},
                    )
                    return
                async for raw_line in resp.aiter_lines():
                    if raw_line == "":
                        # SSE separator
                        yield ProviderStreamChunk(raw_line=b"\n", parsed=None)
                        continue
                    if raw_line.startswith(":"):
                        # Heartbeat / comment — pass through verbatim
                        yield ProviderStreamChunk(raw_line=(raw_line + "\n").encode(), parsed=None)
                        continue
                    parsed = None
                    if raw_line.startswith("data: "):
                        data_str = raw_line[6:]
                        if data_str != "[DONE]":
                            import json as _json

                            try:
                                parsed = _json.loads(data_str)
                            except Exception:
                                parsed = None
                    yield ProviderStreamChunk(
                        raw_line=(raw_line + "\n").encode(),
                        parsed=parsed,
                    )

    # ---------------- Image (async) ----------------

    async def image_generation(self, payload: dict[str, Any]) -> ProviderResponse:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.post(
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
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.post(
                self._url(PATH_VIDEOS),
                headers=self._headers(),
                json=payload,
            )
            return ProviderResponse(
                http_status=resp.status_code,
                body=(resp.json() if resp.content else {}),
                upstream_request_id=self._request_id(resp),
            )

    @staticmethod
    def extract_task_id(submission_body: dict[str, Any] | list) -> str | None:
        """APIMart submission response shape (video):
            {"code": 200, "data": [{"task_id": "...", "status": "submitted"}]}
        Image submissions follow a similar wrapper or may use OpenAI-ish shape.
        Be defensive."""
        if isinstance(submission_body, dict):
            # Wrapped form
            data = submission_body.get("data")
            if isinstance(data, list) and data:
                first = data[0] if isinstance(data[0], dict) else None
                if first:
                    for k in ("task_id", "id"):
                        if k in first:
                            return str(first[k])
            for k in ("task_id", "id"):
                if k in submission_body:
                    return str(submission_body[k])
            # OpenAI-ish image: {"created": ..., "data":[{"url": ..., "task_id": ...}]}
            # already covered above.
        return None

    # ---------------- Task status ----------------

    async def get_task_status(self, task_id: str) -> ProviderTaskResult:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.get(
                self._url(PATH_TASK.format(task_id=task_id)),
                headers=self._headers(),
            )
            body: dict[str, Any] = resp.json() if resp.content else {}

        # Some endpoints wrap as {"code":200,"data":{...}}, others return flat.
        payload = body
        if isinstance(body, dict) and isinstance(body.get("data"), dict) and "status" not in body:
            payload = body["data"]
        elif isinstance(body, dict) and "data" not in body and "status" in body:
            payload = body
        elif isinstance(body, dict) and isinstance(body.get("data"), dict):
            payload = body["data"]

        raw_status = (payload.get("status") if isinstance(payload, dict) else None) or ""
        norm = TASK_STATUS_MAP.get(raw_status.lower(), "running" if raw_status else "queued")

        asset_urls: list[str] = []
        duration: float | None = None
        if isinstance(payload, dict):
            result = payload.get("result") or {}
            # videos
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
                # images
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
