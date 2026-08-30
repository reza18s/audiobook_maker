"""Restart-safe FFmpeg media worker for audiobook exports."""

from __future__ import annotations

import json
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

    def __init__(self, store: SQLiteStore, ffmpeg_bin: str = "ffmpeg", ffprobe_bin: str = "ffprobe", storage_root: str | Path = ".") -> None:
        self.store = store
        self.ffmpeg_bin = ffmpeg_bin
        self.ffprobe_bin = ffprobe_bin
        self.storage_root = Path(storage_root).resolve()
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
        metadata: dict | None = None,
        on_progress: ProgressCallback | None = None,
        export_id: str | None = None,
    ) -> dict:
        if output_format not in {"mp3", "wav", "m4b"}:
            raise ExportError("export format must be mp3, wav, or m4b")
        if pause_seconds < 0:
            raise ExportError("pause duration cannot be negative")
        existing_export = self.store.get_export(export_id) if export_id else None
        project = self.store.get_project(project_id)
        if metadata is None and existing_export and existing_export.get("metadata"):
            try:
                metadata = json.loads(existing_export["metadata"])
            except (TypeError, json.JSONDecodeError):
                metadata = None
        metadata = metadata or _project_metadata(project)
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
                or not self._resolve_audio_path(sentence["audio_path"]).is_file()
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
        export = existing_export or self.store.create_export(project_id, output_format, pause_seconds, str(destination), metadata)
        if not existing_export:
            self.store.update_export(export["id"], metadata=json.dumps(metadata, ensure_ascii=False))
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
                chapter_ranges: list[dict[str, object]] = []
                elapsed_ms = 0
                current_chapter_key = None
                for index, sentence in enumerate(sentences, start=1):
                    self._raise_if_cancelled(export_id, cancel_event)
                    if output_format == "m4b":
                        chapter_key = f"{sentence.get('document_id', '')}:{sentence.get('chapter_number', 0)}"
                        if chapter_key != current_chapter_key:
                            if chapter_ranges:
                                chapter_ranges[-1]["end_ms"] = elapsed_ms
                            chapter_ranges.append({
                                "key": chapter_key,
                                "title": _chapter_title(sentence),
                                "start_ms": elapsed_ms,
                                "end_ms": elapsed_ms,
                            })
                            current_chapter_key = chapter_key
                    normalized_path = Path(temp_dir) / f"{index:08d}.wav"
                    self._run(
                        export_id,
                        cancel_event,
                        [
                            self.ffmpeg_bin, "-hide_banner", "-y", "-i", str(self._resolve_audio_path(sentence["audio_path"])),
                            "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", str(normalized_path),
                        ],
                    )
                    normalized.append(normalized_path)
                    if output_format == "m4b":
                        elapsed_ms += self._duration_ms(normalized_path)
                    if output_format == "m4b" and pause_seconds > 0 and index < total:
                        elapsed_ms += round(pause_seconds * 1000)
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
                if output_format == "m4b" and chapter_ranges:
                    chapter_ranges[-1]["end_ms"] = elapsed_ms
                metadata_file = None
                if output_format == "m4b":
                    metadata_file = Path(temp_dir) / "metadata.txt"
                    metadata_file.write_text(_ffmetadata(metadata, chapter_ranges), encoding="utf-8")
                codec = {
                    "mp3": ["-c:a", "libmp3lame", "-b:a", "192k"],
                    "wav": ["-c:a", "pcm_s16le"],
                    "m4b": ["-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"],
                }[output_format]
                command = [
                    self.ffmpeg_bin, "-hide_banner", "-y", "-f", "concat", "-safe", "0",
                    "-i", str(concat_list),
                ]
                if metadata_file:
                    command.extend(["-i", str(metadata_file), "-map", "0:a:0", "-map_metadata", "1", "-map_chapters", "1"])
                    cover_path = Path(str(metadata.get("cover_path") or ""))
                    if cover_path.is_file():
                        command.extend([
                            "-i", str(cover_path), "-map", "2:v:0", "-c:v", "mjpeg",
                            "-disposition:v:0", "attached_pic", "-metadata:s:v:0", "title=Cover",
                            "-metadata:s:v:0", "comment=Cover (front)",
                        ])
                command.extend([*codec, "-progress", "pipe:1", "-nostats", str(destination)])
                self._run(export_id, cancel_event, command)
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

    def _resolve_audio_path(self, audio_path: str) -> Path:
        candidate = Path(audio_path)
        return candidate if candidate.is_absolute() else self.storage_root / candidate

    def _notify(self, export_id: str, callback: ProgressCallback | None) -> None:
        if callback:
            callback(self.store.get_export(export_id))

    def _duration_ms(self, path: Path) -> int:
        try:
            result = subprocess.run(
                [self.ffprobe_bin, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                check=True,
                capture_output=True,
                text=True,
            )
            return max(1, round(float(result.stdout.strip()) * 1000))
        except (OSError, ValueError, subprocess.CalledProcessError) as error:
            raise ExportError(f"could not read normalized audio duration: {error}") from error


def _project_metadata(project: dict) -> dict[str, str]:
    return {
        "title": str(project.get("name", "Audiobook")),
        "author": str(project.get("author", "")),
        "narrator": str(project.get("narrator", "")),
        "language": str(project.get("language", "en")),
        "series": str(project.get("series", "")),
        "description": str(project.get("description", "")),
        "cover_path": str(project.get("cover_path") or ""),
    }


def _chapter_title(sentence: dict) -> str:
    number = int(sentence.get("chapter_number") or 0)
    title = str(sentence.get("chapter_title") or "").strip()
    if title and title != str(number):
        return f"Chapter {number}: {title}" if number else title
    return f"Chapter {number}" if number else "Unchaptered text"


def _ffmetadata(metadata: dict, chapter_ranges: list[dict[str, object]]) -> str:
    lines = [";FFMETADATA1"]
    for key in ("title", "author", "narrator", "language", "series", "description"):
        value = str(metadata.get(key, "")).strip()
        if value:
            ffmpeg_key = {"author": "artist", "narrator": "album_artist"}.get(key, key)
            lines.append(f"{ffmpeg_key}={_escape_ffmetadata(value)}")
    for chapter in chapter_ranges:
        start_ms = int(chapter["start_ms"])
        end_ms = max(start_ms + 1, int(chapter["end_ms"]))
        lines.extend([
            "",
            "[CHAPTER]",
            "TIMEBASE=1/1000",
            f"START={start_ms}",
            f"END={end_ms}",
            f"title={_escape_ffmetadata(str(chapter['title']))}",
        ])
    return "\n".join(lines) + "\n"


def _escape_ffmetadata(value: str) -> str:
    return value.replace("\\", "\\\\").replace("=", "\\=").replace(";", "\\;").replace("#", "\\#").replace("\n", "\\n")
