"""Recursive secret-redaction helper.

Two call sites:
  - `gateway_service.persist_*` scrubs inbound request payloads before they
    land in `request_logs.request_payload_json`.
  - `audit_service.record` scrubs before/after dicts before they land in
    `audit_logs.{before,after}`.

Keep the keyword set comprehensive: any new field name in a request body or
admin payload that could plausibly carry a credential should be added here.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

REDACT_KEYS: frozenset[str] = frozenset({
    "authorization",
    "api_key",
    "apikey",
    "password",
    "password_hash",
    "secret",
    "token",
    "access_token",
    "refresh_token",
    "key_hash",
})

REDACTED = "***redacted***"


def redact(value: Any) -> Any:
    """Recursively redact secret-y keys and stringify Decimals for JSONB."""
    if isinstance(value, dict):
        return {
            k: (REDACTED if isinstance(k, str) and k.lower() in REDACT_KEYS else redact(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(x) for x in value]
    if isinstance(value, Decimal):
        return str(value)
    return value
