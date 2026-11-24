"""Paid by Wish: only recorded, never processed, and never counted as cash in the drawer."""

import io

import pytest
from openpyxl import load_workbook
from sqlalchemy.exc import IntegrityError

from app.core.database import Database
from tests.selling import (
    REASON,
    confirm,
    delivery,
    key,
    pay,
    pay_wish,
    payment,
    promo,
    rows,
    table,
    takeaway,
    with_promo,
)


def code_of(pos, order):
    return rows(pos, f"SELECT receipt_code FROM orders WHERE id='{order['id']}'")[0][0]


def expected_cash(pos):
    token = pos.token
    pos.admin()
    shift = pos.get("/shifts")[0]
    report = pos.get(f"/shifts/{shift['id']}")
    pos.token = token
    return report["expected"], report["wish"]


def test_a_wish_payment_completes_the_order_and_adds_no_cash(shop):
    before, _ = expected_cash(shop)
    shop.cashier()
    order = pay_wish(shop, takeaway(shop, beef=2, soda=1))
    assert (order["state"], order["payment_state"], order["due"]) == ("completed", "paid", 0)
    assert (order["total"], order["paid"], order["paid_wish"]) == (1100000, 1100000, 1100000)
    assert rows(shop, "SELECT method, applied_lbp, shortfall FROM payments") == [
        ("wish", 1100000, 0)
    ]
    assert rows(shop, "SELECT count(*) FROM payment_lines") == [(0,)]
    after, wish = expected_cash(shop)
    assert after == before and wish == 1100000  # Admin sees it, the drawer does not


def test_a_cash_payment_is_unchanged(shop):
    order = pay(shop, takeaway(shop, beef=1), 0, 500000)
    assert order["paid_wish"] == 0
    assert rows(shop, "SELECT method FROM payments") == [("cash",)]


@pytest.mark.parametrize(
    "extra", [{"usd_cents": 100}, {"lbp": 5}, {"change_usd_cents": 100}, {"change_lbp": 10000}]
)
def test_a_wish_payment_carries_no_cash_amounts(shop, extra):
    order = takeaway(shop, beef=1)
    body = payment(order) | {"method": "wish"} | extra
    assert shop.fails("POST", f"/orders/{order['id']}/payments", body) == "invalid_input"
    assert rows(shop, "SELECT count(*) FROM payments") == [(0,)]


def test_only_known_methods_are_accepted(shop):
    order = takeaway(shop, beef=1)
    body = payment(order) | {"method": "bitcoin"}
    assert shop.fails("POST", f"/orders/{order['id']}/payments", body) == "invalid_input"


def test_retrying_a_wish_payment_records_it_once(shop):
    order = takeaway(shop, beef=1)
    body = payment(order) | {"method": "wish"}
    path = f"/orders/{order['id']}/payments"
    assert shop.post(path, body) == shop.post(path, body)
    assert rows(shop, "SELECT count(*) FROM payments") == [(1,)]
    # the same key may not be reused for a different way of paying
    assert shop.fails("POST", path, body | {"method": "cash", "lbp": 500000}) == (
        "payment_key_reused"
    )


def test_the_same_order_cannot_be_paid_by_wish_twice(shop):
    order = takeaway(shop, beef=1)
    pay_wish(shop, order)
    assert (
        shop.fails("POST", f"/orders/{order['id']}/payments", payment(order) | {"method": "wish"})
        == "order_changed"
    )


def test_nothing_to_pay_for_a_free_order(shop):
    promo(shop, percent=100)
    order = with_promo(shop, takeaway(shop, beef=1))
    body = payment(order) | {"method": "wish"}
    assert shop.fails("POST", f"/orders/{order['id']}/payments", body) == "nothing_to_pay"


def test_part_cash_then_the_rest_by_wish(shop):
    order = confirm(shop, table(shop, 1, beef=2))
    order = pay(shop, order, 0, 300000)
    assert order["payment_state"] == "partial"
    order = pay_wish(shop, order)
    assert (order["state"], order["paid"], order["paid_wish"]) == ("completed", 1000000, 700000)
    assert rows(shop, "SELECT method, applied_lbp FROM payments ORDER BY paid_at, method") == [
        ("cash", 300000),
        ("wish", 700000),
    ]


def test_a_promo_is_counted_once_when_paid_by_wish(shop):
    promo(shop, usage_limit=1)
    a, b = (with_promo(shop, takeaway(shop, beef=1)) for _ in range(2))
    pay_wish(shop, a)
    assert shop.fails("POST", f"/orders/{b['id']}/payments", payment(b) | {"method": "wish"}) == (
        "promo_used_up"
    )


def test_delivery_prepaid_by_wish(shop):
    order = pay_wish(shop, delivery(shop, beef=1))
    assert (order["state"], order["paid_wish"]) == ("completed", 600000)


def test_a_failure_halfway_leaves_nothing_recorded(shop, monkeypatch):
    from app.modules.orders import service as orders

    order = takeaway(shop, beef=1)

    def crash(*_):
        raise RuntimeError("power cut")

    with monkeypatch.context() as patch:
        patch.setattr(orders, "complete", crash)
        r = shop.client.post(
            f"/api/orders/{order['id']}/payments",
            json=payment(order) | {"method": "wish"},
            headers={"Authorization": f"Bearer {shop.token}"},
        )
        assert r.status_code == 500
    assert rows(shop, "SELECT count(*) FROM payments") == [(0,)]
    assert shop.get(f"/orders/{order['id']}") == order


# --- refunds ---------------------------------------------------------------------------------


def refund(pos, order, **more):
    path, code = f"/orders/{order['id']}", code_of(pos, order)
    body = {"idempotency_key": key(), "code": code, "lbp": 0, "approval": REASON} | more
    return pos.post(f"{path}/refund", body)


def test_refunding_a_wish_order_gives_no_cash_back(shop):
    order = pay_wish(shop, takeaway(shop, beef=1))
    code = code_of(shop, order)
    quote = shop.post(f"/orders/{order['id']}/refund-quote", {"code": code})
    assert (quote["amount"], quote["wish"], quote["lbp"], quote["usd_cents"]) == (0, 500000, 0, 0)
    done = refund(shop, order)
    assert done["state"] == "refunded"
    assert rows(shop, "SELECT kind, method, applied_lbp FROM payments ORDER BY paid_at, kind") == [
        ("payment", "wish", 500000),
        ("refund", "wish", 500000),
    ]
    assert rows(shop, "SELECT count(*) FROM payment_lines") == [(0,)]
    after, wish = expected_cash(shop)
    assert wish == 0  # paid and refunded


def test_refunding_a_wish_order_refuses_cash_amounts(shop):
    order = pay_wish(shop, takeaway(shop, beef=1))
    body = {
        "idempotency_key": key(),
        "code": code_of(shop, order),
        "usd_cents": 100,
        "lbp": 0,
        "approval": REASON,
    }
    assert shop.fails("POST", f"/orders/{order['id']}/refund", body) == "change_too_much"


def test_refunding_a_mixed_order_returns_only_the_cash_part_from_the_drawer(shop):
    order = confirm(shop, table(shop, 1, beef=2))
    order = pay_wish(shop, pay(shop, order, 0, 300000))
    quote = shop.post(f"/orders/{order['id']}/refund-quote", {"code": code_of(shop, order)})
    assert (quote["amount"], quote["wish"]) == (300000, 700000)
    refund(shop, order, lbp=300000)
    assert rows(
        shop, "SELECT method, kind, applied_lbp FROM payments WHERE kind='refund' ORDER BY method"
    ) == [("cash", "refund", 300000), ("wish", "refund", 700000)]
    assert rows(shop, "SELECT direction, amount FROM payment_lines WHERE direction='out'") == [
        ("out", 300000)
    ]


def test_refund_retry_records_it_once(shop):
    order = pay_wish(shop, takeaway(shop, beef=1))
    body = {
        "idempotency_key": key(),
        "code": code_of(shop, order),
        "lbp": 0,
        "approval": REASON,
    }
    path = f"/orders/{order['id']}/refund"
    assert shop.post(path, body) == shop.post(path, body | {"approval": REASON | {"password": ""}})
    assert rows(shop, "SELECT count(*) FROM payments WHERE kind='refund'") == [(1,)]


# --- reports, receipts, permissions -------------------------------------------------------------


def test_reports_show_wish_apart_from_cash(shop):
    pay(shop, takeaway(shop, beef=1), 0, 500000)
    pay_wish(shop, takeaway(shop, meal=1))
    gone = pay_wish(shop, takeaway(shop, soda=1))
    refund(shop, gone)
    shop.admin()
    report = shop.get("/reports/sales?period=day")
    assert report["wish"] == 450000  # paid minus refunded
    assert report["cash"] == {"usd_cents": 0, "lbp": 500000}  # the one cash sale, no Wish
    assert report["sales"] == 500000 + 450000
    book = load_workbook(io.BytesIO(shop.get("/reports/sales/export?period=day")))
    cells = [c.value for row in book["Summary"].iter_rows() for c in row]
    assert "Paid by Wish LBP" in cells and 450000 in cells


def test_the_orders_list_says_which_were_paid_by_wish(shop):
    pay_wish(shop, takeaway(shop, beef=1))
    pay(shop, takeaway(shop, soda=1), 0, 100000)
    shop.admin()
    assert sorted(o["paid_wish"] for o in shop.get("/orders")) == [0, 500000]


def test_the_receipt_says_it_was_paid_by_wish(shop):
    order = pay_wish(shop, takeaway(shop, beef=1))
    paper = shop.post(f"/print/jobs/{order['print_job']}/claim")["payload"]
    assert paper["wish"] == 500000
    assert paper["received"] == {"usd_cents": 0, "lbp": 0}
    assert paper["change"] == {"usd_cents": 0, "lbp": 0}
    cash = pay(shop, takeaway(shop, soda=1), 0, 100000)
    assert shop.post(f"/print/jobs/{cash['print_job']}/claim")["payload"]["wish"] == 0


def test_a_cashier_cannot_read_wish_totals(shop):
    pay_wish(shop, takeaway(shop, beef=1))
    for path in ("/reports/sales", "/shifts", "/orders"):
        assert shop.fails("GET", path) == "forbidden"
    current = shop.get("/shifts/current")
    assert "wish" not in str(current)


def test_a_wish_payment_belongs_to_the_shift_that_took_it(shop):
    pay_wish(shop, takeaway(shop, beef=1))
    assert rows(shop, "SELECT p.shift_id = s.id FROM payments p, shifts s") == [(1,)]


def test_the_database_only_allows_known_methods(shop):
    from sqlalchemy import text

    pay_wish(shop, takeaway(shop, beef=1))
    with pytest.raises(IntegrityError), shop.db.transaction() as db:
        db.execute(text("UPDATE payments SET method = 'x'"))  # history cannot be rewritten


def test_old_payments_become_cash_when_the_database_is_updated(tmp_path):
    """Version 1.1 databases have no method column: every earlier payment was cash."""
    import sqlite3

    database = Database(tmp_path / "old.db")
    database.migrate("0005")
    insert = (
        "INSERT INTO payments (id, order_id, kind, idempotency_key, request_hash, rate,"
        " applied_lbp, change_rounding, shortfall, user_id, shift_id, paid_at, business_date{c})"
        " VALUES ('{i}', 'o', 'payment', '{i}', 'h', 89500, 100, 0, 0, 'u', 's', 'd', 'd'{v})"
    )
    raw = sqlite3.connect(database.path)
    raw.execute(insert.format(c="", v="", i="old"))  # foreign keys are off on a plain connection
    raw.commit()
    raw.close()
    database.migrate()
    raw = sqlite3.connect(database.path)
    assert raw.execute("SELECT method FROM payments").fetchall() == [("cash",)]
    with pytest.raises(sqlite3.IntegrityError):
        raw.execute(insert.format(c=", method", v=", 'x'", i="bad"))
    raw.close()
    database.migrate("0005")
    database.migrate()
