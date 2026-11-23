import threading
from datetime import timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.core import clock
from app.main import create_app
from app.modules.orders import service as orders
from tests.conftest import ADMIN_PASSWORD, NOON, Pos
from tests.selling import (
    REASON,
    confirm,
    items,
    key,
    pay,
    pay_fails,
    payment,
    promo,
    rows,
    save,
    table,
    takeaway,
    with_promo,
)


def approval(**more):
    return {"approval": REASON | more}


def test_selling_needs_an_open_shift(pos):
    pos.cashier()
    assert pos.fails("POST", "/orders", {"type": "takeaway"}) == "shift_needed"


def test_server_decides_prices_and_totals(shop):
    order = takeaway(shop, beef=2, meal=1, soda=2)
    assert (order["total"], order["due"], order["total_usd_cents"]) == (1650000, 1650000, 1844)
    assert order["number"] is None


@pytest.mark.parametrize(
    "usd,lbp,change_usd,change_lbp",
    [
        (0, 1650000, 0, 0),
        (1844, 0, 0, 0),
        (1000, 1000000, 200, 70000),
        (1000, 1000000, 0, 250000),
        (1000, 755000, 0, 0),
        (2000, 0, 100, 50000),
        (5000, 0, 3100, 50000),
    ],
)
def test_paying_in_any_mix(shop, usd, lbp, change_usd, change_lbp):
    order = pay(shop, takeaway(shop, beef=2, meal=1, soda=2), usd, lbp, change_usd, change_lbp)
    assert (order["state"], order["due"], order["number"]) == ("completed", 0, 1)


@pytest.mark.parametrize(
    "args,code",
    [
        ((1000, 1000000, 200, 60000), "change_wrong"),
        ((1000, 1000000, 0, 0), "change_wrong"),
        ((1000, 1000000, 300, 0), "change_too_much"),
        ((0, 1000000, 100, 0), "change_too_much"),
        ((0, 1000000), "not_enough"),
        ((0, 0), "nothing_received"),
    ],
)
def test_wrong_payments_are_refused_and_leave_nothing(shop, args, code):
    order = takeaway(shop, beef=2, meal=1, soda=2)
    assert pay_fails(shop, order, *args) == code
    assert shop.get(f"/orders/{order['id']}") == order
    assert rows(shop, "SELECT * FROM payments") == []


def test_worked_example_from_the_architecture(shop):
    promo(shop)
    order = with_promo(shop, takeaway(shop, odd=1))
    assert (order["discount"], order["rounding"], order["total"]) == (45500, 500, 410000)
    assert order["total_usd_cents"] == 459
    body = {"usd_cents": 500}
    quote = shop.post(f"/orders/{order['id']}/quote", body)
    assert (quote["overpaid"], quote["change_lbp"], quote["change_rounding"]) == (
        37500,
        40000,
        -2500,
    )
    pay(shop, order, 500, 0, 0, 40000)
    assert rows(shop, "SELECT applied_lbp, change_rounding FROM payments") == [(410000, -2500)]


def test_small_balance_settles_and_is_recorded(shop):
    promo(shop)
    order = with_promo(shop, takeaway(shop, odd=1))
    quote = shop.post(f"/orders/{order['id']}/quote", {"usd_cents": 400, "lbp": 50000})
    assert quote["settled"] and quote["shortfall"] == 2000
    order = pay(shop, order, 400, 50000)
    assert order["state"] == "completed"
    assert rows(shop, "SELECT applied_lbp, shortfall FROM payments") == [(408000, 2000)]


def test_small_first_payment_does_not_settle(shop):
    order = confirm(shop, table(shop, 1, beef=1))
    order = pay(shop, order, 0, 1000)
    assert (order["payment_state"], order["due"]) == ("partial", 499000)


def test_quote_suggests_whole_dollars(shop):
    order = takeaway(shop, beef=2, meal=1, soda=2)
    quote = shop.post(f"/orders/{order['id']}/quote", {"usd_cents": 1000, "lbp": 1000000})
    assert (quote["overpaid"], quote["most_usd_cents"], quote["change_lbp"]) == (
        245000,
        200,
        250000,
    )
    body = {"usd_cents": 1000, "lbp": 1000000, "change_usd_cents": 200}
    assert shop.post(f"/orders/{order['id']}/quote", body)["change_lbp"] == 70000
    quote = shop.post(f"/orders/{order['id']}/quote", {"lbp": 650000})
    assert (quote["left"], quote["settled"], quote["partial_allowed"]) == (1000000, False, False)


def test_rate_change_between_payments(shop):
    order = pay(shop, confirm(shop, table(shop, 1, beef=2)), 500)
    shop.post("/auth/quick-admin", {"password": ADMIN_PASSWORD})
    shop.put("/settings/rate", {"rate": 100000})
    order = shop.get(f"/orders/{order['id']}")
    assert order["due"] == 1000000 - 447500
    order = pay(shop, order, 500, 52500)
    assert order["state"] == "completed"
    assert rows(shop, "SELECT rate, applied_lbp FROM payments ORDER BY rate") == [
        (89500, 447500),
        (100000, 552500),
    ]


def test_same_key_pays_once(shop):
    order = takeaway(shop, beef=1)
    body = payment(order, 0, 500000)
    path = f"/orders/{order['id']}/payments"
    first, second = shop.post(path, body), shop.post(path, body)
    assert first == second
    assert len(rows(shop, "SELECT * FROM payments")) == 1
    assert shop.fails("POST", path, body | {"lbp": 600000}) == "payment_key_reused"
    other = takeaway(shop, beef=1)
    path = f"/orders/{other['id']}/payments"
    assert shop.fails("POST", path, body) == "payment_key_reused"


def test_two_simultaneous_payments_pay_once(shop):
    order = takeaway(shop, beef=1)
    body, results = payment(order, 0, 500000), []

    def go():
        r = shop.client.post(
            f"/api/orders/{order['id']}/payments",
            json=body,
            headers={"Authorization": f"Bearer {shop.token}"},
        )
        results.append(r.status_code)

    threads = [threading.Thread(target=go) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results == [200] * 4
    assert len(rows(shop, "SELECT * FROM payments")) == 1


def test_a_second_different_payment_is_refused(shop):
    order = takeaway(shop, beef=1)
    pay(shop, order, 0, 500000)
    assert pay_fails(shop, order, 0, 500000) == "order_changed"


def test_failure_before_commit_leaves_nothing(shop, monkeypatch):
    promo(shop)
    order = with_promo(shop, takeaway(shop, beef=1))

    def crash(*_):
        raise RuntimeError("power cut")

    with monkeypatch.context() as patch:
        patch.setattr(orders, "complete", crash)
        r = shop.client.post(
            f"/api/orders/{order['id']}/payments",
            json=payment(order, 0, 450000),
            headers={"Authorization": f"Bearer {shop.token}"},
        )
        assert r.status_code == 500
    assert shop.get(f"/orders/{order['id']}") == order
    for name in ("payments", "payment_lines", "promo_redemptions"):
        assert rows(shop, f"SELECT * FROM {name}") == []


def test_draft_survives_a_crash(shop, settings):
    order = takeaway(shop, beef=3)
    shop.app.state.db.engine.dispose()  # no shutdown hooks: the process is simply gone
    again = Pos(create_app(settings))
    again.cashier()
    assert [d["id"] for d in again.get("/orders/drafts")] == [order["id"]]
    found = again.get(f"/orders/{order['id']}")
    assert found["total"] == 1500000
    pay(again, found, 0, 1500000)
    again.close()


@pytest.mark.parametrize(
    "more,code",
    [
        ({"active": False}, "promo_inactive"),
        ({"starts_on": "2026-11-24"}, "promo_not_started"),
        ({"ends_on": "2026-11-22"}, "promo_expired"),
    ],
)
def test_ineligible_promos(shop, more, code):
    promo(shop, **more)
    order = takeaway(shop, beef=1)
    body = {"version": order["version"], "code": "GYROS10"}
    assert shop.fails("PUT", f"/orders/{order['id']}/promo", body) == code
    body["code"] = "NOPE"
    assert shop.fails("PUT", f"/orders/{order['id']}/promo", body) == "promo_unknown"


def test_promo_dates_are_inclusive(shop):
    promo(shop, starts_on="2026-11-23", ends_on="2026-11-23")
    assert with_promo(shop, takeaway(shop, beef=1))["total"] == 450000


def test_last_promo_use_goes_to_one_order(shop):
    promo(shop, usage_limit=1)
    a, b = (with_promo(shop, takeaway(shop, beef=1)) for _ in range(2))
    pay(shop, a, 0, 450000)
    assert pay_fails(shop, b, 0, 450000) == "promo_used_up"
    body = {"version": b["version"], "code": ""}
    b = shop.put(f"/orders/{b['id']}/promo", body)
    pay(shop, b, 0, 500000)


def test_promo_deactivated_or_changed_before_payment(shop):
    promo(shop)
    order = with_promo(shop, takeaway(shop, beef=1))
    promo(shop, active=False)
    assert pay_fails(shop, order, 0, 450000) == "promo_inactive"
    promo(shop, percent=20)
    assert pay_fails(shop, order, 0, 450000) == "promo_changed"


def test_promo_counts_once_for_several_payments(shop):
    promo(shop, usage_limit=1)
    order = with_promo(shop, confirm(shop, table(shop, 1, beef=1)))
    order = pay(shop, order, 0, 200000)
    body = {"version": order["version"], "code": ""}
    assert shop.fails("PUT", f"/orders/{order['id']}/promo", body) == "promo_locked"
    assert pay(shop, order, 0, 250000)["state"] == "completed"


def test_free_order_completes_without_cash(shop):
    promo(shop, percent=100)
    order = with_promo(shop, takeaway(shop, beef=1))
    assert order["total"] == 0
    assert pay(shop, order)["state"] == "completed"
    assert rows(shop, "SELECT * FROM payment_lines") == []


def test_unavailable_or_repriced_product_is_caught(shop):
    order = takeaway(shop, beef=1)
    shop.post("/auth/quick-admin", {"password": ADMIN_PASSWORD})
    shop.put(f"/menu/products/{shop.p['beef']}/available", {"available": False})
    assert pay_fails(shop, order, 0, 500000) == "product_unavailable"
    shop.put(f"/menu/products/{shop.p['beef']}/available", {"available": True})
    from app.modules.menu.models import Product

    with shop.db.transaction() as db:
        db.get(Product, shop.p["beef"]).price_lbp = 550000
    assert pay_fails(shop, order, 0, 500000) == "total_changed"
    order = save(shop, order, items(shop, beef=1))
    assert pay(shop, order, 0, 550000)["total"] == 550000


def test_past_orders_keep_their_prices(shop):
    order = pay(shop, takeaway(shop, beef=1), 0, 500000)
    from app.modules.menu.models import Product

    with shop.db.transaction() as db:
        db.get(Product, shop.p["beef"]).price_lbp = 1
    assert rows(shop, f"SELECT price FROM order_items WHERE order_id='{order['id']}'") == [
        (500000,)
    ]


def test_drafts_cancel_freely_saved_orders_need_approval(shop):
    draft = takeaway(shop, beef=1)
    body = {"version": draft["version"]}
    assert shop.post(f"/orders/{draft['id']}/cancel", body)["state"] == "cancelled"
    order = confirm(shop, table(shop, 1, beef=1))
    path, body = f"/orders/{order['id']}/cancel", {"version": order["version"]}
    assert shop.fails("POST", path, body) == "approval_needed"
    assert shop.fails("POST", path, body | approval(password="x")) == "wrong_password"
    assert shop.fails("POST", path, body | approval(password="")) == "approval_needed"
    assert shop.post(path, body | approval())["state"] == "cancelled"
    assert rows(
        shop,
        "SELECT count(*) FROM audit_log WHERE action='order_cancelled' AND approver_id<>actor_id",
    ) == [(1,)]


def test_approval_does_not_carry_over(shop):
    a = confirm(shop, table(shop, 1, beef=1))
    b = confirm(shop, table(shop, 2, beef=1))
    shop.post(f"/orders/{a['id']}/cancel", {"version": a["version"]} | approval())
    path = f"/orders/{b['id']}/cancel"
    assert shop.fails("POST", path, {"version": b["version"]}) == "approval_needed"
    assert shop.fails("GET", "/orders") == "forbidden"


def test_voiding_saved_items(shop):
    order = confirm(shop, table(shop, 1, beef=1, soda=2))
    soda = next(i for i in order["items"] if i["name"] == "soda")
    path = f"/orders/{order['id']}/items/{soda['id']}/void"
    body = {"version": order["version"], "qty": 1}
    assert shop.fails("POST", path, body | approval(password="")) == "approval_needed"
    order = shop.post(path, body | approval())
    assert order["total"] == 600000
    assert [i["qty"] for i in order["items"] if i["state"] == "voided"] == [1]
    order = pay(shop, order, 0, 550000)
    body = {"version": order["version"], "qty": 1}
    assert shop.fails("POST", path, body | approval()) == "below_paid"
    order = shop.post("/tables/2/order")
    order = confirm(shop, save(shop, order, items(shop, beef=1)))
    path = f"/orders/{order['id']}/items/{order['items'][0]['id']}/void"
    body = {"version": order["version"], "qty": 1}
    assert shop.fails("POST", path, body | approval()) == "cancel_instead"


def test_void_down_to_the_paid_amount_completes(shop):
    order = pay(shop, confirm(shop, table(shop, 1, beef=1, soda=1)), 0, 500000)
    soda = next(i for i in order["items"] if i["name"] == "soda")
    body = {"version": order["version"], "qty": 1} | approval()
    order = shop.post(f"/orders/{order['id']}/items/{soda['id']}/void", body)
    assert order["state"] == "completed"


def code_of(shop, order):
    return rows(shop, f"SELECT receipt_code FROM orders WHERE id='{order['id']}'")[0][0]


def test_refund(shop):
    order = pay(shop, takeaway(shop, beef=2, meal=1, soda=2), 1000, 1000000, 200, 70000)
    path, code = f"/orders/{order['id']}", code_of(shop, order)
    assert shop.fails("POST", f"{path}/refund-quote", {}) == "not_found"
    quote = shop.post(f"{path}/refund-quote", {"code": code, "usd_cents": 1000})
    assert (quote["amount"], quote["lbp"]) == (1650000, 760000)
    body = {"idempotency_key": key(), "code": code, "usd_cents": 1000, "lbp": 760000}
    assert shop.fails("POST", f"{path}/refund", body | approval(password="")) == "approval_needed"
    wrong = body | {"lbp": 1} | approval()
    assert shop.fails("POST", f"{path}/refund", wrong) == "change_wrong"
    done = shop.post(f"{path}/refund", body | approval())
    assert done["state"] == "refunded"
    assert shop.post(f"{path}/refund", body | approval(password="")) == done
    again = body | {"idempotency_key": key()} | approval()
    assert shop.fails("POST", f"{path}/refund", again) == "nothing_to_refund"
    assert rows(shop, "SELECT count(*) FROM payments WHERE kind='refund'") == [(1,)]
    assert rows(shop, "SELECT count(*) FROM orders") == [(1,)]


def test_partly_paid_order_is_refunded_not_cancelled(shop):
    order = pay(shop, confirm(shop, table(shop, 1, beef=1)), 0, 200000)
    body = {"version": order["version"]} | approval()
    assert shop.fails("POST", f"/orders/{order['id']}/cancel", body) == "refund_instead"
    body = {"idempotency_key": key(), "lbp": 200000} | approval()
    assert shop.post(f"/orders/{order['id']}/refund", body)["state"] == "refunded"


def test_lookup_needs_number_and_code(shop):
    order = pay(shop, takeaway(shop, beef=1), 0, 500000)
    code = code_of(shop, order)
    assert "receipt_code" not in order
    assert shop.fails("GET", f"/orders/{order['id']}") == "not_found"
    found = shop.post("/orders/lookup", {"number": 1, "code": code.lower()})
    assert found["id"] == order["id"]
    for _ in range(3):
        assert shop.fails("POST", "/orders/lookup", {"number": 1, "code": "AAAAA"}) == "not_found"
    body = {"number": 1, "code": code}
    assert shop.fails("POST", "/orders/lookup", body) == "too_many_attempts"


def test_lookup_is_for_the_current_shift_only(shop):
    order = pay(shop, takeaway(shop, beef=1), 0, 500000)
    body = {"number": 1, "code": code_of(shop, order)}
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    shop.cashier("Ahmad")
    shop.post("/shifts/open", {"count": {}})
    assert shop.fails("POST", "/orders/lookup", body) == "not_found"
    shop.admin()
    assert shop.post("/orders/lookup", body)["id"] == order["id"]


def test_numbers_restart_after_the_cutoff(shop):
    local = NOON.replace(hour=3, minute=59)  # cutoff is 4:00

    def number_at(moment):
        clock.freeze(moment)
        return pay(shop, takeaway(shop, soda=1), 0, 100000)["number"]

    assert [number_at(local), number_at(local)] == [1, 2]
    assert number_at(local + timedelta(minutes=1)) == 1
    assert number_at(local) == 3  # the clock was moved back
    assert rows(shop, "SELECT DISTINCT business_date FROM orders ORDER BY 1") == [
        ("2026-11-22",),
        ("2026-11-23",),
    ]


def test_stale_screen_cannot_overwrite(shop):
    old = takeaway(shop, beef=1)
    save(shop, old, items(shop, beef=2))
    body = {"version": old["version"], "type": "takeaway", "items": []}
    assert shop.fails("PUT", f"/orders/{old['id']}", body) == "order_changed"


@pytest.mark.parametrize("qty", [0, -1, 1000, 1.5])
def test_bad_quantities(shop, qty):
    order = shop.post("/orders", {"type": "takeaway"})
    line = {"product_id": shop.p["beef"], "qty": qty}
    body = {"version": 1, "type": "takeaway", "items": [line]}
    assert shop.fails("PUT", f"/orders/{order['id']}", body) == "invalid_input"


def test_empty_order_cannot_be_paid(shop):
    order = shop.post("/orders", {"type": "takeaway"})
    assert pay_fails(shop, order) == "order_empty"


def test_takeaway_cannot_skip_payment(shop):
    order = takeaway(shop, beef=1)
    body = {"version": order["version"], "expected_total": order["total"]}
    assert shop.fails("POST", f"/orders/{order['id']}/confirm", body) == "payment_required"


@pytest.mark.parametrize(
    "name", ["payments", "payment_lines", "shift_closings", "promo_redemptions"]
)
def test_money_records_are_append_only(shop, name):
    promo(shop)
    pay(shop, with_promo(shop, takeaway(shop, beef=1)), 0, 450000)
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    for sql in (f"UPDATE {name} SET id='x'", f"DELETE FROM {name}"):
        with pytest.raises(IntegrityError):
            rows(shop, sql)
