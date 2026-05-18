"""Provider adapter abstraction.

Business code calls the provider via this interface only. Concrete adapters (e.g.
APIMartProvider) encapsulate every upstream-specific detail: endpoint paths,
auth headers, request body shape, response wrapping/unwrapping, async task ID
extraction.

Adding a new provider later = subclass BaseProvider + register it in the
provider service.
"""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any


@dataclass
class ProviderResponse:
    """Normalized non-streaming response returned to the gateway layer."""

    http_status: int
    body: dict[str, Any] | list  # parsed JSON
    upstream_request_id: str | None = None


@dataclass
class ProviderStreamChunk:
    """A single SSE event chunk, byte-faithful to what we forward downstream."""

    raw_line: bytes  # already encoded SSE line, e.g. b"data: {...}\n\n"
    parsed: dict[str, Any] | None = None  # parsed JSON if it was a `data:` chunk


@dataclass
class ProviderTaskResult:
    """Result of polling an async task (image / video)."""

    status: str  # queued | running | succeeded | failed (normalized)
    raw_status: str | None
    asset_urls: list[str]  # final image/video URLs when succeeded
    duration_seconds: float | None  # for video tasks
    error_message: str | None
    raw_body: dict[str, Any] | None


@dataclass
class MessagesUsage:
    """Normalized Anthropic-Messages-style token counts."""

    input_tokens: int
    output_tokens: int

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens


class BaseProvider:
    """Adapter interface. All methods are async and use httpx underneath."""

    name: str = "base"

    # ---- Chat ----

    async def chat_completions(
        self,
        payload: dict[str, Any],
        *,
        stream: bool = False,
    ) -> ProviderResponse:
        raise NotImplementedError

    async def chat_completions_stream(
        self,
        payload: dict[str, Any],
    ) -> AsyncIterator[ProviderStreamChunk]:
        raise NotImplementedError

    # ---- Image (async on APIMart — returns task_id) ----

    async def image_generation(self, payload: dict[str, Any]) -> ProviderResponse:
        raise NotImplementedError

    # ---- Video (async — returns task_id) ----

    async def video_generation(self, payload: dict[str, Any]) -> ProviderResponse:
        raise NotImplementedError

    # ---- Anthropic Messages API ----

    async def messages(self, payload: dict[str, Any]) -> ProviderResponse:
        """Anthropic-style /v1/messages, non-streaming. Response body matches
        Anthropic's schema: {id, type:"message", role, content:[...], stop_reason,
        usage:{input_tokens, output_tokens}}."""
        raise NotImplementedError

    async def messages_stream(self, payload: dict[str, Any]) -> AsyncIterator[ProviderStreamChunk]:
        """SSE stream of Anthropic Messages events. Yields raw_line bytes
        suitable for forwarding plus a parsed dict when the line is a
        `data: {...}` chunk. The terminal `message_stop` / `message_delta`
        carries the usage block."""
        raise NotImplementedError

    @staticmethod
    def extract_messages_usage(body: dict[str, Any] | None) -> MessagesUsage | None:
        """Pull a normalized usage block out of an Anthropic messages response.
        Returns None when missing."""
        if not isinstance(body, dict):
            return None
        usage = body.get("usage")
        if not isinstance(usage, dict):
            return None
        try:
            return MessagesUsage(
                input_tokens=int(usage.get("input_tokens") or 0),
                output_tokens=int(usage.get("output_tokens") or 0),
            )
        except Exception:
            return None

    # ---- Task status (shared by image and video on APIMart) ----

    async def get_task_status(self, task_id: str) -> ProviderTaskResult:
        raise NotImplementedError

    # ---- Submission helpers ----

    def extract_task_id(self, submission_body: dict[str, Any] | list) -> str | None:
        """Pull the upstream task_id out of an async submission response."""
        raise NotImplementedError
