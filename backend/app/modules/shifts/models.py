from datetime import date, datetime

from sqlalchemy import JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId


class Shift(HasId, Base):
    __tablename__ = "shifts"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    # 1 while open, then NULL: the unique index allows one open shift.
    open_slot: Mapped[int | None] = mapped_column(unique=True)
    count_mode: Mapped[str]
    opening_usd_cents: Mapped[int]
    opening_lbp: Mapped[int]
    opening_notes: Mapped[dict | None] = mapped_column(JSON)
    opened_at: Mapped[datetime]
    business_date: Mapped[date]
    closed_at: Mapped[datetime | None]


class ShiftClosing(HasId, Base):
    __tablename__ = "shift_closings"
    shift_id: Mapped[str] = mapped_column(ForeignKey("shifts.id"), unique=True)
    reference: Mapped[str] = mapped_column(unique=True)
    declared_usd_cents: Mapped[int]
    declared_lbp: Mapped[int]
    declared_notes: Mapped[dict | None] = mapped_column(JSON)
    expected_usd_cents: Mapped[int]
    expected_lbp: Mapped[int]
    closed_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    closed_at: Mapped[datetime]
