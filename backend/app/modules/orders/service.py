"""Orders: drafts, totals, confirming, voiding and cancelling. Payments are in `payments`."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.core.money import lbp_to_usd_cents, order_total
from app.core.security import random_code
from app.modules.audit import service as audit
from app.modules.auth import service as auth
from app.modules.auth import throttle
from app.modules.auth.deps import Ctx
from app.modules.menu import service as menu
from app.modules.orders.models import (
    CANCELLED,
    COMPLETED,
    CONFIRMED,
    DELIVERY,
    DINE_IN,
    DRAFT,
    REFUNDED,
    VOIDED,
    DeliveryDetails,
    Order,
    OrderItem,
)
from app.modules.orders.schemas import CancelIn, ConfirmIn, DraftIn, LookupIn, VoidIn
from app.modules.payments.models import Payment
from app.modules.promos import service as promos
from app.modules.settings import service as settings
from app.modules.shifts import service as shifts
from app.modules.tables.models import TableSitting
from app.modules.users import service as users


def today(db: Session):
    return clock.business_date(settings.load(db).day_cutoff_minutes)


# --- reading ---------------------------------------------------------------


def get(db: Session, order_id: str) -> Order:
    order = db.get(Order, order_id)
    if not order:
        raise not_found()
    return order


def get_visible(db: Session, ctx: Ctx, order_id: str, code: str = "") -> Order:
    """Cashiers reach finished orders only with the code printed on the receipt."""
    order = get(db, order_id)
    if ctx.is_admin or order.state in (DRAFT, CONFIRMED):
        return order
    if code and order.receipt_code == code and _in_current_shift(db, order):
        return order
    raise not_found()


def _in_current_shift(db: Session, order: Order) -> bool:
    shift = shifts.current(db)
    if not shift:
        return False
    paid_here = select(Payment.id).where(Payment.order_id == order.id, Payment.shift_id == shift.id)
    return order.shift_id == shift.id or db.scalar(paid_here) is not None


def for_change(db: Session, order_id: str, version: int, *states: str) -> Order:
    order = get(db, order_id)
    if order.version != version:
        raise AppError("order_changed", 409)
    if order.state not in states:
        raise AppError("order_closed", 409)
    return order


def paid_by_wish(db: Session, order_id: str) -> int:
    """What Wish transfers paid toward this order. History: refunds do not reduce it."""
    query = select(func.coalesce(func.sum(Payment.applied_lbp), 0)).where(
        Payment.order_id == order_id, Payment.method == "wish", Payment.kind == "payment"
    )
    return db.scalar(query)


def payment_state(order: Order) -> str:
    if order.state == REFUNDED:
        return "refunded"
    if order.state == COMPLETED:
        return "paid"
    return "partial" if order.paid else "unpaid"


def live_items(order: Order) -> list[OrderItem]:
    return [i for i in order.items if i.state != VOIDED]


def view(db: Session, order: Order) -> dict:
    rate = settings.current_rate(db)
    d = order.delivery
    return {
        "id": order.id,
        "type": order.type,
        "state": order.state,
        "payment_state": payment_state(order),
        "version": order.version,
        "number": order.number,
        "table_no": order.table_no,
        "created_at": clock.iso(order.created_at),
        "confirmed_at": clock.iso(order.confirmed_at),
        "items": [
            {
                "id": i.id,
                "product_id": i.product_id,
                "name": i.name,
                "price": i.price,
                "qty": i.qty,
                "note": i.note,
                "state": i.state,
                "line_total": i.price * i.qty,
            }
            for i in order.items
        ],
        "items_total": sum(i.price * i.qty for i in live_items(order)),
        "delivery_fee": order.delivery_fee if order.type == DELIVERY else 0,
        "promo": order.promo_code and {"code": order.promo_code, "percent": order.promo_percent},
        "discount": order.discount,
        "rounding": order.rounding,
        "total": order.total,
        "paid": order.paid,
        "paid_wish": paid_by_wish(db, order.id),
        "due": order.due,
        "total_usd_cents": lbp_to_usd_cents(order.total, rate) if rate else None,
        "due_usd_cents": lbp_to_usd_cents(order.due, rate) if rate else None,
        "delivery": d
        and {
            "customer": d.customer,
            "phone": d.phone,
            "address": d.address,
            "driver": d.driver,
            "requested_time": d.requested_time,
            "promised_time": d.promised_time,
        },
    }


# --- totals ----------------------------------------------------------------


def reprice(db: Session, order: Order) -> None:
    db.flush()
    db.refresh(order, ["items"])
    gross = sum(i.price * i.qty for i in live_items(order))
    if order.type == DELIVERY:
        gross += order.delivery_fee
    result = order_total(gross, order.promo_percent)
    order.gross, order.discount = result.gross, result.discount
    order.rounding, order.total = result.rounding, result.total


def touch(order: Order) -> None:
    order.version += 1


# --- drafts ----------------------------------------------------------------


def create_draft(db: Session, ctx: Ctx, type_: str, table_no: int | None = None) -> Order:
    shifts.require(db, ctx)
    order = Order(type=type_, table_no=table_no, created_by=ctx.user_id, created_at=clock.now())
    if type_ == DELIVERY:
        _prepare_delivery(db, order)
    db.add(order)
    db.flush()
    return order


def _prepare_delivery(db: Session, order: Order) -> None:
    order.delivery_fee = settings.load(db).default_delivery_fee
    if not order.delivery:
        order.delivery = DeliveryDetails()


def save_draft(db: Session, ctx: Ctx, order_id: str, data: DraftIn) -> Order:
    """Replaces the unsaved part of an order. Confirmed items are never touched."""
    shifts.require(db, ctx)
    order = for_change(db, order_id, data.version, DRAFT, CONFIRMED)
    if order.state == CONFIRMED and order.type != DINE_IN:
        raise AppError("order_closed", 409)
    if data.type != order.type:
        if order.state != DRAFT or DINE_IN in (data.type, order.type):
            raise AppError("order_type_fixed", 409)
        order.type = data.type
        if data.type == DELIVERY:
            _prepare_delivery(db, order)
    for item in [i for i in order.items if i.state == DRAFT]:
        db.delete(item)
    db.flush()
    position = max((i.position for i in order.items if i.state != DRAFT), default=0)
    for entry in data.items:
        product = menu.sellable(db, entry.product_id)
        position += 1
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                name=product.name,
                price=product.price_lbp,
                qty=entry.qty,
                note=entry.note,
                position=position,
            )
        )
    if order.type == DELIVERY:
        if data.delivery_fee is not None:
            order.delivery_fee = data.delivery_fee
        if data.delivery:
            for key, value in data.delivery.model_dump().items():
                setattr(order.delivery, key, value)
    reprice(db, order)
    touch(order)
    return order


def open_drafts(db: Session) -> list[dict]:
    query = (
        select(Order)
        .where(Order.state == DRAFT, Order.type != DINE_IN)
        .order_by(Order.created_at.desc())
    )
    return [
        {
            "id": o.id,
            "type": o.type,
            "total": o.total,
            "created_at": clock.iso(o.created_at),
            "first_item": o.items[0].name,
            "items": sum(i.qty for i in o.items),
        }
        for o in db.scalars(query)
        if o.items
    ]


def set_promo(db: Session, ctx: Ctx, order_id: str, version: int, code: str) -> Order:
    shifts.require(db, ctx)
    order = for_change(db, order_id, version, DRAFT, CONFIRMED)
    if order.paid:
        raise AppError("promo_locked", 409)
    if code:
        promo = promos.find(db, code, today(db))
        order.promo_id, order.promo_code = promo.id, promo.code
        order.promo_percent = promo.percent
    else:
        order.promo_id = order.promo_code = order.promo_percent = None
    reprice(db, order)
    touch(order)
    return order


# --- confirming ------------------------------------------------------------


def next_number(db: Session, day) -> int:
    return (db.scalar(select(func.max(Order.number)).where(Order.business_date == day)) or 0) + 1


def confirm_items(db: Session, ctx: Ctx, order: Order, expected_total: int) -> None:
    """Freezes draft items at today's price. Also called from the payment transaction."""
    shift = shifts.require(db, ctx)
    for item in order.items:
        if item.state == DRAFT:
            product = menu.sellable(db, item.product_id)
            item.name, item.price = product.name, product.price_lbp
            item.state = CONFIRMED
    reprice(db, order)
    if not live_items(order):
        raise AppError("order_empty", 409)
    if order.total != expected_total:
        raise AppError("total_changed", 409)
    if order.state != DRAFT:
        return
    if order.type == DELIVERY:
        d = order.delivery
        missing = [k for k in ("customer", "phone", "address", "driver") if not getattr(d, k)]
        if missing:
            raise AppError("delivery_incomplete", 409, fields=missing)
    if order.type == DINE_IN:
        order.sitting_id = _sitting(db, ctx, order.table_no).id
    order.business_date = today(db)
    order.number = next_number(db, order.business_date)
    order.receipt_code = random_code(5)
    order.shift_id, order.confirmed_at = shift.id, clock.now()
    order.state = CONFIRMED


def _sitting(db: Session, ctx: Ctx, table_no: int) -> TableSitting:
    sitting = db.scalar(select(TableSitting).where(TableSitting.open_table_no == table_no))
    if not sitting:
        sitting = TableSitting(
            table_no=table_no,
            open_table_no=table_no,
            opened_at=clock.now(),
            opened_by=ctx.user_id,
        )
        db.add(sitting)
        db.flush()
    return sitting


def confirm(db: Session, ctx: Ctx, order_id: str, data: ConfirmIn) -> Order:
    """Saves a table order, or sends a delivery that will be paid later."""
    order = for_change(db, order_id, data.version, DRAFT, CONFIRMED)
    if order.type not in (DINE_IN, DELIVERY):
        raise AppError("payment_required", 409)
    confirm_items(db, ctx, order, data.expected_total)
    touch(order)
    return order


def complete(db: Session, ctx: Ctx, order: Order) -> None:
    order.state, order.completed_at, order.completed_by = COMPLETED, clock.now(), ctx.user_id
    order.completed_date = today(db)


# --- undoing ---------------------------------------------------------------


def cancel(ctx: Ctx, order_id: str, data: CancelIn) -> dict:
    with ctx.tx() as db:
        order = for_change(db, order_id, data.version, DRAFT, CONFIRMED)
        is_draft = order.state == DRAFT
        if not is_draft and not data.approval:
            raise AppError("approval_needed", 403)
    approver = None if is_draft else auth.approve(ctx, data.approval)
    with ctx.tx() as db:
        shifts.require(db, ctx)
        order = for_change(db, order_id, data.version, DRAFT if is_draft else CONFIRMED)
        if order.paid:
            raise AppError("refund_instead", 409)
        order.state = CANCELLED
        touch(order)
        if not is_draft:
            audit.record(
                db,
                ctx.user_id,
                "order_cancelled",
                order.id,
                approver,
                reason=data.approval.reason,
                total=order.total,
            )
        return view(db, order)


def void_item(ctx: Ctx, order_id: str, item_id: str, data: VoidIn) -> dict:
    approver = auth.approve(ctx, data.approval)
    with ctx.tx() as db:
        shifts.require(db, ctx)
        order = for_change(db, order_id, data.version, CONFIRMED)
        item = next((i for i in order.items if i.id == item_id and i.state == CONFIRMED), None)
        if not item or data.qty > item.qty:
            raise not_found()
        before = order.total
        if data.qty == item.qty:
            item.state = VOIDED
        else:
            item.qty -= data.qty
            db.add(
                OrderItem(
                    order_id=order.id,
                    product_id=item.product_id,
                    name=item.name,
                    price=item.price,
                    qty=data.qty,
                    note=item.note,
                    state=VOIDED,
                    position=item.position,
                )
            )
        reprice(db, order)
        if not any(i.state == CONFIRMED for i in order.items):
            raise AppError("cancel_instead", 409)
        if order.total < order.paid:
            raise AppError("below_paid", 409)
        if order.paid and order.due == 0:
            complete(db, ctx, order)
        touch(order)
        audit.record(
            db,
            ctx.user_id,
            "item_voided",
            order.id,
            approver,
            reason=data.approval.reason,
            item=item.name,
            qty=data.qty,
            before=before,
            after=order.total,
        )
        return view(db, order)


# --- finding ---------------------------------------------------------------


def lookup(ctx: Ctx, data: LookupIn) -> dict:
    key = f"lookup:{ctx.user_id}"
    throttle.check(ctx.database, key)
    with ctx.tx() as db:
        query = select(Order).where(Order.number == data.number, Order.receipt_code == data.code)
        order = db.scalar(query.order_by(Order.confirmed_at.desc()))
        if order and (ctx.is_admin or _in_current_shift(db, order)):
            found = view(db, order)
        else:
            found = None
    if not found:
        throttle.failed(ctx.database, key)
        raise not_found()
    throttle.passed(ctx.database, key)
    return found


def unpaid_deliveries(db: Session) -> list[dict]:
    query = (
        select(Order)
        .where(Order.type == DELIVERY, Order.state == CONFIRMED)
        .order_by(Order.confirmed_at)
    )
    return [view(db, o) for o in db.scalars(query)]


def driver_names(db: Session) -> list[str]:
    query = select(DeliveryDetails.driver).where(DeliveryDetails.driver != "").distinct()
    return sorted(db.scalars(query))


def admin_list(db: Session, day=None, state: str | None = None) -> list[dict]:
    names = users.names(db)
    query = select(Order).where(Order.number.is_not(None))
    if day:
        query = query.where(Order.business_date == day)
    if state == "unpaid":
        query = query.where(Order.state == CONFIRMED)
    elif state:
        query = query.where(Order.state == state)
    query = query.order_by(Order.confirmed_at.desc(), Order.number.desc()).limit(500)
    found = list(db.scalars(query))
    wish_query = (
        select(Payment.order_id, func.sum(Payment.applied_lbp))
        .where(
            Payment.method == "wish",
            Payment.kind == "payment",
            Payment.order_id.in_([o.id for o in found]),
        )
        .group_by(Payment.order_id)
    )
    wish = {order_id: amount for order_id, amount in db.execute(wish_query)}
    return [
        {
            "id": o.id,
            "number": o.number,
            "business_date": o.business_date,
            "confirmed_at": clock.iso(o.confirmed_at),
            "type": o.type,
            "table_no": o.table_no,
            "cashier": names[o.completed_by or o.created_by],
            "total": o.total,
            "paid_wish": wish.get(o.id, 0),
            "due": o.due,
            "state": o.state,
            "payment_state": payment_state(o),
        }
        for o in found
    ]
