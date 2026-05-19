from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import ApiKey, User
from ..schemas.api_key import ApiKeyCreate, ApiKeyCreatedOut, ApiKeyOut, ApiKeyUpdate
from ..security import generate_api_key
from ..services import abuse_mitigation_service, audit_service
from ..services.gateway_service import mtd_cost_for_api_key, mtd_cost_for_api_keys

router = APIRouter(prefix="/api/keys", tags=["keys"])


def _get_owned(db: Session, user: User, key_id: int) -> ApiKey:
    obj = db.get(ApiKey, key_id)
    if not obj or obj.user_id != user.id:
        raise HTTPException(status_code=404, detail="API key not found")
    return obj


def _to_out(row: ApiKey, mtd: Decimal) -> ApiKeyOut:
    return ApiKeyOut.model_validate(row).model_copy(update={"mtd_cost": mtd})


@router.get("", response_model=list[ApiKeyOut])
def list_keys(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ApiKeyOut]:
    rows = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == user.id)
        .order_by(desc(ApiKey.created_at))
        .all()
    )
    mtd = mtd_cost_for_api_keys(db, [r.id for r in rows])
    return [_to_out(r, mtd.get(r.id, Decimal("0"))) for r in rows]


@router.post("", response_model=ApiKeyCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_key(
    payload: ApiKeyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ApiKeyCreatedOut:
    allowed, _ = await abuse_mitigation_service.check_and_incr_api_key_quota(user.id)
    if not allowed:
        audit_service.record(
            db,
            actor_user_id=user.id,
            action="api_key_quota_exceeded",
            target_type="user",
            target_id=user.id,
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily API key creation limit reached, try tomorrow",
        )
    full, prefix, hashed = generate_api_key()
    row = ApiKey(
        user_id=user.id,
        name=payload.name,
        key_prefix=prefix,
        key_hash=hashed,
        monthly_limit=payload.monthly_limit,
        rate_limit_rpm=payload.rate_limit_rpm,
        rate_limit_tpm=payload.rate_limit_tpm,
        max_concurrent_requests=payload.max_concurrent_requests,
        status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    base = _to_out(row, Decimal("0"))
    return ApiKeyCreatedOut(**base.model_dump(), key=full)


@router.patch("/{key_id}", response_model=ApiKeyOut)
def update_key(
    key_id: int,
    payload: ApiKeyUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ApiKeyOut:
    row = _get_owned(db, user, key_id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _to_out(row, mtd_cost_for_api_key(db, row.id))


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_key(
    key_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    row = _get_owned(db, user, key_id)
    db.delete(row)
    db.commit()


@router.post("/{key_id}/disable", response_model=ApiKeyOut)
def disable_key(
    key_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ApiKeyOut:
    row = _get_owned(db, user, key_id)
    row.status = "disabled"
    db.commit()
    db.refresh(row)
    return _to_out(row, mtd_cost_for_api_key(db, row.id))


@router.post("/{key_id}/enable", response_model=ApiKeyOut)
def enable_key(
    key_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ApiKeyOut:
    row = _get_owned(db, user, key_id)
    row.status = "active"
    db.commit()
    db.refresh(row)
    return _to_out(row, mtd_cost_for_api_key(db, row.id))
