from fastapi import APIRouter
from pydantic import BaseModel

from app.modules.auth.deps import AnyCtx
from app.modules.auth.schemas import Approval
from app.modules.orders import service as orders
from app.modules.tables import service

router = APIRouter(prefix="/api/tables")


class CloseTable(BaseModel):
    approval: Approval | None = None


@router.get("")
def tables(ctx: AnyCtx):
    with ctx.tx() as db:
        return service.overview(db)


@router.post("/{table_no}/order")
def table_order(table_no: int, ctx: AnyCtx):
    with ctx.tx() as db:
        return orders.view(db, service.order_for(db, ctx, table_no))


@router.post("/{table_no}/close")
def close_table(table_no: int, body: CloseTable, ctx: AnyCtx):
    service.close(ctx, table_no, body.approval)
    return {}
