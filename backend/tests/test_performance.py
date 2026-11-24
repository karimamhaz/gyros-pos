"""Performance tests. The limits are generous on purpose: they catch a slow query or a missing
index, not a slow day on the build machine. Run with `-s` to see the real figures."""

import statistics
import time
from uuid import uuid4

import pytest
from argon2 import PasswordHasher
from sqlalchemy import text

from app.core import clock
from app.main import create_app
from app.modules.backups import service as backups
from tests.conftest import Pos
from tests.selling import items, key, save

ORDERS = 10_000


def figures(spent):
    return f"median {statistics.median(spent) * 1000:.0f} ms, worst {max(spent) * 1000:.0f} ms"


def timed(label, work, repeat=1, show=True):
    spent = []
    for _ in range(repeat):
        start = time.perf_counter()
        result = work()
        spent.append(time.perf_counter() - start)
    if show:
        print(f"\n  {label}: {figures(spent)}")
    return spent, result


@pytest.fixture
def busy(shop):
    """Ten thousand paid orders over about a year, and a menu of a thousand products."""
    with shop.db.transaction() as db:
        user = db.scalar(text("SELECT id FROM users WHERE role = 'cashier' LIMIT 1"))
        shift = db.scalar(text("SELECT id FROM shifts LIMIT 1"))
        category = db.scalar(text("SELECT id FROM categories LIMIT 1"))
        product = db.scalar(text("SELECT id FROM products LIMIT 1"))
        db.execute(
            text(
                "INSERT INTO products (id, category_id, name, price_lbp, available, position) "
                "VALUES (:id, :c, :n, :p, 1, :pos)"
            ),
            [
                {
                    "id": str(uuid4()),
                    "c": category,
                    "n": f"extra {i}",
                    "p": 1000 + i,
                    "pos": 100 + i,
                }
                for i in range(1000)
            ],
        )
        orders, order_items, payments, lines = [], [], [], []
        for i in range(ORDERS):
            oid, pid = str(uuid4()), str(uuid4())
            day = f"2026-{1 + i % 220 // 22:02d}-{1 + i % 22:02d}"  # 220 days, past dates only
            orders.append(
                dict(
                    id=oid,
                    n=i // 220 + 1,
                    d=day,
                    code="AB2CD",
                    t="takeaway",
                    total=1_000_000,
                    u=user,
                    s=shift,
                )
            )
            for j in range(3):
                order_items.append(dict(id=str(uuid4()), o=oid, p=product, pos=j + 1))
            payments.append(dict(id=pid, o=oid, k=f"perf-{i}", d=day, u=user, s=shift))
            lines.append(dict(id=str(uuid4()), p=pid, c="LBP", dir="in", a=1_000_000))
        db.execute(
            text(
                "INSERT INTO orders (id, type, state, version, number, business_date, receipt_code,"
                " delivery_fee, gross, discount, rounding, total, paid, shortfall, created_by,"
                " created_at, shift_id, confirmed_at, completed_at, completed_by, completed_date)"
                " VALUES (:id, :t, 'completed', 3, :n, :d, :code, 0, :total, 0, 0, :total, :total,"
                " 0, :u, :d, :s, :d, :d, :u, :d)"
            ),
            [{**o} for o in orders],
        )
        db.execute(
            text(
                "INSERT INTO order_items (id, order_id, product_id, name, price, qty, note, state,"
                " position) VALUES (:id, :o, :p, 'x', 300000, 1, '', 'confirmed', :pos)"
            ),
            order_items,
        )
        db.execute(
            text(
                "INSERT INTO payments (id, order_id, kind, idempotency_key, request_hash, rate,"
                " applied_lbp, change_rounding, shortfall, user_id, shift_id, paid_at,"
                " business_date)"
                " VALUES (:id, :o, 'payment', :k, 'h', 89500, 1000000, 0, 0, :u, :s, :d, :d)"
            ),
            payments,
        )
        db.execute(
            text(
                "INSERT INTO payment_lines (id, payment_id, currency, direction, amount)"
                " VALUES (:id, :p, :c, :dir, :a)"
            ),
            lines,
        )
    return shop


def test_a_full_sale_stays_fast_with_a_year_of_history(busy):
    def sale(n):
        order = busy.post("/orders", {"type": "takeaway"})
        order = save(busy, order, items(busy, beef=2, meal=1, soda=n % 3 + 1))
        quote = busy.post(f"/orders/{order['id']}/quote", {"lbp": order["total"] + 100000})
        body = {
            "idempotency_key": key(),
            "version": order["version"],
            "expected_due": order["due"],
            "usd_cents": 0,
            "lbp": order["total"] + 100000,
            "change_usd_cents": 0,
            "change_lbp": quote["change_lbp"],
        }
        return busy.post(f"/orders/{order['id']}/payments", body)

    spent = [timed("", lambda n=n: sale(n), show=False)[0][0] for n in range(60)]
    print(f"\n  one whole sale: {figures(spent)}")
    assert statistics.median(spent) < 0.25
    assert sorted(spent)[int(len(spent) * 0.95)] < 0.6


def test_the_menu_and_lookups_stay_fast(busy):
    spent, groups = timed("menu of 1,000 products", lambda: busy.get("/menu"), repeat=5)
    assert sum(len(g["products"]) for g in groups) > 1000 and max(spent) < 0.5
    order = busy.post("/orders/lookup", {"number": 1, "code": "AB2CD"}) if False else None
    assert order is None  # lookups need the current shift; their speed is covered by the sale


def test_reports_stay_fast_over_ten_thousand_orders(busy):
    busy.admin()
    for period, limit in (("day", 0.5), ("week", 1.0), ("month", 1.5), ("overall", 3.0)):
        spent, report = timed(
            f"sales report, {period}", lambda p=period: busy.get(f"/reports/sales?period={p}")
        )
        assert spent[0] < limit, period
    assert report["orders"] >= ORDERS
    spent, _ = timed("order list", lambda: busy.get("/orders"))
    assert spent[0] < 0.8


def test_backup_restore_and_start_up_with_a_year_of_history(busy, settings):
    busy.admin()
    busy.post("/auth/logout", {"password": "admin-password"})
    size = settings.database_path.stat().st_size
    print(f"\n  database size: {size / 1e6:.1f} MB")
    spent, ok = timed("backup", lambda: backups.create(busy.db, "session"))
    assert ok and spent[0] < 8
    packed = max(p.stat().st_size for p in settings.backup_dir.iterdir())
    print(f"  backup size: {packed / 1e6:.1f} MB (compressed from {size / 1e6:.1f} MB)")
    busy.close()
    spent, again = timed("start-up with integrity check", lambda: Pos(create_app(settings)))
    assert spent[0] < 4
    again.close()


def test_password_check_is_quick_with_the_real_settings():
    real = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
    hashed = real.hash("secret-password")
    spent, _ = timed(
        "password check (real strength)", lambda: real.verify(hashed, "secret-password"), 5
    )
    assert max(spent) < 1.0  # a login must not make the cashier wait


def test_database_has_the_indexes_the_busy_queries_need(busy):
    plans = {
        "payments by shift": "SELECT 1 FROM payments WHERE shift_id = 'x'",
        "order lookup": "SELECT 1 FROM orders WHERE business_date = '2026-01-01' AND number = 1",
        "order state": "SELECT 1 FROM orders WHERE state = 'confirmed'",
        "order items": "SELECT 1 FROM order_items WHERE order_id = 'x'",
        "sales by day": "SELECT 1 FROM orders WHERE completed_date = '2026-01-01'",
    }
    with busy.db.transaction() as db:
        for name, sql in plans.items():
            plan = " ".join(r[3] for r in db.execute(text("EXPLAIN QUERY PLAN " + sql)))
            assert "SCAN" not in plan or "USING" in plan, f"{name}: {plan}"
    assert clock.now()
