"""DeepSeek provider adapter.

ALL DeepSeek-specific knowledge lives in this file. DeepSeek exposes an
OpenAI-compatible Chat Completions API and an Anthropic-compatible Messages
API on separate base paths:
  - Chat:     POST {base}/chat/completions       (OpenAI format, sync + SSE)
  - Messages: POST {base}/anthropic/v1/messages  (Anthropic format, sync + SSE)
DeepSeek has no image/video generation — those BaseProvider methods are left
unimplemented (they raise NotImplementedError).

Docs (verified 2026-05): https://api-docs.deepseek.com/
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx

from ..config import get_settings
from ..metrics import upstream_latency_ms
from ._sse import parse_sse_line
from .base import BaseProvider, ProviderResponse, ProviderStreamChunk

PATH_CHAT = "/chat/completions"
PATH_MESSAGES = "/anthropic/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

_HTTPX_CLIENT: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _HTTPX_CLIENT
    if _HTTPX_CLIENT is None:
        settings = get_settings()
        timeout = httpx.Timeout(
            connect=settings.deepseek_timeout_connect,
            read=settings.deepseek_timeout_read,
            write=settings.deepseek_timeout_write,
            pool=10.0,
        )
        limits = httpx.Limits(max_keepalive_connections=20, max_connections=100, keepalive_expiry=30.0)
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


class DeepSeekProvider(BaseProvider):
    name = "deepseek"

    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _chat_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _messages_headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    @staticmethod
    def _request_id(resp: httpx.Response) -> str | None:
        for h in ("x-request-id", "x-ds-request-id"):
            if h in resp.headers:
                return resp.headers[h]
        return None

    # ---------------- Chat (OpenAI format) ----------------

    async def chat_completions(
        self,
        payload: dict[str, Any],
        *,
        stream: bool = False,
    ) -> ProviderResponse:
        with upstream_latency_ms.labels(provider=self.name, operation="chat").time():
            resp = await _client().post(
                self._url(PATH_CHAT),
                headers=self._chat_headers(),
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
            headers={**self._chat_headers(), "Accept": "text/event-stream"},
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
                headers=self._messages_headers(),
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
            headers={**self._messages_headers(), "Accept": "text/event-stream"},
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
