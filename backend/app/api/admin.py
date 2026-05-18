from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..deps import get_db, require_admin
from ..utils.time import month_start_utc, today_utc
from ..models import (
    ApiKey,
    BalanceTransaction,
    ModelRow,
    Provider,
    RequestLog,
    User,
)
from ..schemas.billing import RechargeRequest, TransactionOut
from ..schemas.log import RequestLogDetail, RequestLogSummary
from ..schemas.model import ModelCreate, ModelOut, ModelUpdate
from ..schemas.provider import ProviderOut, ProviderUpdate
from ..schemas.user import AdminUserCreate, AdminUserOut, AdminUserUpdate
from ..security import hash_password
from ..services import billing_service
from .logs import _apply_filters, _enrich_summary
from .models import _to_out as model_to_out

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------- Overview ----------------


class OverviewOut(BaseModel):
    users: int
    today_requests: int
    today_spend: Decimal
    month_spend: Decimal
    error_rate_today: float
    usage_today: dict[str, int]  # text/image/video


@router.get("/overview", response_model=OverviewOut, dependencies=[Depends(require_admin)])
def overview(db: Session = Depends(get_db)) -> OverviewOut:
    today = today_utc()
    month = month_start_utc()
    users = int(db.query(func.count(User.id)).scalar() or 0)
    today_reqs = int(
        db.query(func.count(RequestLog.id)).filter(RequestLog.created_at >= today).scalar() or 0
    )
    today_failed = int(
        db.query(func.count(RequestLog.id))
        .filter(RequestLog.created_at >= today, RequestLog.status == "failed")
        .scalar()
        or 0
    )
    today_spend = Decimal(
        db.query(func.coalesce(func.sum(RequestLog.cost), 0))
        .filter(RequestLog.created_at >= today)
        .scalar()
        or 0
    )
    month_spend = Decimal(
        db.query(func.coalesce(func.sum(RequestLog.cost), 0))
        .filter(RequestLog.created_at >= month)
        .scalar()
        or 0
    )
    usage_rows = (
        db.query(RequestLog.request_type, func.count(RequestLog.id))
        .filter(RequestLog.created_at >= today)
        .group_by(RequestLog.request_type)
        .all()
    )
    usage = {"text": 0, "image": 0, "video": 0}
    for t, n in usage_rows:
        if t in usage:
            usage[t] = int(n)
    return OverviewOut(
        users=users,
        today_requests=today_reqs,
        today_spend=today_spend,
        month_spend=month_spend,
        error_rate_today=(today_failed / today_reqs) if today_reqs else 0.0,
        usage_today=usage,
    )


# ---------------- Users ----------------


@router.get("/users", response_model=list[AdminUserOut], dependencies=[Depends(require_admin)])
def list_users(
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[AdminUserOut]:
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter((User.email.ilike(like)) | (User.display_name.ilike(like)))
    rows = query.order_by(desc(User.created_at)).offset(offset).limit(limit).all()
    return [AdminUserOut.model_validate(r) for r in rows]


@router.post(
    "/users",
    response_model=AdminUserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminUserOut:
    if db.query(User).filter(User.email == payload.email.lower()).one_or_none():
        raise HTTPException(status_code=409, detail="Email already exists")
    u = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        role=payload.role,
        status="active",
        balance=Decimal("0"),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    if payload.initial_balance > 0:
        billing_service.recharge(
            db, u.id, payload.initial_balance, admin_id=admin.id, note="Initial balance"
        )
        db.refresh(u)
    return AdminUserOut.model_validate(u)


@router.get("/users/{user_id}", response_model=AdminUserOut, dependencies=[Depends(require_admin)])
def get_user(user_id: int, db: Session = Depends(get_db)) -> AdminUserOut:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return AdminUserOut.model_validate(u)


@router.patch("/users/{user_id}", response_model=AdminUserOut, dependencies=[Depends(require_admin)])
def update_user(
    user_id: int, payload: AdminUserUpdate, db: Session = Depends(get_db)
) -> AdminUserOut:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    data = payload.model_dump(exclude_unset=True)
    if "password" in data:
        u.password_hash = hash_password(data.pop("password"))
    for k, v in data.items():
        setattr(u, k, v)
    db.commit()
    db.refresh(u)
    return AdminUserOut.model_validate(u)


@router.post(
    "/users/{user_id}/disable", response_model=AdminUserOut, dependencies=[Depends(require_admin)]
)
def disable_user(user_id: int, db: Session = Depends(get_db)) -> AdminUserOut:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.status = "disabled"
    db.commit()
    db.refresh(u)
    return AdminUserOut.model_validate(u)


@router.post(
    "/users/{user_id}/enable", response_model=AdminUserOut, dependencies=[Depends(require_admin)]
)
def enable_user(user_id: int, db: Session = Depends(get_db)) -> AdminUserOut:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.status = "active"
    db.commit()
    db.refresh(u)
    return AdminUserOut.model_validate(u)


@router.post(
    "/users/{user_id}/recharge",
    response_model=TransactionOut,
    dependencies=[Depends(require_admin)],
)
def recharge_user(
    user_id: int,
    payload: RechargeRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> TransactionOut:
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        txn = billing_service.recharge(db, user_id, payload.amount, admin.id, payload.note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return TransactionOut.model_validate(txn)


@router.get(
    "/users/{user_id}/transactions",
    response_model=list[TransactionOut],
    dependencies=[Depends(require_admin)],
)
def user_transactions(
    user_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[TransactionOut]:
    rows = (
        db.query(BalanceTransaction)
        .filter(BalanceTransaction.user_id == user_id)
        .order_by(desc(BalanceTransaction.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [TransactionOut.model_validate(r) for r in rows]


# ---------------- Providers ----------------


@router.get("/providers", response_model=list[ProviderOut], dependencies=[Depends(require_admin)])
def list_providers(db: Session = Depends(get_db)) -> list[ProviderOut]:
    rows = db.query(Provider).order_by(Provider.id).all()
    return [ProviderOut.model_validate(r) for r in rows]


@router.patch(
    "/providers/{provider_id}", response_model=ProviderOut, dependencies=[Depends(require_admin)]
)
def update_provider(
    provider_id: int, payload: ProviderUpdate, db: Session = Depends(get_db)
) -> ProviderOut:
    p = db.get(Provider, provider_id)
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return ProviderOut.model_validate(p)


# ---------------- Models ----------------


def _providers_by_id(db: Session) -> dict[int, Provider]:
    return {p.id: p for p in db.query(Provider).all()}


@router.get("/models", response_model=list[ModelOut], dependencies=[Depends(require_admin)])
def admin_list_models(
    type: str | None = Query(default=None, pattern="^(text|image|video|multimodal)$"),
    db: Session = Depends(get_db),
) -> list[ModelOut]:
    q = db.query(ModelRow)
    if type:
        q = q.filter(ModelRow.type == type)
    rows = q.order_by(ModelRow.type, ModelRow.public_name).all()
    providers = _providers_by_id(db)
    return [model_to_out(r, providers) for r in rows]


@router.post(
    "/models",
    response_model=ModelOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def admin_create_model(payload: ModelCreate, db: Session = Depends(get_db)) -> ModelOut:
    if db.query(ModelRow).filter(ModelRow.public_name == payload.public_name).one_or_none():
        raise HTTPException(status_code=409, detail="public_name already exists")
    if not db.get(Provider, payload.provider_id):
        raise HTTPException(status_code=400, detail="provider_id does not exist")
    row = ModelRow(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    providers = _providers_by_id(db)
    return model_to_out(row, providers)


@router.patch(
    "/models/{model_id}", response_model=ModelOut, dependencies=[Depends(require_admin)]
)
def admin_update_model(
    model_id: int, payload: ModelUpdate, db: Session = Depends(get_db)
) -> ModelOut:
    row = db.get(ModelRow, model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return model_to_out(row, _providers_by_id(db))


@router.post(
    "/models/{model_id}/enable", response_model=ModelOut, dependencies=[Depends(require_admin)]
)
def admin_enable_model(model_id: int, db: Session = Depends(get_db)) -> ModelOut:
    row = db.get(ModelRow, model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")
    row.status = "active"
    db.commit()
    db.refresh(row)
    return model_to_out(row, _providers_by_id(db))


@router.post(
    "/models/{model_id}/disable", response_model=ModelOut, dependencies=[Depends(require_admin)]
)
def admin_disable_model(model_id: int, db: Session = Depends(get_db)) -> ModelOut:
    row = db.get(ModelRow, model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")
    row.status = "disabled"
    db.commit()
    db.refresh(row)
    return model_to_out(row, _providers_by_id(db))


# ---------------- Model health check (upstream ping) ----------------


class HealthCheckResult(BaseModel):
    model_id: int
    public_name: str
    upstream_model: str
    type: str
    ok: bool
    status_code: int | None
    latency_ms: int
    error: str | None
    sample: str | None  # short text snippet for text models

    model_config = {"protected_namespaces": ()}


@router.post(
    "/models/{model_id}/healthcheck",
    response_model=HealthCheckResult,
    dependencies=[Depends(require_admin)],
)
async def admin_healthcheck_model(model_id: int, db: Session = Depends(get_db)) -> HealthCheckResult:
    """Issue a minimal request to the upstream for this model and report.

    - text models: a 1-token chat completion ("PING").
    - image / video models: a *submit* only (we don't poll the task to completion;
      we just confirm submission succeeds and returns a task_id).
    Costs are billed normally if the call succeeds, so an admin who pings
    every model burns a bit of credit — keep that in mind.
    """
    from ..services import gateway_service
    import time as _time

    row = db.get(ModelRow, model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")
    provider = db.get(Provider, row.provider_id)
    if not provider:
        raise HTTPException(status_code=500, detail="Model has no provider")
    client = gateway_service.build_provider(provider)
    started = _time.perf_counter()
    try:
        if row.type == "text":
            resp = await client.chat_completions(
                {"model": row.upstream_model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1},
            )
            latency = int((_time.perf_counter() - started) * 1000)
            ok = resp.http_status < 400
            sample = None
            if ok and isinstance(resp.body, dict):
                sample = (resp.body.get("choices") or [{}])[0].get("message", {}).get("content")
            return HealthCheckResult(
                model_id=row.id, public_name=row.public_name, upstream_model=row.upstream_model,
                type=row.type, ok=ok, status_code=resp.http_status, latency_ms=latency,
                error=None if ok else _short_err(resp.body), sample=(sample or "")[:100] or None,
            )
        method = "image_generation" if row.type == "image" else "video_generation"
        payload = {"model": row.upstream_model, "prompt": "health check ping"}
        if row.type == "video":
            payload.update({"duration": 4, "aspect_ratio": "16:9", "resolution": "720p"})
        resp = await getattr(client, method)(payload)
        latency = int((_time.perf_counter() - started) * 1000)
        ok = resp.http_status < 400 and bool(client.extract_task_id(resp.body))
        return HealthCheckResult(
            model_id=row.id, public_name=row.public_name, upstream_model=row.upstream_model,
            type=row.type, ok=ok, status_code=resp.http_status, latency_ms=latency,
            error=None if ok else _short_err(resp.body), sample=None,
        )
    except Exception as e:
        latency = int((_time.perf_counter() - started) * 1000)
        return HealthCheckResult(
            model_id=row.id, public_name=row.public_name, upstream_model=row.upstream_model,
            type=row.type, ok=False, status_code=None, latency_ms=latency,
            error=str(e)[:300], sample=None,
        )


def _short_err(body: object) -> str:
    if isinstance(body, dict):
        err = body.get("error") if isinstance(body.get("error"), dict) else None
        if err:
            return str(err.get("message") or err)[:300]
        return str(body.get("detail") or body)[:300]
    return str(body)[:300]


# ---------------- Logs (all users) ----------------


@router.get("/logs", response_model=list[RequestLogSummary], dependencies=[Depends(require_admin)])
def admin_list_logs(
    type: str | None = Query(default=None, pattern="^(text|image|video)$"),
    model: str | None = None,
    provider_id: int | None = None,
    status_: str | None = Query(default=None, alias="status", pattern="^(success|failed|running|queued)$"),
    task_status: str | None = Query(default=None, pattern="^(queued|running|succeeded|failed)$"),
    api_key_id: int | None = None,
    user_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[RequestLogSummary]:
    q = db.query(RequestLog)
    if user_id is not None:
        q = q.filter(RequestLog.user_id == user_id)
    q = _apply_filters(
        q,
        type=type,
        model=model,
        provider_id=provider_id,
        status=status_,
        task_status=task_status,
        api_key_id=api_key_id,
        date_from=date_from,
        date_to=date_to,
        db=db,
    )
    rows = q.order_by(desc(RequestLog.created_at)).offset(offset).limit(limit).all()
    keys = {k.id: k for k in db.query(ApiKey).all()}
    models = {m.id: m for m in db.query(ModelRow).all()}
    return [_enrich_summary(r, keys, models) for r in rows]


@router.get(
    "/logs/{log_id}", response_model=RequestLogDetail, dependencies=[Depends(require_admin)]
)
def admin_get_log(log_id: int, db: Session = Depends(get_db)) -> RequestLogDetail:
    row = db.get(RequestLog, log_id)
    if not row:
        raise HTTPException(status_code=404, detail="Log not found")
    key = db.get(ApiKey, row.api_key_id) if row.api_key_id else None
    model = db.get(ModelRow, row.model_id) if row.model_id else None
    return RequestLogDetail(
        id=row.id,
        user_id=row.user_id,
        api_key_id=row.api_key_id,
        api_key_prefix=key.key_prefix if key else None,
        provider_id=row.provider_id,
        model_id=row.model_id,
        model_name=model.public_name if model else None,
        request_type=row.request_type,
        upstream_model=row.upstream_model,
        status=row.status,
        task_status=row.task_status,
        prompt_tokens=row.prompt_tokens,
        completion_tokens=row.completion_tokens,
        total_tokens=row.total_tokens,
        image_count=row.image_count,
        video_duration=row.video_duration,
        cost=row.cost,
        latency_ms=row.latency_ms,
        http_status=row.http_status,
        request_id=row.request_id,
        upstream_request_id=row.upstream_request_id,
        error_code=row.error_code,
        error_message=row.error_message,
        asset_url=row.asset_url,
        request_payload_json=row.request_payload_json,
        response_payload_json=row.response_payload_json,
        created_at=row.created_at,
    )
