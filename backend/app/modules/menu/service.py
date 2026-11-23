from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core import clock
from app.core.errors import AppError, not_found
from app.modules.audit import service as audit
from app.modules.menu.models import Category, Product
from app.modules.menu.schemas import ProductIn
from app.modules.menu.text import normalise


def categories(db: Session) -> list[Category]:
    query = select(Category).where(Category.archived_at.is_(None)).order_by(Category.position)
    return list(db.scalars(query))


def products(db: Session) -> list[Product]:
    query = (
        select(Product)
        .join(Product.category)
        .options(joinedload(Product.category))
        .where(Product.archived_at.is_(None))
        .order_by(Category.position, Product.position)
    )
    return list(db.scalars(query))


def get_category(db: Session, category_id: str) -> Category:
    category = db.get(Category, category_id)
    if not category or category.archived_at:
        raise not_found()
    return category


def get_product(db: Session, product_id: str) -> Product:
    product = db.get(Product, product_id)
    if not product or product.archived_at:
        raise not_found()
    return product


def sellable(db: Session, product_id: str) -> Product:
    product = db.get(Product, product_id)
    if not product or product.archived_at or not product.available:
        raise AppError("product_unavailable", 409, name=product.name if product else "")
    return product


def _unique_category(db: Session, name: str, except_id: str | None = None) -> None:
    if any(normalise(c.name) == normalise(name) and c.id != except_id for c in categories(db)):
        raise AppError("category_exists", 409)


def _unique_product(db: Session, name: str, except_id: str | None = None) -> None:
    if any(normalise(p.name) == normalise(name) and p.id != except_id for p in products(db)):
        raise AppError("product_exists", 409)


def _next(db: Session, model) -> int:
    return (db.scalar(select(func.max(model.position))) or 0) + 1


def add_category(db: Session, actor_id: str, name: str) -> Category:
    _unique_category(db, name)
    category = Category(name=name, position=_next(db, Category))
    db.add(category)
    db.flush()
    audit.record(db, actor_id, "category_added", category.id, name=name)
    return category


def rename_category(db: Session, actor_id: str, category_id: str, name: str) -> Category:
    category = get_category(db, category_id)
    _unique_category(db, name, category_id)
    audit.record(db, actor_id, "category_renamed", category_id, before=category.name, after=name)
    category.name = name
    return category


def order_categories(db: Session, ids: list[str]) -> None:
    current = categories(db)
    if sorted(ids) != sorted(c.id for c in current):
        raise AppError("menu_changed", 409)
    for category in current:
        category.position = ids.index(category.id) + 1


def archive_category(db: Session, actor_id: str, category_id: str) -> None:
    category = get_category(db, category_id)
    if any(p.category_id == category_id for p in products(db)):
        raise AppError("category_not_empty", 409)
    category.archived_at = clock.now()
    audit.record(db, actor_id, "category_deleted", category_id, name=category.name)


def add_product(db: Session, actor_id: str, data: ProductIn) -> Product:
    get_category(db, data.category_id)
    _unique_product(db, data.name)
    product = Product(**data.model_dump(), position=_next(db, Product))
    db.add(product)
    db.flush()
    audit.record(db, actor_id, "product_added", product.id, **data.model_dump())
    return product


def update_product(db: Session, actor_id: str, product_id: str, data: ProductIn) -> Product:
    product = get_product(db, product_id)
    get_category(db, data.category_id)
    _unique_product(db, data.name, product_id)
    after = data.model_dump()
    before = {k: getattr(product, k) for k in after}
    for key, value in after.items():
        setattr(product, key, value)
    if before != after:
        audit.record(db, actor_id, "product_changed", product_id, before=before, after=after)
    return product


def set_available(
    db: Session, actor_id: str, approver_id: str, product_id: str, available: bool
) -> Product:
    product = get_product(db, product_id)
    if product.available != available:
        product.available = available
        audit.record(
            db, actor_id, "product_availability", product_id, approver_id, available=available
        )
    return product


def archive_product(db: Session, actor_id: str, product_id: str) -> None:
    product = get_product(db, product_id)
    product.archived_at = clock.now()
    audit.record(db, actor_id, "product_deleted", product_id, name=product.name)
