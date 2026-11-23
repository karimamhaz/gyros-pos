from fastapi import APIRouter

from app.core import clock
from app.modules.auth.deps import AdminCtx, AnyCtx
from app.modules.settings import service as settings
from app.modules.shifts import service
from app.modules.shifts.schemas import CloseAbandoned, CloseShift, OpenShift
from app.modules.users import service as users

router = APIRouter(prefix="/api/shifts")


@router.get("/current")
def current_shift(ctx: AnyCtx):
    """No amounts here: the cashier counts without seeing what is expected."""
    with ctx.tx() as db:
        shift = service.current(db)
        return {
            "open": shift is not None,
            "mine": bool(shift and shift.user_id == ctx.user_id),
            "cashier": shift and users.names(db)[shift.user_id],
            "opened_at": shift and clock.iso(shift.opened_at),
            "count_mode": shift.count_mode if shift else settings.load(db).count_mode,
        }


@router.post("/open")
def open_shift(body: OpenShift, ctx: AnyCtx):
    service.open_shift(ctx, body.count)
    return {}


@router.post("/close")
def close_shift(body: CloseShift, ctx: AnyCtx):
    return {"reference": service.close_own(ctx, body)}


@router.post("/close-abandoned")
def close_abandoned(body: CloseAbandoned, ctx: AdminCtx):
    return {"reference": service.close_abandoned(ctx, body)}


@router.get("")
def shift_history(ctx: AdminCtx, reference: str | None = None):
    with ctx.tx() as db:
        return service.history(db, reference)


@router.get("/{shift_id}")
def review_shift(shift_id: str, ctx: AdminCtx):
    with ctx.tx() as db:
        return service.review(db, shift_id)
