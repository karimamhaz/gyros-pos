import io
from datetime import timedelta

import pytest
from openpyxl import load_workbook

from app.core import clock
from tests.conftest import ADMIN_PASSWORD, NOON
from tests.selling import REASON, confirm, delivery, key, pay, promo, table, takeaway, with_promo


def set_modules(pos, **on):
    settings = {k: v for k, v in pos.get("/settings").items() if k != "rate"}
    pos.put("/settings", settings | on)


@pytest.fixture
def history(shop):
    """Monday 23 November 2026 by hand:
    takeaway 1,650,000 | dine-in 500,000 in two payments | delivery 600,000 less 10%
    another takeaway 450,000 refunded | an unpaid delivery 200,000
    a table with 100,000 paid of 500,000
    Friday 20 November: takeaway 100,000 by Ahmad."""
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    clock.freeze(NOON - timedelta(days=3))
    shop.cashier("Ahmad")
    shop.post("/shifts/open", {"count": {}})
    pay(shop, takeaway(shop, soda=1), 0, 100000)
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    clock.freeze(NOON)
    shop.cashier()
    shop.post("/shifts/open", {"count": {}})
    pay(shop, takeaway(shop, beef=2, meal=1, soda=2), 1000, 1000000, 200, 70000)
    order = pay(shop, confirm(shop, table(shop, 1, beef=1)), 0, 200000)
    pay(shop, order, 0, 300000)
    promo(shop)
    pay(shop, with_promo(shop, delivery(shop, beef=1)), 0, 540000)
    order = pay(shop, takeaway(shop, meal=1), 0, 450000)
    code = shop.app.state.db
    with code.transaction() as db:
        from app.modules.orders.models import Order

        receipt = db.get(Order, order["id"]).receipt_code
    body = {"idempotency_key": key(), "code": receipt, "lbp": 450000, "approval": REASON}
    shop.post(f"/orders/{order['id']}/refund", body)
    confirm(shop, delivery(shop, soda=1))
    pay(shop, confirm(shop, table(shop, 2, beef=1)), 0, 100000)
    shop.post("/auth/quick-admin", {"password": ADMIN_PASSWORD})
    shop.put("/settings/rate", {"rate": 100000})
    shop.admin()
    return shop


def test_every_figure_matches_the_hand_calculation(history):
    r = history.get("/reports/sales?period=day")
    assert r["sales"] == 1650000 + 500000 + 540000
    assert (r["orders"], r["refunds"]) == (4, 1)
    assert r["delivery_fees"] == 100000
    assert r["by_type"] == {"takeaway": 1650000, "dine_in": 500000, "delivery": 540000}
    assert r["by_cashier"] == [{"name": "Sara", "sales": 2690000}]
    assert r["outstanding"] == 200000 + 400000
    assert r["cash"] == {
        "usd_cents": 800,
        "lbp": 1000000 - 70000 + 500000 + 540000 + 450000 - 450000 + 100000,
    }
    qty = {p["name"]: p["qty"] for p in r["products"]}
    assert qty == {"beef": 4, "soda": 2, "meal": 1, "odd": 0}
    assert [p["name"] for p in r["products"]][0] == "beef"
    assert r["products"][-1]["name"] == "odd"
    assert r["profit"] is None


def test_periods(history):
    week = history.get("/reports/sales?period=week")
    assert (week["start"], week["end"]) == ("2026-11-23", "2026-11-29")
    assert len(week["trend"]["points"]) == 7
    month = history.get("/reports/sales?period=month")
    assert (month["start"], month["end"], month["sales"]) == ("2026-11-01", "2026-11-30", 2790000)
    custom = history.get("/reports/sales?period=custom&start=2026-11-17&end=2026-11-20")
    assert (custom["sales"], len(custom["trend"]["points"])) == (100000, 4)
    overall = history.get("/reports/sales?period=overall")
    assert (overall["start"], overall["sales"]) == ("2026-11-20", 2790000)
    assert sum(p["sales"] for p in overall["trend"]["points"]) == overall["sales"]
    long = history.get("/reports/sales?period=custom&start=2026-01-01&end=2026-12-31")
    assert long["trend"]["unit"] == "month" and len(long["trend"]["points"]) == 12
    assert sum(p["sales"] for p in long["trend"]["points"]) == 2790000


def test_filters(history):
    assert history.get("/reports/sales?period=overall&type=delivery")["sales"] == 540000
    ahmad = next(c["id"] for c in history.get("/cashiers") if c["username"] == "ahmad")
    assert history.get(f"/reports/sales?period=overall&user_id={ahmad}")["sales"] == 100000
    meal = history.get(f"/reports/sales?period=day&product_id={history.p['meal']}")
    assert meal["sales"] == 1650000
    assert [p["name"] for p in meal["products"]] == ["meal"]


def test_business_day_cutoff(shop):
    clock.freeze(NOON + timedelta(hours=15, minutes=30))  # 03:30 the next morning
    pay(shop, takeaway(shop, beef=1), 0, 500000)
    shop.admin()
    r = shop.get("/reports/sales?period=day")
    assert (r["start"], r["sales"]) == ("2026-11-23", 500000)


def test_profit_appears_only_with_logged_entries_and_the_note(history):
    set_modules(history, expenses_enabled=True)
    assert history.get("/reports/sales")["profit"] is None
    entry = {"kind": "cost", "category": "لحوم", "currency": "LBP", "amount": 1000000}
    history.post("/expenses", entry | {"day": "2026-11-23"})
    usd = {"kind": "expense", "category": "مولد", "currency": "USD", "amount": 250}
    history.post("/expenses", usd | {"day": "2026-11-23"})
    profit = history.get("/reports/sales")["profit"]
    assert profit == {
        "profit": 2690000 - 1250000,
        "logged": 1250000,
        "note": "only from what you logged as expenses and costs",
    }
    assert history.get("/reports/sales?type=delivery")["profit"] is None
    book = load_workbook(io.BytesIO(history.get("/reports/sales/export")))
    cells = [c.value for row in book["Summary"].iter_rows() for c in row]
    assert profit["note"] in cells and 2690000 in cells


def test_export_matches_screen(history):
    book = load_workbook(io.BytesIO(history.get("/reports/sales/export?period=day")))
    assert book.sheetnames == ["Summary", "Sales over time", "Order type", "Cashiers", "Products"]
    assert ["beef", 4] in [[c.value for c in row] for row in book["Products"].iter_rows()]


def test_cashier_gets_nothing(history):
    history.cashier()
    for path in ("/reports/sales", "/reports/sales/export", "/reports/alerts", "/orders"):
        assert history.fails("GET", path) == "forbidden"
    for path in ("/expenses", "/inventory", "/expenses/export", "/backups", "/shifts"):
        assert history.fails("GET", path) == "forbidden"


def test_expenses(pos):
    assert pos.fails("GET", "/expenses") == "module_off"
    set_modules(pos, expenses_enabled=True)
    entry = {"kind": "expense", "category": "مولد", "currency": "LBP", "amount": 5}
    for bad in ({"amount": 0}, {"kind": "x"}, {"category": " "}, {"day": "nope"}):
        body = entry | {"day": "2026-11-23"} | bad
        assert pos.fails("POST", "/expenses", body) == "invalid_input"
    pos.post("/expenses", entry | {"day": "2026-11-23"})
    listed = pos.get("/expenses?start=2026-11-23&end=2026-11-23")
    assert (listed["total"], listed["categories"]) == (5, ["مولد"])
    assert pos.get("/expenses?start=2026-11-24")["entries"] == []
    pos.get("/expenses/export")
    pos.delete(f"/expenses/{listed['entries'][0]['id']}")
    assert pos.get("/expenses")["total"] == 0


def test_expenses_never_touch_the_drawer(shop):
    reference_before = shop.get("/shifts/current")
    shop.admin()
    set_modules(shop, expenses_enabled=True)
    entry = {"kind": "expense", "category": "x", "currency": "LBP", "amount": 999}
    shop.post("/expenses", entry | {"day": "2026-11-23"})
    shift = shop.get("/shifts")[0]
    assert shop.get(f"/shifts/{shift['id']}")["expected"] == {"usd_cents": 2000, "lbp": 1000000}
    assert reference_before["open"]


def stock(pos, name):
    return next(
        (p["stock"] for g in pos.get("/menu") for p in g["products"] if p["name"] == name), None
    )


def test_inventory_is_manual_and_never_blocks(shop):
    shop.admin()
    assert shop.fails("GET", "/inventory") == "module_off"
    set_modules(shop, inventory_enabled=True)
    body = {"name": "cans", "product_id": shop.p["soda"], "threshold": 5}
    item = shop.post("/inventory", body)["id"]
    assert shop.fails("POST", "/inventory", body) == "stock_item_exists"
    path = f"/inventory/{item}/movements"
    assert shop.post(path, {"kind": "in", "quantity": 6})["status"] == "ok"
    assert shop.post(path, {"kind": "out", "quantity": 2})["status"] == "low"
    assert shop.fails("POST", path, {"kind": "out", "quantity": 5}) == "stock_negative"
    assert shop.post(path, {"kind": "count", "quantity": 0})["status"] == "out"
    assert [m["change"] for m in shop.get(path)] and len(shop.get(path)) == 3
    shop.cashier()
    assert (stock(shop, "soda"), stock(shop, "beef")) == ("out", "ok")
    pay(shop, takeaway(shop, soda=1), 0, 100000)
    shop.admin()
    assert shop.get("/inventory")[0]["quantity"] == 0
    set_modules(shop, inventory_enabled=False)
    assert stock(shop, "soda") == "ok"


def test_alerts(shop):
    pay(shop, takeaway(shop, beef=1), 0, 500000)
    shop.admin()
    assert shop.get("/reports/alerts") == {"backup_failed": False, "clock_behind": False}
    clock.freeze(NOON - timedelta(days=2))
    assert shop.get("/reports/alerts")["clock_behind"] is True
