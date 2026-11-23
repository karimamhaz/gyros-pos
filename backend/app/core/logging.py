import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup_logging(data_dir: Path) -> None:
    folder = data_dir / "logs"
    folder.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        folder / "pos.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8"
    )
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("pos")
    for old in logger.handlers[:]:
        logger.removeHandler(old)
        old.close()
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
