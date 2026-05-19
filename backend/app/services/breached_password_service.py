"""Breached password list — loaded once at import time.

NIST SP 800-63B §5.1.1.2 SHALL clause:
"compare against a list ... containing values known to be ... compromised"
"""
from __future__ import annotations

from pathlib import Path

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "breached_top10k.txt"


def _load() -> frozenset[str]:
    try:
        with _DATA_PATH.open("r", encoding="utf-8") as f:
            return frozenset(line.strip().lower() for line in f if line.strip())
    except FileNotFoundError:
        import logging
        logging.warning("breached_top10k.txt not found at %s; check is disabled", _DATA_PATH)
        return frozenset()


_BREACHED_SET: frozenset[str] = _load()


def is_breached(plain: str) -> bool:
    return plain.lower() in _BREACHED_SET
