from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.modules.settings.schemas import Rate
from app.modules.users.schemas import AdminPassword, AnyPassword, Username

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]


class Setup(BaseModel):
    username: Username
    password: AdminPassword
    rate: Rate


class AdminLogin(BaseModel):
    username: Username
    password: AnyPassword


class CashierLogin(BaseModel):
    user_id: str
    password: AnyPassword


class PasswordOnly(BaseModel):
    password: AnyPassword


class Recover(BaseModel):
    recovery_key: Annotated[str, StringConstraints(max_length=60)]
    password: AdminPassword


class ChangePassword(BaseModel):
    current: AnyPassword
    password: AdminPassword


class Approval(BaseModel):
    """Admin password typed for one action. Admins acting themselves leave it empty."""

    reason: Reason
    password: Annotated[str, StringConstraints(max_length=100)] = ""
