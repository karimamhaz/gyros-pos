from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.core.money import lbp_to_usd_cents
from app.modules.orders.models import CONFIRMED, DELIVERY, DRAFT, Order
from app.modules.payments.models import Payment
from app.modules.printing.models import FAILED, PENDING, PRINTED, PRINTING, UNKNOWN, PrintJob
from app.modules.settings import service as settings
from app.modules.users import service as users

RECEIPT, BILL, TEST = "receipt", "bill", "test"


def _shop(db: Session) -> dict:
    s = settings.load(db)
    return {
        "name": s.receipt_name,
        "phone": s.receipt_phone,
        "address": s.receipt_address,
        "footer": s.receipt_footer,
    }


def receipt(db: Session, order: Order) -> dict:
    payments = list(
        db.scalars(
            select(Payment)
            .where(Payment.order_id == order.id, Payment.kind == "payment")
            .order_by(Payment.paid_at)
        )
    )
    cash = {("USD", "in"): 0, ("LBP", "in"): 0, ("USD", "out"): 0, ("LBP", "out"): 0}
    for line in (line for p in payments for line in p.lines):
        cash[line.currency, line.direction] += line.amount
    rate = payments[-1].rate if payments else settings.require_rate(db)
    d = order.delivery
    refunded = order.refunded_at is not None
    status = "refunded" if refunded else "unpaid"
    if not refunded and order.completed_at:
        status = "paid"
    elif not refunded and order.paid:
        status = "partial"
    return {
        "shop": _shop(db),
        "status": status,
        "type": order.type,
        "table_no": order.table_no,
        "number": order.number,
        "code": order.receipt_code,
        "time": clock.iso(order.completed_at or order.confirmed_at),
        "cashier": users.names(db)[order.completed_by or order.created_by],
        "items": [
            {"name": i.name, "qty": i.qty, "note": i.note, "total": i.price * i.qty}
            for i in order.items
            if i.state == "confirmed"
        ],
        "delivery_fee": order.delivery_fee if order.type == DELIVERY else 0,
        "promo": order.promo_code and {"code": order.promo_code, "percent": order.promo_percent},
        "discount": order.discount,
        "rounding": order.rounding,
        "total": order.total,
        "total_usd_cents": lbp_to_usd_cents(order.total, rate),
        "paid": order.paid,
        "due": order.due,
        "rate": rate,
        "received": {"usd_cents": cash["USD", "in"], "lbp": cash["LBP", "in"]},
        "change": {"usd_cents": cash["USD", "out"], "lbp": cash["LBP", "out"]},
        "delivery": d
        and order.type == DELIVERY
        and {
            "customer": d.customer,
            "phone": d.phone,
            "address": d.address,
            "driver": d.driver,
            "requested_time": d.requested_time,
            "promised_time": d.promised_time,
        }
        or None,
    }


def _add(db: Session, order: Order | None, kind: str, payload: dict, copy=False) -> PrintJob:
    job = PrintJob(
        order_id=order and order.id,
        kind=kind,
        copy=copy,
        payload=payload,
        created_at=clock.now(),
    )
    db.add(job)
    db.flush()
    return job


def _jobs(db: Session, order: Order, kind: str) -> list[PrintJob]:
    query = select(PrintJob).where(PrintJob.order_id == order.id, PrintJob.kind == kind)
    return list(db.scalars(query.order_by(PrintJob.created_at)))


def receipt_once(db: Session, order: Order) -> None:
    """The one automatic receipt. A delivery that already left with its receipt gets no second."""
    if not _jobs(db, order, RECEIPT):
        db.flush()
        _add(db, order, RECEIPT, receipt(db, order))


def automatic_job(db: Session, order: Order) -> str | None:
    """The receipt still waiting to be printed for this order."""
    waiting = [j for j in _jobs(db, order, RECEIPT) if j.state == PENDING and not j.copy]
    return waiting[0].id if waiting else None


def bill(db: Session, order: Order) -> PrintJob:
    if order.state != CONFIRMED:
        raise AppError("order_closed", 409)
    if any(i.state == DRAFT for i in order.items):
        raise AppError("table_has_unsaved", 409)
    return _add(db, order, BILL, receipt(db, order))


def reprint(db: Session, order: Order) -> PrintJob:
    """Marked as a copy once any receipt of the order may already exist on paper."""
    if order.number is None:
        raise not_found()
    existing = _jobs(db, order, RECEIPT)
    copy = any(j.state in (PRINTED, PRINTING, UNKNOWN) for j in existing)
    waiting = [j for j in existing if j.state in (PENDING, FAILED) and not j.copy]
    if not copy and waiting:
        return waiting[0]
    return _add(db, order, RECEIPT, receipt(db, order), copy)


def test_page(db: Session) -> PrintJob:
    rate = settings.current_rate(db) or 89500
    payload = {
        "shop": _shop(db),
        "status": "paid",
        "type": "takeaway",
        "table_no": None,
        "number": 1,
        "code": "TEST2",
        "time": clock.iso(clock.now()),
        "cashier": "تجربة",
        "items": [
            {"name": "شاورما لحمة كبير", "qty": 2, "note": "بدون بصل", "total": 1000000},
            {"name": "مشروبات غازية", "qty": 1, "note": "", "total": 100000},
        ],
        "delivery_fee": 0,
        "promo": None,
        "discount": 0,
        "rounding": 0,
        "total": 1100000,
        "total_usd_cents": lbp_to_usd_cents(1100000, rate),
        "paid": 1100000,
        "due": 0,
        "rate": rate,
        "received": {"usd_cents": 0, "lbp": 1100000},
        "change": {"usd_cents": 0, "lbp": 0},
        "delivery": None,
    }
    return _add(db, None, TEST, payload)


def get(db: Session, job_id: str) -> PrintJob:
    job = db.get(PrintJob, job_id)
    if not job:
        raise not_found()
    return job


def claim(db: Session, job_id: str) -> dict:
    """Hands out the paper once; a second claim is refused until the first has a result."""
    job = get(db, job_id)
    if job.state not in (PENDING, FAILED):
        raise AppError("already_printing", 409)
    job.state, job.attempts, job.error = PRINTING, job.attempts + 1, None
    return {"kind": job.kind, "copy": job.copy, "payload": job.payload}


def result(db: Session, job_id: str, ok: bool, error: str) -> None:
    job = get(db, job_id)
    if job.state == PRINTING:
        job.state, job.error = (PRINTED, None) if ok else (FAILED, error[:200])


def resolve(db: Session, job_id: str, printed: bool) -> None:
    """The person looked at the paper after an interrupted print."""
    job = get(db, job_id)
    if job.state != UNKNOWN:
        raise AppError("already_printing", 409)
    job.state = PRINTED if printed else FAILED


def interrupted(db: Session) -> None:
    db.execute(update(PrintJob).where(PrintJob.state == PRINTING).values(state=UNKNOWN))


def problems(db: Session) -> list[dict]:
    query = (
        select(PrintJob, Order.number)
        .outerjoin(Order, Order.id == PrintJob.order_id)
        .where(PrintJob.state.in_((PENDING, FAILED, UNKNOWN)))
        .order_by(PrintJob.created_at.desc())
        .limit(50)
    )
    return [
        {
            "id": job.id,
            "number": number,
            "kind": job.kind,
            "copy": job.copy,
            "state": job.state,
            "error": job.error,
            "created_at": clock.iso(job.created_at),
        }
        for job, number in db.execute(query)
    ]


def dismiss(db: Session, job_id: str) -> None:
    """The cashier chose to go on without paper."""
    job = get(db, job_id)
    if job.state in (PENDING, FAILED):
        job.state, job.error = PRINTED, "skipped"
