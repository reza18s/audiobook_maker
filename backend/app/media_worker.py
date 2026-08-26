"""Standalone media-worker loop for the Docker deployment."""

from __future__ import annotations

import os
import time
from pathlib import Path

from .database import SQLiteStore
from .media import MediaExportService


def run() -> None:
    database_path = os.environ.get("AUDIOBOOK_DATABASE", "sqlite-data/audiobook.sqlite3")
    store = SQLiteStore(database_path)
    service = MediaExportService(store, ffmpeg_bin=os.environ.get("FFMPEG_BIN", "ffmpeg"))
    poll_seconds = float(os.environ.get("MEDIA_POLL_SECONDS", "1"))
    try:
        while True:
            for export in store.list_pending_exports():
                try:
                    service.export_project(
                        export["project_id"],
                        output_path=Path(export["output_path"]),
                        output_format=export["format"],
                        pause_seconds=export["pause_seconds"],
                        export_id=export["id"],
                    )
                except Exception:
                    # The service records failure state; the worker continues
                    # processing later exports.
                    continue
            time.sleep(poll_seconds)
    finally:
        store.close()


if __name__ == "__main__":
    run()
