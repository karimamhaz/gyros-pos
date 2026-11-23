from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.modules.audit import service as audit
from app.modules.promos.models import PromoCode, PromoRedemption
from app.modules.promos.schemas import PromoIn


def uses(db: Session, promo_id: str) -> int:
    query = select(func.count()).where(PromoRedemption.promo_id == promo_id)
    return db.scalar(query) or 0


def check(db: Session, promo: PromoCode, today: date) -> None:
    if not promo.active:
        raise AppError("promo_inactive", 409)
    if promo.starts_on and today < promo.starts_on:
        raise AppError("promo_not_started", 409)
    if promo.ends_on and today > promo.ends_on:
        raise AppError("promo_expired", 409)
    if promo.usage_limit is not None and uses(db, promo.id) >= promo.usage_limit:
        raise AppError("promo_used_up", 409)


def find(db: Session, code: str, today: date) -> PromoCode:
    promo = db.scalar(select(PromoCode).where(PromoCode.code == code))
    if not promo:
        raise AppError("promo_unknown", 404)
    check(db, promo, today)
    return promo


def redeem(db: Session, promo_id: str, order_id: str, percent: int, discount: int, today: date):
    """Counts the use once per order, inside the payment transaction."""
    if db.scalar(select(PromoRedemption.id).where(PromoRedemption.order_id == order_id)):
        return
    promo = db.get(PromoCode, promo_id)
    check(db, promo, today)
    if promo.percent != percent:
        raise AppError("promo_changed", 409)
    db.add(
        PromoRedemption(
            promo_id=promo_id,
            order_id=order_id,
            percent=percent,
            discount_lbp=discount,
            redeemed_at=clock.now(),
        )
    )


def all_promos(db: Session) -> list[dict]:
    promos = db.scalars(select(PromoCode).order_by(PromoCode.code))
    return [as_dict(db, p) for p in promos]


def as_dict(db: Session, p: PromoCode) -> dict:
    return {
        "id": p.id,
        "code": p.code,
        "percent": p.percent,
        "active": p.active,
        "starts_on": p.starts_on,
        "ends_on": p.ends_on,
        "usage_limit": p.usage_limit,
        "uses": uses(db, p.id),
    }


def save(db: Session, actor_id: str, data: PromoIn, promo_id: str | None = None) -> PromoCode:
    taken = select(PromoCode.id).where(
        PromoCode.code == data.code, PromoCode.id != (promo_id or "")
    )
    if db.scalar(taken):
        raise AppError("promo_exists", 409)
    promo = db.get(PromoCode, promo_id) if promo_id else PromoCode()
    if not promo:
        raise not_found()
    before = promo_id and {k: str(getattr(promo, k)) for k in data.model_dump()}
    for key, value in data.model_dump().items():
        setattr(promo, key, value)
    db.add(promo)
    db.flush()
    after = data.model_dump(mode="json")
    audit.record(db, actor_id, "promo_saved", promo.id, before=before, after=after)
    return promo
