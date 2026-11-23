from datetime import datetime

from sqlalchemy import CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId

ADMIN = "admin"
CASHIER = "cashier"


class User(HasId, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('admin', 'cashier')", name="role"),)
    username: Mapped[str] = mapped_column(unique=True)
    display_name: Mapped[str] = mapped_column(unique=True)
    role: Mapped[str]
    password_hash: Mapped[str]
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime]
