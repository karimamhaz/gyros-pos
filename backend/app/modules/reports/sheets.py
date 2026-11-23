import io

from openpyxl import Workbook

from app.modules.menu.transfer import escape

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def workbook(sheets: dict[str, list[list]]) -> bytes:
    """Text that looks like a formula is escaped, as in the menu export."""
    book = Workbook()
    book.remove(book.active)
    for title, rows in sheets.items():
        sheet = book.create_sheet(title)
        for row in rows:
            sheet.append([escape(v) if isinstance(v, str) else v for v in row])
        for column in "ABCDEFGH":
            sheet.column_dimensions[column].width = 22
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()
