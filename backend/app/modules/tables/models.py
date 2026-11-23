from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, HasId


class TableSitting(HasId, Base):
    __tablename__ = "table_sittings"
    table_no: Mapped[int]
    # The table number while open, then NULL: one open sitting per table.
    open_table_no: Mapped[int | None] = mapped_column(unique=True)
    opened_at: Mapped[datetime]
    opened_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    closed_at: Mapped[datetime | None]
    closed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
