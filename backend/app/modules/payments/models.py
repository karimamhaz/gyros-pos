from datetime import date, datetime

from sqlalchemy import CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, HasId


class Payment(HasId, Base):
    """Append-only. `applied_lbp` is the part that counts toward the order."""

    __tablename__ = "payments"
    __table_args__ = (CheckConstraint("kind IN ('payment', 'refund')", name="kind"),)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    kind: Mapped[str]
    idempotency_key: Mapped[str] = mapped_column(unique=True)
    request_hash: Mapped[str]
    rate: Mapped[int]
    applied_lbp: Mapped[int]
    change_rounding: Mapped[int]
    shortfall: Mapped[int]
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    shift_id: Mapped[str] = mapped_column(ForeignKey("shifts.id"), index=True)
    paid_at: Mapped[datetime]
    business_date: Mapped[date] = mapped_column(index=True)
    lines: Mapped[list["PaymentLine"]] = relationship()


class PaymentLine(HasId, Base):
    __tablename__ = "payment_lines"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount"),
        CheckConstraint("currency IN ('USD', 'LBP')", name="currency"),
        CheckConstraint("direction IN ('in', 'out')", name="direction"),
    )
    payment_id: Mapped[str] = mapped_column(ForeignKey("payments.id"), index=True)
    currency: Mapped[str]
    direction: Mapped[str]
    amount: Mapped[int]
