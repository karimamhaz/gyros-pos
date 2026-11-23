from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Lbp = Annotated[int, Field(ge=0, le=100_000_000_000)]
UsdCents = Annotated[int, Field(ge=0, le=100_000_000)]
Rate = Annotated[int, Field(ge=1, le=100_000_000)]


class PrinterSettings(BaseModel):
    """What the Admin may change about paper. Codes and paid marks are always printed."""

    model_config = ConfigDict(extra="forbid")
    printer: str = Field("", max_length=200)
    paper: Literal[58, 80] = 80
    copies: int = Field(1, ge=1, le=3)
    auto_print: bool = True
    font_size: Literal["small", "medium", "large"] = "medium"
    bold: bool = False
    side_margin_mm: int = Field(3, ge=0, le=10)
    feed_mm: int = Field(8, ge=0, le=40)
    show_logo: bool = True
    logo_percent: int = Field(60, ge=30, le=100)
    show_usd: bool = True
    show_rate: bool = True
    show_cashier: bool = True
    show_address: bool = True
    show_phone: bool = True
    show_footer: bool = True


class AppSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: Literal["ar", "en"] = "ar"
    default_delivery_fee: Lbp = 0
    table_count: int = Field(10, ge=0, le=200)
    day_cutoff_minutes: int = Field(240, ge=0, le=719)
    count_mode: Literal["totals", "banknotes", "closing_only"] = "totals"
    fixed_opening_usd: UsdCents = 0
    fixed_opening_lbp: Lbp = 0
    inventory_enabled: bool = False
    expenses_enabled: bool = False
    receipt_name: str = Field("GYROS شاورما", max_length=60)
    receipt_phone: str = Field("76022164", max_length=40)
    receipt_address: str = Field("الهرمل - مقابل الساعة", max_length=120)
    receipt_footer: str = Field("الطعم الطيب دائماً", max_length=160)
    printer: PrinterSettings = PrinterSettings()


class RateIn(BaseModel):
    rate: Rate
