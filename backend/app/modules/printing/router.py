from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.modules.auth.deps import AdminCtx, AnyCtx
from app.modules.orders import service as orders
from app.modules.orders.schemas import CodeIn
from app.modules.printing import service

router = APIRouter(prefix="/api/print")


class Result(BaseModel):
    ok: bool
    error: str = Field("", max_length=500)


class Resolve(BaseModel):
    printed: bool


@router.get("/problems")
def problems(ctx: AnyCtx):
    with ctx.tx() as db:
        return service.problems(db)


@router.post("/test")
def test_page(ctx: AdminCtx):
    with ctx.tx() as db:
        return {"job": service.test_page(db).id}


@router.post("/orders/{order_id}/bill")
def bill(order_id: str, ctx: AnyCtx):
    with ctx.tx() as db:
        return {"job": service.bill(db, orders.get_visible(db, ctx, order_id)).id}


@router.post("/orders/{order_id}/reprint")
def reprint(order_id: str, body: CodeIn, ctx: AnyCtx):
    with ctx.tx() as db:
        order = orders.get_visible(db, ctx, order_id, body.code)
        return {"job": service.reprint(db, order).id}


@router.post("/jobs/{job_id}/claim")
def claim(job_id: str, ctx: AnyCtx):
    with ctx.tx() as db:
        return service.claim(db, job_id)


@router.post("/jobs/{job_id}/result")
def result(job_id: str, body: Result, ctx: AnyCtx):
    with ctx.tx() as db:
        service.result(db, job_id, body.ok, body.error)
    return {}


@router.post("/jobs/{job_id}/resolve")
def resolve(job_id: str, body: Resolve, ctx: AnyCtx):
    with ctx.tx() as db:
        service.resolve(db, job_id, body.printed)
    return {}


@router.post("/jobs/{job_id}/dismiss")
def dismiss(job_id: str, ctx: AnyCtx):
    with ctx.tx() as db:
        service.dismiss(db, job_id)
    return {}
