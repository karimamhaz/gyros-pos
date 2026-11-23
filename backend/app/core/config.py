import os
from pathlib import Path

from pydantic import BaseModel, Field


class Settings(BaseModel):
    data_dir: Path
    backup_dir: Path
    launch_secret: str = Field(min_length=1)
    port: int = 0

    @property
    def database_path(self) -> Path:
        return self.data_dir / "pos.db"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=Path(os.environ["POS_DATA_DIR"]),
            backup_dir=Path(os.environ["POS_BACKUP_DIR"]),
            launch_secret=os.environ["POS_LAUNCH_SECRET"],
            port=int(os.environ.get("POS_PORT", "0")),
        )
