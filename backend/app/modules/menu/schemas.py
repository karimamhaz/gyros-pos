from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

MenuName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Price = Annotated[int, Field(gt=0, le=1_000_000_000)]


class CategoryIn(BaseModel):
    name: MenuName


class OrderIn(BaseModel):
    ids: list[str]


class ProductIn(BaseModel):
    category_id: str
    name: MenuName
    price_lbp: Price
    available: bool = True


class AvailabilityIn(BaseModel):
    available: bool


class ImportFile(BaseModel):
    filename: Annotated[str, StringConstraints(max_length=200)]
    content: Annotated[str, StringConstraints(max_length=2_800_000)]  # base64 of at most 2 MB


class ImportApply(ImportFile):
    mode: Literal["add", "add_and_update"]
    menu_version: str
