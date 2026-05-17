"""Cost calculator. Always Decimal. Returns 0 if pricing missing (and the caller
should set pricing_missing=true in the request log note)."""
from decimal import Decimal

from ..models import ModelRow

MILLION = Decimal("1000000")


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


def calc_image_cost(model: ModelRow, image_count: int) -> tuple[Decimal, bool]:
    per = model.image_price if model.image_price is not None else model.generation_price
    if per is None:
        return Decimal("0"), True
    return Decimal(per) * Decimal(image_count or 1), False


def calc_video_cost(model: ModelRow, duration_seconds: Decimal | float | None) -> tuple[Decimal, bool]:
    if model.video_second_price is not None and duration_seconds is not None:
        return Decimal(model.video_second_price) * Decimal(str(duration_seconds)), False
    if model.generation_price is not None:
        return Decimal(model.generation_price), False
    return Decimal("0"), True
