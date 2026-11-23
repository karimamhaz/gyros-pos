from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.core.money import usd_cents_to_lbp
from app.modules.audit import service as audit
from app.modules.expenses.models import Expense
from app.modules.settings import service as settings


class ExpenseIn(BaseModel):
    kind: Literal["expense", "cost"]
    category: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)] = ""
    currency: Literal["LBP", "USD"]
    amount: int = Field(gt=0, le=100_000_000_000)
    day: date


def require_enabled(db: Session) -> None:
    if not settings.load(db).expenses_enabled:
        raise AppError("module_off", 409)


def _live(start: date | None, end: date | None):
    query = select(Expense).where(Expense.deleted_at.is_(None))
    if start:
        query = query.where(Expense.day >= start)
    if end:
        query = query.where(Expense.day <= end)
    return query


def entries(db: Session, start: date | None = None, end: date | None = None) -> list[dict]:
    query = _live(start, end).order_by(Expense.day.desc(), Expense.created_at.desc()).limit(1000)
    return [
        {
            "id": e.id,
            "kind": e.kind,
            "category": e.category,
            "description": e.description,
            "currency": e.currency,
            "amount": e.amount,
            "value_lbp": e.value_lbp,
            "day": e.day,
        }
        for e in db.scalars(query)
    ]


def total(db: Session, start: date | None, end: date | None) -> tuple[int, int]:
    """(number of entries, value in LBP)."""
    live = _live(start, end).subquery()
    count, value = db.execute(select(func.count(), func.sum(live.c.value_lbp))).one()
    return count, value or 0


def categories(db: Session) -> list[str]:
    return sorted(db.scalars(select(Expense.category).distinct()))


def add(db: Session, user_id: str, data: ExpenseIn) -> None:
    rate = settings.require_rate(db)
    value = data.amount if data.currency == "LBP" else usd_cents_to_lbp(data.amount, rate)
    if value < 1:
        raise AppError("invalid_input", 422)
    entry = Expense(
        **data.model_dump(), rate=rate, value_lbp=value, created_at=clock.now(), user_id=user_id
    )
    db.add(entry)
    db.flush()
    audit.record(db, user_id, "expense_added", entry.id, value=value)


def delete(db: Session, user_id: str, expense_id: str) -> None:
    entry = db.get(Expense, expense_id)
    if not entry or entry.deleted_at:
        raise not_found()
    entry.deleted_at = clock.now()
    audit.record(db, user_id, "expense_deleted", expense_id, value=entry.value_lbp)
