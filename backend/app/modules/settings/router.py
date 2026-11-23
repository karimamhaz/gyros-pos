from fastapi import APIRouter

from app.modules.auth.deps import AdminCtx, AnyCtx, QuickCtx
from app.modules.settings import service
from app.modules.settings.schemas import AppSettings, RateIn
from app.modules.tables import service as tables

router = APIRouter(prefix="/api/settings")


@router.get("")
def read_settings(ctx: AnyCtx):
    """Nothing here reveals sales, so cashiers may read it too."""
    with ctx.tx() as db:
        return service.load(db).model_dump() | {"rate": service.current_rate(db)}


@router.put("")
def save_settings(body: AppSettings, ctx: AdminCtx):
    with ctx.tx() as db:
        tables.check_count(db, body.table_count)
        return service.save(db, ctx.user_id, body)


@router.put("/rate")
def set_rate(body: RateIn, ctx: QuickCtx):
    with ctx.tx() as db:
        service.set_rate(db, ctx.admin_id, body.rate)
    return {"rate": body.rate}
