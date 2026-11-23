"""Developer tool: `uv run python alembic_dev.py "message"` drafts the next migration."""

import sys
import tempfile
from pathlib import Path

from alembic import command

from app.core.database import Database

with tempfile.TemporaryDirectory() as folder:
    db = Database(Path(folder) / "draft.db")
    db.migrate()
    number = f"{int(db.head_revision() or 0) + 1:04d}"
    command.revision(db._config(), message=sys.argv[1], autogenerate=True, rev_id=number)
