from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.database import Database
from app.core.errors import AppError
from app.core.security import hash_password, new_token, random_code, token_hash, verify_password
from app.modules.audit import service as audit
from app.modules.auth import throttle
from app.modules.auth.deps import Ctx
from app.modules.auth.models import LoginSession, RecoveryKey
from app.modules.auth.schemas import Approval, ChangePassword, Recover, Setup
from app.modules.settings import service as settings
from app.modules.shifts.models import Shift
from app.modules.users import service as users
from app.modules.users.models import ADMIN, CASHIER, User

QUICK_MINUTES = 5


def is_set_up(db: Session) -> bool:
    return bool(users.active_admins(db))


def _new_recovery_key(db: Session) -> str:
    """Replaces any unused key. Shown to the Admin once."""
    for key in db.scalars(select(RecoveryKey).where(RecoveryKey.used_at.is_(None))):
        key.used_at = clock.now()
    plain = "-".join(random_code(5) for _ in range(5))
    db.add(RecoveryKey(key_hash=hash_password(plain), created_at=clock.now()))
    return plain


def setup(database: Database, data: Setup) -> str:
    with database.transaction() as db:
        if is_set_up(db):
            raise AppError("already_set_up", 409)
        admin = users.add_user(db, data.username, data.username, data.password, ADMIN)
        settings.set_rate(db, admin.id, data.rate)
        audit.record(db, admin.id, "set_up")
        return _new_recovery_key(db)


def end_session(db: Session, session: LoginSession, reason: str) -> None:
    session.ended_at, session.end_reason, session.active_slot = clock.now(), reason, None
    session.quick_admin_id = session.quick_until = None


def active_session(db: Session) -> LoginSession | None:
    return db.scalar(select(LoginSession).where(LoginSession.active_slot == 1))


def open_shift(db: Session) -> Shift | None:
    return db.scalar(select(Shift).where(Shift.open_slot == 1))


def _start_session(db: Session, user: User) -> str:
    previous = active_session(db)
    if previous:
        end_session(db, previous, "replaced")
        db.flush()
    token = new_token()
    db.add(
        LoginSession(
            user_id=user.id, token_hash=token_hash(token), started_at=clock.now(), active_slot=1
        )
    )
    return token


def login(database: Database, role: str, find, password: str) -> tuple[str, User]:
    with database.transaction() as db:
        user = db.scalar(select(User).where(find, User.role == role, User.active))
        key = f"login:{user.id if user else role}"
        candidates = [(user.id, user.password_hash)] if user else []
    throttle.match_password(database, key, candidates, password)
    with database.transaction() as db:
        user = db.get(User, user.id)
        shift = open_shift(db)
        if role == CASHIER and shift and shift.user_id != user.id:
            name = db.get(User, shift.user_id).display_name
            raise AppError("shift_open_other", 409, name=name)
        return _start_session(db, user), user


def login_admin(database: Database, username: str, password: str):
    return login(database, ADMIN, User.username == username, password)


def login_cashier(database: Database, user_id: str, password: str):
    return login(database, CASHIER, User.id == user_id, password)


def check_own_password(ctx: Ctx, password: str) -> None:
    with ctx.tx() as db:
        user = db.get(User, ctx.user_id)
        candidate = (user.id, user.password_hash)
    throttle.match_password(ctx.database, f"own:{ctx.user_id}", [candidate], password)


def check_admin_password(ctx: Ctx, password: str) -> str:
    with ctx.tx() as db:
        candidates = [(a.id, a.password_hash) for a in users.active_admins(db)]
    return throttle.match_password(ctx.database, "approval", candidates, password)


def approve(ctx: Ctx, approval: Approval) -> str:
    """Admin's id for one action. Call before opening that action's transaction."""
    if ctx.is_admin:
        return ctx.user_id
    if not approval.password:
        raise AppError("approval_needed", 403)
    return check_admin_password(ctx, approval.password)


def logout(ctx: Ctx, password: str) -> None:
    check_own_password(ctx, password)
    with ctx.tx() as db:
        shift = open_shift(db)
        if shift and shift.user_id == ctx.user_id:
            raise AppError("close_shift_first", 409)
        end_session(db, db.get(LoginSession, ctx.session_id), "logout")


def open_quick_admin(ctx: Ctx, password: str) -> int:
    admin_id = check_admin_password(ctx, password)
    with ctx.tx() as db:
        session = db.get(LoginSession, ctx.session_id)
        session.quick_admin_id = admin_id
        session.quick_until = clock.now() + timedelta(minutes=QUICK_MINUTES)
        audit.record(db, ctx.user_id, "quick_admin_opened", approver_id=admin_id)
    return QUICK_MINUTES * 60


def close_quick_admin(ctx: Ctx) -> None:
    with ctx.tx() as db:
        session = db.get(LoginSession, ctx.session_id)
        session.quick_admin_id = session.quick_until = None


def recover(database: Database, data: Recover) -> tuple[str, str]:
    throttle.check(database, "recover")
    typed = data.recovery_key.strip().upper()
    with database.transaction() as db:
        key = db.scalar(select(RecoveryKey).where(RecoveryKey.used_at.is_(None)))
        hashed, key_id = (key.key_hash, key.id) if key else ("", "")
    if not verify_password(hashed, typed):
        throttle.failed(database, "recover")
        raise AppError("wrong_recovery_key", 403)
    throttle.passed(database, "recover")
    with database.transaction() as db:
        key = db.get(RecoveryKey, key_id)
        admin = users.active_admins(db)[0]
        if key.used_at:
            raise AppError("wrong_recovery_key", 403)
        admin.password_hash = hash_password(data.password)
        audit.record(db, admin.id, "admin_recovered")
        return admin.username, _new_recovery_key(db)


def change_password(ctx: Ctx, data: ChangePassword) -> None:
    check_own_password(ctx, data.current)
    with ctx.tx() as db:
        db.get(User, ctx.user_id).password_hash = hash_password(data.password)
        audit.record(db, ctx.user_id, "admin_password_changed")
