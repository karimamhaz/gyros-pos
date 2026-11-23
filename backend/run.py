"""Entry point of the packaged backend."""

from app.core.config import Settings
from app.main import serve

if __name__ == "__main__":
    serve(Settings.from_env())
