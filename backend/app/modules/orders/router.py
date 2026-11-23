from datetime import date
from typing import Literal

from fastapi import APIRouter

from app.modules.auth.deps import AdminCtx, AnyCtx
from app.modules.orders import service
from app.modules.orders.schemas import (
    CancelIn,
    ConfirmIn,
    DraftIn,
    LookupIn,
    NewOrder,
    PaymentIn,
    PromoIn,
    QuoteIn,
    RefundIn,
    RefundQuoteIn,
    VoidIn,
)
from app.modules.payments import service as payments

router = APIRouter(prefix="/api/orders")


@router.post("")
def new_order(body: NewOrder, ctx: AnyCtx):
    with ctx.tx() as db:
        return service.view(db, service.create_draft(db, ctx, body.type))


@router.get("")
def list_orders(
    ctx: AdminCtx,
    day: date | None = None,
    state: Literal["unpaid", "completed", "cancelled", "refunded"] | None = None,
):
    with ctx.tx() as db:
        return service.admin_list(db, day, state)


@router.get("/drafts")
def drafts(ctx: AnyCtx):
    with ctx.tx() as db:
        return service.open_drafts(db)


@router.get("/unpaid-deliveries")
def unpaid_deliveries(ctx: AnyCtx):
    with ctx.tx() as db:
        return service.unpaid_deliveries(db)


@router.get("/drivers")
def drivers(ctx: AnyCtx):
    with ctx.tx() as db:
        return service.driver_names(db)


@router.post("/lookup")
def lookup(body: LookupIn, ctx: AnyCtx):
    return service.lookup(ctx, body)


@router.get("/{order_id}")
def read_order(order_id: str, ctx: AnyCtx):
    with ctx.tx() as db:
        return service.view(db, service.get_visible(db, ctx, order_id))


@router.put("/{order_id}")
def save_draft(order_id: str, body: DraftIn, ctx: AnyCtx):
    with ctx.tx() as db:
        return service.view(db, service.save_draft(db, ctx, order_id, body))


@router.put("/{order_id}/promo")
def set_promo(order_id: str, body: PromoIn, ctx: AnyCtx):
    with ctx.tx() as db:
        order = service.set_promo(db, ctx, order_id, body.version, body.code)
        return service.view(db, order)


@router.post("/{order_id}/confirm")
def confirm(order_id: str, body: ConfirmIn, ctx: AnyCtx):
    with ctx.tx() as db:
        return service.view(db, service.confirm(db, ctx, order_id, body))


@router.post("/{order_id}/quote")
def quote(order_id: str, body: QuoteIn, ctx: AnyCtx):
    with ctx.tx() as db:
        return payments.quote(db, service.get_visible(db, ctx, order_id), body)


@router.post("/{order_id}/payments")
def pay(order_id: str, body: PaymentIn, ctx: AnyCtx):
    with ctx.tx() as db:
        result = service.view(db, payments.pay(db, ctx, order_id, body))
    return result


@router.post("/{order_id}/cancel")
def cancel(order_id: str, body: CancelIn, ctx: AnyCtx):
    return service.cancel(ctx, order_id, body)


@router.post("/{order_id}/items/{item_id}/void")
def void_item(order_id: str, item_id: str, body: VoidIn, ctx: AnyCtx):
    return service.void_item(ctx, order_id, item_id, body)


@router.post("/{order_id}/refund-quote")
def refund_quote(order_id: str, body: RefundQuoteIn, ctx: AnyCtx):
    with ctx.tx() as db:
        return payments.refund_quote(db, ctx, order_id, body)


@router.post("/{order_id}/refund")
def refund(order_id: str, body: RefundIn, ctx: AnyCtx):
    return payments.refund(ctx, order_id, body)
