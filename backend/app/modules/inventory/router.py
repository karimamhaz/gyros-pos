from fastapi import APIRouter

from app.core import clock
from app.modules.auth.deps import AdminCtx
from app.modules.inventory import service
from app.modules.inventory.service import ItemIn, MovementIn

router = APIRouter(prefix="/api/inventory")


@router.get("")
def list_items(ctx: AdminCtx):
    with ctx.tx() as db:
        service.require_enabled(db)
        return [service.as_dict(i) for i in service.items(db)]


@router.post("")
def add_item(body: ItemIn, ctx: AdminCtx):
    with ctx.tx() as db:
        service.require_enabled(db)
        return service.as_dict(service.save(db, body))


@router.put("/{item_id}")
def change_item(item_id: str, body: ItemIn, ctx: AdminCtx):
    with ctx.tx() as db:
        service.require_enabled(db)
        return service.as_dict(service.save(db, body, item_id))


@router.delete("/{item_id}")
def archive_item(item_id: str, ctx: AdminCtx):
    with ctx.tx() as db:
        service.require_enabled(db)
        service.get(db, item_id).archived_at = clock.now()
    return {}


@router.post("/{item_id}/movements")
def move(item_id: str, body: MovementIn, ctx: AdminCtx):
    with ctx.tx() as db:
        service.require_enabled(db)
        return service.as_dict(service.move(db, ctx.user_id, item_id, body))


@router.get("/{item_id}/movements")
def movements(item_id: str, ctx: AdminCtx):
    with ctx.tx() as db:
        service.require_enabled(db)
        return service.movements(db, item_id)
