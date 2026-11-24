import hashlib

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError
from app.core.money import Change, change_for, lbp_to_usd_cents, settles, usd_cents_to_lbp
from app.modules.audit import service as audit
from app.modules.auth import service as auth
from app.modules.auth.deps import Ctx
from app.modules.orders import service as orders
from app.modules.orders.models import (
    COMPLETED,
    CONFIRMED,
    DRAFT,
    REFUNDED,
    TAKEAWAY,
    Order,
)
from app.modules.orders.schemas import PaymentIn, QuoteIn, RefundIn, RefundQuoteIn
from app.modules.payments.models import Payment, PaymentLine
from app.modules.promos import service as promos
from app.modules.settings import service as settings
from app.modules.shifts import service as shifts


def _hash(order_id: str, kind: str, data: BaseModel) -> str:
    # The Admin password is not part of what was paid.
    body = data.model_dump_json(exclude={"approval"})
    return hashlib.sha256(f"{order_id}:{kind}:{body}".encode()).hexdigest()


def _already_done(db: Session, key: str, request_hash: str) -> Payment | None:
    payment = db.scalar(select(Payment).where(Payment.idempotency_key == key))
    if payment and payment.request_hash != request_hash:
        raise AppError("payment_key_reused", 409)
    return payment


def _change(overpaid: int, usd_cents: int, rate: int) -> Change:
    try:
        return change_for(overpaid, usd_cents, rate)
    except ValueError:
        raise AppError("change_too_much", 409) from None


def quote(db: Session, order: Order, data: QuoteIn) -> dict:
    """What the payment screen shows while the cashier types. Writes nothing."""
    rate = settings.require_rate(db)
    received = usd_cents_to_lbp(data.usd_cents, rate) + data.lbp
    over = max(0, received - order.due)
    left = max(0, order.due - received)
    settled = (received > 0 or order.due == 0) and settles(order.total, left)
    most_usd = over * 100 // rate // 100 * 100
    while usd_cents_to_lbp(most_usd, rate) > over:
        most_usd -= 100
    change = _change(over, min(data.change_usd_cents, _most_cents(over, rate)), rate)
    return {
        "rate": rate,
        "due": order.due,
        "due_usd_cents": lbp_to_usd_cents(order.due, rate),
        "received": received,
        "left": left,
        "left_usd_cents": lbp_to_usd_cents(left, rate),
        "settled": settled,
        "shortfall": left if settled else 0,
        "partial_allowed": order.type != TAKEAWAY and received > 0,
        "overpaid": over,
        "change_usd_cents": change.usd_cents,
        "change_lbp": change.lbp,
        "change_rounding": change.rounding,
        "most_usd_cents": most_usd,
    }


def _most_cents(over: int, rate: int) -> int:
    cents = over * 100 // rate
    while usd_cents_to_lbp(cents, rate) > over:
        cents -= 1
    return cents


def _lines(payment: Payment, amounts: list[tuple[str, str, int]]) -> list[PaymentLine]:
    return [
        PaymentLine(payment_id=payment.id, currency=c, direction=d, amount=a)
        for c, d, a in amounts
        if a
    ]


def pay(db: Session, ctx: Ctx, order_id: str, data: PaymentIn) -> Order:
    """The whole payment in one transaction; the caller commits before answering."""
    request_hash = _hash(order_id, "payment", data)
    done = _already_done(db, data.idempotency_key, request_hash)
    if done:
        return orders.get(db, order_id)

    shift = shifts.require(db, ctx)
    rate = settings.require_rate(db)
    order = orders.for_change(db, order_id, data.version, DRAFT, CONFIRMED)
    orders.confirm_items(db, ctx, order, data.expected_due + order.paid)

    due = order.due
    if data.method == "wish":
        # Settles exactly what is left: a transfer has no change and no small balance.
        if due == 0:
            raise AppError("nothing_to_pay", 409)
        received, left, change, settled = due, 0, Change(0, 0, 0), True
    else:
        received = usd_cents_to_lbp(data.usd_cents, rate) + data.lbp
        if received == 0 and due > 0:
            raise AppError("nothing_received", 409)
        over, left = max(0, received - due), max(0, due - received)
        change = _change(over, data.change_usd_cents, rate)
        if change.lbp != data.change_lbp:
            raise AppError("change_wrong", 409)
        settled = settles(order.total, left)
        if not settled and order.type == TAKEAWAY:
            raise AppError("not_enough", 409)
    if order.promo_id:
        promos.redeem(
            db,
            order.promo_id,
            order.id,
            order.promo_percent,
            order.discount,
            orders.today(db),
        )

    payment = Payment(
        order_id=order.id,
        kind="payment",
        method=data.method,
        idempotency_key=data.idempotency_key,
        request_hash=request_hash,
        rate=rate,
        applied_lbp=min(received, due),
        change_rounding=change.rounding,
        shortfall=left if settled else 0,
        user_id=ctx.user_id,
        shift_id=shift.id,
        paid_at=clock.now(),
        business_date=orders.today(db),
    )
    db.add(payment)
    db.flush()
    db.add_all(  # a Wish payment has no cash lines
        _lines(
            payment,
            [
                ("USD", "in", data.usd_cents),
                ("LBP", "in", data.lbp),
                ("USD", "out", change.usd_cents),
                ("LBP", "out", change.lbp),
            ],
        )
    )
    order.paid += payment.applied_lbp
    if settled:
        order.shortfall = payment.shortfall
        orders.complete(db, ctx, order)
    orders.touch(order)
    db.flush()
    return order


def _refundable(db: Session, ctx: Ctx, order_id: str, code: str) -> Order:
    order = orders.get_visible(db, ctx, order_id, code)
    if order.state != COMPLETED and not (order.state == CONFIRMED and order.paid):
        raise AppError("nothing_to_refund", 409)
    return order


def refund_quote(db: Session, ctx: Ctx, order_id: str, data: RefundQuoteIn) -> dict:
    order = _refundable(db, ctx, order_id, data.code)
    rate = settings.require_rate(db)
    wish = orders.paid_by_wish(db, order.id)
    cash = order.paid - wish  # only this part comes out of the drawer
    out = _change(cash, data.usd_cents, rate)
    most = cash * 100 // rate // 100 * 100
    while usd_cents_to_lbp(most, rate) > cash:
        most -= 100
    return {
        "amount": cash,
        "wish": wish,
        "usd_cents": out.usd_cents,
        "lbp": out.lbp,
        "rounding": out.rounding,
        "most_usd_cents": most,
    }


def refund(ctx: Ctx, order_id: str, data: RefundIn) -> dict:
    request_hash = _hash(order_id, "refund", data)
    with ctx.tx() as db:
        if _already_done(db, data.idempotency_key, request_hash):
            return orders.view(db, orders.get(db, order_id))
    approver = auth.approve(ctx, data.approval)
    with ctx.tx() as db:
        if _already_done(db, data.idempotency_key, request_hash):
            return orders.view(db, orders.get(db, order_id))
        shift = shifts.require(db, ctx)
        rate = settings.require_rate(db)
        order = _refundable(db, ctx, order_id, data.code)
        wish = orders.paid_by_wish(db, order.id)
        cash = order.paid - wish
        out = _change(cash, data.usd_cents, rate)
        if out.lbp != data.lbp:
            raise AppError("change_wrong", 409)
        # The cash part comes out of the drawer; the Wish part is paid back outside the app.
        parts = [(m, a) for m, a in (("cash", cash), ("wish", wish)) if a]
        for index, (method, amount) in enumerate(parts):
            payment = Payment(
                order_id=order.id,
                kind="refund",
                method=method,
                idempotency_key=data.idempotency_key
                if index == 0
                else f"{data.idempotency_key}:wish",
                request_hash=request_hash,
                rate=rate,
                applied_lbp=amount,
                change_rounding=out.rounding if method == "cash" else 0,
                shortfall=0,
                user_id=ctx.user_id,
                shift_id=shift.id,
                paid_at=clock.now(),
                business_date=orders.today(db),
            )
            db.add(payment)
            db.flush()
            if method == "cash":
                db.add_all(
                    _lines(payment, [("USD", "out", out.usd_cents), ("LBP", "out", out.lbp)])
                )
        order.state, order.refunded_at = REFUNDED, clock.now()
        order.refunded_date = orders.today(db)
        orders.touch(order)
        audit.record(
            db,
            ctx.user_id,
            "order_refunded",
            order.id,
            approver,
            reason=data.approval.reason,
            amount=order.paid,
            wish=wish,
        )
        db.flush()
        return orders.view(db, order)
