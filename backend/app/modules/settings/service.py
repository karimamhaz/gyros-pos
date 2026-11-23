from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.settings.models import ExchangeRate, Setting
from app.modules.settings.schemas import AppSettings


def load(db: Session) -> AppSettings:
    stored = {s.key: s.value for s in db.scalars(select(Setting))}
    return AppSettings.model_validate(stored)


def save(db: Session, actor_id: str | None, new: AppSettings) -> AppSettings:
    before, after = load(db).model_dump(), new.model_dump()
    changed = {k: v for k, v in after.items() if before[k] != v}
    for key, value in changed.items():
        db.merge(Setting(key=key, value=value))
    if changed:
        audit.record(
            db,
            actor_id,
            "settings_changed",
            before={k: before[k] for k in changed},
            after=changed,
        )
    return new


def current_rate(db: Session) -> int | None:
    return db.scalar(select(ExchangeRate.rate).order_by(ExchangeRate.seq.desc()).limit(1))


def require_rate(db: Session) -> int:
    rate = current_rate(db)
    if rate is None:
        raise AppError("rate_not_set", 409)
    return rate


def set_rate(db: Session, actor_id: str, rate: int) -> None:
    before = current_rate(db)
    if rate == before:
        return
    seq = (db.scalar(select(func.max(ExchangeRate.seq))) or 0) + 1
    db.add(ExchangeRate(seq=seq, rate=rate, set_at=clock.now(), set_by=actor_id))
    audit.record(db, actor_id, "rate_changed", before=before, after=rate)
