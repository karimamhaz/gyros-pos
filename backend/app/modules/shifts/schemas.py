from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.modules.auth.schemas import Reason
from app.modules.settings.schemas import Lbp, UsdCents
from app.modules.users.schemas import AnyPassword

USD_NOTES = (100, 50, 20, 10, 5, 2, 1)
LBP_NOTES = (1_000_000, 500_000, 100_000, 50_000, 20_000, 10_000, 5_000, 1_000)
Pieces = Annotated[int, Field(ge=0, le=100_000)]
UsdNote = Literal["100", "50", "20", "10", "5", "2", "1"]
LbpNote = Literal["1000000", "500000", "100000", "50000", "20000", "10000", "5000", "1000"]


class Notes(BaseModel):
    usd: dict[UsdNote, Pieces] = {}
    lbp: dict[LbpNote, Pieces] = {}


class Count(BaseModel):
    """Totals, or banknotes from which the server adds up the totals."""

    usd_cents: UsdCents = 0
    lbp: Lbp = 0
    notes: Notes | None = None


class OpenShift(BaseModel):
    count: Count = Count()


class CloseShift(BaseModel):
    password: AnyPassword
    count: Count


class CloseAbandoned(CloseShift):
    reason: Reason
