from alembic import context

import app.modules  # noqa: F401  (importing it registers every model, so Alembic sees all tables)
from app.core.database import Base

engine = context.config.attributes["engine"]

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
    connection.commit()
