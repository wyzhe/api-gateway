from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.api.gateway import _enforce_input_token_limit


def _model(max_tokens):
    m = MagicMock()
    m.max_input_tokens = max_tokens
    m.public_name = "test-model"
    m.upstream_model = "test"
    return m


def test_no_limit_allows_any_size():
    _enforce_input_token_limit(_model(None), prompt_tokens=10_000_000)


def test_under_limit_passes():
    # cap=100, 0.95 effective = 95
    _enforce_input_token_limit(_model(100), prompt_tokens=80)


def test_at_threshold_passes():
    # 0.95 * 100 = 95 → 95 must pass, 96 must fail
    _enforce_input_token_limit(_model(100), prompt_tokens=95)


def test_over_threshold_rejects_400():
    with pytest.raises(HTTPException) as exc_info:
        _enforce_input_token_limit(_model(100), prompt_tokens=96)
    assert exc_info.value.status_code == 400
    assert "input length" in exc_info.value.detail.lower()
    # Error message must contain the actual numbers for debuggability.
    assert "96" in exc_info.value.detail
    assert "95" in exc_info.value.detail or "100" in exc_info.value.detail
