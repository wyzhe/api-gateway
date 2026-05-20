"""Unit tests for build_daily_usage — pure function, runs without Postgres."""
from datetime import date
from decimal import Decimal

from app.api.dashboard import DailyUsageEntry, build_daily_usage


def test_empty_input_yields_30_zero_buckets():
    out = build_daily_usage([], date(2026, 4, 21))
    assert len(out) == 30
    assert all(isinstance(e, DailyUsageEntry) for e in out)
    assert out[0].date == date(2026, 4, 21)
    assert out[29].date == date(2026, 5, 20)
    assert all(
        e.text_cost == e.image_cost == e.video_cost == Decimal("0")
        and e.text_requests == e.image_requests == e.video_requests == 0
        for e in out
    )


def test_custom_num_days():
    out = build_daily_usage([], date(2026, 4, 21), num_days=7)
    assert len(out) == 7
    assert out[-1].date == date(2026, 4, 27)


def test_dates_are_consecutive_ascending():
    out = build_daily_usage([], date(2026, 4, 21))
    for i in range(1, len(out)):
        assert (out[i].date - out[i - 1].date).days == 1


def test_single_day_single_type():
    rows = [(date(2026, 4, 21), "text", Decimal("1.50"), 3)]
    out = build_daily_usage(rows, date(2026, 4, 21))
    assert out[0].text_cost == Decimal("1.50")
    assert out[0].text_requests == 3
    assert out[0].image_cost == Decimal("0")
    assert out[1].text_cost == Decimal("0")


def test_multi_day_multi_type_pivot_with_gap():
    rows = [
        (date(2026, 4, 21), "text", Decimal("1.00"), 2),
        (date(2026, 4, 21), "image", Decimal("0.30"), 1),
        (date(2026, 4, 23), "video", Decimal("2.00"), 1),
    ]
    out = build_daily_usage(rows, date(2026, 4, 21))
    assert out[0].text_cost == Decimal("1.00")
    assert out[0].image_cost == Decimal("0.30")
    assert out[0].text_requests == 2
    assert out[1].text_cost == Decimal("0")  # 4/22 gap zero-filled
    assert out[2].video_cost == Decimal("2.00")
    assert out[2].video_requests == 1


def test_cost_stays_decimal_not_float():
    rows = [(date(2026, 4, 21), "text", 0.1, 1)]  # float-ish input
    out = build_daily_usage(rows, date(2026, 4, 21))
    assert isinstance(out[0].text_cost, Decimal)


def test_unknown_request_type_is_ignored():
    rows = [(date(2026, 4, 21), "embedding", Decimal("9.99"), 5)]
    out = build_daily_usage(rows, date(2026, 4, 21))
    assert out[0].text_cost == Decimal("0")
    assert out[0].text_requests == 0
