from sqlalchemy import text

from app.main import create_app
from tests.conftest import Pos
from tests.selling import confirm, delivery, items, pay, payment, promo, rows, save, table, takeaway
from tests.selling import with_promo as add_promo


def claim(pos, job):
    return pos.post(f"/print/jobs/{job}/claim")


def result(pos, job, ok=True):
    pos.post(f"/print/jobs/{job}/result", {"ok": ok, "error": "" if ok else "paper out"})


def test_one_payment_makes_one_receipt(shop):
    order = takeaway(shop, beef=1)
    body = payment(order, 0, 500000)
    first = shop.post(f"/orders/{order['id']}/payments", body)
    again = shop.post(f"/orders/{order['id']}/payments", body)
    assert first["print_job"] == again["print_job"]
    assert rows(shop, "SELECT count(*) FROM print_jobs") == [(1,)]
    paper = claim(shop, first["print_job"])
    assert (paper["copy"], paper["payload"]["status"]) == (False, "paid")
    assert shop.fails("POST", f"/print/jobs/{first['print_job']}/claim") == "already_printing"
    result(shop, first["print_job"])
    assert shop.fails("POST", f"/print/jobs/{first['print_job']}/claim") == "already_printing"
    assert shop.get("/print/problems") == []


def test_receipt_content(shop):
    promo(shop)
    order = delivery(shop, beef=1)
    line = items(shop, beef=1)[0] | {"note": "no sauce"}
    order = add_promo(shop, save(shop, order, [line]))
    paper = claim(shop, pay(shop, order, 1000, 0, 0, 360000)["print_job"])["payload"]
    assert paper["items"] == [{"name": "beef", "qty": 1, "note": "no sauce", "total": 500000}]
    assert paper["delivery"]["customer"] == "Ali" and paper["delivery_fee"] == 100000
    assert (paper["discount"], paper["total"], paper["code"] != "") == (60000, 540000, True)
    assert paper["received"] == {"usd_cents": 1000, "lbp": 0}
    assert paper["change"] == {"usd_cents": 0, "lbp": 360000}
    assert paper["rate"] == 89500 and paper["shop"]["phone"] == "76022164"


def test_failure_keeps_the_order_paid_and_retries_as_original(shop):
    job = pay(shop, takeaway(shop, beef=1), 0, 500000)["print_job"]
    claim(shop, job)
    result(shop, job, ok=False)
    assert rows(shop, "SELECT state FROM orders") == [("completed",)]
    assert [p["state"] for p in shop.get("/print/problems")] == ["failed"]
    assert claim(shop, job)["copy"] is False
    result(shop, job)


def test_reprint_is_a_copy(shop):
    order = pay(shop, takeaway(shop, beef=1), 0, 500000)
    code = rows(shop, "SELECT receipt_code FROM orders")[0][0]
    path = f"/print/orders/{order['id']}/reprint"
    assert shop.fails("POST", path, {}) == "not_found"
    assert shop.post(path, {"code": code})["job"] == order["print_job"]  # never printed yet
    claim(shop, order["print_job"])
    result(shop, order["print_job"])
    copy = shop.post(path, {"code": code})["job"]
    assert claim(shop, copy)["copy"] is True


def test_interrupted_print_asks(shop, settings):
    job = pay(shop, takeaway(shop, beef=1), 0, 500000)["print_job"]
    claim(shop, job)
    again = Pos(create_app(settings))
    again.cashier()
    assert [p["state"] for p in again.get("/print/problems")] == ["unknown"]
    again.post(f"/print/jobs/{job}/resolve", {"printed": False})
    assert claim(again, job)["copy"] is False
    result(again, job)
    again.close()


def test_skipping_paper(shop):
    job = pay(shop, takeaway(shop, beef=1), 0, 500000)["print_job"]
    claim(shop, job)
    result(shop, job, ok=False)
    shop.post(f"/print/jobs/{job}/dismiss")
    assert shop.get("/print/problems") == []


def test_unpaid_bill(shop):
    order = table(shop, 1, beef=1)
    path = f"/print/orders/{order['id']}/bill"
    assert shop.fails("POST", path) == "order_closed"
    order = confirm(shop, order)
    assert order["print_job"] is None
    assert claim(shop, shop.post(path)["job"])["payload"]["status"] == "unpaid"
    save(shop, order, items(shop, soda=1))
    assert shop.fails("POST", path) == "table_has_unsaved"


def test_delivery_prints_once_at_dispatch(shop):
    sent = confirm(shop, delivery(shop, beef=1))
    assert claim(shop, sent["print_job"])["payload"]["status"] == "unpaid"
    result(shop, sent["print_job"])
    assert pay(shop, sent, 0, 600000)["print_job"] is None


def test_partial_payment_prints_nothing_yet(shop):
    order = pay(shop, confirm(shop, table(shop, 1, beef=1)), 0, 100000)
    assert order["print_job"] is None
    assert pay(shop, order, 0, 400000)["print_job"]


def test_test_page_is_admin_only(shop):
    assert shop.fails("POST", "/print/test") == "forbidden"
    shop.admin()
    assert claim(shop, shop.post("/print/test")["job"])["kind"] == "test"


def test_printer_settings_cannot_hide_required_parts(pos):
    settings = {k: v for k, v in pos.get("/settings").items() if k != "rate"}
    for name in ("show_code", "show_status", "show_copy_mark"):
        body = settings | {"printer": settings["printer"] | {name: False}}
        assert pos.fails("PUT", "/settings", body) == "invalid_input"
    assert settings["printer"]["copies"] == 1
    for bad in ({"copies": 0}, {"copies": 9}, {"paper": 70}, {"logo_percent": 500}):
        body = settings | {"printer": settings["printer"] | bad}
        assert pos.fails("PUT", "/settings", body) == "invalid_input"
    pos.put("/settings", settings | {"printer": settings["printer"] | {"paper": 58}})
    assert pos.get("/settings")["printer"]["paper"] == 58


def test_migration_keeps_payload_json(shop):
    pay(shop, takeaway(shop, beef=1), 0, 500000)
    with shop.db.transaction() as db:
        assert db.scalar(text("SELECT json_valid(payload) FROM print_jobs")) == 1
