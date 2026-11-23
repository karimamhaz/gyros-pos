from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId

PENDING, PRINTING, PRINTED, FAILED, UNKNOWN = "pending", "printing", "printed", "failed", "unknown"


class PrintJob(HasId, Base):
    """`payload` is frozen when the job is made, so a retry prints the same paper."""

    __tablename__ = "print_jobs"
    __table_args__ = (
        CheckConstraint(
            "state IN ('pending', 'printing', 'printed', 'failed', 'unknown')", name="state"
        ),
    )
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id"), index=True)
    kind: Mapped[str]
    copy: Mapped[bool] = mapped_column(default=False)
    state: Mapped[str] = mapped_column(default=PENDING, index=True)
    attempts: Mapped[int] = mapped_column(default=0)
    error: Mapped[str | None]
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime]
