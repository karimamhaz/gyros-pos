"""Plain imports on purpose: the Windows packager follows these, but not names built at run time."""

# isort: skip_file
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.backups import models as _backups  # noqa: F401
from app.modules.expenses import models as _expenses  # noqa: F401
from app.modules.inventory import models as _inventory  # noqa: F401
from app.modules.menu import models as _menu  # noqa: F401
from app.modules.orders import models as _orders  # noqa: F401
from app.modules.payments import models as _payments  # noqa: F401
from app.modules.printing import models as _printing  # noqa: F401
from app.modules.promos import models as _promos  # noqa: F401
from app.modules.settings import models as _settings  # noqa: F401
from app.modules.shifts import models as _shifts  # noqa: F401
from app.modules.tables import models as _tables  # noqa: F401
from app.modules.users import models as _users  # noqa: F401

from app.modules.auth import router as auth_router
from app.modules.backups import router as backups_router
from app.modules.expenses import router as expenses_router
from app.modules.inventory import router as inventory_router
from app.modules.menu import router as menu_router
from app.modules.orders import router as orders_router
from app.modules.printing import router as printing_router
from app.modules.promos import router as promos_router
from app.modules.reports import router as reports_router
from app.modules.settings import router as settings_router
from app.modules.shifts import router as shifts_router
from app.modules.tables import router as tables_router
from app.modules.users import router as users_router


def load_models() -> None:
    """Importing this module has already loaded every model, so Alembic sees all tables."""


def routers():
    return [
        auth_router.router,
        backups_router.router,
        expenses_router.router,
        inventory_router.router,
        menu_router.router,
        orders_router.router,
        printing_router.router,
        promos_router.router,
        reports_router.router,
        settings_router.router,
        shifts_router.router,
        tables_router.router,
        users_router.router,
    ]
