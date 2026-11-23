from datetime import date, datetime

from sqlalchemy import CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId


class PromoCode(HasId, Base):
    __tablename__ = "promo_codes"
    __table_args__ = (CheckConstraint("percent BETWEEN 1 AND 100", name="percent"),)
    code: Mapped[str] = mapped_column(unique=True)
    percent: Mapped[int]
    active: Mapped[bool] = mapped_column(default=True)
    starts_on: Mapped[date | None]
    ends_on: Mapped[date | None]
    usage_limit: Mapped[int | None]


class PromoRedemption(HasId, Base):
    __tablename__ = "promo_redemptions"
    promo_id: Mapped[str] = mapped_column(ForeignKey("promo_codes.id"))
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), unique=True)
    percent: Mapped[int]
    discount_lbp: Mapped[int]
    redeemed_at: Mapped[datetime]
