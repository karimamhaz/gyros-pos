from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.core import clock, security
from app.core.config import Settings
from app.main import create_app

SECRET = "test-secret"
ADMIN_PASSWORD = "admin-password"
CASHIER_PASSWORD = "1234"
NOON = datetime(2026, 11, 23, 12, 0).astimezone()


@pytest.fixture(autouse=True)
def _fast_and_frozen(monkeypatch):
    from argon2 import PasswordHasher

    monkeypatch.setattr(security, "_hasher", PasswordHasher(1, 8, 1))
    clock.freeze(NOON)
    yield
    clock.freeze(None)


@pytest.fixture
def settings(tmp_path):
    return Settings(
        data_dir=tmp_path / "data", backup_dir=tmp_path / "backups", launch_secret=SECRET
    )


class Pos:
    """Drives the API the way the screens do."""

    def __init__(self, app):
        self.app = app
        self.client = TestClient(
            app, headers={"X-Launch-Secret": SECRET}, raise_server_exceptions=False
        )
        self.client.__enter__()
        self.token = None

    def close(self):
        self.client.__exit__(None, None, None)

    @property
    def db(self):
        return self.app.state.db

    def call(self, method, path, body=None, ok=True):
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        r = self.client.request(method, f"/api{path}", json=body, headers=headers)
        if ok:
            assert r.status_code == 200, f"{path}: {r.status_code} {r.text}"
            return r.json() if "json" in r.headers.get("content-type", "") else r.content
        assert r.status_code >= 400, f"{path} should fail: {r.text}"
        assert r.json()["error"]["code"] != "internal_error", r.text
        return r.json()["error"]["code"]

    def get(self, path):
        return self.call("GET", path)

    def post(self, path, body=None):
        return self.call("POST", path, body or {})

    def put(self, path, body):
        return self.call("PUT", path, body)

    def delete(self, path):
        return self.call("DELETE", path)

    def fails(self, method, path, body=None):
        return self.call(method, path, body, ok=False)

    def admin(self, password=ADMIN_PASSWORD):
        self.token = None
        self.token = self.post("/auth/login/admin", {"username": "boss", "password": password})[
            "token"
        ]
        return self

    def cashier(self, name="Sara", password=CASHIER_PASSWORD):
        self.token = None
        user = next(c for c in self.get("/auth/cashiers") if c["name"] == name)
        self.token = self.post(
            "/auth/login/cashier", {"user_id": user["id"], "password": password}
        )["token"]
        return self


@pytest.fixture
def fresh(settings):
    """The app before first-time setup."""
    pos = Pos(create_app(settings))
    yield pos
    pos.close()


@pytest.fixture
def pos(fresh):
    """Set up, with two cashiers. Logged in as Admin."""
    fresh.recovery_key = fresh.post(
        "/auth/setup", {"username": "boss", "password": ADMIN_PASSWORD, "rate": 89500}
    )["recovery_key"]
    fresh.admin()
    for name in ("Sara", "Ahmad"):
        fresh.post(
            "/cashiers",
            {"username": name.lower(), "display_name": name, "password": CASHIER_PASSWORD},
        )
    return fresh
