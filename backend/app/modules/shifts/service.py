from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.core.security import random_code
from app.modules.audit import service as audit
from app.modules.auth import service as auth
from app.modules.auth import throttle
from app.modules.auth.deps import Ctx
from app.modules.auth.models import LoginSession
from app.modules.backups import service as backups
from app.modules.payments.models import Payment, PaymentLine
from app.modules.settings import service as settings
from app.modules.shifts.models import Shift, ShiftClosing
from app.modules.shifts.schemas import CloseAbandoned, CloseShift, Count
from app.modules.users import service as users
from app.modules.users.models import User


def current(db: Session) -> Shift | None:
    return db.scalar(select(Shift).where(Shift.open_slot == 1))


def require(db: Session, ctx: Ctx) -> Shift:
    shift = current(db)
    if not shift or shift.user_id != ctx.user_id:
        raise AppError("shift_needed", 409)
    return shift


def _counted(mode: str, count: Count) -> tuple[int, int, dict | None]:
    if mode != "banknotes":
        return count.usd_cents, count.lbp, None
    if count.notes is None:
        raise AppError("count_banknotes")
    usd = sum(int(note) * 100 * n for note, n in count.notes.usd.items())
    lbp = sum(int(note) * n for note, n in count.notes.lbp.items())
    return usd, lbp, count.notes.model_dump()


def open_shift(ctx: Ctx, count: Count) -> Shift:
    with ctx.tx() as db:
        if current(db):
            raise AppError("shift_already_open", 409)
        config = settings.load(db)
        if config.count_mode == "closing_only":
            usd, lbp, notes = config.fixed_opening_usd, config.fixed_opening_lbp, None
        else:
            usd, lbp, notes = _counted(config.count_mode, count)
        shift = Shift(
            user_id=ctx.user_id,
            open_slot=1,
            count_mode=config.count_mode,
            opening_usd_cents=usd,
            opening_lbp=lbp,
            opening_notes=notes,
            opened_at=clock.now(),
            business_date=clock.business_date(config.day_cutoff_minutes),
        )
        db.add(shift)
        db.flush()
        audit.record(db, ctx.user_id, "shift_opened", shift.id)
        return shift


def movements(db: Session, shift_id: str) -> dict[tuple[str, str], int]:
    """Cash per (currency, direction). Expenses are never part of this."""
    query = (
        select(PaymentLine.currency, PaymentLine.direction, func.sum(PaymentLine.amount))
        .join(Payment, Payment.id == PaymentLine.payment_id)
        .where(Payment.shift_id == shift_id)
        .group_by(PaymentLine.currency, PaymentLine.direction)
    )
    return {(c, d): total for c, d, total in db.execute(query)}


def wish_total(db: Session, shift_id: str) -> int:
    """Paid by Wish during the shift, less refunds. Shown to Admin, never counted as cash."""
    query = (
        select(Payment.kind, func.sum(Payment.applied_lbp))
        .where(Payment.shift_id == shift_id, Payment.method == "wish")
        .group_by(Payment.kind)
    )
    totals = {kind: amount for kind, amount in db.execute(query)}
    return totals.get("payment", 0) - totals.get("refund", 0)


def expected(db: Session, shift: Shift) -> tuple[int, int]:
    m = movements(db, shift.id)
    return (
        shift.opening_usd_cents + m.get(("USD", "in"), 0) - m.get(("USD", "out"), 0),
        shift.opening_lbp + m.get(("LBP", "in"), 0) - m.get(("LBP", "out"), 0),
    )


def _reference(db: Session) -> str:
    while True:
        code = f"GX-{random_code(4)}-{random_code(3)}"
        if not db.scalar(select(ShiftClosing.id).where(ShiftClosing.reference == code)):
            return code


def _close(db: Session, shift: Shift, count: Count, closed_by: str) -> ShiftClosing:
    usd, lbp, notes = _counted(shift.count_mode, count)
    expected_usd, expected_lbp = expected(db, shift)
    closing = ShiftClosing(
        shift_id=shift.id,
        reference=_reference(db),
        declared_usd_cents=usd,
        declared_lbp=lbp,
        declared_notes=notes,
        expected_usd_cents=expected_usd,
        expected_lbp=expected_lbp,
        closed_by=closed_by,
        closed_at=clock.now(),
    )
    shift.open_slot, shift.closed_at = None, clock.now()
    db.add(closing)
    db.flush()
    return closing


def close_own(ctx: Ctx, data: CloseShift) -> str:
    """Ends the shift and the login. The Admin password also works, and is recorded."""
    with ctx.tx() as db:
        require(db, ctx)
        own = db.get(User, ctx.user_id)
        candidates = [(own.id, own.password_hash)]
        if not ctx.is_admin:
            candidates += [(a.id, a.password_hash) for a in users.active_admins(db)]
    closer = throttle.match_password(ctx.database, f"own:{ctx.user_id}", candidates, data.password)
    with ctx.tx() as db:
        shift = require(db, ctx)
        closing = _close(db, shift, data.count, closer)
        auth.end_session(db, db.get(LoginSession, ctx.session_id), "logout")
        approver = closer if closer != ctx.user_id else None
        audit.record(db, ctx.user_id, "shift_closed", shift.id, approver)
    backups.create(ctx.database, "session", ctx.session_id)
    return closing.reference


def close_abandoned(ctx: Ctx, data: CloseAbandoned) -> str:
    auth.check_own_password(ctx, data.password)
    with ctx.tx() as db:
        shift = current(db)
        if not shift:
            raise AppError("no_open_shift", 409)
        closing = _close(db, shift, data.count, ctx.user_id)
        audit.record(
            db, ctx.user_id, "shift_closed_by_admin", shift.id, ctx.user_id, reason=data.reason
        )
        return closing.reference


def history(db: Session, reference: str | None) -> list[dict]:
    names = users.names(db)
    query = select(Shift, ShiftClosing).outerjoin(ShiftClosing, ShiftClosing.shift_id == Shift.id)
    if reference:
        query = query.where(ShiftClosing.reference == reference.strip().upper())
    rows = db.execute(query.order_by(Shift.opened_at.desc()).limit(200))
    return [_row(s, c, names) for s, c in rows]


def _row(shift: Shift, closing: ShiftClosing | None, names: dict[str, str]) -> dict:
    return {
        "id": shift.id,
        "cashier": names[shift.user_id],
        "opened_at": clock.iso(shift.opened_at),
        "closed_at": clock.iso(shift.closed_at),
        "reference": closing and closing.reference,
        "difference_usd_cents": closing and closing.declared_usd_cents - closing.expected_usd_cents,
        "difference_lbp": closing and closing.declared_lbp - closing.expected_lbp,
    }


def review(db: Session, shift_id: str) -> dict:
    shift = db.get(Shift, shift_id)
    if not shift:
        raise not_found()
    closing = db.scalar(select(ShiftClosing).where(ShiftClosing.shift_id == shift_id))
    names = users.names(db)
    m = movements(db, shift_id)
    usd, lbp = expected(db, shift)
    return _row(shift, closing, names) | {
        "count_mode": shift.count_mode,
        "opening": {"usd_cents": shift.opening_usd_cents, "lbp": shift.opening_lbp},
        "cash_in": {"usd_cents": m.get(("USD", "in"), 0), "lbp": m.get(("LBP", "in"), 0)},
        "cash_out": {"usd_cents": m.get(("USD", "out"), 0), "lbp": m.get(("LBP", "out"), 0)},
        "expected": {"usd_cents": usd, "lbp": lbp},
        "wish": wish_total(db, shift_id),
        "declared": closing
        and {"usd_cents": closing.declared_usd_cents, "lbp": closing.declared_lbp},
        "notes": closing and closing.declared_notes,
        "closed_by": closing and names[closing.closed_by],
        "closed_by_admin": bool(closing and closing.closed_by != shift.user_id),
    }
