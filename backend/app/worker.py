"""arq worker for background jobs.

Run with:
    arq app.worker.WorkerSettings

Jobs:
- finalize_task(task_id): idempotent, locked finalize for one VideoTask.
- scan_pending_tasks(): cron, enqueues finalize_task for non-terminal tasks.
- refresh_low_balance_gauge(): cron, updates the Prometheus gauge.
"""
from __future__ import annotations

import asyncio
from datetime import timedelta
from decimal import Decimal

from arq.connections import RedisSettings
from arq.cron import cron
from sqlalchemy import func, select

from .config import get_settings
from .database import SessionLocal
from .logging_config import configure_logging, get_logger
from .metrics import users_with_low_balance
from .models import User
from .providers import close_all_clients
from .services import task_service

settings = get_settings()
LOW_BALANCE_THRESHOLD = Decimal("1.00")


async def startup(ctx):
    configure_logging()
    ctx["log"] = get_logger("worker")


async def shutdown(ctx):
    await close_all_clients()


async def finalize_task(ctx, task_id: int) -> dict:
    log = ctx["log"]
    db = SessionLocal()
    try:
        outcome = await task_service.finalize_task(db, task_id=task_id, source="worker")
        if outcome is None:
            return {"task_id": task_id, "status": "not_found"}
        log.info(
            "worker_finalize_task",
            task_id=task_id,
            status=outcome.new_status,
            debited=str(outcome.debited),
        )
        return {"task_id": task_id, "status": outcome.new_status, "debited": str(outcome.debited)}
    finally:
        db.close()


async def scan_pending_tasks(ctx) -> dict:
    log = ctx["log"]
    db = SessionLocal()
    try:
        ids = task_service.pending_task_ids(db, older_than_seconds=15, limit=200)
    finally:
        db.close()
    if not ids:
        return {"enqueued": 0}
    redis = ctx.get("redis") or ctx["redis"]
    # enqueue with deduplication keys so repeated cron firings don't pile up
    enqueued = 0
    for tid in ids:
        job = await redis.enqueue_job(
            "finalize_task", tid, _job_id=f"finalize_task:{tid}"
        )
        if job is not None:
            enqueued += 1
    log.info("worker_scan", scheduled=len(ids), enqueued=enqueued)
    return {"enqueued": enqueued}


async def refresh_low_balance_gauge(ctx) -> dict:
    db = SessionLocal()
    try:
        n = int(
            db.execute(
                select(func.count(User.id)).where(User.balance <= LOW_BALANCE_THRESHOLD)
            ).scalar_one()
            or 0
        )
    finally:
        db.close()
    users_with_low_balance.set(n)
    return {"low_balance_users": n}


def _redis_settings() -> RedisSettings:
    """Build arq RedisSettings from REDIS_URL. arq's `from_dsn` exists in
    newer releases; we parse manually for portability."""
    from urllib.parse import urlparse

    parsed = urlparse(settings.redis_url)
    host = parsed.hostname or "localhost"
    port = parsed.port or 6379
    password = parsed.password
    database = 0
    if parsed.path and parsed.path != "/":
        try:
            database = int(parsed.path.lstrip("/"))
        except ValueError:
            database = 0
    return RedisSettings(host=host, port=port, password=password, database=database)


class WorkerSettings:
    redis_settings = _redis_settings()
    on_startup = startup
    on_shutdown = shutdown
    functions = [finalize_task, scan_pending_tasks, refresh_low_balance_gauge]
    cron_jobs = [
        cron(
            scan_pending_tasks,
            second={0, 30},  # twice a minute; configurable by editing this
            run_at_startup=True,
            unique=True,
        ),
        cron(
            refresh_low_balance_gauge,
            minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},
            run_at_startup=True,
            unique=True,
        ),
    ]
    job_timeout = timedelta(minutes=5)
    keep_result = timedelta(minutes=15)
    max_tries = 5


# Allow running with `python -m app.worker` too.
if __name__ == "__main__":
    from arq.worker import run_worker

    asyncio.run(run_worker(WorkerSettings))
