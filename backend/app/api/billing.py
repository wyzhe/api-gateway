from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import BalanceTransaction, RequestLog, User
from ..schemas.billing import BillingSummary, TransactionOut

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _today_start() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, now.day, tzinfo=timezone.utc)


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc)


@router.get("/summary", response_model=BillingSummary)
def summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BillingSummary:
    today = _today_start()
    month = _month_start()

    def _sum(since: datetime) -> Decimal:
        v = (
            db.query(func.coalesce(func.sum(RequestLog.cost), 0))
            .filter(RequestLog.user_id == user.id, RequestLog.created_at >= since)
            .scalar()
        )
        return Decimal(v or 0)

    def _count(since: datetime) -> int:
        v = (
            db.query(func.count(RequestLog.id))
            .filter(RequestLog.user_id == user.id, RequestLog.created_at >= since)
            .scalar()
        )
        return int(v or 0)

    by_type_rows = (
        db.query(RequestLog.request_type, func.coalesce(func.sum(RequestLog.cost), 0))
        .filter(RequestLog.user_id == user.id, RequestLog.created_at >= month)
        .group_by(RequestLog.request_type)
        .all()
    )
    spend_by_type = {"text": Decimal("0"), "image": Decimal("0"), "video": Decimal("0")}
    for t, v in by_type_rows:
        if t in spend_by_type:
            spend_by_type[t] = Decimal(v or 0)

    return BillingSummary(
        balance=Decimal(user.balance),
        today_spend=_sum(today),
        month_spend=_sum(month),
        today_requests=_count(today),
        month_requests=_count(month),
        spend_by_type=spend_by_type,
    )


@router.get("/transactions", response_model=list[TransactionOut])
def transactions(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TransactionOut]:
    rows = (
        db.query(BalanceTransaction)
        .filter(BalanceTransaction.user_id == user.id)
        .order_by(desc(BalanceTransaction.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [TransactionOut.model_validate(r) for r in rows]
