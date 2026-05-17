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

    # ---- Task status (shared by image and video on APIMart) ----

    async def get_task_status(self, task_id: str) -> ProviderTaskResult:
        raise NotImplementedError

    # ---- Submission helpers ----

    def extract_task_id(self, submission_body: dict[str, Any] | list) -> str | None:
        """Pull the upstream task_id out of an async submission response."""
        raise NotImplementedError
