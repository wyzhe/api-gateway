"""Pricing snapshot serialization. Pure-function tests."""
from decimal import Decimal
from types import SimpleNamespace

from app.services import cost_service


def test_price_snapshot_serializes_decimal_as_string():
    m = SimpleNamespace(
        id=42, public_name="gpt-4o", upstream_model="gpt-4o", type="text",
        pricing_mode="per_token",
        input_price=Decimal("2.5"), output_price=Decimal("10.0"),
        image_price=None, video_second_price=None, generation_price=None,
    )
    snap = cost_service.price_snapshot(m)
    assert snap["model_id"] == 42
    assert snap["public_name"] == "gpt-4o"
    assert snap["pricing_mode"] == "per_token"
    assert snap["input_price"] == "2.5"
    assert snap["output_price"] == "10.0"
    assert snap["image_price"] is None


def test_recompute_text_cost_from_snapshot():
    snap = {"input_price": "3.0", "output_price": "15.0"}
    # 1000 prompt + 2000 completion → 1000/1M * 3 + 2000/1M * 15 = 0.033
    cost = cost_service.recompute_text_cost_from_snapshot(snap, 1000, 2000)
    assert cost == Decimal("0.033")


def test_estimate_text_cost_upper_bound():
    m = SimpleNamespace(
        input_price=Decimal("1"), output_price=Decimal("2"),
        image_price=None, video_second_price=None, generation_price=None,
    )
    cost = cost_service.estimate_text_cost_upper_bound(m, 1000, 5000)
    # 1000/1M * 1 + 5000/1M * 2 = 0.001 + 0.010 = 0.011
    assert cost == Decimal("0.011")
