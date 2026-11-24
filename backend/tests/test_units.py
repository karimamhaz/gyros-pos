"""Unit tests: small pieces on their own, including randomised checks of the money rules."""

import json
import logging
import random
import re
from datetime import UTC, datetime

import pytest

from app.core import clock, money, security
from app.core.errors import AppError, not_found
from app.core.logging import JsonFormatter
from app.modules.menu.text import normalise


def local_as_utc(year, month, day, hour, minute):
    """A moment given on the wall clock, in the naive UTC the database stores."""
    return (
        datetime(year, month, day, hour, minute).astimezone().astimezone(UTC).replace(tzinfo=None)
    )


# --- money: randomised rules -------------------------------------------------------------


def test_money_rules_hold_for_random_orders():
    rng = random.Random(20261124)
    for _ in range(20_000):
        gross = rng.randint(0, 20_000_000)
        percent = rng.choice([None, *range(1, 101)])
        t = money.order_total(gross, percent)
        assert 0 <= t.discount <= gross
        assert t.total <= gross  # rounding never charges more than the menu price
        assert t.total == gross or t.total % money.ROUND_TO == 0
        assert t.gross - t.discount + t.rounding == t.total  # every pound is accounted for
        assert abs(t.rounding) <= money.ROUND_TO // 2


def test_change_accounts_for_every_pound():
    rng = random.Random(7)
    for _ in range(20_000):
        rate = rng.choice([1500, 89_500, 90_000, rng.randint(1, 500_000)])
        over = rng.randint(0, 10_000_000)
        cents = rng.randint(0, over * 100 // rate)
        if money.usd_cents_to_lbp(cents, rate) > over:
            continue
        c = money.change_for(over, cents, rate)
        assert money.usd_cents_to_lbp(c.usd_cents, rate) + c.lbp + c.rounding == over
        assert c.lbp % money.ROUND_TO == 0 and abs(c.rounding) <= money.ROUND_TO // 2


def test_displayed_usd_always_settles_the_bill():
    rng = random.Random(3)
    for _ in range(20_000):
        rate, lbp = rng.randint(1, 600_000), rng.randint(0, 50_000_000)
        cents = money.lbp_to_usd_cents(lbp, rate)
        assert money.usd_cents_to_lbp(cents, rate) >= lbp
        assert cents == 0 or money.usd_cents_to_lbp(cents - 1, rate) < lbp  # and not a cent more


@pytest.mark.parametrize(
    "total,left,expected",
    [
        (10_000, 4_999, True),
        (10_000, 5_000, False),
        (9_999, 1, False),
        (50_000, 0, True),
        (50_000, -5, True),
    ],
)
def test_small_balance_boundaries(total, left, expected):
    assert money.settles(total, left) is expected


# --- text, time, security ------------------------------------------------------------------


@pytest.mark.parametrize(
    "a,b",
    [
        ("لحمة", "لحمه"),
        ("أحمد", "احمد"),
        ("  Beef   Large ", "beef large"),
        ("Ｂｅｅｆ", "beef"),
        ("كَبِير", "كبير"),
        ("مشروب", "مشروبـ"),
    ],
)
def test_similar_names_match(a, b):
    assert normalise(a) == normalise(b)


@pytest.mark.parametrize("a,b", [("لبن", "لحم"), ("beef", "beet"), ("وسط", "كبير")])
def test_different_names_stay_different(a, b):
    assert normalise(a) != normalise(b)


def test_business_day_follows_the_cutoff():
    def day(h, m, cutoff):
        return clock.business_date(cutoff, local_as_utc(2026, 11, 24, h, m)).isoformat()

    assert day(3, 59, 240) == "2026-11-23"
    assert day(4, 0, 240) == "2026-11-24"
    assert day(0, 0, 0) == "2026-11-24"
    assert day(23, 59, 0) == "2026-11-24"
    assert day(0, 30, 60) == "2026-11-23"


def test_clock_can_be_frozen_and_released():
    clock.freeze(datetime(2026, 1, 2, 3, 4, 5, 999).astimezone())
    assert clock.now() == datetime(2026, 1, 2, 3, 4, 5).astimezone(UTC).replace(tzinfo=None)
    clock.freeze(None)
    assert abs((datetime.now(UTC).replace(tzinfo=None) - clock.now()).total_seconds()) < 5


def test_codes_avoid_look_alike_characters_and_do_not_repeat():
    codes = {security.random_code(5) for _ in range(2000)}
    assert len(codes) > 1990
    assert all(re.fullmatch(r"[2-9A-HJKMNP-Z]{5}", c) for c in codes)


def test_passwords_hash_and_verify():
    hashed = security.hash_password("pässwörd عربي")
    assert hashed.startswith("$argon2id$") and hashed != security.hash_password("pässwörd عربي")
    assert security.verify_password(hashed, "pässwörd عربي")
    assert not security.verify_password(hashed, "pässwörd")
    assert not security.verify_password("not a hash", "x") and not security.verify_password("", "")


def test_tokens_and_secret_comparison():
    token = security.new_token()
    assert len(token) >= 40 and token != security.new_token()
    assert security.token_hash(token) == security.token_hash(token) != token
    assert security.same_secret("abc", "abc") and not security.same_secret("abc", "abd")
    assert not security.same_secret("é", "e") and not security.same_secret("", "x")


def test_error_bodies_never_carry_more_than_a_code_and_numbers():
    assert AppError("x", 409, a=1).body() == {"error": {"code": "x", "params": {"a": 1}}}
    assert not_found().status == 404


def test_log_lines_are_json_and_keep_the_traceback():
    try:
        raise ValueError("boom")
    except ValueError:
        import sys

        record = logging.LogRecord(
            "pos", logging.ERROR, __file__, 1, "failed %s", ("x",), sys.exc_info()
        )
    line = json.loads(JsonFormatter().format(record))
    assert line["message"] == "failed x" and "ValueError" in line["exception"]
