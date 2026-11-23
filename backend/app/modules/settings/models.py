from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[object] = mapped_column(JSON)


class ExchangeRate(HasId, Base):
    """Append-only; the newest row is the current rate."""

    __tablename__ = "exchange_rates"
    __table_args__ = (CheckConstraint("rate > 0", name="rate"),)
    seq: Mapped[int] = mapped_column(unique=True)
    rate: Mapped[int]
    set_at: Mapped[datetime]
    set_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
