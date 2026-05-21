from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi_limiter import FastAPILimiter
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api import admin as admin_api
from .api import auth as auth_api
from .api import billing as billing_api
from .api import dashboard as dashboard_api
from .api import gateway as gateway_api
from .api import keys as keys_api
from .api import logs as logs_api
from .api import models as models_api
from .api import oauth as oauth_api
from .api import settings_connections as settings_connections_api
from .config import get_settings
from .database import SessionLocal, engine
from .logging_config import configure_logging, get_logger
from .metrics import render_metrics
from .middleware import AccessLogMiddleware, BodySizeLimitMiddleware, RequestIdMiddleware
from .providers import close_all_clients
from .redis_client import close_redis, get_redis, ping as redis_ping
from .seed import run_seed

configure_logging()
log = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup", env=settings.env)
    redis = get_redis()
    redis_ok = False
    try:
        await redis.ping()
        redis_ok = True
    except Exception as e:
        log.error("redis_unavailable_at_startup", error=str(e))
        if settings.is_production:
            raise
    if redis_ok:
        try:
            await FastAPILimiter.init(redis)
        except Exception as e:
            log.error("rate_limiter_init_failed", error=str(e))
            if settings.is_production:
                raise

    db = SessionLocal()
    try:
        run_seed(db)
    finally:
        db.close()
    yield
    log.info("shutdown")
    try:
        await FastAPILimiter.close()
    except Exception:
        pass
    await close_all_clients()
    await close_redis()


app = FastAPI(title="LLM API Gateway", version="0.2.0", lifespan=lifespan)

# Middleware: outer-most is the last `add_middleware` call, so order matters.
# BodySizeLimitMiddleware is last (outermost) so it short-circuits before logging.
app.add_middleware(AccessLogMiddleware)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "Accept"],
    expose_headers=["X-Request-ID", "X-Gateway-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=4 * 1024 * 1024)


# ---------------- Security headers ----------------


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    # Strict CSP for browser-served routes. APIs are JSON, but a stray HTML
    # response anywhere shouldn't load third-party scripts.
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "media-src 'self' https:; "
        "connect-src 'self' https:; "
        "font-src 'self' data:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'",
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


# ---------------- Probes / metrics ----------------


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
async def readyz() -> Response:
    db_ok = True
    redis_ok = await redis_ping()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        db_ok = False
        log.warning("readyz_db_fail", error=str(e))
    if db_ok and redis_ok:
        return JSONResponse({"status": "ready", "db": True, "redis": True})
    return JSONResponse({"status": "not_ready", "db": db_ok, "redis": redis_ok}, status_code=503)


@app.get("/metrics")
async def metrics() -> Response:
    body, ctype = render_metrics()
    return Response(content=body, media_type=ctype)


# ---------------- Unified error envelope ----------------


# OpenAI-style error `type` keyed by HTTP status. Clients written against the
# OpenAI/Anthropic SDKs branch on this vocabulary — emitting a gateway-private
# `http_error` / `http_<code>` shape instead would be a non-standard surface.
_OPENAI_ERROR_TYPE: dict[int, str] = {
    400: "invalid_request_error",
    401: "authentication_error",
    403: "permission_error",
    404: "invalid_request_error",
    409: "invalid_request_error",
    413: "invalid_request_error",
    422: "invalid_request_error",
    429: "rate_limit_error",
}


def _openai_error_type(status_code: int) -> str:
    if status_code in _OPENAI_ERROR_TYPE:
        return _OPENAI_ERROR_TYPE[status_code]
    return "api_error" if status_code >= 500 else "invalid_request_error"


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Mirror OpenAI's `{"error": {message, type, param, code}}` shape so SDK
    # clients can parse uniformly. Preserve any headers set on the
    # HTTPException (e.g. Retry-After / Retry-After-Ms from the rate-limit
    # gates) — without forwarding them here, the Anthropic SDK would never see
    # the retry hint.
    headers = getattr(exc, "headers", None)
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail, headers=headers)
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content={"error": detail}, headers=headers)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": str(detail) if detail is not None else "Error",
                "type": _openai_error_type(exc.status_code),
                "param": None,
                "code": None,
            }
        },
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "message": "Validation failed",
                "type": "validation_error",
                "code": "validation_error",
                "details": exc.errors(),
            }
        },
    )


# ---------------- Routes ----------------


app.include_router(auth_api.router)
app.include_router(oauth_api.router)
app.include_router(keys_api.router)
app.include_router(models_api.router)
app.include_router(billing_api.router)
app.include_router(logs_api.router)
app.include_router(dashboard_api.router)
app.include_router(admin_api.router)
app.include_router(settings_connections_api.router)
app.include_router(gateway_api.router)
