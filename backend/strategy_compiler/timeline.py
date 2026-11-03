"""Month arithmetic. Months are strings 'YYYY-MM'. Internally a month is an integer index."""

from __future__ import annotations

import re

_MONTH_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


def parse_month(ym: str) -> int:
    match = _MONTH_RE.match(ym)
    if not match:
        raise ValueError(f"invalid month {ym!r}, expected YYYY-MM")
    return int(match.group(1)) * 12 + int(match.group(2)) - 1


def format_month(index: int) -> str:
    year, month = divmod(index, 12)
    return f"{year:04d}-{month + 1:02d}"


def month_range(start: str, end: str) -> list[str]:
    """Inclusive list of months from start to end. Empty if end is before start."""
    a, b = parse_month(start), parse_month(end)
    return [format_month(i) for i in range(a, b + 1)]
