import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from .config import get_settings

settings = get_settings()

# --- Password hashing (bcrypt direct — bcrypt truncates plaintext at 72 bytes) ---


def _to_bytes(s: str) -> bytes:
    # bcrypt silently truncates plaintext past 72 bytes; we mirror that here so
    # hash/verify agree. Pydantic schemas cap password length to keep this safe.
    return s.encode("utf-8")[:72]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_to_bytes(plain), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bytes(plain), hashed.encode("utf-8"))
    except Exception:
        return False


# --- JWT ---


def create_access_token(subject: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload: dict = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expires_minutes)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


# --- API Key generation ---
# Format: lgw_<32 url-safe chars>. Hash with SHA-256 (deterministic lookup-friendly;
# the key itself is a 192-bit secret so a strong KDF is not strictly required for MVP).

API_KEY_PREFIX = "lgw_"
API_KEY_BODY_LEN = 32  # token_urlsafe bytes (~43 chars); we slice to 32 for readability


def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key_plain, key_prefix_displayed, key_hash_to_store)."""
    body = secrets.token_urlsafe(36)[:API_KEY_BODY_LEN]
    full = f"{API_KEY_PREFIX}{body}"
    prefix = full[:11]  # e.g. lgw_AbCdEfG
    key_hash = hash_api_key(full)
    return full, prefix, key_hash


def hash_api_key(plain: str) -> str:
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()
