from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId


class BackupRecord(HasId, Base):
    """What was attempted. The files belong to the owner and are never managed here."""

    __tablename__ = "backup_records"
    session_id: Mapped[str | None] = mapped_column(ForeignKey("sessions.id"))
    kind: Mapped[str]
    filename: Mapped[str]
    sha256: Mapped[str | None]
    size: Mapped[int | None]
    ok: Mapped[bool]
    error: Mapped[str | None]
    created_at: Mapped[datetime]
