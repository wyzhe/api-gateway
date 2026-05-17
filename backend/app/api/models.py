from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import ModelRow, Provider, User
from ..schemas.model import ModelOut

router = APIRouter(prefix="/api/models", tags=["models"])


def _to_out(row: ModelRow, providers_by_id: dict[int, Provider]) -> ModelOut:
    p = providers_by_id.get(row.provider_id)
    return ModelOut(
        id=row.id,
        public_name=row.public_name,
        upstream_model=row.upstream_model,
        provider_id=row.provider_id,
        provider_name=p.name if p else None,
        display_provider=row.display_provider,
        type=row.type,
        display_name=row.display_name,
        description=row.description,
        status=row.status,
        visible=row.visible,
        capabilities=row.capabilities,
        pricing_mode=row.pricing_mode,
        input_price=row.input_price,
        output_price=row.output_price,
        image_price=row.image_price,
        video_second_price=row.video_second_price,
        generation_price=row.generation_price,
        created_at=row.created_at,
    )


@router.get("", response_model=list[ModelOut])
def list_models(
    type: str | None = Query(default=None, pattern="^(text|image|video|multimodal)$"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ModelOut]:
    q = db.query(ModelRow).filter(ModelRow.visible.is_(True), ModelRow.status == "active")
    if type:
        q = q.filter(ModelRow.type == type)
    rows = q.order_by(desc(ModelRow.type), ModelRow.public_name).all()
    providers = {p.id: p for p in db.query(Provider).all()}
    return [_to_out(r, providers) for r in rows]


@router.get("/{model_id}", response_model=ModelOut)
def get_model(
    model_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ModelOut:
    row = db.get(ModelRow, model_id)
    if not row or not row.visible or row.status != "active":
        raise HTTPException(status_code=404, detail="Model not found")
    providers = {p.id: p for p in db.query(Provider).all()}
    return _to_out(row, providers)
