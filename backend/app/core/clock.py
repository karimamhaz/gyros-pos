"""Single source of time, so tests can move it."""

from datetime import UTC, date, datetime, timedelta

_fixed: datetime | None = None


def freeze(moment: datetime | None) -> None:
    global _fixed
    _fixed = moment


def now() -> datetime:
    """Current UTC time without tzinfo, as stored in the database."""
    return (_fixed or datetime.now(UTC)).astimezone(UTC).replace(tzinfo=None, microsecond=0)


def to_local(moment: datetime) -> datetime:
    return moment.replace(tzinfo=UTC).astimezone()


def business_date(cutoff_minutes: int, moment: datetime | None = None) -> date:
    return (to_local(moment or now()) - timedelta(minutes=cutoff_minutes)).date()


def iso(moment: datetime | None) -> str | None:
    """Local time with offset, for the UI and receipts."""
    return to_local(moment).isoformat() if moment else None
