"""Structured logging with request_id contextvar.

Output is JSON to stdout in production, pretty colored in dev.
Use `get_logger(__name__)` everywhere. Don't call stdlib `logging.info()` directly
unless you've imported a module-level logger and bound it up the chain.
"""
from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any

import structlog

from .config import get_settings

# Contextvar populated by RequestIdMiddleware.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def _add_request_id(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    rid = request_id_var.get()
    if rid:
        event_dict["request_id"] = rid
    return event_dict


_configured = False


def configure_logging() -> None:
    global _configured
    if _configured:
        return
    settings = get_settings()
    is_prod = settings.is_production

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _add_request_id,
    ]

    if is_prod:
        renderer: Any = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Route stdlib `logging` (uvicorn, sqlalchemy, etc.) through structlog too.
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Quieten noisy libs.
    for name in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)

    _configured = True


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    if not _configured:
        configure_logging()
    return structlog.get_logger(name)
