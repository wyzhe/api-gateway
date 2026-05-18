"""Cost calculator. Always Decimal. Returns 0 if pricing missing (and the caller
should set pricing_missing=true in the request log note).

Also provides pessimistic upper-bound estimates used by the spend reservation
gate (see reservation_service.py) — these MUST never under-estimate, because
the reservation is what protects the monthly cap.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from ..models import ModelRow

MILLION = Decimal("1000000")


# ---------------- Actual cost (post-call) ----------------


def calc_text_cost(model: ModelRow, prompt_tokens: int, completion_tokens: int) -> tuple[Decimal, bool]:
    """Returns (cost, pricing_missing)."""
    input_p = model.input_price
    output_p = model.output_price
    if input_p is None and output_p is None:
        return Decimal("0"), True
    cost = Decimal("0")
    if input_p is not None and prompt_tokens:
        cost += Decimal(prompt_tokens) / MILLION * Decimal(input_p)
    if output_p is not None and completion_tokens:
        cost += Decimal(completion_tokens) / MILLION * Decimal(output_p)
    return cost, False


def _compute_cache_cost(
    *,
    input_p: Decimal | None,
    output_p: Decimal | None,
    cw: Decimal | None,
    cr: Decimal | None,
    prompt_tokens: int,
    completion_tokens: int,
    cached_tokens: int,
    cache_creation_tokens: int,
) -> Decimal:
    """Three-bucket per-1M billing kernel shared by the live-model and
    snapshot-replay paths. NULL cache_write/read price falls back to input_p
    so cached tokens are never billed at zero by accident."""
    cache_read = max(0, int(cached_tokens or 0))
    cache_write = max(0, int(cache_creation_tokens or 0))
    regular = max(0, int(prompt_tokens or 0) - cache_read - cache_write)

    cost = Decimal("0")
    if input_p is not None:
        if regular:
            cost += Decimal(regular) / MILLION * Decimal(input_p)
        if cache_read and cr is None:
            cost += Decimal(cache_read) / MILLION * Decimal(input_p)
        if cache_write and cw is None:
            cost += Decimal(cache_write) / MILLION * Decimal(input_p)
    if cr is not None and cache_read:
        cost += Decimal(cache_read) / MILLION * Decimal(cr)
    if cw is not None and cache_write:
        cost += Decimal(cache_write) / MILLION * Decimal(cw)
    if output_p is not None and completion_tokens:
        cost += Decimal(completion_tokens) / MILLION * Decimal(output_p)
    return cost


def calc_text_cost_with_cache(
    model: ModelRow,
    prompt_tokens: int,
    completion_tokens: int,
    *,
    cached_tokens: int,
    cache_creation_tokens: int,
) -> tuple[Decimal, bool]:
    """Cost for text completion when usage reports cache hits/writes.

    `prompt_tokens` is the **total** input tokens (already includes the
    cached + cache_creation portions, per Anthropic + OpenAI conventions).
    All prices are per 1M tokens.
    """
    input_p = model.input_price
    output_p = model.output_price
    if input_p is None and output_p is None:
        return Decimal("0"), True

    cost = _compute_cache_cost(
        input_p=input_p,
        output_p=output_p,
        cw=model.cache_write_price,
        cr=model.cache_read_price,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cached_tokens=cached_tokens,
        cache_creation_tokens=cache_creation_tokens,
    )
    return cost, False


def calc_image_cost(model: ModelRow, image_count: int) -> tuple[Decimal, bool]:
    per = model.image_price if model.image_price is not None else model.generation_price
    if per is None:
        return Decimal("0"), True
    return Decimal(per) * Decimal(image_count or 1), False


def calc_video_cost(
    model: ModelRow, duration_seconds: Decimal | float | int | None
) -> tuple[Decimal, bool]:
    if model.video_second_price is not None and duration_seconds is not None:
        # Wrap in str() so a float arg (legacy callers) doesn't introduce
        # binary-float precision drift.
        d = duration_seconds if isinstance(duration_seconds, Decimal) else Decimal(str(duration_seconds))
        return Decimal(model.video_second_price) * d, False
    if model.generation_price is not None:
        return Decimal(model.generation_price), False
    return Decimal("0"), True


# ---------------- Pessimistic estimate (pre-call) ----------------


def estimate_text_cost_upper_bound(
    model: ModelRow,
    prompt_tokens_est: int,
    max_completion_tokens: int,
) -> Decimal:
    """Cost ceiling for a chat call before we know the actual usage.

    Used by reservation_service to reserve against the monthly cap.
    Returns 0 if pricing is missing (no reservation needed for free models)."""
    input_p = model.input_price or Decimal("0")
    output_p = model.output_price or Decimal("0")
    cost = Decimal(prompt_tokens_est) / MILLION * Decimal(input_p)
    cost += Decimal(max_completion_tokens) / MILLION * Decimal(output_p)
    return cost


def estimate_image_cost_upper_bound(model: ModelRow, image_count: int) -> Decimal:
    per = model.image_price if model.image_price is not None else model.generation_price
    if per is None:
        return Decimal("0")
    return Decimal(per) * Decimal(max(image_count, 1))


def estimate_video_cost_upper_bound(model: ModelRow, requested_duration_seconds: int | None) -> Decimal:
    if model.video_second_price is not None:
        # If client requested no duration, fall back to a conservative 60s ceiling.
        d = Decimal(requested_duration_seconds or 60)
        return Decimal(model.video_second_price) * d
    if model.generation_price is not None:
        return Decimal(model.generation_price)
    return Decimal("0")


# ---------------- Pricing snapshot ----------------


def price_snapshot(model: ModelRow) -> dict[str, Any]:
    """Serialize the model's current pricing parameters into a JSON-safe dict.

    Stored in `request_log.unit_price_snapshot_json` so that historical cost
    is fully explainable even after the model row's price changes.
    """
    def s(v: Decimal | None) -> str | None:
        return str(v) if v is not None else None

    return {
        "model_id": model.id,
        "public_name": model.public_name,
        "upstream_model": model.upstream_model,
        "type": model.type,
        "pricing_mode": model.pricing_mode,
        "input_price": s(model.input_price),
        "output_price": s(model.output_price),
        "cache_write_price": s(model.cache_write_price),
        "cache_read_price": s(model.cache_read_price),
        "image_price": s(model.image_price),
        "video_second_price": s(model.video_second_price),
        "generation_price": s(model.generation_price),
    }


# ---------------- Recompute from a stored snapshot ----------------


def recompute_text_cost_from_snapshot(
    snapshot: dict[str, Any],
    prompt_tokens: int,
    completion_tokens: int,
    *,
    cached_tokens: int = 0,
    cache_creation_tokens: int = 0,
) -> Decimal:
    """Recompute text cost from a stored price snapshot. Used by the arq
    worker's stream-usage clawback path. Old callers that pass no cache
    kwargs see identical behavior to the cache-unaware legacy formula."""
    ip = Decimal(snapshot.get("input_price") or "0")
    op = Decimal(snapshot.get("output_price") or "0")
    cw = snapshot.get("cache_write_price")
    cr = snapshot.get("cache_read_price")
    return _compute_cache_cost(
        input_p=ip,
        output_p=op,
        cw=Decimal(cw) if cw is not None else None,
        cr=Decimal(cr) if cr is not None else None,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cached_tokens=cached_tokens,
        cache_creation_tokens=cache_creation_tokens,
    )
