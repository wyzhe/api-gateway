"""Per-model price_markup multiplier — pure-function tests. No DB needed."""
from decimal import Decimal
from types import SimpleNamespace

from app.services import cost_service


def _model(markup, **kw):
    base = dict(
        input_price=None, output_price=None, image_price=None,
        video_second_price=None, generation_price=None,
        cache_write_price=None, cache_read_price=None,
        price_markup=Decimal(markup),
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_text_cost_applies_markup():
    m = _model("2", input_price=Decimal("3"), output_price=Decimal("15"))
    cost, missing = cost_service.calc_text_cost(m, prompt_tokens=1000, completion_tokens=2000)
    # base = 1000/1M*3 + 2000/1M*15 = 0.033 ; ×2 = 0.066
    assert cost == Decimal("0.066")
    assert missing is False


def test_markup_one_is_identity():
    m = _model("1", input_price=Decimal("3"), output_price=Decimal("15"))
    cost, _ = cost_service.calc_text_cost(m, 1000, 2000)
    assert cost == Decimal("0.033")


def test_estimate_applies_markup():
    m = _model("1.5", input_price=Decimal("1"), output_price=Decimal("2"))
    cost = cost_service.estimate_text_cost_upper_bound(m, 1000, 5000)
    # base = 1000/1M*1 + 5000/1M*2 = 0.011 ; ×1.5 = 0.0165
    assert cost == Decimal("0.0165")


def test_cache_cost_applies_markup():
    m = _model("2", input_price=Decimal("3"), output_price=Decimal("15"),
               cache_read_price=Decimal("0.3"))
    cost, _ = cost_service.calc_text_cost_with_cache(
        m, prompt_tokens=1000, completion_tokens=500,
        cached_tokens=200, cache_creation_tokens=0,
    )
    base = (
        Decimal("800") / Decimal("1000000") * Decimal("3")
        + Decimal("200") / Decimal("1000000") * Decimal("0.3")
        + Decimal("500") / Decimal("1000000") * Decimal("15")
    )
    assert cost == base * Decimal("2")


def test_image_cost_applies_markup():
    m = _model("3", image_price=Decimal("0.04"))
    cost, _ = cost_service.calc_image_cost(m, image_count=2)
    assert cost == Decimal("0.24")  # 0.04*2*3


def test_video_cost_applies_markup():
    m = _model("2", video_second_price=Decimal("0.40"))
    cost, _ = cost_service.calc_video_cost(m, duration_seconds=8)
    assert cost == Decimal("6.4")  # 0.40*8*2


def test_snapshot_includes_markup():
    m = SimpleNamespace(
        id=1, public_name="x", upstream_model="x", type="text",
        pricing_mode="per_token", input_price=Decimal("3"), output_price=Decimal("15"),
        cache_write_price=None, cache_read_price=None, image_price=None,
        video_second_price=None, generation_price=None, price_markup=Decimal("2.5"),
    )
    snap = cost_service.price_snapshot(m)
    assert snap["price_markup"] == "2.5"


def test_recompute_from_snapshot_applies_markup():
    snap = {"input_price": "3.0", "output_price": "15.0", "price_markup": "2"}
    cost = cost_service.recompute_text_cost_from_snapshot(snap, 1000, 2000)
    assert cost == Decimal("0.066")


def test_recompute_from_snapshot_missing_markup_is_identity():
    """Old request_log snapshots predate the column → treated as 1.0."""
    snap = {"input_price": "3.0", "output_price": "15.0"}
    cost = cost_service.recompute_text_cost_from_snapshot(snap, 1000, 2000)
    assert cost == Decimal("0.033")
