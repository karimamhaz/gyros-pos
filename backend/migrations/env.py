from alembic import context

from app.core.database import Base
from app.modules import load_models

load_models()
engine = context.config.attributes["engine"]

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
    connection.commit()
