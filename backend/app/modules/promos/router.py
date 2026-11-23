from fastapi import APIRouter

from app.modules.auth.deps import AdminCtx
from app.modules.promos import service
from app.modules.promos.schemas import PromoIn

router = APIRouter(prefix="/api/promos")


@router.get("")
def list_promos(ctx: AdminCtx):
    with ctx.tx() as db:
        return service.all_promos(db)


@router.post("")
def add_promo(body: PromoIn, ctx: AdminCtx):
    with ctx.tx() as db:
        return service.as_dict(db, service.save(db, ctx.user_id, body))


@router.put("/{promo_id}")
def change_promo(promo_id: str, body: PromoIn, ctx: AdminCtx):
    with ctx.tx() as db:
        return service.as_dict(db, service.save(db, ctx.user_id, body, promo_id))
