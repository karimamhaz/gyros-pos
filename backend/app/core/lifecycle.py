import logging
import sqlite3
from contextlib import closing

from fastapi import FastAPI

from app.core.database import Database
from app.modules.auth import service as auth
from app.modules.backups import service as backups
from app.modules.printing import service as printing

log = logging.getLogger("pos")


def _unfinished_session(database: Database) -> str | None:
    """Plain SQL, because the schema may still be an older version."""
    try:
        with closing(sqlite3.connect(database.path)) as db:
            row = db.execute("SELECT id FROM sessions WHERE active_slot = 1").fetchone()
            return row and row[0]
    except sqlite3.OperationalError:
        return None


def start(app: FastAPI) -> None:
    database: Database = app.state.db
    app.state.damaged = False
    if database.path.exists():
        if not backups.healthy(database.path):  # opening also runs SQLite's own recovery
            log.error("the database failed its integrity check")
            app.state.damaged = True
            return
        unfinished = _unfinished_session(database)
        if unfinished:
            backups.create(database, "recovery", unfinished)
        before = database.revision()
        if before and before != database.head_revision():
            backups.create(database, "premigrate")
    database.migrate()
    with database.transaction() as db:
        stale = auth.active_session(db)
        if stale:
            auth.end_session(db, stale, "abnormal")
        printing.interrupted(db)
