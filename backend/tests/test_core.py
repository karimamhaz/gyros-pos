import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text

from app.core.config import Settings
from app.core.database import Database
from app.main import create_app, serve

SECRET = "test-secret"


@pytest.fixture
def app(tmp_path):
    return create_app(
        Settings(data_dir=tmp_path / "d", backup_dir=tmp_path / "b", launch_secret=SECRET)
    )


def test_health(app):
    with TestClient(app, headers={"X-Launch-Secret": SECRET}) as client:
        r = client.get("/api/health")
        assert (r.status_code, r.json()["status"]) == (200, "ok")


@pytest.mark.parametrize(
    "headers", [{}, {"X-Launch-Secret": "wrong"}, {"X-Launch-Secret": "é".encode()}]
)
@pytest.mark.parametrize("path", ["/api/health", "/api/anything", "/docs", "/openapi.json"])
def test_secret_is_required_everywhere(app, headers, path):
    with TestClient(app) as client:
        assert client.get(path, headers=headers).status_code == 401


def test_unexpected_error_hides_details(app):
    @app.get("/api/boom")
    def boom():
        raise RuntimeError("private detail")

    with TestClient(
        app, headers={"X-Launch-Secret": SECRET}, raise_server_exceptions=False
    ) as client:
        r = client.get("/api/boom")
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "internal_error", "params": {}}}
    log = (app.state.settings.data_dir / "logs" / "pos.log").read_text()
    assert "RuntimeError" in log and SECRET not in log


def test_refuses_other_hosts(tmp_path):
    settings = Settings(data_dir=tmp_path, backup_dir=tmp_path, launch_secret=SECRET)
    with pytest.raises(ValueError):
        serve(settings, host="0.0.0.0")


def test_empty_secret_is_refused(tmp_path):
    with pytest.raises(ValueError):
        Settings(data_dir=tmp_path, backup_dir=tmp_path, launch_secret="")


@pytest.fixture
def db(tmp_path):
    return Database(tmp_path / "t.db")


def test_durability_settings(db):
    with db.transaction() as s:
        assert s.scalar(text("PRAGMA foreign_keys")) == 1
        assert s.scalar(text("PRAGMA journal_mode")) == "wal"
        assert s.scalar(text("PRAGMA synchronous")) == 2


def test_transaction_rolls_back_and_starts_immediate(db):
    with db.transaction() as s:
        s.execute(text("CREATE TABLE t (x INTEGER)"))
    seen = []
    event.listen(db.engine, "before_cursor_execute", lambda *a: seen.append(a[2]))
    with pytest.raises(RuntimeError):
        with db.transaction() as s:
            s.execute(text("INSERT INTO t VALUES (1)"))
            raise RuntimeError
    with db.transaction() as s:
        assert s.scalar(text("SELECT count(*) FROM t")) == 0
        assert s.connection().connection.dbapi_connection.in_transaction
    import sqlite3

    with db.transaction() as s:
        s.execute(text("SELECT 1"))
        other = sqlite3.connect(db.path, timeout=0)
        with pytest.raises(sqlite3.OperationalError):
            other.execute("BEGIN IMMEDIATE")
        other.close()


def test_migrations_up_and_down(db):
    db.migrate()
    assert db.revision() == db.head_revision()
    db.migrate("base")
    assert db.revision() is None
