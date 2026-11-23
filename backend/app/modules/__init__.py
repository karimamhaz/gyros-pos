from importlib import import_module

MODELS = ("audit", "auth", "settings", "users")
ROUTERS = ("auth", "settings", "users")


def load_models() -> None:
    """Import every model so Alembic and foreign keys can see all tables."""
    for name in MODELS:
        import_module(f"app.modules.{name}.models")


def routers():
    return [import_module(f"app.modules.{name}.router").router for name in ROUTERS]
