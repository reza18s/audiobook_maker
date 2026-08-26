"""Local entry point for the FastAPI gateway."""

import os

from .api import create_app


app = create_app(
    database_path=os.environ.get("AUDIOBOOK_DATABASE", "sqlite-data/audiobook.sqlite3"),
    storage_root=os.environ.get("AUDIOBOOK_STORAGE_ROOT", "project-data"),
)
