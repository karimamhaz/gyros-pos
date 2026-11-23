from fastapi import APIRouter

from app.modules.auth.deps import AdminCtx
from app.modules.users import service
from app.modules.users.models import User
from app.modules.users.schemas import CashierUpdate, NewCashier, NewPassword

router = APIRouter(prefix="/api/cashiers")


def _out(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "active": user.active,
    }


@router.get("")
def list_cashiers(ctx: AdminCtx):
    with ctx.tx() as db:
        return [_out(u) for u in service.all_cashiers(db)]


@router.post("")
def add_cashier(body: NewCashier, ctx: AdminCtx):
    with ctx.tx() as db:
        return _out(service.add_cashier(db, ctx.user_id, body))


@router.put("/{user_id}")
def update_cashier(user_id: str, body: CashierUpdate, ctx: AdminCtx):
    with ctx.tx() as db:
        return _out(service.update_cashier(db, ctx.user_id, user_id, body))


@router.put("/{user_id}/password")
def set_password(user_id: str, body: NewPassword, ctx: AdminCtx):
    with ctx.tx() as db:
        service.set_cashier_password(db, ctx.user_id, user_id, body.password)
    return {}
