from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import ApiKey, ModelRow, RequestLog, User
from ..schemas.log import RequestLogDetail, RequestLogSummary

router = APIRouter(prefix="/api/logs", tags=["logs"])


def _enrich_summary(
    row: RequestLog,
    keys_by_id: dict[int, ApiKey],
    models_by_id: dict[int, ModelRow],
) -> RequestLogSummary:
    key = keys_by_id.get(row.api_key_id) if row.api_key_id else None
    model = models_by_id.get(row.model_id) if row.model_id else None
    return RequestLogSummary(
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
        error_code=row.error_code,
        error_message=row.error_message,
        asset_url=row.asset_url,
        created_at=row.created_at,
    )


def _apply_filters(
    q,
    *,
    type: str | None,
    model: str | None,
    provider_id: int | None,
    status: str | None,
    task_status: str | None,
    api_key_id: int | None,
    date_from: datetime | None,
    date_to: datetime | None,
    db: Session,
):
    if type:
        q = q.filter(RequestLog.request_type == type)
    if model:
        model_row = db.query(ModelRow).filter(ModelRow.public_name == model).one_or_none()
        if model_row:
            q = q.filter(RequestLog.model_id == model_row.id)
        else:
            q = q.filter(RequestLog.id == -1)  # no match
    if provider_id is not None:
        q = q.filter(RequestLog.provider_id == provider_id)
    if status:
        q = q.filter(RequestLog.status == status)
    if task_status:
        q = q.filter(RequestLog.task_status == task_status)
    if api_key_id is not None:
        q = q.filter(RequestLog.api_key_id == api_key_id)
    if date_from:
        q = q.filter(RequestLog.created_at >= date_from)
    if date_to:
        q = q.filter(RequestLog.created_at <= date_to)
    return q


@router.get("", response_model=list[RequestLogSummary])
def list_logs(
    type: str | None = Query(default=None, pattern="^(text|image|video)$"),
    model: str | None = None,
    provider_id: int | None = None,
    status: str | None = Query(default=None, pattern="^(success|failed|running|queued)$"),
    task_status: str | None = Query(default=None, pattern="^(queued|running|succeeded|failed)$"),
    api_key_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RequestLogSummary]:
    q = db.query(RequestLog).filter(RequestLog.user_id == user.id)
    q = _apply_filters(
        q,
        type=type,
        model=model,
        provider_id=provider_id,
        status=status,
        task_status=task_status,
        api_key_id=api_key_id,
        date_from=date_from,
        date_to=date_to,
        db=db,
    )
    rows = q.order_by(desc(RequestLog.created_at)).offset(offset).limit(limit).all()
    key_ids = {r.api_key_id for r in rows if r.api_key_id is not None}
    model_ids = {r.model_id for r in rows if r.model_id is not None}
    keys = (
        {k.id: k for k in db.query(ApiKey).filter(ApiKey.id.in_(key_ids)).all()}
        if key_ids
        else {}
    )
    models = (
        {m.id: m for m in db.query(ModelRow).filter(ModelRow.id.in_(model_ids)).all()}
        if model_ids
        else {}
    )
    return [_enrich_summary(r, keys, models) for r in rows]


@router.get("/{log_id}", response_model=RequestLogDetail)
def get_log(
    log_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RequestLogDetail:
    row = db.get(RequestLog, log_id)
    if not row or row.user_id != user.id:
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
