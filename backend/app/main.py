import logging
import socket
import sys
import threading
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import Settings
from app.core.database import Database
from app.core.errors import AppError
from app.core.lifecycle import start
from app.core.logging import setup_logging
from app.core.security import same_secret
from app.modules import routers
from app.modules.auth.deps import PublicDb

log = logging.getLogger("pos")


def create_app(settings: Settings) -> FastAPI:
    setup_logging(settings.data_dir)
    db = Database(settings.database_path, settings.backup_dir)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        start(app)
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings, app.state.db, app.state.damaged = settings, db, False

    @app.middleware("http")
    async def require_launch_secret(request: Request, call_next):
        if not same_secret(request.headers.get("x-launch-secret", ""), settings.launch_secret):
            return JSONResponse(AppError("unauthorized", 401).body(), 401)
        if app.state.damaged and request.url.path != "/api/health":
            return JSONResponse(AppError("damaged", 503).body(), 503)
        return await call_next(request)

    @app.exception_handler(AppError)
    async def app_error(_request, error: AppError):
        return JSONResponse(error.body(), error.status)

    @app.exception_handler(RequestValidationError)
    async def invalid(_request, error: RequestValidationError):
        fields = [".".join(str(p) for p in e["loc"][1:]) for e in error.errors()]
        return JSONResponse(AppError("invalid_input", 422, fields=fields).body(), 422)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, error: Exception):
        log.error("unhandled error on %s", request.url.path, exc_info=error)
        return JSONResponse(AppError("internal_error", 500).body(), 500)

    @app.get("/api/health")
    def health(_db: PublicDb):
        return {"status": "damaged" if app.state.damaged else "ok"}

    for router in routers():
        app.include_router(router)
    return app


def serve(settings: Settings, host: str = "127.0.0.1") -> None:
    if host != "127.0.0.1":
        raise ValueError("the API only listens on 127.0.0.1")
    sock = socket.socket()
    sock.bind((host, settings.port))
    sock.listen()  # early requests wait instead of failing
    print(f"PORT={sock.getsockname()[1]}", flush=True)  # read by the Electron shell
    config = uvicorn.Config(create_app(settings), log_config=None, access_log=False)
    server = uvicorn.Server(config)

    def stop_with_parent():
        sys.stdin.read()  # ends when the shell closes or dies
        server.should_exit = True

    if not sys.stdin.isatty():
        threading.Thread(target=stop_with_parent, daemon=True).start()
    server.run(sockets=[sock])


if __name__ == "__main__":
    serve(Settings.from_env())
