"""provider_selector — sticky hook + default fallback."""
from __future__ import annotations

import pytest

from app.models import ModelRow, Provider
from app.services import provider_selector


@pytest.mark.asyncio
async def test_default_returns_model_provider(db_session):
    model = db_session.query(ModelRow).first()
    assert model is not None
    choice = await provider_selector.pick_provider(db_session, model=model, redis=None)
    assert choice.provider.id == model.provider_id
    assert choice.sticky is False


@pytest.mark.asyncio
async def test_sticky_no_redis_passes_through(db_session):
    """With session_key set but redis=None, behave as if no stickiness."""
    model = db_session.query(ModelRow).first()
    choice = await provider_selector.pick_provider(
        db_session, model=model, redis=None, session_key="k123"
    )
    assert choice.sticky is False
    assert choice.provider.id == model.provider_id


@pytest.mark.asyncio
async def test_helper_returns_default(db_session):
    """The async helper should match pick_provider's default branch when
    Redis is unavailable."""
    model = db_session.query(ModelRow).first()
    provider = await provider_selector.pick_provider_async_helper(
        db_session, model, session_key="k42"
    )
    assert isinstance(provider, Provider)
    assert provider.id == model.provider_id
