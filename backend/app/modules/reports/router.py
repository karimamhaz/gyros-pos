from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select

from app.modules.auth.deps import AdminCtx
from app.modules.backups import service as backups
from app.modules.orders import service as orders
from app.modules.orders.models import Order
from app.modules.reports import service
from app.modules.reports.service import Filters
from app.modules.reports.sheets import XLSX

router = APIRouter(prefix="/api/reports")


def filters(
    period: Literal["day", "week", "month", "overall", "custom"] = "day",
    start: date | None = None,
    end: date | None = None,
    type: Literal["takeaway", "dine_in", "delivery"] | None = None,
    product_id: str | None = None,
    user_id: str | None = None,
) -> Filters:
    return Filters(period, start, end, type, product_id, user_id)


Query = Annotated[Filters, Depends(filters)]


@router.get("/sales")
def sales(ctx: AdminCtx, f: Query):
    with ctx.tx() as db:
        return service.sales(db, f)


@router.get("/sales/export")
def export(ctx: AdminCtx, f: Query):
    with ctx.tx() as db:
        return Response(service.export(db, f), media_type=XLSX)


@router.get("/alerts")
def alerts(ctx: AdminCtx):
    """Things the Admin should know on arrival."""
    with ctx.tx() as db:
        latest = db.scalar(select(func.max(Order.business_date)))
        return {
            "backup_failed": backups.last_failed(db),
            "clock_behind": bool(latest and latest > orders.today(db)),
        }
