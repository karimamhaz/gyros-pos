from datetime import timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core import clock
from app.main import create_app
from app.modules.auth.deps import Allow, Public
from app.modules.auth.models import LoginSession
from app.modules.users.models import User
from tests.conftest import ADMIN_PASSWORD, CASHIER_PASSWORD, NOON, Pos


def api_routes(app):
    from fastapi.routing import APIRoute

    found, stack = [], list(app.routes)
    while stack:
        route = stack.pop()
        if isinstance(route, APIRoute):
            found.append(route)
        else:
            inner = getattr(route, "original_router", None) or getattr(route, "router", None)
            stack.extend(getattr(inner, "routes", None) or getattr(route, "routes", None) or [])
    return found


def guard(route):
    guards = [d.call for d in route.dependant.dependencies if isinstance(d.call, Allow | Public)]
    assert len(guards) == 1, f"{route.path} must declare who may call it"
    return guards[0]


PUBLIC = {
    "/api/health",
    "/api/auth/start",
    "/api/auth/cashiers",
    "/api/auth/setup",
    "/api/auth/login/admin",
    "/api/auth/login/cashier",
    "/api/auth/recover",
}


def test_every_route_declares_and_enforces_permissions(pos):
    routes = api_routes(pos.app)
    assert len(routes) >= 15
    assert {r.path for r in routes if isinstance(guard(r), Public)} == PUBLIC
    for route in routes:
        rule = guard(route)
        if isinstance(rule, Public):
            continue
        for method in route.methods:
            path = route.path.removeprefix("/api").replace("{", "").replace("}", "")
            pos.token = None
            assert pos.fails(method, path, {}) == "session_ended", route.path
            if "cashier" not in rule.roles:
                pos.cashier()
                assert pos.fails(method, path, {}) == "forbidden", route.path


def test_setup_happens_once(fresh):
    assert fresh.get("/auth/start") == {"set_up": False, "language": "ar"}
    body = {"username": "boss", "password": ADMIN_PASSWORD, "rate": 89500}
    assert fresh.fails("POST", "/auth/setup", body | {"password": "short"}) == "invalid_input"
    fresh.post("/auth/setup", body)
    assert fresh.get("/auth/start")["set_up"]
    assert fresh.fails("POST", "/auth/setup", body) == "already_set_up"
    fresh.admin()
    assert fresh.get("/settings")["rate"] == 89500


def test_passwords_are_argon2id(pos):
    with pos.db.transaction() as db:
        for user in db.scalars(select(User)):
            assert user.password_hash.startswith("$argon2id$")


def test_login_list_has_active_cashiers_only(pos):
    assert [c["name"] for c in pos.get("/auth/cashiers")] == ["Ahmad", "Sara"]
    assert all(set(c) == {"id", "name"} for c in pos.get("/auth/cashiers"))
    sara = next(c for c in pos.get("/cashiers") if c["username"] == "sara")
    pos.put(f"/cashiers/{sara['id']}", {"display_name": "Sara", "active": False})
    assert [c["name"] for c in pos.get("/auth/cashiers")] == ["Ahmad"]
    body = {"user_id": sara["id"], "password": CASHIER_PASSWORD}
    assert pos.fails("POST", "/auth/login/cashier", body) == "wrong_password"


def test_entry_paths_reject_the_other_role(pos):
    with pos.db.transaction() as db:
        admin_id = db.scalar(select(User.id).where(User.role == "admin"))
    body = {"user_id": admin_id, "password": ADMIN_PASSWORD}
    assert pos.fails("POST", "/auth/login/cashier", body) == "wrong_password"
    body = {"username": "sara", "password": CASHIER_PASSWORD}
    assert pos.fails("POST", "/auth/login/admin", body) == "wrong_password"


def test_repeated_failures_are_slowed_down_even_after_restart(pos, settings):
    body = {"username": "boss", "password": "wrong"}
    for _ in range(3):
        assert pos.fails("POST", "/auth/login/admin", body) == "wrong_password"
    right = {"username": "boss", "password": ADMIN_PASSWORD}
    assert pos.fails("POST", "/auth/login/admin", right) == "too_many_attempts"
    pos.close()
    again = Pos(create_app(settings))
    assert again.fails("POST", "/auth/login/admin", right) == "too_many_attempts"
    clock.freeze(NOON + timedelta(seconds=6))
    again.admin()
    assert again.get("/settings")
    again.close()


def test_one_session_and_password_logout(pos):
    old = pos.token
    pos.cashier()
    new, pos.token = pos.token, old
    assert pos.fails("GET", "/settings") == "session_ended"
    pos.token = new
    assert pos.fails("POST", "/auth/logout", {"password": "nope"}) == "wrong_password"
    pos.post("/auth/logout", {"password": CASHIER_PASSWORD})
    assert pos.fails("GET", "/settings") == "session_ended"
    with pos.db.transaction() as db, pytest.raises(IntegrityError):
        user_id = db.scalar(select(User.id))
        for i in range(2):
            db.add(
                LoginSession(
                    user_id=user_id, token_hash=str(i), started_at=clock.now(), active_slot=1
                )
            )
        db.flush()


def test_restart_ends_a_session_left_open(pos, settings):
    pos.close()
    again = Pos(create_app(settings))
    again.token = pos.token
    assert again.fails("GET", "/settings") == "session_ended"
    again.close()


def test_disabled_cashier_is_out_immediately(pos):
    pos.cashier()
    cashier = pos.token
    with pos.db.transaction() as db:
        db.scalar(select(User).where(User.username == "sara")).active = False
    pos.token = cashier
    assert pos.fails("GET", "/settings") == "session_ended"


def test_quick_admin_changes_the_rate_only_then_expires(pos):
    pos.cashier()
    assert pos.fails("PUT", "/settings/rate", {"rate": 90000}) == "forbidden"
    assert pos.fails("POST", "/auth/quick-admin", {"password": "1234"}) == "wrong_password"
    assert pos.post("/auth/quick-admin", {"password": ADMIN_PASSWORD}) == {"seconds": 300}
    pos.put("/settings/rate", {"rate": 90000})
    assert pos.get("/settings")["rate"] == 90000
    assert pos.fails("GET", "/cashiers") == "forbidden"
    clock.freeze(NOON + timedelta(minutes=5, seconds=1))
    assert pos.fails("PUT", "/settings/rate", {"rate": 91000}) == "forbidden"
    clock.freeze(NOON + timedelta(minutes=6))
    pos.post("/auth/quick-admin", {"password": ADMIN_PASSWORD})
    pos.delete("/auth/quick-admin")
    assert pos.fails("PUT", "/settings/rate", {"rate": 91000}) == "forbidden"
    with pos.db.transaction() as db:
        actions = list(db.scalars(text("SELECT action FROM audit_log")))
    assert "quick_admin_opened" in actions and actions.count("rate_changed") == 2


def test_recovery_key_works_once_and_is_replaced(pos):
    key = pos.recovery_key
    bad = {"recovery_key": "AAAAA-" * 4 + "AAAAA", "password": "new-password"}
    assert pos.fails("POST", "/auth/recover", bad) == "wrong_recovery_key"
    result = pos.post(
        "/auth/recover", {"recovery_key": f" {key.lower()} ", "password": "new-password"}
    )
    assert result["username"] == "boss" and result["recovery_key"] != key
    pos.admin("new-password")
    again = {"recovery_key": key, "password": "other-password"}
    assert pos.fails("POST", "/auth/recover", again) == "wrong_recovery_key"


def test_admin_changes_own_password(pos):
    body = {"current": "wrong", "password": "another-one"}
    assert pos.fails("PUT", "/auth/password", body) == "wrong_password"
    pos.put("/auth/password", body | {"current": ADMIN_PASSWORD})
    pos.admin("another-one")


def test_cashier_accounts_are_unique_and_admin_is_untouchable(pos):
    new = {"username": "SARA", "display_name": "X", "password": "1234"}
    assert pos.fails("POST", "/cashiers", new) == "username_taken"
    new = {"username": "x1", "display_name": "Sara", "password": "1234"}
    assert pos.fails("POST", "/cashiers", new) == "name_taken"
    with pos.db.transaction() as db:
        admin_id = db.scalar(select(User.id).where(User.role == "admin"))
    body = {"display_name": "x", "active": False}
    assert pos.fails("PUT", f"/cashiers/{admin_id}", body) == "not_found"
    assert pos.fails("PUT", f"/cashiers/{admin_id}/password", {"password": "1234"}) == "not_found"


def test_cashier_password_change(pos):
    sara = next(c for c in pos.get("/cashiers") if c["username"] == "sara")
    pos.put(f"/cashiers/{sara['id']}/password", {"password": "9876"})
    pos.cashier(password="9876")


@pytest.mark.parametrize("table", ["audit_log", "exchange_rates"])
def test_history_is_append_only(pos, table):
    for sql in (f"UPDATE {table} SET id = 'x'", f"DELETE FROM {table}"):
        with pytest.raises(IntegrityError):
            with pos.db.transaction() as db:
                db.execute(text(sql))


def test_settings_are_saved_and_audited(pos):
    body = pos.get("/settings")
    body.pop("rate")
    pos.put("/settings", body | {"table_count": 12})
    assert pos.get("/settings")["table_count"] == 12
    assert pos.fails("PUT", "/settings", body | {"surprise": 1}) == "invalid_input"
    assert pos.fails("PUT", "/settings", body | {"table_count": -1}) == "invalid_input"
