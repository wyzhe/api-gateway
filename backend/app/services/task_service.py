"""Finalize image/video tasks safely under concurrency.

Both `GET /v1/tasks/{id}` (client poll) and the arq worker call into
`finalize_task` here. The function:

  1. Locks the VideoTask row with SELECT ... FOR UPDATE.
  2. Re-reads the linked RequestLog (under the same transaction).
  3. If the task is already terminal (succeeded/failed), returns the existing
     state — no double debit, no double refund.
  4. Otherwise calls upstream `get_task_status`, then updates both rows
     atomically. On succeeded → debit via billing_service; on failed → no
     debit; on running/queued → just refresh task_status.

This file is the only place that mutates a finalized request_log's cost or
status.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..enums import RequestStatus, TaskStatus, UsageSource
from ..logging_config import get_logger
from ..metrics import task_finalizations_total
from ..models import ApiKey, ModelRow, Provider, RequestLog, VideoTask
from . import billing_service, cost_service

log = get_logger(__name__)


@dataclass
class FinalizeOutcome:
    task: VideoTask
    request_log: RequestLog | None
    new_status: str  # queued | running | succeeded | failed
    debited: Decimal  # 0 if no debit happened


async def finalize_task(
    db: Session,
    *,
    task_id: int,
    source: str,  # "client_poll" | "worker"
) -> FinalizeOutcome | None:
    """Lock the task row, poll upstream, transition + debit atomically.

    Returns None if the task no longer exists. Otherwise returns the post-
    transition state.
    """
    from ..services import gateway_service  # local import to avoid cycle

    task = db.execute(
        select(VideoTask).where(VideoTask.id == task_id).with_for_update()
    ).scalar_one_or_none()
    if task is None:
        return None

    if task.status in (TaskStatus.SUCCEEDED, TaskStatus.FAILED):
        rlog = db.get(RequestLog, task.request_log_id) if task.request_log_id else None
        task_finalizations_total.labels(source=source, outcome="noop").inc()
        return FinalizeOutcome(task=task, request_log=rlog, new_status=task.status, debited=Decimal("0"))

    rlog = db.get(RequestLog, task.request_log_id) if task.request_log_id else None
    model = db.get(ModelRow, task.model_id) if task.model_id else None
    provider_row = db.get(Provider, task.provider_id) if task.provider_id else None

    if not provider_row or not model:
        task_finalizations_total.labels(source=source, outcome="conflict").inc()
        log.warning("task_finalize_missing_refs", task_id=task.id, has_provider=bool(provider_row), has_model=bool(model))
        return FinalizeOutcome(task=task, request_log=rlog, new_status=task.status, debited=Decimal("0"))

    provider_client = gateway_service.build_provider(provider_row)
    try:
        result = await provider_client.get_task_status(task.upstream_task_id)
    except Exception as exc:
        log.warning("task_finalize_upstream_error", task_id=task.id, error=str(exc)[:200])
        # Don't transition; let the next poll try again.
        return FinalizeOutcome(task=task, request_log=rlog, new_status=task.status, debited=Decimal("0"))

    debited = Decimal("0")
    task.status = result.status

    if result.status == TaskStatus.SUCCEEDED:
        if result.asset_urls:
            task.asset_url = result.asset_urls[0]
        if rlog and rlog.status != RequestStatus.SUCCESS:
            cost, pricing_missing = _compute_cost(rlog, model, result.duration_seconds, result.asset_urls)
            rlog.status = RequestStatus.SUCCESS
            rlog.task_status = TaskStatus.SUCCEEDED
            rlog.cost = cost
            rlog.asset_url = task.asset_url or (result.asset_urls[0] if result.asset_urls else None)
            rlog.unit_price_snapshot_json = cost_service.price_snapshot(model)
            rlog.usage_source = UsageSource.MISSING if pricing_missing else UsageSource.UPSTREAM
            if cost > 0:
                billing_service.debit(
                    db, rlog.user_id, cost, request_log_id=rlog.id,
                    note=f"{rlog.request_type}:{model.public_name}",
                )
                debited = cost
        task_finalizations_total.labels(source=source, outcome="succeeded").inc()
    elif result.status == TaskStatus.FAILED:
        task.error_message = result.error_message
        if rlog and rlog.status != RequestStatus.FAILED:
            rlog.status = RequestStatus.FAILED
            rlog.task_status = TaskStatus.FAILED
            rlog.error_message = result.error_message
            rlog.error_code = "upstream_task_failed"
        task_finalizations_total.labels(source=source, outcome="failed").inc()
    else:
        if rlog:
            rlog.task_status = result.status
        task_finalizations_total.labels(source=source, outcome="noop").inc()

    db.commit()
    db.refresh(task)
    if rlog:
        db.refresh(rlog)
    return FinalizeOutcome(task=task, request_log=rlog, new_status=task.status, debited=debited)


def _compute_cost(
    rlog: RequestLog,
    model: ModelRow,
    duration_seconds: float | None,
    asset_urls: list[str],
) -> tuple[Decimal, bool]:
    if rlog.request_type == "video":
        duration: Decimal | None = (
            Decimal(str(duration_seconds)) if duration_seconds is not None else None
        )
        rlog.video_duration = duration
        return cost_service.calc_video_cost(model, duration)
    # image
    n = 1
    if isinstance(rlog.request_payload_json, dict):
        try:
            n = int(rlog.request_payload_json.get("n", 1) or 1)
        except Exception:
            n = 1
    rlog.image_count = n
    return cost_service.calc_image_cost(model, n)


def pending_task_ids(db: Session, *, older_than_seconds: int = 15, limit: int = 200) -> list[int]:
    """IDs of tasks still in queued/running for at least N seconds. Used by the
    worker to enqueue per-task finalize jobs."""
    from datetime import datetime, timedelta, timezone

    threshold = datetime.now(timezone.utc) - timedelta(seconds=older_than_seconds)
    rows = (
        db.query(VideoTask.id)
        .filter(VideoTask.status.in_((TaskStatus.QUEUED, TaskStatus.RUNNING)))
        .filter(VideoTask.updated_at <= threshold)
        .order_by(VideoTask.updated_at)
        .limit(limit)
        .all()
    )
    return [r[0] for r in rows]


def task_belongs_to(db: Session, task: VideoTask, user_id: int) -> bool:
    return task.user_id == user_id


__all__ = ["finalize_task", "pending_task_ids", "FinalizeOutcome", "task_belongs_to", "ApiKey"]
