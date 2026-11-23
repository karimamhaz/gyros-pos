from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import Settings
from app.core.database import Database
from app.core.errors import AppError
from app.core.security import token_hash
from app.modules.auth.models import LoginSession
from app.modules.users.models import ADMIN, CASHIER, User


class Ctx:
    """Who is asking, and the only way routes reach the database."""

    def __init__(self, request: Request, session: LoginSession, user: User):
        self.database: Database = request.app.state.db
        self.settings: Settings = request.app.state.settings
        self.session_id = session.id
        self.user_id, self.role, self.name = user.id, user.role, user.display_name
        quick = session.quick_until and session.quick_until > clock.now()
        self.quick_admin_id = session.quick_admin_id if quick else None

    @property
    def is_admin(self) -> bool:
        return self.role == ADMIN

    @property
    def admin_id(self) -> str:
        """The Admin responsible for this request, also in the quick Admin screen."""
        return self.user_id if self.is_admin else (self.quick_admin_id or "")

    @contextmanager
    def tx(self) -> Iterator[Session]:
        with self.database.transaction() as db:
            session = db.get(LoginSession, self.session_id)
            if not session or session.ended_at:
                raise AppError("session_ended", 401)
            yield db


class Allow:
    """Declares who may call a route. A test fails if a route has none of these."""

    def __init__(self, *roles: str, quick: bool = False):
        self.roles, self.quick = roles, quick

    def __call__(self, request: Request) -> Ctx:
        scheme, _, token = request.headers.get("authorization", "").partition(" ")
        if scheme != "Bearer" or not token:
            raise AppError("session_ended", 401)
        with request.app.state.db.transaction() as db:
            session = db.scalar(
                select(LoginSession).where(
                    LoginSession.token_hash == token_hash(token), LoginSession.ended_at.is_(None)
                )
            )
            user = session and db.get(User, session.user_id)
            if not session or not user or not user.active:
                raise AppError("session_ended", 401)
            ctx = Ctx(request, session, user)
        if ctx.role not in self.roles and not (self.quick and ctx.quick_admin_id):
            raise AppError("forbidden", 403)
        return ctx


class Public:
    """Marks the few routes that work before login."""

    roles = ("public",)

    def __call__(self, request: Request) -> Database:
        return request.app.state.db


AdminCtx = Annotated[Ctx, Depends(Allow(ADMIN))]
AnyCtx = Annotated[Ctx, Depends(Allow(ADMIN, CASHIER))]
QuickCtx = Annotated[Ctx, Depends(Allow(ADMIN, quick=True))]
PublicDb = Annotated[Database, Depends(Public())]
