from dataclasses import asdict
from typing import Literal

from fastapi import APIRouter, Response

from app.modules.auth.deps import AdminCtx, AnyCtx, QuickCtx
from app.modules.inventory import service as inventory
from app.modules.menu import service, transfer
from app.modules.menu.models import Product
from app.modules.menu.schemas import (
    AvailabilityIn,
    CategoryIn,
    ImportApply,
    ImportFile,
    OrderIn,
    ProductIn,
)

router = APIRouter(prefix="/api/menu")
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _product(p: Product) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "category_id": p.category_id,
        "price_lbp": p.price_lbp,
        "available": p.available,
    }


@router.get("")
def selling_menu(ctx: AnyCtx):
    """What can be sold now, grouped the way the screen shows it."""
    with ctx.tx() as db:
        stock = inventory.warnings(db)
        groups = [{"id": c.id, "name": c.name, "products": []} for c in service.categories(db)]
        by_id = {g["id"]: g for g in groups}
        for p in service.products(db):
            if p.available:
                by_id[p.category_id]["products"].append(
                    _product(p) | {"stock": stock.get(p.id, "ok")}
                )
        return [g for g in groups if g["products"]]


@router.get("/all")
def full_menu(ctx: QuickCtx):
    with ctx.tx() as db:
        return {
            "categories": [{"id": c.id, "name": c.name} for c in service.categories(db)],
            "products": [_product(p) for p in service.products(db)],
        }


@router.post("/categories")
def add_category(body: CategoryIn, ctx: AdminCtx):
    with ctx.tx() as db:
        category = service.add_category(db, ctx.user_id, body.name)
        return {"id": category.id, "name": category.name}


@router.put("/categories/order")
def order_categories(body: OrderIn, ctx: AdminCtx):
    with ctx.tx() as db:
        service.order_categories(db, body.ids)
    return {}


@router.put("/categories/{category_id}")
def rename_category(category_id: str, body: CategoryIn, ctx: AdminCtx):
    with ctx.tx() as db:
        category = service.rename_category(db, ctx.user_id, category_id, body.name)
        return {"id": category.id, "name": category.name}


@router.delete("/categories/{category_id}")
def delete_category(category_id: str, ctx: AdminCtx):
    with ctx.tx() as db:
        service.archive_category(db, ctx.user_id, category_id)
    return {}


@router.post("/products")
def add_product(body: ProductIn, ctx: AdminCtx):
    with ctx.tx() as db:
        return _product(service.add_product(db, ctx.user_id, body))


@router.put("/products/{product_id}")
def update_product(product_id: str, body: ProductIn, ctx: AdminCtx):
    with ctx.tx() as db:
        return _product(service.update_product(db, ctx.user_id, product_id, body))


@router.put("/products/{product_id}/available")
def set_available(product_id: str, body: AvailabilityIn, ctx: QuickCtx):
    with ctx.tx() as db:
        product = service.set_available(db, ctx.user_id, ctx.admin_id, product_id, body.available)
        return _product(product)


@router.delete("/products/{product_id}")
def delete_product(product_id: str, ctx: AdminCtx):
    with ctx.tx() as db:
        service.archive_product(db, ctx.user_id, product_id)
    return {}


@router.post("/import/preview")
def preview_import(body: ImportFile, ctx: AdminCtx):
    with ctx.tx() as db:
        rows = transfer.analyse(db, body)
        return {"menu_version": transfer.menu_version(db), "rows": [asdict(r) for r in rows]}


@router.post("/import/apply")
def apply_import(body: ImportApply, ctx: AdminCtx):
    with ctx.tx() as db:
        return transfer.apply(db, ctx.user_id, body)


@router.get("/export/{kind}")
def export_menu(kind: Literal["csv", "xlsx"], ctx: AdminCtx):
    with ctx.tx() as db:
        if kind == "csv":
            return Response(transfer.export_csv(db), media_type="text/csv")
        return Response(transfer.export_xlsx(db), media_type=XLSX)
