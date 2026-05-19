"""Password policy per NIST SP 800-63B § 5.1.1.2."""
from __future__ import annotations

from .breached_password_service import is_breached

MIN_LEN = 12
MAX_LEN = 128


def validate_password(plain: str, *, email: str) -> str | None:
    """Return None if OK, else an error code string."""
    if len(plain) < MIN_LEN:
        return "too_short"
    if len(plain) > MAX_LEN:
        return "too_long"
    if is_breached(plain):
        return "breached"

    local = email.split("@", 1)[0].lower()
    if len(local) >= 5 and local in plain.lower():
        return "contains_email"

    return None
