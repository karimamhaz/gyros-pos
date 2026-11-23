from typing import Annotated

from pydantic import BaseModel, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, min_length=2, max_length=30, pattern=r"^[\w.-]+$"
    ),
]
CashierPassword = Annotated[str, StringConstraints(min_length=4, max_length=100)]
AdminPassword = Annotated[str, StringConstraints(min_length=8, max_length=100)]
AnyPassword = Annotated[str, StringConstraints(min_length=1, max_length=100)]


class NewCashier(BaseModel):
    username: Username
    display_name: Name
    password: CashierPassword


class CashierUpdate(BaseModel):
    display_name: Name
    active: bool


class NewPassword(BaseModel):
    password: CashierPassword
