"""Restart-safe FFmpeg media worker for audiobook exports."""

from __future__ import annotations

import shlex
import subprocess
import tempfile
from pathlib import Path
from threading import Event, RLock
from typing import Callable

from .database import SQLiteStore


class ExportError(ValueError):
    """Raised when an export cannot be assembled."""


class ExportCancelled(ExportError):
    """Raised when the user cancels an active export."""


ProgressCallback = Callable[[dict], None]


class MediaExportService:
    """Assemble ordered sentence audio outside the TTS engine containers."""

    def __init__(self, store: SQLiteStore, ffmpeg_bin: str = "ffmpeg") -> None:
        self.store = store
        self.ffmpeg_bin = ffmpeg_bin
        self._lock = RLock()
        self._cancel_events: dict[str, Event] = {}
        self._processes: dict[str, subprocess.Popen] = {}
        self.store.recover_exports()

    def cancel(self, export_id: str) -> dict:
        with self._lock:
            event = self._cancel_events.get(export_id)
            if event is not None:
                event.set()
            process = self._processes.get(export_id)
            if process is not None and process.poll() is None:
                process.terminate()
        export = self.store.get_export(export_id)
        if export["status"] in {"queued", "running"}:
            if event is None and process is None:
                return self.store.update_export(export_id, status="cancelled", error="Cancelled")
            return self.store.update_export(export_id, status="cancelling")
        return export

    def export_project(
        self,
        project_id: str,
        *,
        output_path: str | Path,
        output_format: str = "mp3",
        pause_seconds: float = 0.0,
        on_progress: ProgressCallback | None = None,
        export_id: str | None = None,
    ) -> dict:
        if output_format not in {"mp3", "wav"}:
            raise ExportError("export format must be mp3 or wav")
        if pause_seconds < 0:
            raise ExportError("pause duration cannot be negative")
        existing_export = self.store.get_export(export_id) if export_id else None
        if existing_export and existing_export["status"] in {"cancelled", "cancelling"}:
            return self.store.update_export(existing_export["id"], status="cancelled", error="Cancelled")
        try:
            sentences = self.store.get_export_sentences(project_id)
            if not sentences:
                raise ExportError("project has no sentences to export")
            invalid = [
                sentence["id"]
                for sentence in sentences
                if sentence["status"] != "completed"
                or not sentence.get("audio_path")
                or not Path(sentence["audio_path"]).is_file()
            ]
            if invalid:
                preview = ", ".join(invalid[:5])
                suffix = "..." if len(invalid) > 5 else ""
                raise ExportError(f"missing or failed sentence audio: {preview}{suffix}")

            destination = Path(output_path)
            if destination.suffix.lower() != f".{output_format}":
                raise ExportError("output path extension must match export format")
            destination.parent.mkdir(parents=True, exist_ok=True)
        except Exception as error:
            if existing_export:
                self.store.update_export(existing_export["id"], status="failed", error=str(error))
            raise
        export = existing_export or self.store.create_export(project_id, output_format, pause_seconds, str(destination))
        export_id = export["id"]
        cancel_event = Event()
        with self._lock:
            self._cancel_events[export_id] = cancel_event
        total = len(sentences)
        self.store.update_export(export_id, status="running", total_sentences=total, percent=0)
        self._notify(export_id, on_progress)
        try:
            with tempfile.TemporaryDirectory(prefix=f"audiobook-export-{export_id}-") as temp_dir:
                normalized = []
                for index, sentence in enumerate(sentences, start=1):
                    self._raise_if_cancelled(export_id, cancel_event)
                    normalized_path = Path(temp_dir) / f"{index:08d}.wav"
                    self._run(
                        export_id,
                        cancel_event,
                        [
                            self.ffmpeg_bin, "-hide_banner", "-y", "-i", sentence["audio_path"],
                            "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", str(normalized_path),
                        ],
                    )
                    normalized.append(normalized_path)
                    self.store.update_export(
                        export_id,
                        completed_sentences=index,
                        percent=round(index / total * 90, 2),
                    )
                    self._notify(export_id, on_progress)

                if pause_seconds > 0 and len(normalized) > 1:
                    silence = Path(temp_dir) / "silence.wav"
                    self._run(
                        export_id,
                        cancel_event,
                        [
                            self.ffmpeg_bin, "-hide_banner", "-y", "-f", "lavfi",
                            "-i", "anullsrc=r=44100:cl=stereo", "-t", str(pause_seconds),
                            "-c:a", "pcm_s16le", str(silence),
                        ],
                    )
                concat_list = Path(temp_dir) / "concat.txt"
                entries: list[Path] = []
                for index, audio in enumerate(normalized):
                    if index and pause_seconds > 0:
                        entries.append(silence)
                    entries.append(audio)
                concat_list.write_text(
                    "".join(f"file {shlex.quote(str(path.resolve()))}\n" for path in entries),
                    encoding="utf-8",
                )
                codec = ["-c:a", "libmp3lame", "-b:a", "192k"] if output_format == "mp3" else ["-c:a", "pcm_s16le"]
                self._run(
                    export_id,
                    cancel_event,
                    [
                        self.ffmpeg_bin, "-hide_banner", "-y", "-f", "concat", "-safe", "0",
                        "-i", str(concat_list), *codec, "-progress", "pipe:1", "-nostats",
                        str(destination),
                    ],
                )
            self.store.update_export(export_id, status="completed", completed_sentences=total, percent=100, error=None)
            self._notify(export_id, on_progress)
            return self.store.get_export(export_id)
        except ExportCancelled:
            self.store.update_export(export_id, status="cancelled", error="Cancelled")
            self._notify(export_id, on_progress)
            return self.store.get_export(export_id)
        except Exception as error:
            self.store.update_export(export_id, status="failed", error=str(error))
            self._notify(export_id, on_progress)
            raise
        finally:
            with self._lock:
                self._cancel_events.pop(export_id, None)
                self._processes.pop(export_id, None)

    def _run(self, export_id: str, cancel_event: Event, command: list[str]) -> None:
        self._raise_if_cancelled(export_id, cancel_event)
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        with self._lock:
            self._processes[export_id] = process
        try:
            if process.stdout is not None:
                for _ in process.stdout:
                    if cancel_event.is_set():
                        process.terminate()
                        process.wait()
                        raise ExportCancelled("export cancelled")
            return_code = process.wait()
            self._raise_if_cancelled(export_id, cancel_event)
            if return_code != 0:
                raise ExportError(f"FFmpeg failed with exit code {return_code}")
        finally:
            with self._lock:
                self._processes.pop(export_id, None)

    @staticmethod
    def _raise_if_cancelled(export_id: str, cancel_event: Event) -> None:
        if cancel_event.is_set():
            raise ExportCancelled(f"export cancelled: {export_id}")

    def _notify(self, export_id: str, callback: ProgressCallback | None) -> None:
        if callback:
            callback(self.store.get_export(export_id))
