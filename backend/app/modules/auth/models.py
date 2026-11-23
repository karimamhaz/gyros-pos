from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId


class LoginSession(HasId, Base):
    __tablename__ = "sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(unique=True)
    started_at: Mapped[datetime]
    ended_at: Mapped[datetime | None]
    end_reason: Mapped[str | None]
    # 1 while active, then NULL: the unique index allows one active session.
    active_slot: Mapped[int | None] = mapped_column(unique=True)
    quick_admin_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    quick_until: Mapped[datetime | None]


class RecoveryKey(HasId, Base):
    __tablename__ = "recovery_keys"
    key_hash: Mapped[str]
    created_at: Mapped[datetime]
    used_at: Mapped[datetime | None]


class Throttle(Base):
    __tablename__ = "throttles"
    key: Mapped[str] = mapped_column(primary_key=True)
    failures: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[datetime | None]
