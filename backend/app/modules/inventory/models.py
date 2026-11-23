from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId


class InventoryItem(HasId, Base):
    """Changed by Admin only. Sales never touch it (D19)."""

    __tablename__ = "inventory_items"
    name: Mapped[str]
    product_id: Mapped[str | None] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(default=0)
    threshold: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime]
    archived_at: Mapped[datetime | None]


class StockMovement(HasId, Base):
    __tablename__ = "stock_movements"
    item_id: Mapped[str] = mapped_column(ForeignKey("inventory_items.id"), index=True)
    kind: Mapped[str]
    change: Mapped[int]
    quantity_after: Mapped[int]
    reason: Mapped[str] = mapped_column(default="")
    at: Mapped[datetime]
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
