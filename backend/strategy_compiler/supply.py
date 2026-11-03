"""Supply: a per-employee, per-month capacity ledger.

Each employee's programme capacity in a month is fte x availability (availability is the share of
FTE free for programme work after business-as-usual load). Any booking reduces the ledger, so one
person's capacity is never counted twice across overlapping requirements or milestones.
"""

from __future__ import annotations

from collections.abc import Iterable

from .config import EPS
from .contracts import Employee


def coverage(proficiency: int, required: int) -> float:
    """Share of the required proficiency that the person meets, capped at 1."""
    return min(1.0, proficiency / required)


def gap(proficiency: int, required: int) -> int:
    """Proficiency levels still missing."""
    return max(0, required - proficiency)


class Ledger:
    def __init__(
        self,
        employees: Iterable[Employee],
        months: Iterable[str],
        contributing_teams: set[str],
    ) -> None:
        self._remaining: dict[tuple[str, str], float] = {}
        self._base: dict[str, float] = {}
        month_list = list(months)
        for e in employees:
            base = e.fte * e.availability if e.team_id in contributing_teams else 0.0
            self._base[e.employee_id] = base
            for month in month_list:
                self._remaining[(e.employee_id, month)] = base

    def base_capacity(self, employee_id: str) -> float:
        return self._base.get(employee_id, 0.0)

    def remaining(self, employee_id: str, month: str) -> float:
        return self._remaining.get((employee_id, month), 0.0)

    def book(self, employee_id: str, month: str, amount: float) -> None:
        key = (employee_id, month)
        if amount < -EPS or amount > self._remaining.get(key, 0.0) + EPS:
            raise ValueError(f"overbooking {employee_id} in {month}: {amount} > remaining")
        self._remaining[key] = max(0.0, self._remaining.get(key, 0.0) - amount)

    def consume_all(self, employee_id: str, month: str) -> float:
        """Used for training: the person's whole programme capacity in that month."""
        key = (employee_id, month)
        left = self._remaining.get(key, 0.0)
        self._remaining[key] = 0.0
        return left
