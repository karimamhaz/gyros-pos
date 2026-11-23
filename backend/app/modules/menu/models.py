from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, HasId


class Category(HasId, Base):
    __tablename__ = "categories"
    name: Mapped[str]
    position: Mapped[int]
    archived_at: Mapped[datetime | None]


class Product(HasId, Base):
    __tablename__ = "products"
    __table_args__ = (CheckConstraint("price_lbp > 0", name="price"),)
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str]
    price_lbp: Mapped[int]
    available: Mapped[bool] = mapped_column(default=True)
    position: Mapped[int]
    archived_at: Mapped[datetime | None]
    category: Mapped[Category] = relationship()
