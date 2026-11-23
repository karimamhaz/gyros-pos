from importlib import import_module

MODELS = (
    "audit",
    "auth",
    "backups",
    "expenses",
    "inventory",
    "menu",
    "orders",
    "payments",
    "printing",
    "promos",
    "settings",
    "shifts",
    "tables",
    "users",
)
ROUTERS = (
    "auth",
    "backups",
    "expenses",
    "inventory",
    "menu",
    "orders",
    "printing",
    "promos",
    "reports",
    "settings",
    "shifts",
    "tables",
    "users",
)


def load_models() -> None:
    """Import every model so Alembic and foreign keys can see all tables."""
    for name in MODELS:
        import_module(f"app.modules.{name}.models")


def routers():
    return [import_module(f"app.modules.{name}.router").router for name in ROUTERS]
