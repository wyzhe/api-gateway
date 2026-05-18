"""Rate limit dependencies.

Thin wrapper around fastapi-limiter that degrades gracefully if Redis was
unavailable at startup. In production the lifespan re-raises Redis errors,
so this only matters for local-dev and tests.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter


def _initialized() -> bool:
    return getattr(FastAPILimiter, "redis", None) is not None


class _MaybeLimiter:
    """Proxies to a real `RateLimiter` if FastAPILimiter is initialized,
    otherwise no-ops. Usable directly as a FastAPI dependency."""

    def __init__(
        self,
        times: int,
        seconds: int,
        identifier: Callable[[Request], Awaitable[str]] | None = None,
    ) -> None:
        self._real = RateLimiter(times=times, seconds=seconds, identifier=identifier)

    async def __call__(self, request: Request, response: Response) -> None:
        if not _initialized():
            return None
        await self._real(request, response)


def make_limiter(
    times: int,
    *,
    seconds: int,
    identifier: Callable[[Request], Awaitable[str]] | None = None,
) -> _MaybeLimiter:
    return _MaybeLimiter(times=times, seconds=seconds, identifier=identifier)
