"""Hashing, JWT, API key generation, refresh token generation."""
from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt

from .config import get_settings

settings = get_settings()

# --- Password hashing ---


def _to_bytes(s: str) -> bytes:
    return s.encode("utf-8")[:72]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_to_bytes(plain), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bytes(plain), hashed.encode("utf-8"))
    except Exception:
        return False


# --- Access token (short-lived JWT) ---


def create_access_token(subject: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload: dict = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_access_ttl_minutes)).timestamp()),
        "typ": "access",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("typ") not in (None, "access"):
        return None
    return payload


# --- Refresh tokens (opaque, server-side DB-backed) ---

REFRESH_TOKEN_PREFIX = "rft_"
REFRESH_TOKEN_BODY_LEN = 48


def generate_refresh_token() -> tuple[str, str, datetime]:
    """Returns (plaintext, sha256_hash, expires_at)."""
    body = secrets.token_urlsafe(REFRESH_TOKEN_BODY_LEN)[:REFRESH_TOKEN_BODY_LEN]
    plain = f"{REFRESH_TOKEN_PREFIX}{body}"
    h = hash_refresh_token(plain)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_ttl_days)
    return plain, h, expires_at


def hash_refresh_token(plain: str) -> str:
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


# --- API keys ---

API_KEY_PREFIX = "sk-"
API_KEY_BODY_LEN = 32


def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key_plain, key_prefix_displayed, key_hash_to_store)."""
    body = secrets.token_urlsafe(36)[:API_KEY_BODY_LEN]
    full = f"{API_KEY_PREFIX}{body}"
    prefix = full[:11]
    key_hash = hash_api_key(full)
    return full, prefix, key_hash


def hash_api_key(plain: str) -> str:
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


# --- API key encryption-at-rest (for dashboard re-reveal) ---
# Auth still goes via key_hash only; this is never read on the gateway hot path.
# Fernet key is derived from jwt_secret — rotating jwt_secret makes stored keys unrecoverable.


@lru_cache(maxsize=1)
def _api_key_fernet() -> Fernet:
    material = hashlib.sha256(f"apikey-enc-v1:{settings.jwt_secret}".encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(material))


def encrypt_api_key(plain: str) -> str:
    return _api_key_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_api_key(token: str) -> str | None:
    try:
        return _api_key_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None
