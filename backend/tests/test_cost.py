"""Pure-function tests for cost_service. No DB needed."""
from decimal import Decimal
from types import SimpleNamespace

from app.services import cost_service


def _model(**kwargs) -> SimpleNamespace:
    """Build a minimal model stub with whatever pricing fields the test sets."""
    base = dict(
        input_price=None, output_price=None,
        image_price=None, video_second_price=None, generation_price=None,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


# ---------------- text ----------------

def test_text_cost_basic():
    m = _model(input_price=Decimal("2.5"), output_price=Decimal("10.0"))
    cost, missing = cost_service.calc_text_cost(m, prompt_tokens=1000, completion_tokens=2000)
    # 1000/1M * 2.5 + 2000/1M * 10 = 0.0025 + 0.02 = 0.0225
    assert cost == Decimal("0.022500")
    assert missing is False


def test_text_cost_returns_decimal_not_float():
    m = _model(input_price=Decimal("3"), output_price=Decimal("15"))
    cost, _ = cost_service.calc_text_cost(m, 10, 20)
    assert isinstance(cost, Decimal)


def test_text_cost_missing_prices():
    m = _model()
    cost, missing = cost_service.calc_text_cost(m, 100, 200)
    assert cost == Decimal("0")
    assert missing is True


def test_text_cost_partial_pricing():
    """Only output price set — input contribution is zero, not missing."""
    m = _model(output_price=Decimal("5"))
    cost, missing = cost_service.calc_text_cost(m, 100, 1000)
    assert cost == Decimal("1000") / Decimal("1000000") * Decimal("5")
    assert missing is False


# ---------------- image ----------------

def test_image_cost_per_image():
    m = _model(image_price=Decimal("0.04"))
    cost, missing = cost_service.calc_image_cost(m, image_count=3)
    assert cost == Decimal("0.12")
    assert missing is False


def test_image_cost_falls_back_to_generation_price():
    m = _model(generation_price=Decimal("0.05"))
    cost, missing = cost_service.calc_image_cost(m, image_count=2)
    assert cost == Decimal("0.10")
    assert missing is False


def test_image_cost_missing():
    cost, missing = cost_service.calc_image_cost(_model(), image_count=1)
    assert cost == Decimal("0")
    assert missing is True


# ---------------- video ----------------

def test_video_cost_per_second():
    m = _model(video_second_price=Decimal("0.40"))
    cost, missing = cost_service.calc_video_cost(m, duration_seconds=8)
    assert cost == Decimal("3.2")
    assert missing is False


def test_video_cost_per_second_decimal_duration():
    m = _model(video_second_price=Decimal("0.50"))
    cost, _ = cost_service.calc_video_cost(m, duration_seconds=4.5)
    assert cost == Decimal("2.25")


def test_video_cost_flat_when_no_per_second():
    m = _model(generation_price=Decimal("0.20"))
    cost, missing = cost_service.calc_video_cost(m, duration_seconds=None)
    assert cost == Decimal("0.20")
    assert missing is False


def test_video_cost_missing():
    cost, missing = cost_service.calc_video_cost(_model(), duration_seconds=5)
    assert cost == Decimal("0")
    assert missing is True
