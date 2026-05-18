"""Concurrent task finalization must not double-debit.

This is the regression test for the race condition where two callers
(client poll + worker, or two client polls) both transitioned a task from
`running` to `succeeded` and each called `billing_service.debit()`.

Setup: insert a queued VideoTask + parent RequestLog. Patch the upstream
client to return a deterministic "succeeded" result. Kick off N concurrent
`task_service.finalize_task()` calls and assert:

  - The user's balance dropped by exactly one task cost.
  - Exactly one debit BalanceTransaction was written.
  - Exactly one `succeeded` outcome was recorded.
"""
from __future__ import annotations

import asyncio
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.database import SessionLocal
from app.models import BalanceTransaction, RequestLog, User, VideoTask
from app.providers.base import ProviderTaskResult
from app.services import task_service


@pytest.mark.asyncio
async def test_concurrent_finalize_only_debits_once(test_user_funded, db_session):
    user_id = test_user_funded.id

    from app.models import ApiKey, ModelRow, Provider
    from app.security import generate_api_key

    model = db_session.query(ModelRow).filter(ModelRow.type == "image").first()
    assert model is not None
    provider = db_session.get(Provider, model.provider_id)

    # Ensure the user has at least one ApiKey.
    api_key = db_session.query(ApiKey).filter(ApiKey.user_id == user_id).first()
    if api_key is None:
        _, prefix, key_hash = generate_api_key()
        api_key = ApiKey(
            user_id=user_id, name="concurrency-test",
            key_prefix=prefix, key_hash=key_hash, status="active",
        )
        db_session.add(api_key)
        db_session.commit()
        db_session.refresh(api_key)

    # Insert parent log + task in 'running' state.
    log = RequestLog(
        user_id=user_id, api_key_id=api_key.id, provider_id=provider.id, model_id=model.id,
        request_type="image", status="running", task_status="running", cost=Decimal("0"),
        request_payload_json={"n": 1},
    )
    db_session.add(log)
    db_session.flush()
    task = VideoTask(
        user_id=user_id, api_key_id=api_key.id, request_log_id=log.id,
        provider_id=provider.id, model_id=model.id, upstream_task_id="fixture-task-1",
        status="running",
    )
    db_session.add(task)
    db_session.commit()
    task_id = task.id

    balance_before = Decimal(db_session.get(User, user_id).balance)

    # Patch upstream so we don't hit the network.
    async def fake_status(self, tid):
        return ProviderTaskResult(
            status="succeeded",
            raw_status="completed",
            asset_urls=["https://example.test/img.png"],
            duration_seconds=None,
            error_message=None,
            raw_body={"status": "completed"},
        )

    # Race N concurrent finalize calls, each on its own DB session.
    N = 8

    async def runner():
        s = SessionLocal()
        try:
            return await task_service.finalize_task(s, task_id=task_id, source="client_poll")
        finally:
            s.close()

    with patch("app.providers.apimart.APIMartProvider.get_task_status", new=fake_status):
        results = await asyncio.gather(*(runner() for _ in range(N)))

    assert all(r is not None for r in results)
    assert all(r.new_status == "succeeded" for r in results)

    # Exactly one debit BalanceTransaction must exist for this log.
    debits = (
        db_session.query(BalanceTransaction)
        .filter(BalanceTransaction.request_log_id == log.id, BalanceTransaction.type == "debit")
        .all()
    )
    assert len(debits) == 1, f"expected 1 debit, got {len(debits)}"

    # Balance dropped by exactly that one debit amount.
    db_session.expire_all()
    balance_after = Decimal(db_session.get(User, user_id).balance)
    assert balance_after == balance_before - debits[0].amount

    # Task & log are terminal & consistent.
    db_session.expire_all()
    fresh_task = db_session.get(VideoTask, task_id)
    fresh_log = db_session.get(RequestLog, log.id)
    assert fresh_task.status == "succeeded"
    assert fresh_log.status == "success"
    assert fresh_log.cost == debits[0].amount
    assert fresh_log.unit_price_snapshot_json is not None
