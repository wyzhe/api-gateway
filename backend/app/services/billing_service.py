"""Money operations. Always Decimal, always single-transaction with FOR UPDATE on the user row."""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import BalanceTransaction, RequestLog, User


def _lock_user(db: Session, user_id: int) -> User:
    stmt = select(User).where(User.id == user_id).with_for_update()
    user = db.execute(stmt).scalar_one_or_none()
    if user is None:
        raise ValueError(f"user {user_id} not found")
    return user


def recharge(
    db: Session,
    user_id: int,
    amount: Decimal,
    admin_id: int | None,
    note: str | None = None,
) -> BalanceTransaction:
    if amount <= 0:
        raise ValueError("amount must be > 0")
    user = _lock_user(db, user_id)
    before = Decimal(user.balance)
    after = before + amount
    user.balance = after
    txn = BalanceTransaction(
        user_id=user.id,
        type="recharge",
        amount=amount,
        balance_before=before,
        balance_after=after,
        note=note,
        created_by_admin_id=admin_id,
    )
    db.add(txn)
    db.flush()  # caller commits — keeps the audit_logs row in the same transaction
    return txn


def debit(
    db: Session,
    user_id: int,
    amount: Decimal,
    request_log_id: int | None,
    note: str | None = None,
) -> BalanceTransaction | None:
    """Deduct usage cost. amount==0 is a no-op (still no transaction row)."""
    if amount <= 0:
        return None
    user = _lock_user(db, user_id)
    before = Decimal(user.balance)
    after = before - amount
    user.balance = after
    txn = BalanceTransaction(
        user_id=user.id,
        type="debit",
        amount=amount,
        balance_before=before,
        balance_after=after,
        request_log_id=request_log_id,
        note=note,
    )
    db.add(txn)
    db.flush()  # caller commits as part of the gateway transaction
    return txn


def refund(
    db: Session,
    user_id: int,
    amount: Decimal,
    request_log_id: int | None,
    note: str | None = None,
) -> BalanceTransaction | None:
    """Credit back a previously-debited amount (e.g. clawback after stream usage
    reconciliation, or refund of a task we incorrectly debited)."""
    if amount <= 0:
        return None
    user = _lock_user(db, user_id)
    before = Decimal(user.balance)
    after = before + amount
    user.balance = after
    txn = BalanceTransaction(
        user_id=user.id,
        type="refund",
        amount=amount,
        balance_before=before,
        balance_after=after,
        request_log_id=request_log_id,
        note=note,
    )
    db.add(txn)
    db.flush()
    return txn


def adjust(
    db: Session,
    user_id: int,
    amount: Decimal,  # may be negative
    admin_id: int | None,
    note: str | None,
) -> BalanceTransaction:
    user = _lock_user(db, user_id)
    before = Decimal(user.balance)
    after = before + amount
    user.balance = after
    txn = BalanceTransaction(
        user_id=user.id,
        type="adjustment",
        amount=amount,
        balance_before=before,
        balance_after=after,
        note=note,
        created_by_admin_id=admin_id,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def adjust_log_cost(
    db: Session,
    log: RequestLog,
    new_cost: Decimal,
    *,
    note: str | None = None,
) -> BalanceTransaction | None:
    """Reconcile an already-billed log to a new cost.

    Used by the worker after streaming usage reconciliation: if the
    pessimistic estimate over-charged, refund the diff; if it under-charged,
    debit the diff. Locks the user, writes a single transaction row, updates
    log.cost in place.

    Returns the BalanceTransaction (or None if no diff). Caller commits.
    """
    old_cost = Decimal(log.cost or 0)
    delta = new_cost - old_cost
    if delta == 0:
        return None
    user = _lock_user(db, log.user_id)
    before = Decimal(user.balance)
    if delta > 0:
        after = before - delta
        ttype = "debit"
        amount = delta
    else:
        after = before + (-delta)
        ttype = "refund"
        amount = -delta
    user.balance = after
    log.cost = new_cost
    txn = BalanceTransaction(
        user_id=user.id,
        type=ttype,
        amount=amount,
        balance_before=before,
        balance_after=after,
        request_log_id=log.id,
        note=note or f"reconcile log#{log.id}",
    )
    db.add(txn)
    db.flush()
    return txn
