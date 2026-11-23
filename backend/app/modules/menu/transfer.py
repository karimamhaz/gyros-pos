"""Menu import and export. Files are untrusted: size, shape and every value are checked."""

import base64
import binascii
import csv
import hashlib
import io
import json
import zipfile
from dataclasses import dataclass, field

from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.menu import service
from app.modules.menu.schemas import ImportApply, ImportFile, ProductIn
from app.modules.menu.text import normalise

HEADER = ["name", "category", "price_lbp", "available"]
ALIASES = {
    "name": "name",
    "product": "name",
    "الاسم": "name",
    "المنتج": "name",
    "category": "category",
    "التصنيف": "category",
    "price_lbp": "price_lbp",
    "price": "price_lbp",
    "السعر": "price_lbp",
    "available": "available",
    "متاح": "available",
}
YES = {"yes", "true", "1", "y", "نعم", "متاح"}
NO = {"no", "false", "0", "n", "لا", "غير متاح"}
MAX_BYTES, MAX_ROWS, MAX_UNPACKED = 2_000_000, 2000, 20_000_000
FORMULA = ("=", "+", "-", "@", "\t", "\r", "'")


@dataclass
class Row:
    line: int
    name: str = ""
    category: str = ""
    price_lbp: int | None = None
    available: bool = True
    result: str = "new"  # new, update, same, similar, error
    errors: list[str] = field(default_factory=list)
    match: str | None = None
    old_price: int | None = None
    product_id: str | None = None


def escape(text: str) -> str:
    """Stops a spreadsheet from running a name as a formula. `unescape` reverses it."""
    return "'" + text if text.startswith(FORMULA) else text


def unescape(text: str) -> str:
    return text[1:] if text.startswith("'") and text[1:].startswith(FORMULA) else text


def menu_version(db: Session) -> str:
    state = [
        (p.id, p.name, p.category.name, p.price_lbp, p.available) for p in service.products(db)
    ] + [(c.id, c.name) for c in service.categories(db)]
    return hashlib.sha256(json.dumps(state).encode()).hexdigest()


def _read(upload: ImportFile) -> list[list[str]]:
    try:
        data = base64.b64decode(upload.content, validate=True)
    except (binascii.Error, ValueError):
        raise AppError("import_unreadable") from None
    if len(data) > MAX_BYTES:
        raise AppError("import_too_large")
    name = upload.filename.lower()
    try:
        if name.endswith(".csv"):
            rows = _read_csv(data)
        elif name.endswith(".xlsx"):
            rows = _read_xlsx(data)
        else:
            raise AppError("import_wrong_type")
    except AppError:
        raise
    except Exception:
        raise AppError("import_unreadable") from None
    if len(rows) > MAX_ROWS + 1:
        raise AppError("import_too_large")
    return rows


def _read_csv(data: bytes) -> list[list[str]]:
    text = data.decode("utf-8-sig")
    first = text.split("\n", 1)[0]
    delimiter = ";" if first.count(";") > first.count(",") else ","
    rows = []
    for row in csv.reader(io.StringIO(text), delimiter=delimiter, strict=True):
        rows.append(row)
        if len(rows) > MAX_ROWS + 1:
            raise AppError("import_too_large")
    return rows


def _read_xlsx(data: bytes) -> list[list[str]]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if sum(i.file_size for i in archive.infolist()) > MAX_UNPACKED:
            raise AppError("import_too_large")
    book = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    rows = []
    for values in book.worksheets[0].iter_rows(values_only=True):
        rows.append([_cell(v) for v in values[:20]])
        if len(rows) > MAX_ROWS + 1:
            raise AppError("import_too_large")
    book.close()
    return rows


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _price(text: str) -> int | None:
    clean = text.replace(",", "").replace(" ", "").replace("٬", "")
    if not clean.isdecimal():
        return None
    value = int(clean)
    return value if 0 < value <= 1_000_000_000 else None


def analyse(db: Session, upload: ImportFile) -> list[Row]:
    table = _read(upload)
    if not table:
        raise AppError("import_empty")
    columns = [ALIASES.get(h.strip().casefold()) for h in table[0]]
    missing = [h for h in ("name", "category", "price_lbp") if h not in columns]
    if missing:
        raise AppError("import_columns", columns=", ".join(missing))

    products = service.products(db)
    exact = {p.name: p for p in products}
    similar = {normalise(p.name): p for p in products}
    seen: set[str] = set()
    rows: list[Row] = []
    for line, values in enumerate(table[1:], start=2):
        if not any(v.strip() for v in values):
            continue
        cells = {c: v.strip() for c, v in zip(columns, values, strict=False) if c}
        row = Row(line, unescape(cells.get("name", "")), unescape(cells.get("category", "")))
        row.price_lbp = _price(cells.get("price_lbp", ""))
        available = cells.get("available", "").casefold()
        row.available = available not in NO
        if not row.name:
            row.errors.append("name_required")
        if not row.category:
            row.errors.append("category_required")
        if len(row.name) > 60 or len(row.category) > 60:
            row.errors.append("too_long")
        if row.price_lbp is None:
            row.errors.append("price_invalid")
        if available and available not in YES | NO:
            row.errors.append("available_invalid")
        key = normalise(row.name)
        if key and key in seen:
            row.errors.append("repeated_in_file")
        seen.add(key)
        product = exact.get(row.name)
        if row.errors:
            row.result = "error"
        elif product:
            row.product_id, row.old_price = product.id, product.price_lbp
            same = (
                product.price_lbp == row.price_lbp
                and product.available == row.available
                and normalise(product.category.name) == normalise(row.category)
            )
            row.result = "same" if same else "update"
        elif key in similar:
            row.result, row.match = "similar", similar[key].name
        rows.append(row)
    if not rows:
        raise AppError("import_empty")
    return rows


def apply(db: Session, actor_id: str, request: ImportApply) -> dict:
    """Runs inside one transaction. Similar and invalid rows are never written."""
    if request.menu_version != menu_version(db):
        raise AppError("menu_changed", 409)
    rows = analyse(db, request)
    by_name = {normalise(c.name): c.id for c in service.categories(db)}
    counts = {"added": 0, "updated": 0}
    for row in rows:
        adding = row.result == "new"
        updating = row.result == "update" and request.mode == "add_and_update"
        if not adding and not updating:
            continue
        key = normalise(row.category)
        if key not in by_name:
            by_name[key] = service.add_category(db, actor_id, row.category).id
        data = ProductIn(
            category_id=by_name[key],
            name=row.name,
            price_lbp=row.price_lbp,
            available=row.available,
        )
        if adding:
            service.add_product(db, actor_id, data)
            counts["added"] += 1
        else:
            service.update_product(db, actor_id, row.product_id, data)
            counts["updated"] += 1
    audit.record(db, actor_id, "menu_imported", mode=request.mode, **counts)
    return counts | {"skipped": len(rows) - counts["added"] - counts["updated"]}


def _export_rows(db: Session) -> list[list]:
    return [
        [escape(p.name), escape(p.category.name), p.price_lbp, "yes" if p.available else "no"]
        for p in service.products(db)
    ]


def export_csv(db: Session) -> bytes:
    out = io.StringIO(newline="")
    csv.writer(out).writerows([HEADER, *_export_rows(db)])
    return out.getvalue().encode("utf-8-sig")


def export_xlsx(db: Session) -> bytes:
    book = Workbook()
    sheet = book.active
    sheet.title = "Menu"
    for row in [HEADER, *_export_rows(db)]:
        sheet.append(row)
    sheet.column_dimensions["A"].width = sheet.column_dimensions["B"].width = 28
    sheet.freeze_panes = "A2"
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()
