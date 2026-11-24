"""Integration tests: the pieces working together, from database rules up to the whole API."""

import itertools

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.core.database import Base, Database
from app.modules import load_models
from tests.selling import rows, takeaway
from tests.test_auth import api_routes, guard


def test_migrations_go_up_down_and_up_again(tmp_path):
    db = Database(tmp_path / "m.db")
    db.migrate()
    first = set(inspect(db.engine).get_table_names())
    assert {"orders", "payments", "users", "backup_records", "print_jobs"} <= first
    assert db.revision() == db.head_revision()
    db.migrate("base")
    assert set(inspect(db.engine).get_table_names()) <= {"alembic_version"}
    db.migrate()
    assert set(inspect(db.engine).get_table_names()) == first


def test_models_and_migrations_describe_the_same_database(tmp_path):
    load_models()
    db = Database(tmp_path / "d.db")
    db.migrate()
    with db.engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": False})
        diff = compare_metadata(ctx, Base.metadata)
    assert diff == []


BAD_ROWS = [
    "INSERT INTO products (id, category_id, name, price_lbp, available, position) "
    "SELECT 'p', id, 'x', 0, 1, 1 FROM categories LIMIT 1",
    "INSERT INTO exchange_rates (id, seq, rate, set_at, set_by) "
    "SELECT 'r', 99, 0, '2026-01-01', id FROM users LIMIT 1",
    "INSERT INTO promo_codes (id, code, percent, active) VALUES ('q', 'X', 101, 1)",
    "INSERT INTO users (id, username, display_name, role, password_hash, active, created_at) "
    "VALUES ('u', 'u', 'u', 'owner', 'x', 1, '2026-01-01')",
    "INSERT INTO order_items (id, order_id, product_id, name, price, qty, state, position) "
    "VALUES ('i', 'missing', 'missing', 'x', 1, 1, 'draft', 1)",
]


@pytest.mark.parametrize("sql", BAD_ROWS)
def test_the_database_itself_refuses_bad_rows(shop, sql):
    with pytest.raises(IntegrityError), shop.db.transaction() as db:
        db.execute(text(sql))


def test_amounts_cannot_go_negative_in_the_database(shop):
    order = takeaway(shop, beef=1)
    for sql in (
        f"UPDATE orders SET total = -1 WHERE id = '{order['id']}'",
        f"UPDATE order_items SET qty = 0 WHERE order_id = '{order['id']}'",
    ):
        with pytest.raises(IntegrityError), shop.db.transaction() as db:
            db.execute(text(sql))
    assert rows(shop, f"SELECT total FROM orders WHERE id = '{order['id']}'") == [(500000,)]


GARBAGE = [
    None,
    {},
    [],
    "text",
    0,
    -1,
    2**70,
    1.5,
    {"version": "x"},
    {"items": "x"},
    {"password": ["a"]},
    {"amount": {"$gt": 0}},
    {"code": "<script>alert(1)</script>"},
    {"id": "'; DROP TABLE users; --"},
    {"name": "\u0000" * 50},
    {"x": "ع" * 5000},
]


@pytest.mark.parametrize("who", ["anonymous", "cashier", "admin"])
def test_no_route_crashes_on_garbage(shop, who):
    """Bad input must always get a clear 4xx answer, never a crash."""
    routes = [r for r in api_routes(shop.app) if r.path != "/api/auth/setup"]
    assert len(routes) > 70
    shop.token = {"anonymous": None, "cashier": shop.token}.get(who)
    if who == "admin":
        shop.admin()
    for route in routes:
        path = route.path
        for name in (
            "order_id",
            "item_id",
            "job_id",
            "product_id",
            "user_id",
            "promo_id",
            "category_id",
            "shift_id",
            "expense_id",
            "table_no",
            "kind",
        ):
            path = path.replace("{" + name + "}", "0")
        headers = {"Authorization": f"Bearer {shop.token}"} if shop.token else {}
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            for body in GARBAGE:
                r = shop.client.request(method, path, json=body, headers=headers)
                assert r.status_code < 500, (method, path, body, r.text[:200])
                assert r.status_code in (200, 307) or "error" in r.json(), (
                    method,
                    path,
                    r.text[:200],
                )
    assert rows(shop, "SELECT count(*) FROM users") != [(0,)]  # nothing was dropped


def test_every_route_has_exactly_one_declared_guard(shop):
    for route in api_routes(shop.app):
        guard(route)


def test_two_apps_cannot_share_one_database_by_accident(shop, settings):
    """A second process must wait for the writer, not corrupt or silently overwrite."""
    import sqlite3

    other = sqlite3.connect(settings.database_path, timeout=0.2)
    order = takeaway(shop, beef=1)
    with shop.db.transaction() as db:
        db.execute(text("UPDATE orders SET version = version"))
        with pytest.raises(sqlite3.OperationalError):
            other.execute("BEGIN IMMEDIATE")
    other.close()
    assert shop.get(f"/orders/{order['id']}")["id"] == order["id"]
    assert list(itertools.islice(iter([1]), 1)) == [1]
