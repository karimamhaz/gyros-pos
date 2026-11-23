from datetime import datetime

from sqlalchemy import JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId


class AuditEntry(HasId, Base):
    """Append-only: triggers created by the migration block update and delete."""

    __tablename__ = "audit_log"
    at: Mapped[datetime] = mapped_column(index=True)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    approver_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str]
    target: Mapped[str | None]
    details: Mapped[dict | None] = mapped_column(JSON)
