"""Pure-function tests for task_service._compute_cost. No DB needed."""
from decimal import Decimal
from types import SimpleNamespace

from app.services.task_service import _compute_cost


def _video_log(request_payload_json) -> SimpleNamespace:
    return SimpleNamespace(
        request_type="video",
        request_payload_json=request_payload_json,
        video_duration=None,
    )


def _video_model(**kwargs) -> SimpleNamespace:
    base = dict(video_second_price=None, generation_price=None, price_markup=Decimal("1"))
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_video_cost_falls_back_to_requested_duration_when_upstream_omits_it():
    """APIMart's task-status response carries no video duration. A per-second
    priced video must bill the client-requested duration, not $0."""
    rlog = _video_log({"duration": 4, "prompt": "x"})
    model = _video_model(video_second_price=Decimal("0.05"))

    cost, missing = _compute_cost(rlog, model, duration_seconds=None, asset_urls=[])

    assert cost == Decimal("0.20")
    assert missing is False
    assert rlog.video_duration == Decimal("4")


def test_video_cost_prefers_upstream_duration_over_requested():
    """When upstream DOES report a duration it wins — the requested duration
    is only a fallback, never an override."""
    rlog = _video_log({"duration": 4, "prompt": "x"})
    model = _video_model(video_second_price=Decimal("0.05"))

    cost, missing = _compute_cost(rlog, model, duration_seconds=10, asset_urls=[])

    assert cost == Decimal("0.50")
    assert missing is False
    assert rlog.video_duration == Decimal("10")


def test_video_cost_missing_when_no_duration_anywhere():
    """No upstream duration and no requested duration -> pricing_missing, $0."""
    rlog = _video_log({"prompt": "x"})
    model = _video_model(video_second_price=Decimal("0.05"))

    cost, missing = _compute_cost(rlog, model, duration_seconds=None, asset_urls=[])

    assert cost == Decimal("0")
    assert missing is True
    assert rlog.video_duration is None
