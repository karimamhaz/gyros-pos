"""Slows down guessing. Kept in the database so restarting the app does not reset it."""

from datetime import timedelta

from app.core import clock
from app.core.database import Database
from app.core.errors import AppError
from app.core.security import verify_password
from app.modules.auth.models import Throttle

FREE_TRIES = 3


def check(database: Database, key: str) -> None:
    with database.transaction() as db:
        row = db.get(Throttle, key)
        if row and row.locked_until and row.locked_until > clock.now():
            seconds = int((row.locked_until - clock.now()).total_seconds())
            raise AppError("too_many_attempts", 429, seconds=seconds)


def failed(database: Database, key: str) -> None:
    with database.transaction() as db:
        row = db.get(Throttle, key) or Throttle(key=key, failures=0)
        row.failures += 1
        if row.failures >= FREE_TRIES:
            wait = min(300, 5 * 2 ** (row.failures - FREE_TRIES))
            row.locked_until = clock.now() + timedelta(seconds=wait)
        db.add(row)


def passed(database: Database, key: str) -> None:
    with database.transaction() as db:
        row = db.get(Throttle, key)
        if row:
            db.delete(row)


def match_password(
    database: Database, key: str, candidates: list[tuple[str, str]], password: str
) -> str:
    """Returns the id of the (id, hash) pair that matches. Runs outside other transactions."""
    check(database, key)
    for user_id, hashed in candidates:
        if verify_password(hashed, password):
            passed(database, key)
            return user_id
    failed(database, key)
    raise AppError("wrong_password", 403)
