import pytest

from app.core.money import (
    Change,
    change_for,
    lbp_to_usd_cents,
    order_total,
    round_10000,
    settles,
    usd_cents_to_lbp,
)

RATE = 89500


def test_conversions():
    assert usd_cents_to_lbp(500, RATE) == 447500
    assert lbp_to_usd_cents(410000, RATE) == 459
    assert lbp_to_usd_cents(1650000, RATE) == 1844


def test_round_10000():
    assert [round_10000(x) for x in (0, 4999, 5000, 37500)] == [0, 0, 10000, 40000]


def test_order_total():
    total = order_total(455000, 10)
    assert (total.discount, total.rounding, total.total) == (45500, 500, 410000)
    assert order_total(455000, None).total == 455000
    assert order_total(455000, 100).total == 0
    assert order_total(16000, 1).total == 16000  # rounding up may not exceed gross
    assert order_total(950000, 10).total == 860000


def test_small_balance():
    assert settles(410000, 2000)
    assert not settles(410000, 5000)
    assert not settles(4000, 1)
    assert settles(4000, 0)


def test_change():
    assert change_for(37500, 0, RATE) == Change(0, 40000, -2500)
    assert change_for(245000, 200, RATE) == Change(200, 70000, -4000)
    with pytest.raises(ValueError):
        change_for(245000, 300, RATE)


def test_displayed_usd_is_the_smallest_amount_that_settles_example():
    assert lbp_to_usd_cents(4835650, 1748) == 276639
    assert lbp_to_usd_cents(0, 89500) == 0


def test_displayed_usd_always_settles():
    for lbp in range(1, 2_000_001, 997):
        assert usd_cents_to_lbp(lbp_to_usd_cents(lbp, RATE), RATE) >= lbp


@pytest.mark.parametrize("rate", [1, 7, 99, 1500, 89500, 89501, 120000])
def test_displayed_usd_settles_at_any_rate(rate):
    for lbp in range(1, 5000):
        assert usd_cents_to_lbp(lbp_to_usd_cents(lbp, rate), rate) >= lbp


@pytest.mark.parametrize(
    "call",
    [
        lambda: usd_cents_to_lbp(-1, RATE),
        lambda: usd_cents_to_lbp(1, 0),
        lambda: lbp_to_usd_cents(1, -1),
        lambda: round_10000(-1),
        lambda: order_total(-1, None),
        lambda: order_total(1, 101),
    ],
)
def test_rejects_invalid(call):
    with pytest.raises(ValueError):
        call()
