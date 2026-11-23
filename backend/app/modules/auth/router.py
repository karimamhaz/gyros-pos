from fastapi import APIRouter

from app.modules.auth import service
from app.modules.auth.deps import AdminCtx, AnyCtx, PublicDb
from app.modules.auth.schemas import (
    AdminLogin,
    CashierLogin,
    ChangePassword,
    PasswordOnly,
    Recover,
    Setup,
)
from app.modules.settings import service as settings
from app.modules.users import service as users
from app.modules.users.models import User

router = APIRouter(prefix="/api/auth")


def _login(result: tuple[str, User]) -> dict:
    token, user = result
    return {"token": token, "role": user.role, "name": user.display_name, "user_id": user.id}


@router.get("/start")
def start(database: PublicDb):
    with database.transaction() as db:
        return {"set_up": service.is_set_up(db), "language": settings.load(db).language}


@router.get("/cashiers")
def cashier_names(database: PublicDb):
    """Names for the login list: active cashiers only, never the Admin."""
    with database.transaction() as db:
        return [{"id": u.id, "name": u.display_name} for u in users.active_cashiers(db)]


@router.post("/setup")
def setup(body: Setup, database: PublicDb):
    return {"recovery_key": service.setup(database, body)}


@router.post("/login/admin")
def login_admin(body: AdminLogin, database: PublicDb):
    return _login(service.login_admin(database, body.username, body.password))


@router.post("/login/cashier")
def login_cashier(body: CashierLogin, database: PublicDb):
    return _login(service.login_cashier(database, body.user_id, body.password))


@router.post("/recover")
def recover(body: Recover, database: PublicDb):
    username, key = service.recover(database, body)
    return {"username": username, "recovery_key": key}


@router.post("/logout")
def logout(body: PasswordOnly, ctx: AnyCtx):
    service.logout(ctx, body.password)
    return {}


@router.put("/password")
def change_password(body: ChangePassword, ctx: AdminCtx):
    service.change_password(ctx, body)
    return {}


@router.post("/quick-admin")
def open_quick_admin(body: PasswordOnly, ctx: AnyCtx):
    return {"seconds": service.open_quick_admin(ctx, body.password)}


@router.delete("/quick-admin")
def close_quick_admin(ctx: AnyCtx):
    service.close_quick_admin(ctx)
    return {}
