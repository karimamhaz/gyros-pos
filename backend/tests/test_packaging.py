"""Regression: the Windows build once crashed because modules were loaded by name at run time."""

import re
from pathlib import Path

from app.modules import routers

APP = Path(__file__).resolve().parents[1] / "app"


def test_no_module_is_loaded_by_name():
    offenders = [
        f"{p.relative_to(APP)}:{n}"
        for p in APP.rglob("*.py")
        for n, line in enumerate(p.read_text().splitlines(), 1)
        if re.search(r"\b(import_module|__import__)\(|importlib", line)
    ]
    assert offenders == []


def test_every_router_file_is_registered():
    found = {p.parent.name for p in (APP / "modules").glob("*/router.py")}
    registered = {r.prefix.split("/")[2] for r in routers()}
    aliases = {"cashiers": "users", "print": "printing", "promos": "promos", "menu": "menu"}
    assert found == {aliases.get(name, name) for name in registered}


def test_every_model_file_is_imported_by_the_package():
    source = (APP / "modules" / "__init__.py").read_text()
    for models in (APP / "modules").glob("*/models.py"):
        assert f"app.modules.{models.parent.name} import models" in source, models.parent.name
