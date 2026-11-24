import json

from tests.conftest import ADMIN_PASSWORD, CASHIER_PASSWORD
from tests.selling import (
    REASON,
    confirm,
    key,
    pay,
    table,
    takeaway,
)


def close(pos, password=CASHIER_PASSWORD, **count):
    return pos.post("/shifts/close", {"password": password, "count": count})["reference"]


def review(pos, reference):
    pos.admin()
    shift = pos.get(f"/shifts?reference={reference}")[0]
    return pos.get(f"/shifts/{shift['id']}")


def test_expected_cash_matches_a_scripted_shift(shop):
    pay(shop, takeaway(shop, beef=2, meal=1, soda=2), 1000, 1000000, 200, 70000)
    pay(shop, takeaway(shop, beef=1), 1000, 0, 0, 400000)
    order = confirm(shop, table(shop, 1, meal=1))
    order = pay(shop, order, 0, 100000)
    body = {"idempotency_key": key(), "usd_cents": 100, "lbp": 10000, "approval": REASON}
    shop.post(f"/orders/{order['id']}/refund", body)
    report = review(shop, close(shop, usd_cents=3700, lbp=1600000))
    assert report["cash_in"] == {"usd_cents": 2000, "lbp": 1100000}
    assert report["cash_out"] == {"usd_cents": 300, "lbp": 480000}
    assert report["expected"] == {"usd_cents": 3700, "lbp": 1620000}
    assert (report["difference_usd_cents"], report["difference_lbp"]) == (0, -20000)
    assert not report["closed_by_admin"]


def test_cashier_never_sees_expected_cash(shop):
    pay(shop, takeaway(shop, beef=1), 0, 500000)
    seen = [shop.get("/shifts/current"), shop.get("/settings"), shop.get("/tables")]
    seen.append(shop.get("/orders/drafts"))
    assert shop.fails("GET", "/shifts") == "forbidden"
    answer = shop.post("/shifts/close", {"password": CASHIER_PASSWORD, "count": {"lbp": 1}})
    assert set(answer) == {"reference"}
    text = json.dumps(seen)
    assert "expected" not in text and "1500000" not in text and "difference" not in text


def test_closing_ends_the_login_and_needs_the_password(shop):
    assert shop.fails("POST", "/auth/logout", {"password": "1234"}) == "close_shift_first"
    body = {"password": "wrong", "count": {}}
    assert shop.fails("POST", "/shifts/close", body) == "wrong_password"
    close(shop)
    assert shop.fails("GET", "/settings") == "session_ended"


def test_admin_password_closes_for_an_absent_cashier(shop):
    report = review(shop, close(shop, ADMIN_PASSWORD))
    assert report["closed_by_admin"] and report["cashier"] == "Sara"


def test_abandoned_shift(shop):
    assert (
        shop.fails(
            "POST",
            "/auth/login/cashier",
            {"user_id": cashier_id(shop, "Ahmad"), "password": "1234"},
        )
        == "shift_open_other"
    )
    shop.admin()
    current = shop.get("/shifts/current")
    assert current["open"] and not current["mine"] and current["cashier"] == "Sara"
    assert shop.fails("POST", "/orders", {"type": "takeaway"}) == "shift_needed"
    body = {"password": "wrong", "reason": "went home", "count": {"lbp": 1000000}}
    assert shop.fails("POST", "/shifts/close-abandoned", body) == "wrong_password"
    shop.post("/shifts/close-abandoned", body | {"password": ADMIN_PASSWORD})
    assert shop.get("/settings")
    assert shop.fails("POST", "/shifts/close-abandoned", body | {"password": ADMIN_PASSWORD}) == (
        "no_open_shift"
    )
    shop.cashier("Ahmad")
    shop.post("/shifts/open", {"count": {}})


def cashier_id(pos, name):
    return next(c["id"] for c in pos.get("/auth/cashiers") if c["name"] == name)


def test_same_cashier_resumes_an_open_shift(shop):
    shop.cashier()
    assert shop.get("/shifts/current")["mine"]
    assert shop.fails("POST", "/shifts/open", {"count": {}}) == "shift_already_open"


def test_admin_sells_with_an_own_shift(pos):
    pos.post("/shifts/open", {"count": {"lbp": 5}})
    pos.post("/orders", {"type": "takeaway"})
    assert pos.fails("POST", "/auth/logout", {"password": ADMIN_PASSWORD}) == "close_shift_first"
    close(pos, ADMIN_PASSWORD)


def set_mode(pos, **changes):
    settings = {k: v for k, v in pos.get("/settings").items() if k != "rate"}
    pos.put("/settings", settings | changes)


def test_there_is_no_lbp_note_above_100000(pos):
    set_mode(pos, count_mode="banknotes")
    pos.cashier()
    for note in ("1000000", "500000", "250000"):
        body = {"count": {"notes": {"usd": {}, "lbp": {note: 1}}}}
        assert pos.fails("POST", "/shifts/open", body) == "invalid_input"


def test_banknote_count_is_added_up_by_the_server(pos):
    set_mode(pos, count_mode="banknotes")
    pos.cashier()
    assert pos.fails("POST", "/shifts/open", {"count": {"lbp": 5}}) == "count_banknotes"
    notes = {"usd": {"20": 2, "1": 3}, "lbp": {"100000": 4, "5000": 1}}
    pos.post("/shifts/open", {"count": {"usd_cents": 999, "notes": notes}})
    bad = {"password": "1234", "count": {"notes": {"usd": {"7": 1}}}}
    assert pos.fails("POST", "/shifts/close", bad) == "invalid_input"
    bad["count"]["notes"] = {"usd": {"20": -1}}
    assert pos.fails("POST", "/shifts/close", bad) == "invalid_input"
    body = {"password": "1234", "count": {"notes": notes}}
    reference = pos.post("/shifts/close", body)["reference"]
    report = review(pos, reference)
    assert report["opening"] == {"usd_cents": 4300, "lbp": 405000}
    assert report["difference_lbp"] == 0 and report["notes"] == notes


def test_closing_only_uses_the_fixed_opening(pos):
    set_mode(pos, count_mode="closing_only", fixed_opening_usd=5000, fixed_opening_lbp=200000)
    pos.cashier()
    pos.post("/shifts/open", {"count": {"usd_cents": 1, "lbp": 1}})
    report = review(pos, close(pos, usd_cents=5000, lbp=200000))
    assert report["opening"] == {"usd_cents": 5000, "lbp": 200000}
    assert report["difference_usd_cents"] == 0


def test_changing_the_method_does_not_affect_an_open_shift(shop):
    shop.admin()
    set_mode(shop, count_mode="banknotes")
    shop.cashier()
    assert shop.get("/shifts/current")["count_mode"] == "totals"
    report = review(shop, close(shop, usd_cents=2000, lbp=1000000))
    assert report["difference_lbp"] == 0


def test_cashier_on_shift_cannot_be_disabled(shop):
    shop.admin()
    sara = next(c for c in shop.get("/cashiers") if c["username"] == "sara")
    body = {"display_name": "Sara", "active": False}
    assert shop.fails("PUT", f"/cashiers/{sara['id']}", body) == "user_has_open_shift"
