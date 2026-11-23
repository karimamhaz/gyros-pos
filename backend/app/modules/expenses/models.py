from datetime import date, datetime

from sqlalchemy import CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId


class Expense(HasId, Base):
    """A log only. Never part of a shift or drawer (D20)."""

    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("kind IN ('expense', 'cost')", name="kind"),
        CheckConstraint("amount > 0 AND value_lbp > 0", name="amount"),
    )
    kind: Mapped[str]
    category: Mapped[str]
    description: Mapped[str] = mapped_column(default="")
    currency: Mapped[str]
    amount: Mapped[int]
    rate: Mapped[int]
    value_lbp: Mapped[int]
    day: Mapped[date] = mapped_column(index=True)
    created_at: Mapped[datetime]
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    deleted_at: Mapped[datetime | None]
