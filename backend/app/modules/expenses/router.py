from datetime import date

from fastapi import APIRouter, Response

from app.modules.auth.deps import AdminCtx
from app.modules.expenses import service
from app.modules.expenses.service import ExpenseIn
from app.modules.reports.sheets import XLSX, workbook

router = APIRouter(prefix="/api/expenses")


@router.get("")
def list_expenses(ctx: AdminCtx, start: date | None = None, end: date | None = None):
    with ctx.tx() as db:
        service.require_enabled(db)
        return {
            "entries": service.entries(db, start, end),
            "total": service.total(db, start, end)[1],
            "categories": service.categories(db),
        }


@router.get("/export")
def export_expenses(ctx: AdminCtx, start: date | None = None, end: date | None = None):
    with ctx.tx() as db:
        service.require_enabled(db)
        rows = [
            [e["day"], e["kind"], e["category"], e["description"], e["currency"], e["value_lbp"]]
            for e in service.entries(db, start, end)
        ]
    head = ["Date", "Kind", "Category", "Description", "Currency", "Value LBP"]
    return Response(workbook({"Expenses": [head, *rows]}), media_type=XLSX)


@router.post("")
def add_expense(body: ExpenseIn, ctx: AdminCtx):
    with ctx.tx() as db:
        service.require_enabled(db)
        service.add(db, ctx.user_id, body)
    return {}


@router.delete("/{expense_id}")
def delete_expense(expense_id: str, ctx: AdminCtx):
    with ctx.tx() as db:
        service.require_enabled(db)
        service.delete(db, ctx.user_id, expense_id)
    return {}
