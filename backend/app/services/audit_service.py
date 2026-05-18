"""Audit log helpers.

Use `record(...)` inside the SAME transaction as the change you're recording.
It does not commit; the caller is responsible. This matches the pattern in
billing_service.debit() (caller commits).
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..logging_config import request_id_var
from ..models import AuditLog
from ..utils.redact import redact


def record(
    db: Session,
    *,
    actor_user_id: int | None,
    action: str,
    target_type: str,
    target_id: str | int | None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    ip: str | None = None,
) -> AuditLog:
    row = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        before=redact(before) if before is not None else None,
        after=redact(after) if after is not None else None,
        request_id=request_id_var.get(),
        ip=ip,
    )
    db.add(row)
    db.flush()
    return row
