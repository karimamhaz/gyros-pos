from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.modules.audit import service as audit
from app.modules.auth import service as auth
from app.modules.auth.deps import Ctx
from app.modules.auth.schemas import Approval
from app.modules.orders import service as orders
from app.modules.orders.models import CANCELLED, CONFIRMED, DINE_IN, DRAFT, Order
from app.modules.settings import service as settings
from app.modules.shifts import service as shifts
from app.modules.tables.models import TableSitting


def _open_sittings(db: Session) -> dict[int, TableSitting]:
    query = select(TableSitting).where(TableSitting.open_table_no.is_not(None))
    return {s.table_no: s for s in db.scalars(query)}


def _active_order(db: Session, table_no: int, sitting: TableSitting | None) -> Order | None:
    """The table's unpaid bill, or a draft not saved yet."""
    query = select(Order).where(Order.type == DINE_IN, Order.table_no == table_no)
    if sitting:
        bill = db.scalar(query.where(Order.sitting_id == sitting.id, Order.state == CONFIRMED))
        if bill:
            return bill
    return db.scalar(query.where(Order.state == DRAFT))


def overview(db: Session) -> list[dict]:
    sittings = _open_sittings(db)
    result = []
    for no in range(1, settings.load(db).table_count + 1):
        sitting = sittings.get(no)
        order = _active_order(db, no, sitting)
        due = order.due if order and order.state == CONFIRMED else 0
        started = order and bool(order.items)
        state = ("open" if due else "paid") if sitting else ("draft" if started else "free")
        result.append(
            {
                "table_no": no,
                "state": state,
                "due": due,
                "opened_at": sitting and clock.iso(sitting.opened_at),
            }
        )
    return result


def _check_number(db: Session, table_no: int) -> None:
    if not 1 <= table_no <= settings.load(db).table_count:
        raise not_found()


def order_for(db: Session, ctx: Ctx, table_no: int) -> Order:
    """The table's current bill, started when there is none (A7: never a paid one)."""
    _check_number(db, table_no)
    shifts.require(db, ctx)
    order = _active_order(db, table_no, _open_sittings(db).get(table_no))
    return order or orders.create_draft(db, ctx, DINE_IN, table_no)


def close(ctx: Ctx, table_no: int, approval: Approval | None) -> None:
    approver = auth.approve(ctx, approval) if approval else None
    with ctx.tx() as db:
        shifts.require(db, ctx)
        sitting = _open_sittings(db).get(table_no)
        if not sitting:
            raise AppError("table_not_open", 409)
        order = _active_order(db, table_no, sitting)
        if order and any(i.state == DRAFT for i in order.items):
            raise AppError("table_has_unsaved", 409)
        due = order.due if order and order.state == CONFIRMED else 0
        if due and not approver:
            raise AppError("table_owes", 403, due=due)
        if order and order.state == DRAFT:
            order.state = CANCELLED
        sitting.open_table_no = None
        sitting.closed_at, sitting.closed_by = clock.now(), ctx.user_id
        if due:
            audit.record(
                db,
                ctx.user_id,
                "table_closed_unpaid",
                order.id,
                approver,
                reason=approval.reason,
                due=due,
            )


def check_count(db: Session, count: int) -> None:
    """Settings may not remove a table that is in use."""
    used = list(_open_sittings(db))
    drafts = select(Order).where(Order.type == DINE_IN, Order.state == DRAFT)
    used += [o.table_no for o in db.scalars(drafts) if o.items]
    if used and max(used) > count:
        raise AppError("table_in_use", 409, table=max(used))
