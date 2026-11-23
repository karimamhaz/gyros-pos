"""The only place money is converted or rounded. LBP in pounds, USD in cents, integers only."""

from dataclasses import dataclass

SMALL_BALANCE = 5_000
ROUND_TO = 10_000


@dataclass(frozen=True)
class Total:
    gross: int
    discount: int
    rounding: int
    total: int


@dataclass(frozen=True)
class Change:
    usd_cents: int
    lbp: int
    rounding: int


def _check(amount: int, rate: int = 1) -> None:
    if amount < 0 or rate <= 0:
        raise ValueError("amount must not be negative and rate must be positive")


def usd_cents_to_lbp(cents: int, rate: int) -> int:
    _check(cents, rate)
    return (cents * rate + 50) // 100


def lbp_to_usd_cents(lbp: int, rate: int) -> int:
    """Rounds up, so paying the displayed amount always settles the bill."""
    _check(lbp, rate)
    cents = -(-lbp * 100 // rate)
    # Half-up conversion back can fall short at very low rates.
    while usd_cents_to_lbp(cents, rate) < lbp:
        cents += 1
    return cents


def round_10000(lbp: int) -> int:
    _check(lbp)
    return (lbp + ROUND_TO // 2) // ROUND_TO * ROUND_TO


def order_total(gross: int, percent: int | None) -> Total:
    _check(gross)
    if percent is None:
        return Total(gross, 0, 0, gross)
    if not 1 <= percent <= 100:
        raise ValueError("percent must be 1 to 100")
    discount = (gross * percent + 50) // 100
    exact = gross - discount
    total = min(round_10000(exact), gross)
    return Total(gross, discount, total - exact, total)


def settles(total: int, due_after: int) -> bool:
    """A leftover smaller than the notes in circulation counts as paid (A15)."""
    return due_after <= 0 or (total >= ROUND_TO and due_after < SMALL_BALANCE)


def change_for(overpaid_lbp: int, usd_cents: int, rate: int) -> Change:
    usd_value = usd_cents_to_lbp(usd_cents, rate)
    if usd_value > overpaid_lbp:
        raise ValueError("USD change is worth more than the overpayment")
    lbp = round_10000(overpaid_lbp - usd_value)
    return Change(usd_cents, lbp, overpaid_lbp - usd_value - lbp)
