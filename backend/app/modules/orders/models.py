from datetime import date, datetime

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, HasId

TAKEAWAY, DINE_IN, DELIVERY = "takeaway", "dine_in", "delivery"
DRAFT, CONFIRMED, COMPLETED = "draft", "confirmed", "completed"
CANCELLED, REFUNDED = "cancelled", "refunded"
VOIDED = "voided"


class Order(HasId, Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("business_date", "number", name="uq_orders_number"),
        CheckConstraint("type IN ('takeaway', 'dine_in', 'delivery')", name="type"),
        CheckConstraint(
            "state IN ('draft', 'confirmed', 'completed', 'cancelled', 'refunded')", name="state"
        ),
        CheckConstraint("total >= 0 AND paid >= 0", name="amounts"),
    )
    type: Mapped[str]
    state: Mapped[str] = mapped_column(default=DRAFT, index=True)
    version: Mapped[int] = mapped_column(default=1)
    number: Mapped[int | None]
    business_date: Mapped[date | None]
    receipt_code: Mapped[str | None]
    table_no: Mapped[int | None]
    sitting_id: Mapped[str | None] = mapped_column(ForeignKey("table_sittings.id"), index=True)
    delivery_fee: Mapped[int] = mapped_column(default=0)
    promo_id: Mapped[str | None] = mapped_column(ForeignKey("promo_codes.id"))
    promo_code: Mapped[str | None]
    promo_percent: Mapped[int | None]
    gross: Mapped[int] = mapped_column(default=0)
    discount: Mapped[int] = mapped_column(default=0)
    rounding: Mapped[int] = mapped_column(default=0)
    total: Mapped[int] = mapped_column(default=0)
    paid: Mapped[int] = mapped_column(default=0)
    shortfall: Mapped[int] = mapped_column(default=0)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime]
    shift_id: Mapped[str | None] = mapped_column(ForeignKey("shifts.id"))
    confirmed_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]
    completed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    completed_date: Mapped[date | None] = mapped_column(index=True)
    refunded_at: Mapped[datetime | None]
    refunded_date: Mapped[date | None] = mapped_column(index=True)
    items: Mapped[list["OrderItem"]] = relationship(order_by="OrderItem.position")
    delivery: Mapped["DeliveryDetails | None"] = relationship()

    @property
    def due(self) -> int:
        if self.state not in (DRAFT, CONFIRMED):
            return 0
        return self.total - self.paid


class OrderItem(HasId, Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("qty > 0 AND price > 0", name="amounts"),
        CheckConstraint("state IN ('draft', 'confirmed', 'voided')", name="state"),
    )
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    name: Mapped[str]
    price: Mapped[int]
    qty: Mapped[int]
    note: Mapped[str] = mapped_column(default="")
    state: Mapped[str] = mapped_column(default=DRAFT)
    position: Mapped[int]


class DeliveryDetails(Base):
    __tablename__ = "delivery_details"
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), primary_key=True)
    customer: Mapped[str] = mapped_column(default="")
    phone: Mapped[str] = mapped_column(default="")
    address: Mapped[str] = mapped_column(default="")
    driver: Mapped[str] = mapped_column(default="")
    requested_time: Mapped[str] = mapped_column(default="")
    promised_time: Mapped[str] = mapped_column(default="")
