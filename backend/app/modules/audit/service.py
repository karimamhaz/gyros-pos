from sqlalchemy.orm import Session

from app.core import clock
from app.modules.audit.models import AuditEntry


def record(
    db: Session,
    actor_id: str | None,
    action: str,
    target: str | None = None,
    approver_id: str | None = None,
    **details,
) -> None:
    db.add(
        AuditEntry(
            at=clock.now(),
            actor_id=actor_id,
            approver_id=approver_id,
            action=action,
            target=target,
            details=details or None,
        )
    )
