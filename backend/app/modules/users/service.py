from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.core.security import hash_password
from app.modules.audit import service as audit
from app.modules.users.models import ADMIN, CASHIER, User
from app.modules.users.schemas import CashierUpdate, NewCashier


def active_admins(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(User.role == ADMIN, User.active)))


def active_cashiers(db: Session) -> list[User]:
    query = select(User).where(User.role == CASHIER, User.active).order_by(User.display_name)
    return list(db.scalars(query))


def all_cashiers(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(User.role == CASHIER).order_by(User.created_at)))


def names(db: Session) -> dict[str, str]:
    return dict(db.execute(select(User.id, User.display_name)).tuples())


def _unique(db: Session, column, value: str, code: str, except_id: str | None = None) -> None:
    if db.scalar(select(User.id).where(column == value, User.id != (except_id or ""))):
        raise AppError(code, 409)


def add_user(db: Session, username: str, name: str, password: str, role: str) -> User:
    _unique(db, User.username, username, "username_taken")
    _unique(db, User.display_name, name, "name_taken")
    user = User(
        username=username,
        display_name=name,
        role=role,
        password_hash=hash_password(password),
        created_at=clock.now(),
    )
    db.add(user)
    db.flush()
    return user


def _cashier(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if not user or user.role != CASHIER:
        raise not_found()
    return user


def add_cashier(db: Session, actor_id: str, data: NewCashier) -> User:
    user = add_user(db, data.username, data.display_name, data.password, CASHIER)
    audit.record(db, actor_id, "cashier_added", user.id, username=user.username)
    return user


def update_cashier(db: Session, actor_id: str, user_id: str, data: CashierUpdate) -> User:
    user = _cashier(db, user_id)
    _unique(db, User.display_name, data.display_name, "name_taken", user_id)
    before = {"name": user.display_name, "active": user.active}
    user.display_name, user.active = data.display_name, data.active
    audit.record(
        db,
        actor_id,
        "cashier_changed",
        user_id,
        before=before,
        after={"name": user.display_name, "active": user.active},
    )
    return user


def set_cashier_password(db: Session, actor_id: str, user_id: str, password: str) -> None:
    _cashier(db, user_id).password_hash = hash_password(password)
    audit.record(db, actor_id, "cashier_password_changed", user_id)
