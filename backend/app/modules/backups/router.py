from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.errors import AppError
from app.modules.auth import service as auth
from app.modules.auth.deps import AdminCtx
from app.modules.backups import service
from app.modules.users.schemas import AnyPassword

router = APIRouter(prefix="/api/backups")


class RestoreIn(BaseModel):
    """`file` is a name from the backup folder, or a full path the Admin picked."""

    file: str = Field(min_length=1, max_length=500)
    password: AnyPassword


@router.get("")
def list_backups(ctx: AdminCtx):
    with ctx.tx() as db:
        records = service.records(db)
    return {"records": records, "files": service.files(ctx.database)}


@router.post("/restore")
def restore(body: RestoreIn, ctx: AdminCtx):
    auth.check_own_password(ctx, body.password)
    with ctx.tx() as db:
        if auth.open_shift(db):
            raise AppError("close_shift_first", 409)
    source = Path(body.file)
    if not source.is_absolute():
        source = ctx.database.backup_dir / source.name
    service.restore(ctx.database, source, ctx.name, ctx.session_id)
    return {}
