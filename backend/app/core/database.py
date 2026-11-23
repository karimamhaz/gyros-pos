import sys
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import MetaData, String, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import NullPool

ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


def new_id() -> str:
    return str(uuid4())


class HasId:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)


class Database:
    """One SQLite file with one writer. `lock` also keeps restore apart from requests."""

    def __init__(self, path: Path, backup_dir: Path | None = None):
        self.path = path
        self.backup_dir = backup_dir or path.parent / "Backups"
        path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.engine = create_engine(
            f"sqlite:///{path.as_posix()}",
            poolclass=NullPool,
            connect_args={"timeout": 10, "check_same_thread": False},
        )

        @event.listens_for(self.engine, "connect")
        def _connect(conn, _record):
            conn.isolation_level = None  # BEGIN is issued below, not by the driver
            for pragma in ("foreign_keys=ON", "journal_mode=WAL", "synchronous=FULL"):
                conn.execute(f"PRAGMA {pragma}")

        @event.listens_for(self.engine, "begin")
        def _begin(conn):
            conn.exec_driver_sql("BEGIN IMMEDIATE")

    @contextmanager
    def transaction(self) -> Iterator[Session]:
        with self.lock, Session(self.engine, expire_on_commit=False) as session, session.begin():
            yield session

    def _config(self) -> Config:
        config = Config()
        config.set_main_option("script_location", str(ROOT / "migrations").replace("%", "%%"))
        config.attributes["engine"] = self.engine
        return config

    def head_revision(self) -> str | None:
        return ScriptDirectory.from_config(self._config()).get_current_head()

    def knows_revision(self, revision: str) -> bool:
        return any(
            s.revision == revision
            for s in ScriptDirectory.from_config(self._config()).walk_revisions()
        )

    def revision(self) -> str | None:
        with self.engine.connect() as conn:
            return MigrationContext.configure(conn).get_current_revision()

    def migrate(self, target: str = "head") -> None:
        with self.lock:
            run = command.downgrade if target == "base" else command.upgrade
            run(self._config(), target)
