from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import ApiKey, ModelRow, RequestLog, User
from ..schemas.log import RequestLogSummary
from ..utils.time import month_start_utc, today_utc
from .logs import _enrich_summary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class TopModelEntry(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_id: int | None
    model_name: str | None
    cost: Decimal
    requests: int


class TopApiKeyEntry(BaseModel):
    api_key_id: int | None
    api_key_prefix: str | None
    requests: int
    cost: Decimal


class DailyUsageEntry(BaseModel):
    date: date
    text_cost: Decimal
    image_cost: Decimal
    video_cost: Decimal
    text_requests: int
    image_requests: int
    video_requests: int


class DashboardOut(BaseModel):
    balance: Decimal
    today_text_requests: int
    today_image_requests: int
    today_video_requests: int
    today_spend: Decimal
    month_spend: Decimal
    recent_failures: list[RequestLogSummary]
    recent_logs: list[RequestLogSummary]
    top_models_by_cost: list[TopModelEntry]
    top_api_keys_by_usage: list[TopApiKeyEntry]


def build_daily_usage(
    rows: list[tuple[date, str, Decimal, int]],
    start: date,
    num_days: int = 30,
) -> list[DailyUsageEntry]:
    """Pivot grouped (day, request_type, cost, count) rows into `num_days`
    consecutive daily buckets starting at `start`. Missing days are zero-filled.
    Only request_type in {text, image, video} is counted; others are ignored.
    cost is always wrapped as Decimal(str(...)) — never raw float."""
    by_day: dict[date, dict[str, tuple[Decimal, int]]] = {}
    for day, rtype, cost, count in rows:
        by_day.setdefault(day, {})[rtype] = (Decimal(str(cost)), int(count))

    out: list[DailyUsageEntry] = []
    for i in range(num_days):
        d = start + timedelta(days=i)
        types = by_day.get(d, {})
        t_cost, t_n = types.get("text", (Decimal("0"), 0))
        i_cost, i_n = types.get("image", (Decimal("0"), 0))
        v_cost, v_n = types.get("video", (Decimal("0"), 0))
        out.append(
            DailyUsageEntry(
                date=d,
                text_cost=t_cost,
                image_cost=i_cost,
                video_cost=v_cost,
                text_requests=t_n,
                image_requests=i_n,
                video_requests=v_n,
            )
        )
    return out


@router.get("", response_model=DashboardOut)
def dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardOut:
    today = today_utc()
    month = month_start_utc()

    def _count_by_type(t: str) -> int:
        return int(
            db.query(func.count(RequestLog.id))
            .filter(
                RequestLog.user_id == user.id,
                RequestLog.request_type == t,
                RequestLog.created_at >= today,
            )
            .scalar()
            or 0
        )

    today_spend = Decimal(
        db.query(func.coalesce(func.sum(RequestLog.cost), 0))
        .filter(RequestLog.user_id == user.id, RequestLog.created_at >= today)
        .scalar()
        or 0
    )
    month_spend = Decimal(
        db.query(func.coalesce(func.sum(RequestLog.cost), 0))
        .filter(RequestLog.user_id == user.id, RequestLog.created_at >= month)
        .scalar()
        or 0
    )

    failures = (
        db.query(RequestLog)
        .filter(RequestLog.user_id == user.id, RequestLog.status == "failed")
        .order_by(desc(RequestLog.created_at))
        .limit(10)
        .all()
    )
    recent = (
        db.query(RequestLog)
        .filter(RequestLog.user_id == user.id)
        .order_by(desc(RequestLog.created_at))
        .limit(20)
        .all()
    )

    top_models = (
        db.query(
            RequestLog.model_id,
            func.coalesce(func.sum(RequestLog.cost), 0).label("c"),
            func.count(RequestLog.id).label("n"),
        )
        .filter(RequestLog.user_id == user.id, RequestLog.created_at >= month)
        .group_by(RequestLog.model_id)
        .order_by(desc("c"))
        .limit(5)
        .all()
    )
    top_keys = (
        db.query(
            RequestLog.api_key_id,
            func.count(RequestLog.id).label("n"),
            func.coalesce(func.sum(RequestLog.cost), 0).label("c"),
        )
        .filter(RequestLog.user_id == user.id, RequestLog.created_at >= month)
        .group_by(RequestLog.api_key_id)
        .order_by(desc("n"))
        .limit(5)
        .all()
    )

    keys_by_id = {k.id: k for k in db.query(ApiKey).filter(ApiKey.user_id == user.id).all()}
    models_by_id = {m.id: m for m in db.query(ModelRow).all()}

    return DashboardOut(
        balance=Decimal(user.balance),
        today_text_requests=_count_by_type("text"),
        today_image_requests=_count_by_type("image"),
        today_video_requests=_count_by_type("video"),
        today_spend=today_spend,
        month_spend=month_spend,
        recent_failures=[_enrich_summary(r, keys_by_id, models_by_id) for r in failures],
        recent_logs=[_enrich_summary(r, keys_by_id, models_by_id) for r in recent],
        top_models_by_cost=[
            TopModelEntry(
                model_id=m_id,
                model_name=models_by_id[m_id].public_name if m_id in models_by_id else None,
                cost=Decimal(c),
                requests=int(n),
            )
            for (m_id, c, n) in top_models
        ],
        top_api_keys_by_usage=[
            TopApiKeyEntry(
                api_key_id=k_id,
                api_key_prefix=keys_by_id[k_id].key_prefix if k_id in keys_by_id else None,
                requests=int(n),
                cost=Decimal(c),
            )
            for (k_id, n, c) in top_keys
        ],
    )
