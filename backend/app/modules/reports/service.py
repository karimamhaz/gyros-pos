"""Admin sales figures. Definitions are in architecture section 12."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.expenses import service as expenses
from app.modules.menu import service as menu
from app.modules.orders import service as orders
from app.modules.orders.models import COMPLETED, CONFIRMED, DELIVERY, Order, OrderItem
from app.modules.payments.models import Payment, PaymentLine
from app.modules.reports.sheets import workbook
from app.modules.settings import service as settings
from app.modules.users import service as users

PROFIT_NOTE = "only from what you logged as expenses and costs"
MAX_DAYS_BY_DAY = 92


@dataclass
class Filters:
    period: str = "day"
    start: date | None = None
    end: date | None = None
    type: str | None = None
    product_id: str | None = None
    user_id: str | None = None

    @property
    def only_dates(self) -> bool:
        return not (self.type or self.product_id or self.user_id)


def date_range(db: Session, f: Filters) -> tuple[date, date]:
    today = orders.today(db)
    if f.period == "custom" and f.start and f.end:
        return min(f.start, f.end), max(f.start, f.end)
    if f.period == "week":
        monday = today - timedelta(days=today.weekday())
        return monday, monday + timedelta(days=6)
    if f.period == "month":
        first = today.replace(day=1)
        return first, (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    if f.period == "overall":
        firsts = [
            db.scalar(select(func.min(Order.completed_date))),
            db.scalar(select(func.min(Payment.business_date))),
        ]
        return min([d for d in firsts if d] or [today]), today
    return today, today


def _narrow(query, f: Filters, user_column):
    if f.type:
        query = query.where(Order.type == f.type)
    if f.user_id:
        query = query.where(user_column == f.user_id)
    if f.product_id:
        has = select(OrderItem.order_id).where(
            OrderItem.product_id == f.product_id, OrderItem.state == CONFIRMED
        )
        query = query.where(Order.id.in_(has))
    return query


def sales(db: Session, f: Filters) -> dict:
    start, end = date_range(db, f)
    sold = list(
        db.scalars(
            _narrow(
                select(Order).where(Order.completed_date.between(start, end)),
                f,
                Order.completed_by,
            )
        )
    )
    refunded = list(
        db.scalars(
            _narrow(
                select(Order).where(
                    Order.refunded_date.between(start, end), Order.completed_date.is_not(None)
                ),
                f,
                Order.completed_by,
            )
        )
    )
    names = users.names(db)
    by_day: dict[date, int] = defaultdict(int)
    by_type = {"takeaway": 0, "dine_in": 0, "delivery": 0}
    by_cashier: dict[str, int] = defaultdict(int)
    fees = 0
    moves = [(o, o.completed_date, 1) for o in sold] + [(o, o.refunded_date, -1) for o in refunded]
    for order, day, sign in moves:
        amount = sign * order.total
        by_day[day] += amount
        by_type[order.type] += amount
        by_cashier[names[order.completed_by]] += amount
        if order.type == DELIVERY:
            fees += sign * order.delivery_fee
    total = sum(by_type.values())

    return {
        "start": start,
        "end": end,
        "sales": total,
        "delivery_fees": fees,
        "orders": len(sold),
        "refunds": len(refunded),
        "outstanding": _outstanding(db, f),
        "trend": _trend(by_day, start, end),
        "by_type": by_type,
        "by_cashier": [
            {"name": n, "sales": v} for n, v in sorted(by_cashier.items(), key=lambda x: -x[1])
        ],
        "cash": _cash(db, f, start, end),
        "wish": _wish(db, f, start=start, end=end),
        "products": _products(db, f, start, end),
        "profit": _profit(db, f, start, end, total),
    }


def _outstanding(db: Session, f: Filters) -> int:
    query = _narrow(select(Order).where(Order.state == CONFIRMED), f, Order.created_by)
    return sum(o.due for o in db.scalars(query))


def _trend(by_day: dict[date, int], start: date, end: date) -> dict:
    if (end - start).days < MAX_DAYS_BY_DAY:
        days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        return {"unit": "day", "points": [{"at": d, "sales": by_day.get(d, 0)} for d in days]}
    months: dict[date, int] = defaultdict(int)
    month = start.replace(day=1)
    while month <= end:
        months[month] = 0
        month = (month + timedelta(days=32)).replace(day=1)
    for day, amount in by_day.items():
        months[day.replace(day=1)] += amount
    points = [{"at": m, "sales": v} for m, v in sorted(months.items())]
    return {"unit": "month", "points": points}


def _cash(db: Session, f: Filters, start: date, end: date) -> dict:
    query = (
        select(PaymentLine.currency, PaymentLine.direction, func.sum(PaymentLine.amount))
        .join(Payment, Payment.id == PaymentLine.payment_id)
        .join(Order, Order.id == Payment.order_id)
        .where(Payment.business_date.between(start, end))
        .group_by(PaymentLine.currency, PaymentLine.direction)
    )
    net = {"USD": 0, "LBP": 0}
    for currency, direction, amount in db.execute(_narrow(query, f, Payment.user_id)):
        net[currency] += amount if direction == "in" else -amount
    return {"usd_cents": net["USD"], "lbp": net["LBP"]}


def _wish(db: Session, f: Filters, start: date, end: date) -> int:
    """Paid by Wish in the period, less what was paid back. Never part of the cash figure."""
    query = (
        select(Payment.kind, func.sum(Payment.applied_lbp))
        .join(Order, Order.id == Payment.order_id)
        .where(Payment.method == "wish", Payment.business_date.between(start, end))
        .group_by(Payment.kind)
    )
    totals = {kind: amount for kind, amount in db.execute(_narrow(query, f, Payment.user_id))}
    return totals.get("payment", 0) - totals.get("refund", 0)


def _products(db: Session, f: Filters, start: date, end: date) -> list[dict]:
    """Quantities only: a promo covers the whole order, so items have no discounted revenue."""
    query = (
        select(OrderItem.product_id, func.sum(OrderItem.qty))
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.state == COMPLETED,
            Order.completed_date.between(start, end),
            OrderItem.state == CONFIRMED,
        )
        .group_by(OrderItem.product_id)
    )
    if f.product_id:
        query = query.where(OrderItem.product_id == f.product_id)
    sold = {pid: qty for pid, qty in db.execute(_narrow(query, f, Order.completed_by))}
    result = {
        p.id: {"id": p.id, "name": p.name, "qty": 0}
        for p in menu.products(db)
        if not f.product_id or p.id == f.product_id
    }
    for pid, qty in sold.items():
        if pid not in result:  # deleted since
            result[pid] = {"id": pid, "name": db.get(menu.Product, pid).name, "qty": 0}
        result[pid]["qty"] = qty
    return sorted(result.values(), key=lambda p: (-p["qty"], p["name"]))


def _profit(db: Session, f: Filters, start: date, end: date, total: int) -> dict | None:
    """Hidden unless something was logged, so sales are never shown as profit."""
    if not f.only_dates or not settings.load(db).expenses_enabled:
        return None
    count, logged = expenses.total(db, start, end)
    return {"profit": total - logged, "logged": logged, "note": PROFIT_NOTE} if count else None


def export(db: Session, f: Filters) -> bytes:
    r = sales(db, f)
    summary = [
        ["From", r["start"]],
        ["To", r["end"]],
        ["Total sales LBP", r["sales"]],
        ["Included delivery fees LBP", r["delivery_fees"]],
        ["Orders", r["orders"]],
        ["Refunded orders", r["refunds"]],
        ["Still unpaid LBP", r["outstanding"]],
        ["Cash collected USD", r["cash"]["usd_cents"] / 100],
        ["Cash collected LBP", r["cash"]["lbp"]],
        ["Paid by Wish LBP", r["wish"]],
    ]
    if r["profit"]:
        summary += [
            ["Logged expenses and costs LBP", r["profit"]["logged"]],
            ["Profit LBP", r["profit"]["profit"], PROFIT_NOTE],
        ]
    return workbook(
        {
            "Summary": summary,
            "Sales over time": [["From", "Sales LBP"]]
            + [[p["at"], p["sales"]] for p in r["trend"]["points"]],
            "Order type": [["Type", "Sales LBP"], *map(list, r["by_type"].items())],
            "Cashiers": [["Cashier", "Sales LBP"]]
            + [[c["name"], c["sales"]] for c in r["by_cashier"]],
            "Products": [["Product", "Quantity"]] + [[p["name"], p["qty"]] for p in r["products"]],
        }
    )
