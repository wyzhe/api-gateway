"""Seed default rows on startup: admin user, APIMart provider, default models.

Idempotent — safe to call on every boot.
"""
from decimal import Decimal

from sqlalchemy.orm import Session

from .config import get_settings
from .enums import AccountStatus
from .models import ModelRow, Provider, User
from .security import hash_password

settings = get_settings()


# --- Default model catalogue ---
# `public_name` is what users send in their `model` field.
# `upstream_model` is what we forward to APIMart.
# `display_provider` is a UI-only tag so the React app keeps multi-color provider chips
# (every model still routes through APIMart at runtime).
#
# Status / visible default to active+visible unless we know APIMart doesn't list it yet
# (e.g. grok-imagine — flagged disabled, admin can enable later).

DEFAULT_MODELS: list[dict] = [
    # ------------ Text ------------
    {
        "public_name": "gpt-5",
        "upstream_model": "gpt-5",
        "type": "text",
        "display_name": "GPT-5",
        "display_provider": "openai",
        "description": "OpenAI flagship general reasoning model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("5.0"),
        "output_price": Decimal("15.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 256000},
    },
    {
        "public_name": "gpt-4o",
        "upstream_model": "gpt-4o",
        "type": "text",
        "display_name": "GPT-4o",
        "display_provider": "openai",
        "description": "OpenAI multimodal flagship.",
        "pricing_mode": "per_token",
        "input_price": Decimal("2.5"),
        "output_price": Decimal("10.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 128000},
    },
    {
        "public_name": "claude-sonnet-4.6",
        "upstream_model": "claude-sonnet-4.6",
        "type": "text",
        "display_name": "Claude Sonnet 4.6",
        "display_provider": "anthropic",
        "description": "Anthropic best price/quality balance (2026 refresh).",
        "pricing_mode": "per_token",
        "input_price": Decimal("3.0"),
        "output_price": Decimal("15.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 200000},
    },
    {
        "public_name": "gemini-2.0-flash",
        "upstream_model": "gemini-2.0-flash",
        "type": "text",
        "display_name": "Gemini 2.0 Flash",
        "display_provider": "gemini",
        "description": "Google fast multimodal text model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("0.3"),
        "output_price": Decimal("2.5"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 1000000},
    },
    # ------------ Image ------------
    {
        "public_name": "gpt-image-2",
        "upstream_model": "gpt-image-2",
        "type": "image",
        "display_name": "GPT-Image-2",
        "display_provider": "openai",
        "description": "OpenAI flagship image model (async via APIMart).",
        "pricing_mode": "per_image",
        "image_price": Decimal("0.04"),
        "capabilities": {"sizes": ["1:1", "16:9", "9:16"], "resolutions": ["1k", "2k", "4k"]},
    },
    {
        "public_name": "nano-banana",
        "upstream_model": "nano-banana",
        "type": "image",
        "display_name": "Nano Banana",
        "display_provider": "gemini",
        "description": "Cheap and fast Google image model.",
        "pricing_mode": "per_image",
        "image_price": Decimal("0.03"),
        "capabilities": {"sizes": ["1:1", "16:9", "9:16"]},
    },
    {
        "public_name": "nano-banana-pro",
        "upstream_model": "nano-banana-pro",
        "type": "image",
        "display_name": "Nano Banana Pro",
        "display_provider": "gemini",
        "description": "Higher fidelity Nano Banana, supports inpainting.",
        "pricing_mode": "per_image",
        "image_price": Decimal("0.06"),
        "capabilities": {"sizes": ["1:1", "16:9", "9:16"]},
    },
    {
        # APIMart docs do not currently list grok image generation — seed disabled.
        "public_name": "grok-imagine",
        "upstream_model": "grok-imagine",
        "type": "image",
        "display_name": "Grok Imagine",
        "display_provider": "xai",
        "description": "xAI image model. Not yet confirmed on APIMart — admin must enable.",
        "pricing_mode": "per_image",
        "image_price": Decimal("0.05"),
        "capabilities": {},
        "status": "disabled",
    },
    # ------------ Video ------------
    {
        "public_name": "veo3",
        "upstream_model": "veo-3",
        "type": "video",
        "display_name": "Veo 3",
        "display_provider": "veo",
        "description": "Google Veo 3 video model (async).",
        "pricing_mode": "per_second",
        "video_second_price": Decimal("0.40"),
        "capabilities": {"durations": [4, 8], "aspect_ratios": ["16:9", "9:16"]},
    },
    {
        "public_name": "veo3.1",
        "upstream_model": "veo-3.1",
        "type": "video",
        "display_name": "Veo 3.1",
        "display_provider": "veo",
        "description": "Google Veo 3.1 video model (async).",
        "pricing_mode": "per_second",
        "video_second_price": Decimal("0.45"),
        "capabilities": {"durations": [4, 8], "aspect_ratios": ["16:9", "9:16"]},
    },
    # Note: sora2 dropped from seed — observed upstream queue times >30 min,
    # not suitable for an interactive playground. Re-add as `disabled` if you
    # want it visible later; admins can also POST /api/admin/models to add.
    {
        # APIMart docs do not currently list grok video — seed disabled.
        "public_name": "grok-imagine-video",
        "upstream_model": "grok-imagine-video",
        "type": "video",
        "display_name": "Grok Imagine Video",
        "display_provider": "xai",
        "description": "xAI video model. Not yet confirmed on APIMart — admin must enable.",
        "pricing_mode": "per_generation",
        "generation_price": Decimal("0.20"),
        "capabilities": {},
        "status": "disabled",
    },
]


def ensure_admin(db: Session) -> User:
    admin = db.query(User).filter(User.email == settings.admin_email).one_or_none()
    if admin:
        return admin
    admin = User(
        email=settings.admin_email,
        password_hash=hash_password(settings.admin_password),
        display_name="Admin",
        role="admin",
        status="active",
        balance=Decimal("0"),
    )
    db.add(admin)
    db.flush()
    return admin


def ensure_apimart_provider(db: Session) -> Provider:
    p = db.query(Provider).filter(Provider.name == "apimart").one_or_none()
    if p:
        return p
    p = Provider(
        name="apimart",
        display_name="APIMart",
        base_url=settings.apimart_base_url,
        status="active",
    )
    db.add(p)
    db.flush()
    return p


# Rename map: old public_name -> new public_name. Existing FK rows keep working.
RENAME_ON_BOOT: dict[str, str] = {
    "claude-sonnet-4.5": "claude-sonnet-4.6",
}

# Names we want to keep in the DB (for log FK integrity) but mark disabled.
DISABLE_ON_BOOT: set[str] = {"sora2"}


def ensure_default_models(db: Session, provider: Provider) -> None:
    # Rename obsolete public_names to current ones (keeps logs/transactions valid).
    for old, new in RENAME_ON_BOOT.items():
        row = db.query(ModelRow).filter(ModelRow.public_name == old).one_or_none()
        if row and not db.query(ModelRow).filter(ModelRow.public_name == new).one_or_none():
            row.public_name = new
            row.upstream_model = new

    # Soft-disable models we no longer want exposed.
    for name in DISABLE_ON_BOOT:
        row = db.query(ModelRow).filter(ModelRow.public_name == name).one_or_none()
        if row and row.status != AccountStatus.DISABLED.value:
            row.status = AccountStatus.DISABLED.value
            row.visible = False

    # Make rename/disable visible to the next query in this transaction.
    db.flush()
    existing = {m.public_name for m in db.query(ModelRow.public_name).all()}
    for spec in DEFAULT_MODELS:
        if spec["public_name"] in existing:
            continue
        db.add(
            ModelRow(
                provider_id=provider.id,
                visible=True,
                status=spec.get("status", "active"),
                **{k: v for k, v in spec.items() if k != "status"},
            )
        )


def run_seed(db: Session) -> None:
    ensure_admin(db)
    provider = ensure_apimart_provider(db)
    ensure_default_models(db, provider)
    db.commit()
