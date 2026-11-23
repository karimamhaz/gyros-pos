import gzip
import shutil
import sqlite3
from datetime import timedelta

import pytest

from app.core import clock
from app.core.database import Database
from app.main import create_app
from app.modules.backups import service
from tests.conftest import ADMIN_PASSWORD, NOON, Pos
from tests.selling import pay, rows, takeaway


def files(settings):
    if not settings.backup_dir.exists():
        return []
    return sorted(p.name for p in settings.backup_dir.iterdir())


def kinds(settings):
    return sorted(n.split("_")[3] for n in files(settings))


def unpack(path, target):
    with gzip.open(path) as source, open(target, "wb") as out:
        shutil.copyfileobj(source, out)
    return target


def test_each_session_makes_one_verified_backup(shop, settings, tmp_path):
    before = len(files(settings))  # the Admin session that prepared the shop
    pay(shop, takeaway(shop, beef=1), 0, 500000)
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    assert len(files(settings)) == before + 1
    shop.admin()
    shop.post("/auth/logout", {"password": ADMIN_PASSWORD})
    assert len(files(settings)) == before + 2
    assert set(kinds(settings)) == {"session"}
    newest = max(settings.backup_dir.iterdir(), key=lambda p: p.stat().st_mtime_ns)
    copy = unpack(newest, tmp_path / "copy.db")
    assert service.healthy(copy)
    with sqlite3.connect(copy) as db:
        assert db.execute("SELECT sum(paid) FROM orders").fetchone() == (500000,)
    assert rows(shop, "SELECT count(*) FROM backup_records WHERE ok = 1") == [(before + 2,)]


def test_names_never_collide_even_if_the_clock_goes_back(pos, settings):
    for step in (0, 0, -3600, 0):
        clock.freeze(NOON + timedelta(seconds=step))
        assert service.create(pos.db, "session")
    assert len(set(files(settings))) == 4


def test_existing_file_is_never_overwritten(pos, settings, monkeypatch):
    settings.backup_dir.mkdir(parents=True)
    target = settings.backup_dir / "pos_taken.db.gz"
    target.write_bytes(b"owner's file")
    names = iter(["pos_taken.db.gz", "pos_free.db.gz"])
    monkeypatch.setattr(service, "_name", lambda *_: next(names))
    assert service.create(pos.db, "session")
    assert target.read_bytes() == b"owner's file"
    assert files(settings) == ["pos_free.db.gz", "pos_taken.db.gz"]


def test_failure_does_not_block_logout_and_alerts_admin(shop, settings):
    shutil.rmtree(settings.backup_dir, ignore_errors=True)
    settings.backup_dir.write_text("a file where the folder should be")
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    shop.admin()
    assert shop.get("/reports/alerts")["backup_failed"] is True
    settings.backup_dir.unlink()
    shop.post("/auth/logout", {"password": ADMIN_PASSWORD})
    shop.admin()
    assert shop.get("/reports/alerts")["backup_failed"] is False


def test_interrupted_write_leaves_a_file_that_fails_and_retries_under_a_new_name(
    pos, settings, monkeypatch
):
    real = shutil.copyfileobj

    def cut(source, out):
        if "backups" in str(getattr(out, "name", "")):
            out.write(source.read(50))
            raise OSError("disk full")
        return real(source, out)

    with monkeypatch.context() as patch:
        patch.setattr(service.shutil, "copyfileobj", cut)
        assert not service.create(pos.db, "session")
    assert service.create(pos.db, "session")
    assert len(files(settings)) == 2


def test_crash_start_makes_a_recovery_backup_and_resumes(shop, settings):
    pay(shop, takeaway(shop, beef=1), 0, 500000)
    again = Pos(create_app(settings))  # the first process never ended its session
    assert kinds(settings).count("recovery") == 1
    body = {"user_id": next(c["id"] for c in again.get("/auth/cashiers") if c["name"] == "Ahmad")}
    body["password"] = "1234"
    assert again.fails("POST", "/auth/login/cashier", body) == "shift_open_other"
    again.cashier()
    assert again.get("/shifts/current")["mine"]
    again.close()


def test_clean_start_makes_no_recovery_backup(pos, settings):
    pos.post("/auth/logout", {"password": ADMIN_PASSWORD})
    again = Pos(create_app(settings))
    assert "recovery" not in kinds(settings)
    again.close()


def test_backup_before_migration(settings):
    database = Database(settings.database_path, settings.backup_dir)
    database.migrate("0004")
    pos = Pos(create_app(settings))
    assert kinds(settings) == ["premigrate"]
    assert pos.db.revision() == pos.db.head_revision()
    pos.close()


def test_damaged_database_is_not_used(pos, settings):
    pos.close()
    size = settings.database_path.stat().st_size
    for extra in ("-wal", "-shm"):
        settings.database_path.with_name(settings.database_path.name + extra).unlink(
            missing_ok=True
        )
    with settings.database_path.open("r+b") as f:
        f.seek(100)
        f.write(b"\xff" * (size - 100))
    again = Pos(create_app(settings))
    assert again.get("/health") == {"status": "damaged"}
    assert again.fails("GET", "/auth/start") == "damaged"
    assert files(settings) == []
    again.close()


@pytest.fixture
def saved(shop, settings):
    """A backup holding one order, then more sales after it. Logged in as Admin."""
    pay(shop, takeaway(shop, beef=1), 0, 500000)
    known = set(files(settings))
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    shop.backup = (set(files(settings)) - known).pop()
    shop.cashier()
    shop.post("/shifts/open", {"count": {}})
    pay(shop, takeaway(shop, soda=1), 0, 100000)
    shop.post("/shifts/close", {"password": "1234", "count": {}})
    shop.admin()
    return shop


def restore(pos, file, password=ADMIN_PASSWORD):
    return {"file": str(file), "password": password}


def test_restore_brings_back_known_data_and_saves_the_current(saved, settings, tmp_path):
    assert saved.backup in saved.get("/backups")["files"]
    before = {p.name: p.read_bytes() for p in settings.backup_dir.iterdir()}
    saved.post("/backups/restore", restore(saved, saved.backup))
    assert saved.fails("GET", "/settings") == "session_ended"
    saved.admin()
    assert rows(saved, "SELECT sum(total) FROM orders") == [(500000,)]
    assert all((settings.backup_dir / n).read_bytes() == b for n, b in before.items())
    extra = next(n for n in files(settings) if "_prerestore_" in n)
    copy = unpack(settings.backup_dir / extra, tmp_path / "pre.db")
    with sqlite3.connect(copy) as db:
        assert db.execute("SELECT sum(total) FROM orders").fetchone() == (600000,)
    saved.post("/backups/restore", restore(saved, extra))
    saved.admin()
    assert rows(saved, "SELECT sum(total) FROM orders") == [(600000,)]


def test_restore_needs_password_and_no_open_shift(saved):
    assert saved.fails("POST", "/backups/restore", restore(saved, saved.backup, "x")) == (
        "wrong_password"
    )
    saved.post("/shifts/open", {"count": {}})
    assert saved.fails("POST", "/backups/restore", restore(saved, saved.backup)) == (
        "close_shift_first"
    )


def test_bad_backups_are_refused_and_change_nothing(saved, settings, tmp_path):
    good = (settings.backup_dir / saved.backup).read_bytes()

    def write(name, data):
        path = tmp_path / name
        path.write_bytes(data)
        return path

    newer = unpack(settings.backup_dir / saved.backup, tmp_path / "newer.db")
    with sqlite3.connect(newer) as db:
        db.execute("UPDATE alembic_version SET version_num = '9999'")
    other = tmp_path / "other.db"
    with sqlite3.connect(other) as db:
        db.execute("CREATE TABLE x (y)")
    cases = {
        write("cut.db.gz", good[: len(good) // 2]): "backup_invalid",
        write("noise.db.gz", b"not a backup"): "backup_invalid",
        write("inner.db.gz", gzip.compress(b"not a database")): "backup_invalid",
        write("empty.db.gz", gzip.compress(b"")): "backup_invalid",
        write("newer.db.gz", gzip.compress(newer.read_bytes())): "backup_newer",
        write("other.db.gz", gzip.compress(other.read_bytes())): "backup_invalid",
        write("wrong.txt", good): "backup_invalid",
        tmp_path / "missing.db.gz": "backup_invalid",
    }
    count = len(files(settings))
    for path, code in cases.items():
        assert saved.fails("POST", "/backups/restore", restore(saved, path)) == code, path.name
    assert rows(saved, "SELECT sum(total) FROM orders") == [(600000,)]
    assert len(files(settings)) == count


def test_a_name_cannot_escape_the_backup_folder(saved, tmp_path):
    assert saved.fails("POST", "/backups/restore", restore(saved, "../data/pos.db")) == (
        "backup_invalid"
    )


def test_failed_swap_puts_the_old_data_back(saved, monkeypatch):
    def crash(*_):
        raise RuntimeError("power cut")

    with monkeypatch.context() as patch:
        patch.setattr(saved.db, "migrate", crash)
        code = saved.fails("POST", "/backups/restore", restore(saved, saved.backup))
    assert code == "restore_failed"
    assert rows(saved, "SELECT sum(total) FROM orders") == [(600000,)]
    assert saved.get("/settings")


def test_kill_during_payment_leaves_a_usable_database(shop, settings, tmp_path):
    """Copies the files mid-transaction, as a power cut would leave them."""
    order = takeaway(shop, beef=1)
    frozen = tmp_path / "frozen"
    with shop.db.transaction() as db:
        from app.modules.orders.models import Order

        db.get(Order, order["id"]).paid = 500000
        db.flush()
        shutil.copytree(settings.data_dir, frozen)
    cut = settings.model_copy(update={"data_dir": frozen, "backup_dir": tmp_path / "b2"})
    again = Pos(create_app(cut))
    assert again.get("/health") == {"status": "ok"}
    assert rows(again, "SELECT state, paid FROM orders") == [("draft", 0)]
    again.close()
