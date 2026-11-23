from fastapi import FastAPI

from app.modules.auth import service as auth


def start(app: FastAPI) -> None:
    db = app.state.db
    db.migrate()
    with db.transaction() as session:
        stale = auth.active_session(session)
        if stale:
            auth.end_session(session, stale, "abnormal")
