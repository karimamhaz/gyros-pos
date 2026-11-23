"""Creates backup files and restores one. Never overwrites, renames or deletes a backup."""

import gzip
import hashlib
import logging
import os
import secrets
import shutil
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path

from sqlalchemy import literal_column, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.database import Database
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.auth.models import LoginSession
from app.modules.backups.models import BackupRecord
from app.modules.users import service as users

log = logging.getLogger("pos")
SUFFIX = ".db.gz"
MAX_UNPACKED = 4_000_000_000
NEWEST = literal_column("backup_records.rowid").desc()  # insertion order, whatever the clock says


def _hash(path: Path) -> str:
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def healthy(path: Path) -> bool:
    try:
        with closing(sqlite3.connect(path)) as db:
            return db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    except sqlite3.DatabaseError:
        return False


def _snapshot(source: Path, target: Path) -> None:
    with closing(sqlite3.connect(source)) as live, closing(sqlite3.connect(target)) as copy:
        live.backup(copy)
        copy.execute("PRAGMA journal_mode=DELETE")  # one file, no side files
    if not healthy(target):
        raise OSError("snapshot failed its integrity check")


def _name(kind: str, session_id: str | None) -> str:
    stamp = clock.now().strftime("%Y%m%dT%H%M%SZ")
    return f"pos_{stamp}_{(session_id or 'none')[:8]}_{kind}_{secrets.token_hex(3)}{SUFFIX}"


def _write_new(folder: Path, packed: Path, kind: str, session_id: str | None) -> Path:
    """Exclusive create: an existing file can never be touched."""
    for _ in range(5):
        target = folder / _name(kind, session_id)
        try:
            out = target.open("xb")
        except FileExistsError:
            continue
        with out, packed.open("rb") as data:
            shutil.copyfileobj(data, out)
            out.flush()
            os.fsync(out.fileno())
        if _hash(target) != _hash(packed):
            raise OSError("backup file does not match what was written")
        return target
    raise OSError("no free backup name")


def _create_file(database: Database, kind: str, session_id: str | None) -> tuple[Path, str]:
    database.backup_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=database.path.parent) as work:
        snapshot, packed = Path(work) / "snapshot.db", Path(work) / "packed.gz"
        with database.lock:
            _snapshot(database.path, snapshot)
        with snapshot.open("rb") as data, gzip.open(packed, "wb", compresslevel=6) as out:
            shutil.copyfileobj(data, out)
        target = _write_new(database.backup_dir, packed, kind, session_id)
        return target, _hash(target)


def create(database: Database, kind: str, session_id: str | None = None) -> bool:
    """Never raises: a failed backup is recorded and shown to the Admin, not a blocked logout."""
    filename, digest, size, error = "", None, None, None
    try:
        target, digest = _create_file(database, kind, session_id)
        filename, size = target.name, target.stat().st_size
    except (OSError, sqlite3.Error) as e:
        error = f"{type(e).__name__}: {e}"[:300]
        log.error("backup failed (%s): %s", kind, error)
    try:
        with database.transaction() as db:
            known = session_id and db.get(LoginSession, session_id)
            db.add(
                BackupRecord(
                    session_id=session_id if known else None,
                    kind=kind,
                    filename=filename,
                    sha256=digest,
                    size=size,
                    ok=error is None,
                    error=error,
                    created_at=clock.now(),
                )
            )
    except Exception:
        # Before the first migration there is nowhere to record it; the file itself exists.
        log.warning("backup record not stored (%s)", kind)
    return error is None


def last_failed(db: Session) -> bool:
    newest = db.scalar(select(BackupRecord.ok).order_by(NEWEST).limit(1))
    return newest is False


def records(db: Session) -> list[dict]:
    names = users.names(db)
    query = (
        select(BackupRecord, LoginSession.user_id)
        .outerjoin(LoginSession, LoginSession.id == BackupRecord.session_id)
        .order_by(NEWEST)
        .limit(100)
    )
    return [
        {
            "id": r.id,
            "kind": r.kind,
            "filename": r.filename,
            "user": names.get(user_id),
            "size": r.size,
            "ok": r.ok,
            "created_at": clock.iso(r.created_at),
        }
        for r, user_id in db.execute(query)
    ]


def files(database: Database) -> list[str]:
    if not database.backup_dir.is_dir():
        return []
    names = (f.name for f in database.backup_dir.iterdir() if f.name.endswith(SUFFIX))
    return sorted(names, reverse=True)


def _unpack(source: Path, target: Path) -> None:
    try:
        written = 0
        with gzip.open(source, "rb") as data, target.open("wb") as out:
            while chunk := data.read(1 << 20):
                written += len(chunk)
                if written > MAX_UNPACKED:
                    raise AppError("backup_invalid", 409)
                out.write(chunk)
    except (OSError, EOFError, gzip.BadGzipFile) as e:
        raise AppError("backup_invalid", 409) from e
    if not healthy(target):
        raise AppError("backup_invalid", 409)


def _check_schema(database: Database, candidate: Path) -> None:
    try:
        with closing(sqlite3.connect(candidate)) as db:
            row = db.execute("SELECT version_num FROM alembic_version").fetchone()
            db.execute("SELECT id FROM users LIMIT 1")
    except sqlite3.DatabaseError:
        raise AppError("backup_invalid", 409) from None
    if not row or not database.knows_revision(row[0]):
        raise AppError("backup_newer", 409)


def _side_files(path: Path) -> list[Path]:
    return [path.with_name(path.name + suffix) for suffix in ("-wal", "-shm")]


def restore(database: Database, source: Path, actor: str, session_id: str) -> None:
    """Verifies first, saves the current data, then swaps. Any failure puts the old data back."""
    if not source.is_file() or not source.name.endswith(SUFFIX):
        raise AppError("backup_invalid", 409)
    with tempfile.TemporaryDirectory(dir=database.path.parent) as work, database.lock:
        candidate = Path(work) / "candidate.db"
        _unpack(source, candidate)
        _check_schema(database, candidate)
        if not create(database, "prerestore", session_id):
            raise AppError("prerestore_failed", 409)

        with closing(sqlite3.connect(database.path)) as db:
            db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        database.engine.dispose()
        kept = database.path.with_name("pos.before-restore.db")
        os.replace(database.path, kept)
        try:
            for side in _side_files(database.path):
                side.unlink(missing_ok=True)
            os.replace(candidate, database.path)
            database.migrate()
            with database.transaction() as db:
                for session in db.scalars(
                    select(LoginSession).where(LoginSession.active_slot == 1)
                ):
                    session.active_slot, session.ended_at = None, clock.now()
                    session.end_reason = "restored"
                audit.record(db, None, "restored", source.name, by=actor)
            if not healthy(database.path):
                raise OSError("restored database failed its check")
        except Exception as e:
            log.error("restore failed, putting the previous data back", exc_info=e)
            database.engine.dispose()
            for side in _side_files(database.path):
                side.unlink(missing_ok=True)
            os.replace(kept, database.path)
            raise AppError("restore_failed", 409) from e
