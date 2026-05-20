"""Seed default rows on startup: admin user, APIMart provider, default models.

Idempotent — safe to call on every boot.
"""
import secrets
from decimal import Decimal

from sqlalchemy.orm import Session

from .config import get_settings
from .enums import AccountStatus
from .logging_config import get_logger
from .models import ModelRow, Provider, User
from .security import hash_password

settings = get_settings()
log = get_logger(__name__)


# --- Default model catalogue ---
# `public_name` is what users send in their `model` field.
# `upstream_model` is what we forward to APIMart.
# `display_provider` is a UI-only tag so the React app keeps multi-color provider chips
# (every model still routes through APIMart at runtime).
#
# Status / visible default to active+visible. The grok-imagine *image* row is
# the exception — seeded disabled (APIMart image support unconfirmed); an admin
# can enable it later. The grok video row (grok-imagine-1.0-video-apimart) is active.

DEFAULT_MODELS: list[dict] = [
    # ------------ Text ------------
    # NOTE: `upstream_model` is APIMart's EXACT model id (per GET /v1/models),
    # which often differs from `public_name` — APIMart hyphenates Anthropic
    # version numbers (claude-opus-4-7) and suffixes Gemini 3.1 Pro with
    # -preview. Do not "normalise" upstream_model back to match public_name.
    {
        "public_name": "gpt-5.5",
        "upstream_model": "gpt-5.5",
        "type": "text",
        "display_name": "GPT-5.5",
        "display_provider": "openai",
        "description": "OpenAI flagship general reasoning model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("5.0"),
        "output_price": Decimal("30.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 400_000},
        "max_input_tokens": 400_000,
        # OpenAI bills cached input cheaply but has no separate cache-write fee.
        "cache_write_price": None,
        "cache_read_price": Decimal("0.50"),
    },
    {
        "public_name": "claude-opus-4.7",
        "upstream_model": "claude-opus-4-7",
        "type": "text",
        "display_name": "Claude Opus 4.7",
        "display_provider": "anthropic",
        "description": "Anthropic flagship reasoning model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("5.0"),
        "output_price": Decimal("25.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 1_000_000},
        "max_input_tokens": 1_000_000,
        # Cache pricing per 1M input tokens: write = 1.25x input; read = 0.1x input.
        "cache_write_price": Decimal("6.25"),
        "cache_read_price": Decimal("0.50"),
    },
    {
        "public_name": "claude-sonnet-4.6",
        "upstream_model": "claude-sonnet-4-6",
        "type": "text",
        "display_name": "Claude Sonnet 4.6",
        "display_provider": "anthropic",
        "description": "Anthropic best price/quality balance (2026 refresh).",
        "pricing_mode": "per_token",
        "input_price": Decimal("3.0"),
        "output_price": Decimal("15.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 200_000},
        "max_input_tokens": 200_000,
        # Cache pricing per 1M input tokens: write = $3.75/1M; read = $0.30/1M.
        "cache_write_price": Decimal("3.75"),
        "cache_read_price": Decimal("0.30"),
    },
    {
        "public_name": "gemini-3.1-pro",
        "upstream_model": "gemini-3.1-pro-preview",
        "type": "text",
        "display_name": "Gemini 3.1 Pro",
        "display_provider": "gemini",
        "description": "Google flagship multimodal reasoning model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("2.0"),
        "output_price": Decimal("12.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 1_000_000},
        "max_input_tokens": 1_000_000,
        # Standard-context (<=200K) list price; cached input billed at cache_read_price.
        "cache_write_price": None,
        "cache_read_price": Decimal("0.20"),
    },
    {
        "public_name": "gemini-3.5-flash",
        "upstream_model": "gemini-3.5-flash",
        "type": "text",
        "display_name": "Gemini 3.5 Flash",
        "display_provider": "gemini",
        "description": "Google fast multimodal model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("1.5"),
        "output_price": Decimal("9.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 1_000_000},
        "max_input_tokens": 1_000_000,
        "cache_write_price": None,
        "cache_read_price": Decimal("0.15"),
    },
    # Non-text models do not consume input tokens — max_input_tokens and cache prices are not applicable below.
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
    # Note: sora2 is not seeded — observed upstream queue times >30 min, not
    # suitable for an interactive playground. It is kept disabled via
    # DISABLE_ON_BOOT for existing DBs; admins can re-add via POST /api/admin/models.
    {
        "public_name": "veo3.1-fast",
        "upstream_model": "veo3.1-fast",
        "type": "video",
        "display_name": "veo3.1",
        "display_provider": "veo",
        "description": "Google Veo 3.1 Fast video model (async).",
        "pricing_mode": "per_second",
        "video_second_price": Decimal("0.15"),
        "capabilities": {"durations": [4, 8], "aspect_ratios": ["16:9", "9:16"]},
    },
    {
        "public_name": "grok-imagine-1.0-video-apimart",
        "upstream_model": "grok-imagine-1.0-video-apimart",
        "type": "video",
        "display_name": "grok-imagine",
        "display_provider": "xai",
        "description": "xAI Grok Imagine video model (async).",
        "pricing_mode": "per_second",
        "video_second_price": Decimal("0.05"),
        "capabilities": {},
    },
]

# DeepSeek 模型走独立的 deepseek provider。定价为官方列表价按 ¥7.2/$ 换算的
# USD 值（不含临时折扣，不加价）；DeepSeek 缓存无写入费 → cache_write_price=None。
DEEPSEEK_MODELS: list[dict] = [
    {
        "public_name": "deepseek-v4-flash",
        "upstream_model": "deepseek-v4-flash",
        "type": "text",
        "display_name": "DeepSeek V4 Flash",
        "display_provider": "deepseek",
        "description": "DeepSeek V4 fast-inference model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("0.14"),
        "output_price": Decimal("0.28"),
        "capabilities": {"stream": True, "tools": True, "vision": False, "ctx": 128_000},
        "max_input_tokens": 128_000,
        "cache_write_price": None,
        "cache_read_price": Decimal("0.003"),
    },
    {
        "public_name": "deepseek-v4-pro",
        "upstream_model": "deepseek-v4-pro",
        "type": "text",
        "display_name": "DeepSeek V4 Pro",
        "display_provider": "deepseek",
        "description": "DeepSeek V4 advanced-reasoning model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("0.42"),
        "output_price": Decimal("0.83"),
        "capabilities": {"stream": True, "tools": True, "vision": False, "ctx": 128_000},
        "max_input_tokens": 128_000,
        "cache_write_price": None,
        "cache_read_price": Decimal("0.0035"),
    },
]


def ensure_admin(db: Session) -> User:
    admin = db.query(User).filter(User.email == settings.admin_email).one_or_none()
    if admin:
        return admin
    pw = settings.admin_password
    auto_generated = False
    if not pw:
        pw = secrets.token_urlsafe(18)
        auto_generated = True
    admin = User(
        email=settings.admin_email,
        password_hash=hash_password(pw),
        display_name="Admin",
        role="admin",
        status="active",
        balance=Decimal("0"),
    )
    db.add(admin)
    db.flush()
    if auto_generated:
        # Print once to logs so the operator can capture it. Do NOT store the
        # plaintext anywhere persistent.
        log.warning(
            "admin_password_generated",
            email=settings.admin_email,
            initial_password=pw,
            hint="rotate this password after first login",
        )
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


def ensure_deepseek_provider(db: Session) -> Provider:
    p = db.query(Provider).filter(Provider.name == "deepseek").one_or_none()
    if p:
        return p
    p = Provider(
        name="deepseek",
        display_name="DeepSeek",
        base_url=settings.deepseek_base_url,
        status="active",
    )
    db.add(p)
    db.flush()
    return p


def ensure_deepseek_models(db: Session, provider: Provider) -> None:
    # If no API key is configured at boot, seed the models disabled so they
    # don't surface as broken — an admin can enable them later (same posture
    # as the grok placeholder rows).
    default_status = "active" if settings.deepseek_api_key else "disabled"
    existing = {m.public_name for m in db.query(ModelRow.public_name).all()}
    for spec in DEEPSEEK_MODELS:
        if spec["public_name"] in existing:
            continue
        db.add(
            ModelRow(
                provider_id=provider.id,
                visible=True,
                status=default_status,
                **{k: v for k, v in spec.items() if k != "status"},
            )
        )


# Rename map: old public_name -> new public_name. Existing FK rows keep working.
RENAME_ON_BOOT: dict[str, str] = {
    "claude-sonnet-4.5": "claude-sonnet-4.6",
}

# Retarget map: public_name -> correct upstream_model. Fixes already-seeded
# production rows whose upstream_model used the wrong APIMart id (APIMart
# hyphenates Anthropic versions; we originally seeded the dotted form, which
# APIMart rejects with model_not_found). Applied on boot, idempotent — no
# migration needed. Fresh DBs get the right value straight from DEFAULT_MODELS.
RETARGET_ON_BOOT: dict[str, str] = {
    "claude-sonnet-4.6": "claude-sonnet-4-6",
}

# Names we want to keep in the DB (for log FK integrity) but mark disabled.
# Retired models: soft-disabled on existing DBs so request_logs FKs / price
# snapshots stay intact. New DBs simply never seed them (absent from DEFAULT_MODELS).
DISABLE_ON_BOOT: set[str] = {
    "sora2",
    "gpt-5",
    "gpt-4o",
    "gemini-2.0-flash",
    "veo3",
    "veo3.1",
}


def ensure_default_models(db: Session, provider: Provider) -> None:
    # Rename obsolete public_names to current ones (keeps logs/transactions valid).
    for old, new in RENAME_ON_BOOT.items():
        row = db.query(ModelRow).filter(ModelRow.public_name == old).one_or_none()
        if row and not db.query(ModelRow).filter(ModelRow.public_name == new).one_or_none():
            row.public_name = new
            row.upstream_model = new

    # Correct upstream_model on existing rows whose APIMart id was wrong.
    # Runs after RENAME_ON_BOOT so a just-renamed row gets the right id too.
    for public_name, correct_upstream in RETARGET_ON_BOOT.items():
        row = db.query(ModelRow).filter(ModelRow.public_name == public_name).one_or_none()
        if row and row.upstream_model != correct_upstream:
            row.upstream_model = correct_upstream

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
    deepseek = ensure_deepseek_provider(db)
    ensure_deepseek_models(db, deepseek)
    db.commit()
