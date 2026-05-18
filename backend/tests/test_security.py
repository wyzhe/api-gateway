"""Auth / API-key generation primitives. Pure-function, no DB."""
from app.security import (
    create_access_token,
    decode_access_token,
    generate_api_key,
    hash_api_key,
    hash_password,
    verify_password,
)


def test_password_hash_verifies():
    h = hash_password("hunter2")
    assert h.startswith("$2") and len(h) >= 50  # bcrypt prefix
    assert verify_password("hunter2", h) is True
    assert verify_password("wrong", h) is False


def test_password_long_input_truncates_consistently():
    """bcrypt truncates at 72 bytes; we should hash and verify identically."""
    long = "a" * 200
    h = hash_password(long)
    assert verify_password(long, h) is True
    # First 72 chars should still verify (same truncated payload).
    assert verify_password("a" * 72, h) is True


def test_jwt_roundtrip():
    tok = create_access_token("123", extra={"role": "admin"})
    payload = decode_access_token(tok)
    assert payload is not None
    assert payload["sub"] == "123"
    assert payload["role"] == "admin"


def test_jwt_rejects_garbage():
    assert decode_access_token("not-a-jwt") is None
    assert decode_access_token("") is None


def test_api_key_generation_shape():
    full, prefix, hashed = generate_api_key()
    assert full.startswith("lgw_")
    assert len(full) == 4 + 32  # "lgw_" + 32 body chars
    assert prefix == full[:11]
    assert hashed == hash_api_key(full)
    # Different invocations give different keys
    full2, _, hashed2 = generate_api_key()
    assert full != full2 and hashed != hashed2


def test_api_key_hash_is_deterministic():
    k = "lgw_abc123"
    assert hash_api_key(k) == hash_api_key(k)
    assert len(hash_api_key(k)) == 64  # sha256 hex
