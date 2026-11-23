from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, model_validator

Code = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_upper=True, min_length=2, max_length=20, pattern=r"^[\w-]+$"
    ),
]


class PromoIn(BaseModel):
    code: Code
    percent: int = Field(ge=1, le=100)
    active: bool = True
    starts_on: date | None = None
    ends_on: date | None = None
    usage_limit: int | None = Field(None, ge=1, le=1_000_000)

    @model_validator(mode="after")
    def _dates(self):
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("ends before it starts")
        return self
