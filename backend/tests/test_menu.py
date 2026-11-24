import base64
import io
import zipfile
from pathlib import Path

import pytest
from openpyxl import Workbook
from sqlalchemy import text

from app.modules.menu import service
from tests.conftest import ADMIN_PASSWORD


@pytest.fixture
def menu(pos):
    pos.meat = pos.post("/menu/categories", {"name": "شاورما اللحمة"})["id"]
    pos.drinks = pos.post("/menu/categories", {"name": "المشروبات"})["id"]
    pos.beef = product(pos, "شاورما لحمة كبير", 500000)["id"]
    pos.laban = product(pos, "لبن", 70000, pos.drinks)["id"]
    return pos


def product(pos, name, price, category=None, **more):
    body = {"category_id": category or pos.meat, "name": name, "price_lbp": price} | more
    return pos.post("/menu/products", body)


def names(pos):
    return [p["name"] for p in pos.get("/menu/all")["products"]]


def upload(content, filename="menu.csv"):
    data = content.encode() if isinstance(content, str) else content
    return {"filename": filename, "content": base64.b64encode(data).decode()}


def apply(pos, file, mode="add"):
    version = pos.post("/menu/import/preview", file)["menu_version"]
    return pos.post("/menu/import/apply", file | {"mode": mode, "menu_version": version})


def test_cashier_sees_only_available_products(menu):
    menu.put(f"/menu/products/{menu.laban}/available", {"available": False})
    menu.cashier()
    groups = menu.get("/menu")
    assert [[p["name"] for p in g["products"]] for g in groups] == [["شاورما لحمة كبير"]]
    assert menu.fails("GET", "/menu/all") == "forbidden"


def test_quick_admin_may_only_change_availability(menu):
    menu.cashier()
    menu.post("/auth/quick-admin", {"password": ADMIN_PASSWORD})
    menu.put(f"/menu/products/{menu.beef}/available", {"available": False})
    body = {"category_id": menu.meat, "name": "x", "price_lbp": 1}
    assert menu.fails("PUT", f"/menu/products/{menu.beef}", body) == "forbidden"
    assert menu.fails("POST", "/menu/products", body) == "forbidden"


def test_validation(menu):
    for price in (0, -1, 1.5, "abc"):
        body = {"category_id": menu.meat, "name": "x", "price_lbp": price}
        assert menu.fails("POST", "/menu/products", body) == "invalid_input"
    body = {"category_id": menu.meat, "name": " شاورما لحمه  كبير ", "price_lbp": 1}
    assert menu.fails("POST", "/menu/products", body) == "product_exists"
    assert menu.fails("POST", "/menu/categories", {"name": "المشروبات"}) == "category_exists"
    body = {"category_id": "nope", "name": "x", "price_lbp": 1}
    assert menu.fails("POST", "/menu/products", body) == "not_found"


def test_deleting_archives(menu):
    assert menu.fails("DELETE", f"/menu/categories/{menu.drinks}") == "category_not_empty"
    menu.delete(f"/menu/products/{menu.laban}")
    menu.delete(f"/menu/categories/{menu.drinks}")
    assert names(menu) == ["شاورما لحمة كبير"]
    with menu.db.transaction() as db:
        assert db.scalar(text("SELECT count(*) FROM products")) == 2
    again = menu.post("/menu/categories", {"name": "المشروبات"})["id"]
    product(menu, "لبن", 80000, again)


def test_category_order(menu):
    menu.put("/menu/categories/order", {"ids": [menu.drinks, menu.meat]})
    assert names(menu) == ["لبن", "شاورما لحمة كبير"]
    body = {"ids": [menu.drinks]}
    assert menu.fails("PUT", "/menu/categories/order", body) == "menu_changed"


CSV = """name,category,price_lbp,available
شاورما مكس,شاورما اللحمة,550000,yes
لبن,المشروبات,"80,000",yes
شاورما لحمه كبير,شاورما اللحمة,500000,yes
كبيس,إضافات,,yes
,إضافات,5000,yes
عصير,المشروبات,120000,maybe
شاورما مكس,شاورما اللحمة,1,yes
علبة توم,إضافات,50000,لا
"""


def test_preview_explains_every_row_and_writes_nothing(menu):
    before = names(menu)
    rows = menu.post("/menu/import/preview", upload(CSV))["rows"]
    assert [r["result"] for r in rows] == [
        "new", "update", "similar", "error", "error", "error", "error", "new",
    ]  # fmt: skip
    assert rows[1]["old_price"] == 70000 and rows[1]["price_lbp"] == 80000
    assert rows[2]["match"] == "شاورما لحمة كبير"
    assert [r["errors"] for r in rows[3:7]] == [
        ["price_invalid"],
        ["name_required"],
        ["available_invalid"],
        ["repeated_in_file"],
    ]
    assert names(menu) == before


def test_add_only_never_changes_existing(menu):
    assert apply(menu, upload(CSV)) == {"added": 2, "updated": 0, "skipped": 6}
    prices = {p["name"]: p for p in menu.get("/menu/all")["products"]}
    assert prices["لبن"]["price_lbp"] == 70000
    assert prices["علبة توم"]["available"] is False


def test_add_and_update(menu):
    assert apply(menu, upload(CSV), "add_and_update")["updated"] == 1
    assert {p["name"]: p["price_lbp"] for p in menu.get("/menu/all")["products"]}["لبن"] == 80000


def test_stale_preview_is_rejected(menu):
    version = menu.post("/menu/import/preview", upload(CSV))["menu_version"]
    menu.put(f"/menu/products/{menu.laban}/available", {"available": False})
    body = upload(CSV) | {"mode": "add", "menu_version": version}
    assert menu.fails("POST", "/menu/import/apply", body) == "menu_changed"


def test_failed_import_leaves_menu_unchanged(menu, monkeypatch):
    before = menu.get("/menu/all")
    original, calls = service.add_product, []

    def fail_second(*args):
        calls.append(1)
        if len(calls) == 2:
            raise RuntimeError("disk full")
        return original(*args)

    monkeypatch.setattr(service, "add_product", fail_second)
    version = menu.post("/menu/import/preview", upload(CSV))["menu_version"]
    body = upload(CSV) | {"mode": "add", "menu_version": version}
    r = menu.client.post(
        "/api/menu/import/apply", json=body, headers={"Authorization": f"Bearer {menu.token}"}
    )
    assert r.status_code == 500
    assert menu.get("/menu/all") == before


@pytest.mark.parametrize("kind", ["csv", "xlsx"])
def test_export_then_import_changes_nothing(menu, kind):
    for name in ("=SUM(A1)", "'quoted", "+plus", "-5", "@x", 'فاصلة, و"اقتباس"'):
        product(menu, name, 1000)
    product(menu, "متوقف", 2000, available=False)
    data = menu.get(f"/menu/export/{kind}")
    if kind == "csv":
        assert b"\n=SUM" not in data and b"'=SUM" in data
    rows = menu.post("/menu/import/preview", upload(data, f"menu.{kind}"))["rows"]
    assert {r["result"] for r in rows} == {"same"} and len(rows) == 9


def test_arabic_headers_and_semicolons(menu):
    rows = menu.post("/menu/import/preview", upload("الاسم;التصنيف;السعر\nعصير;المشروبات;120000\n"))
    assert rows["rows"][0]["result"] == "new"


def bomb():
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("xl/worksheets/sheet1.xml", b"0" * 21_000_000)
    return out.getvalue()


def many_rows():
    book = Workbook()
    for i in range(2003):
        book.active.append([f"p{i}", "c", 1])
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


@pytest.mark.parametrize(
    "content,filename,code",
    [
        (b"x" * 2_000_001, "m.csv", "import_too_large"),
        (bomb(), "m.xlsx", "import_too_large"),
        (many_rows(), "m.xlsx", "import_too_large"),
        ("name,category,price\n" + "a,b,1\n" * 2001, "m.csv", "import_too_large"),
        (b"not a zip", "m.xlsx", "import_unreadable"),
        (b"\xff\xfe\x00", "m.csv", "import_unreadable"),
        ("a,b\n1,2\n", "m.csv", "import_columns"),
        ("name,category,price\n", "m.csv", "import_empty"),
        ("", "m.csv", "import_empty"),
        ("x", "m.exe", "import_wrong_type"),
    ],
)
def test_bad_files_are_refused(menu, content, filename, code):
    assert menu.fails("POST", "/menu/import/preview", upload(content, filename)) == code


@pytest.mark.parametrize("name", ["gyros_menu.csv", "gyros_menu.xlsx"])
def test_the_restaurant_menu_files_import_cleanly(pos, name):
    data = (Path(__file__).resolve().parents[2] / "docs" / name).read_bytes()
    assert apply(pos, upload(data, name)) == {"added": 17, "updated": 0, "skipped": 0}
    pos.cashier()
    assert [len(g["products"]) for g in pos.get("/menu")] == [3, 3, 3, 3, 2, 2, 1]


def test_both_menu_files_hold_the_same_menu():
    from openpyxl import load_workbook

    docs = Path(__file__).resolve().parents[2] / "docs"
    book = load_workbook(docs / "gyros_menu.xlsx").active
    sheet = [[str(c.value) for c in row] for row in book.iter_rows()]
    import csv

    with (docs / "gyros_menu.csv").open(encoding="utf-8-sig", newline="") as f:
        csv_rows = list(csv.reader(f))
    assert sheet == csv_rows
