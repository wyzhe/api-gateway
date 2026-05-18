from decimal import Decimal
from unittest.mock import MagicMock

from app.services import cost_service


def _model(input_p="3.00", output_p="15.00", cw=None, cr=None):
    m = MagicMock()
    m.input_price = Decimal(input_p) if input_p else None
    m.output_price = Decimal(output_p) if output_p else None
    m.cache_write_price = Decimal(cw) if cw else None
    m.cache_read_price = Decimal(cr) if cr else None
    return m


def test_no_cache_fields_matches_legacy_cost():
    cost, missing = cost_service.calc_text_cost_with_cache(
        _model(),
        prompt_tokens=1000,
        completion_tokens=500,
        cached_tokens=0,
        cache_creation_tokens=0,
    )
    expected = Decimal("1000") / Decimal("1000000") * Decimal("3.00") + Decimal(
        "500"
    ) / Decimal("1000000") * Decimal("15.00")
    assert cost == expected
    assert missing is False


def test_cache_read_priced_separately():
    cost, _ = cost_service.calc_text_cost_with_cache(
        _model(cw="3.75", cr="0.30"),
        prompt_tokens=1000,
        completion_tokens=500,
        cached_tokens=200,
        cache_creation_tokens=0,
    )
    expected = (
        Decimal("800") / Decimal("1000000") * Decimal("3.00")
        + Decimal("200") / Decimal("1000000") * Decimal("0.30")
        + Decimal("500") / Decimal("1000000") * Decimal("15.00")
    )
    assert cost == expected


def test_cache_write_priced_separately():
    cost, _ = cost_service.calc_text_cost_with_cache(
        _model(cw="3.75", cr="0.30"),
        prompt_tokens=1000,
        completion_tokens=500,
        cached_tokens=0,
        cache_creation_tokens=300,
    )
    expected = (
        Decimal("700") / Decimal("1000000") * Decimal("3.00")
        + Decimal("300") / Decimal("1000000") * Decimal("3.75")
        + Decimal("500") / Decimal("1000000") * Decimal("15.00")
    )
    assert cost == expected


def test_cache_columns_null_falls_back_to_input_price():
    cost, _ = cost_service.calc_text_cost_with_cache(
        _model(cw=None, cr=None),
        prompt_tokens=1000,
        completion_tokens=0,
        cached_tokens=200,
        cache_creation_tokens=300,
    )
    expected = Decimal("1000") / Decimal("1000000") * Decimal("3.00")
    assert cost == expected


def test_price_snapshot_includes_cache_columns():
    m = _model(cw="3.75", cr="0.30")
    m.id = 1
    m.public_name = "x"
    m.upstream_model = "x"
    m.type = "text"
    m.pricing_mode = "per_token"
    m.image_price = None
    m.video_second_price = None
    m.generation_price = None
    snap = cost_service.price_snapshot(m)
    assert snap["cache_write_price"] == "3.75"
    assert snap["cache_read_price"] == "0.30"


def test_recompute_from_snapshot_uses_cache_fields():
    snap = {
        "input_price": "3.00",
        "output_price": "15.00",
        "cache_write_price": "3.75",
        "cache_read_price": "0.30",
    }
    cost = cost_service.recompute_text_cost_from_snapshot(
        snap,
        prompt_tokens=1000,
        completion_tokens=500,
        cached_tokens=200,
        cache_creation_tokens=300,
    )
    expected = (
        Decimal("500") / Decimal("1000000") * Decimal("3.00")
        + Decimal("200") / Decimal("1000000") * Decimal("0.30")
        + Decimal("300") / Decimal("1000000") * Decimal("3.75")
        + Decimal("500") / Decimal("1000000") * Decimal("15.00")
    )
    assert cost == expected
