import pytest

from tests.selling import (
    REASON,
    WHO,
    confirm,
    delivery,
    items,
    pay,
    promo,
    rows,
    save,
    table,
    with_promo,
)


def state(shop, no):
    return next(t for t in shop.get("/tables") if t["table_no"] == no)


def close(shop, no, ok=True, **body):
    path = f"/tables/{no}/close"
    return shop.post(path, body) if ok else shop.fails("POST", path, body)


def test_sitting_lifecycle(shop):
    assert [t["state"] for t in shop.get("/tables")] == ["free"] * 5
    order = table(shop, 2, beef=1)
    assert state(shop, 2)["state"] == "draft"
    order = confirm(shop, order)
    assert (state(shop, 2)["state"], state(shop, 2)["due"]) == ("open", 500000)
    more = save(shop, shop.post("/tables/2/order"), items(shop, soda=1))
    assert more["id"] == order["id"] and more["total"] == 600000
    paid = pay(shop, confirm(shop, more), 0, 600000)
    assert paid["state"] == "completed" and state(shop, 2)["state"] == "paid"

    second = confirm(shop, table(shop, 2, soda=1))
    assert second["id"] != paid["id"] and second["total"] == 100000
    body = {"version": paid["version"], "type": "dine_in", "items": []}
    assert shop.fails("PUT", f"/orders/{paid['id']}", body) == "order_closed"
    pay(shop, second, 0, 100000)
    close(shop, 2)
    assert state(shop, 2)["state"] == "free"
    assert close(shop, 2, ok=False) == "table_not_open"
    assert rows(shop, "SELECT count(*) FROM orders WHERE sitting_id IS NOT NULL") == [(2,)]


def test_paying_saves_new_items_first(shop):
    order = confirm(shop, table(shop, 1, beef=1))
    order = save(shop, order, items(shop, soda=1))
    assert pay(shop, order, 0, 600000)["state"] == "completed"


def test_saved_items_cannot_be_edited_away(shop):
    order = confirm(shop, table(shop, 1, beef=1))
    order = save(shop, order, [])
    assert order["total"] == 500000 and order["items"][0]["state"] == "confirmed"


def test_closing_with_money_owed(shop):
    order = confirm(shop, table(shop, 1, beef=1))
    assert close(shop, 1, ok=False) == "table_owes"
    bad = {"reason": "left", "password": "nope"}
    assert close(shop, 1, ok=False, approval=bad) == "wrong_password"
    close(shop, 1, approval=REASON)
    assert state(shop, 1)["state"] == "free"
    assert shop.get(f"/orders/{order['id']}")["due"] == 500000  # the debt stays on record
    assert shop.post("/tables/1/order")["id"] != order["id"]


def test_closing_with_unsaved_items(shop):
    order = confirm(shop, table(shop, 1, beef=1))
    save(shop, order, items(shop, soda=1))
    assert close(shop, 1, ok=False, approval=REASON) == "table_has_unsaved"


def test_table_count_persists_and_protects_open_tables(shop):
    confirm(shop, table(shop, 4, beef=1))
    token = shop.token
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    shop.admin()
    settings = {k: v for k, v in shop.get("/settings").items() if k != "rate"}
    body = settings | {"table_count": 3}
    assert shop.fails("PUT", "/settings", body) == "table_in_use"
    shop.put("/settings", settings | {"table_count": 4})
    assert shop.get("/settings")["table_count"] == 4
    assert token


def test_unknown_table(shop):
    assert shop.fails("POST", "/tables/6/order") == "not_found"
    assert shop.fails("POST", "/tables/0/order") == "not_found"


def test_delivery_fee_default_and_override(shop):
    order = delivery(shop, beef=1)
    assert (order["delivery_fee"], order["total"]) == (100000, 600000)
    order = save(shop, order, items(shop, beef=1), delivery_fee=50000)
    assert order["total"] == 550000
    assert shop.get("/settings")["default_delivery_fee"] == 100000
    assert order["delivery"] == WHO | {"requested_time": "", "promised_time": ""}


@pytest.mark.parametrize("missing", ["customer", "phone", "address", "driver"])
def test_delivery_details_are_required_at_dispatch(shop, missing):
    order = delivery(shop, WHO | {missing: "  "}, beef=1)
    body = {"version": order["version"], "expected_total": order["total"]}
    assert shop.fails("POST", f"/orders/{order['id']}/confirm", body) == "delivery_incomplete"


def test_switching_type_adds_and_removes_the_fee(shop):
    order = delivery(shop, beef=1)
    body = {"version": order["version"], "type": "takeaway", "items": items(shop, beef=1)}
    order = shop.put(f"/orders/{order['id']}", body)
    assert order["total"] == 500000
    body = {"version": order["version"], "type": "delivery", "items": items(shop, beef=1)}
    assert shop.put(f"/orders/{order['id']}", body)["total"] == 600000


def test_promo_covers_the_delivery_fee(shop):
    promo(shop)
    order = with_promo(shop, delivery(shop, meal=1, beef=1))
    assert (order["discount"], order["total"]) == (105000, 950000)


def test_unpaid_delivery_passes_to_the_next_shift(shop):
    order = confirm(shop, delivery(shop, beef=1))
    assert [o["due"] for o in shop.get("/orders/unpaid-deliveries")] == [600000]
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    shop.cashier("Ahmad")
    shop.post("/shifts/open", {"count": {}})
    order = shop.get("/orders/unpaid-deliveries")[0]
    pay(shop, order, 0, 600000)
    assert shop.get("/orders/unpaid-deliveries") == []
    assert rows(
        shop,
        "SELECT u.display_name FROM payments p JOIN shifts s ON s.id = p.shift_id"
        " JOIN users u ON u.id = s.user_id",
    ) == [("Ahmad",)]


def test_prepaid_delivery_and_driver_suggestions(shop):
    order = pay(shop, delivery(shop, beef=1), 0, 600000)
    assert order["state"] == "completed"
    assert shop.get("/orders/drivers") == ["Mo"]
