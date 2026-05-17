from datetime import datetime, timezone


def today_utc() -> datetime:
    n = datetime.now(timezone.utc)
    return datetime(n.year, n.month, n.day, tzinfo=timezone.utc)


def month_start_utc() -> datetime:
    n = datetime.now(timezone.utc)
    return datetime(n.year, n.month, 1, tzinfo=timezone.utc)
