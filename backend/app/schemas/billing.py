from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TransactionOut(BaseModel):
    id: int
    user_id: int
    type: str
    amount: Decimal
    balance_before: Decimal
    balance_after: Decimal
    request_log_id: int | None
    note: str | None
    created_by_admin_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RechargeRequest(BaseModel):
    amount: Decimal = Field(gt=Decimal("0"))
    note: str | None = None


class BillingSummary(BaseModel):
    balance: Decimal
    today_spend: Decimal
    month_spend: Decimal
    today_requests: int
    month_requests: int
    spend_by_type: dict[str, Decimal]  # {"text": ..., "image": ..., "video": ...}
