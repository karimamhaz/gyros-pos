from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.modules.inventory.models import InventoryItem, StockMovement
from app.modules.menu import service as menu
from app.modules.menu.schemas import MenuName
from app.modules.settings import service as settings

Quantity = Annotated[int, Field(ge=0, le=10_000_000)]


class ItemIn(BaseModel):
    name: MenuName
    product_id: str | None = None
    threshold: Quantity = 0


class MovementIn(BaseModel):
    kind: Literal["in", "out", "count"]
    quantity: Quantity
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = ""


def require_enabled(db: Session) -> None:
    if not settings.load(db).inventory_enabled:
        raise AppError("module_off", 409)


def items(db: Session) -> list[InventoryItem]:
    query = select(InventoryItem).where(InventoryItem.archived_at.is_(None))
    return list(db.scalars(query.order_by(InventoryItem.name)))


def status(item: InventoryItem) -> str:
    if item.quantity <= 0:
        return "out"
    return "low" if item.quantity <= item.threshold else "ok"


def as_dict(item: InventoryItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "product_id": item.product_id,
        "quantity": item.quantity,
        "threshold": item.threshold,
        "updated_at": clock.iso(item.updated_at),
        "status": status(item),
    }


def warnings(db: Session) -> dict[str, str]:
    """Per product, for the cashier screen. Information only; nothing is blocked."""
    if not settings.load(db).inventory_enabled:
        return {}
    return {i.product_id: status(i) for i in items(db) if i.product_id and status(i) != "ok"}


def _check(db: Session, data: ItemIn, except_id: str = "") -> None:
    if data.product_id:
        menu.get_product(db, data.product_id)
    for other in items(db):
        if other.id == except_id:
            continue
        if other.name == data.name or (data.product_id and other.product_id == data.product_id):
            raise AppError("stock_item_exists", 409)


def get(db: Session, item_id: str) -> InventoryItem:
    item = db.get(InventoryItem, item_id)
    if not item or item.archived_at:
        raise not_found()
    return item


def save(db: Session, data: ItemIn, item_id: str | None = None) -> InventoryItem:
    _check(db, data, item_id or "")
    item = get(db, item_id) if item_id else InventoryItem(quantity=0)
    for key, value in data.model_dump().items():
        setattr(item, key, value)
    item.updated_at = clock.now()
    db.add(item)
    db.flush()
    return item


def move(db: Session, user_id: str, item_id: str, data: MovementIn) -> InventoryItem:
    item = get(db, item_id)
    after = {
        "in": item.quantity + data.quantity,
        "out": item.quantity - data.quantity,
        "count": data.quantity,
    }[data.kind]
    if after < 0:
        raise AppError("stock_negative", 409)
    db.add(
        StockMovement(
            item_id=item.id,
            kind=data.kind,
            change=after - item.quantity,
            quantity_after=after,
            reason=data.reason,
            at=clock.now(),
            user_id=user_id,
        )
    )
    item.quantity, item.updated_at = after, clock.now()
    return item


def movements(db: Session, item_id: str) -> list[dict]:
    query = (
        select(StockMovement)
        .where(StockMovement.item_id == item_id)
        .order_by(StockMovement.at.desc())
        .limit(50)
    )
    return [
        {
            "id": m.id,
            "kind": m.kind,
            "change": m.change,
            "quantity_after": m.quantity_after,
            "reason": m.reason,
            "at": clock.iso(m.at),
        }
        for m in db.scalars(query)
    ]
