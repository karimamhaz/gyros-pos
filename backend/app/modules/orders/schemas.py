from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.modules.auth.schemas import Approval
from app.modules.settings.schemas import Lbp, UsdCents

Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]
Long = Annotated[str, StringConstraints(strip_whitespace=True, max_length=250)]
Key = Annotated[str, StringConstraints(min_length=16, max_length=64)]
ReceiptCode = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, max_length=10)]


class NewOrder(BaseModel):
    type: Literal["takeaway", "delivery"]


class ItemIn(BaseModel):
    product_id: str
    qty: int = Field(ge=1, le=999)
    note: Note = ""


class DeliveryIn(BaseModel):
    customer: Short = ""
    phone: Short = ""
    address: Long = ""
    driver: Short = ""
    requested_time: Short = ""
    promised_time: Short = ""


class DraftIn(BaseModel):
    version: int
    type: Literal["takeaway", "delivery", "dine_in"]
    items: list[ItemIn] = Field(max_length=200)
    delivery: DeliveryIn | None = None
    delivery_fee: Lbp | None = None


class PromoIn(BaseModel):
    version: int
    code: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, max_length=20)] = (
        ""
    )


class ConfirmIn(BaseModel):
    version: int
    expected_total: Lbp


class QuoteIn(BaseModel):
    usd_cents: UsdCents = 0
    lbp: Lbp = 0
    change_usd_cents: UsdCents = 0


class PaymentIn(QuoteIn):
    idempotency_key: Key
    version: int
    expected_due: Lbp
    change_lbp: Lbp = 0


class CancelIn(BaseModel):
    version: int
    approval: Approval | None = None


class VoidIn(BaseModel):
    version: int
    qty: int = Field(ge=1, le=999)
    approval: Approval


class LookupIn(BaseModel):
    number: int = Field(ge=1, le=1_000_000)
    code: ReceiptCode


class CodeIn(BaseModel):
    code: ReceiptCode = ""


class RefundQuoteIn(CodeIn):
    usd_cents: UsdCents = 0


class RefundIn(RefundQuoteIn):
    idempotency_key: Key
    lbp: Lbp
    approval: Approval
