"""Durable generation worker for isolated HTTP TTS engine services."""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from threading import Event
from typing import Mapping

from .contracts import GenerateRequest, JobStatus, Progress
from .database import SQLiteStore
from .engine_client import EngineClient, EngineClientError, configured_engine_urls
from .queue import SQLiteQueue

LOGGER = logging.getLogger(__name__)


class GenerationWorker:
    """Claim one queue item, call its engine, and persist the WAV artifact."""

    def __init__(
        self,
        database_path: str | Path,
        storage_root: str | Path,
        engine_urls: Mapping[str, str] | None = None,
        *,
        poll_seconds: float = 1.0,
        request_timeout_seconds: float = 300.0,
        clients: Mapping[str, EngineClient] | None = None,
    ) -> None:
        self.root = Path(storage_root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.store = SQLiteStore(database_path)
        self.queue = SQLiteQueue(database_path)
        self.poll_seconds = max(0.1, poll_seconds)
        self.clients = dict(clients or {
            engine_id: EngineClient(url, timeout_seconds=request_timeout_seconds)
            for engine_id, url in (engine_urls or configured_engine_urls()).items()
        })

    def close(self) -> None:
        self.queue.close()
        self.store.close()

    def run_once(self) -> bool:
        request = self.queue.claim_next()
        if request is None:
            return False
        sentence = self.store.get_sentence_by_generation_job(request.job_id)
        try:
            if sentence is None:
                raise EngineClientError("generation job is not attached to a sentence")
            if self.queue.get_status(request.job_id).status == JobStatus.CANCEL_REQUESTED:
                self._cancel(request.job_id, sentence)
                return True
            client = self.clients.get(request.engine_id)
            if client is None:
                raise EngineClientError(f"no engine service is configured for {request.engine_id}")

            self.queue.update_progress(
                request.job_id,
                Progress(completed=0, total=1, percent=0, message="Preparing engine"),
            )
            client.ensure_ready()
            self._upload_speaker_sample(client, request, sentence["project_id"])
            self.queue.update_progress(
                request.job_id,
                Progress(completed=0, total=1, percent=0, message="Generating audio"),
            )
            audio = client.generate(request)

            current_sentence = self.store.get_sentence_by_generation_job(request.job_id)
            if current_sentence is None:
                # The user edited the sentence while the engine was running.
                self.queue.complete(request.job_id)
                return True
            audio_path = self._write_audio(current_sentence["project_id"], current_sentence["id"], audio)
            status = self.queue.complete(request.job_id, audio_path)
            if status.status == JobStatus.CANCELLED:
                self._remove_artifact(audio_path)
                self.store.cancel_generation(current_sentence["id"], request.job_id)
                return True
            self.queue.update_progress(
                request.job_id,
                Progress(completed=1, total=1, percent=100, message="Audio generated"),
            )
            if not self.store.complete_generation(current_sentence["id"], request.job_id, audio_path):
                self._remove_artifact(audio_path)
            return True
        except Exception as error:
            self._handle_failure(request, sentence, error)
            return True

    def run_forever(self, stop_event: Event | None = None) -> None:
        stop_event = stop_event or Event()
        while not stop_event.is_set():
            if not self.run_once():
                stop_event.wait(self.poll_seconds)

    def _handle_failure(self, request: GenerateRequest, sentence: dict | None, error: Exception) -> None:
        message = str(error) or error.__class__.__name__
        LOGGER.warning("generation job %s failed: %s", request.job_id, message)
        status = self.queue.fail(request.job_id, message)
        if status.status == JobStatus.CANCELLED:
            if sentence:
                self.store.cancel_generation(sentence["id"], request.job_id)
            return
        if status.status == JobStatus.RETRYING:
            self.queue.requeue_retry(request.job_id)
            return
        if sentence:
            self.store.fail_generation(sentence["id"], request.job_id, message)

    def _cancel(self, job_id: str, sentence: dict) -> None:
        self.queue.mark_cancelled(job_id)
        self.store.cancel_generation(sentence["id"], job_id)

    def _upload_speaker_sample(self, client: EngineClient, request: GenerateRequest, project_id: str) -> None:
        if not request.speaker_sample:
            return
        sample_name = Path(request.speaker_sample).name
        sample_path = (self.root / project_id / "samples" / sample_name).resolve()
        try:
            sample_path.relative_to(self.root / project_id)
        except ValueError as error:
            raise EngineClientError("speaker sample path is outside the project volume") from error
        if not sample_path.is_file():
            return
        client.upload_sample(sample_path.stem, sample_path.read_bytes())

    def _write_audio(self, project_id: str, sentence_id: str, audio: bytes) -> str:
        destination = (self.root / project_id / "audio" / f"{sentence_id}.wav").resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.relative_to(self.root)
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix=f".{sentence_id}.", suffix=".tmp", dir=destination.parent, delete=False
        ) as temporary:
            temporary.write(audio)
            temporary_path = Path(temporary.name)
        temporary_path.replace(destination)
        return destination.relative_to(self.root).as_posix()

    def _remove_artifact(self, relative_path: str) -> None:
        candidate = (self.root / relative_path).resolve()
        try:
            candidate.relative_to(self.root)
        except ValueError:
            return
        candidate.unlink(missing_ok=True)


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    worker = GenerationWorker(
        os.environ.get("AUDIOBOOK_DATABASE", "sqlite-data/audiobook.sqlite3"),
        os.environ.get("AUDIOBOOK_STORAGE_ROOT", "project-data"),
        poll_seconds=float(os.environ.get("ENGINE_WORKER_POLL_SECONDS", "1")),
        request_timeout_seconds=float(os.environ.get("ENGINE_REQUEST_TIMEOUT_SECONDS", "300")),
    )
    try:
        worker.run_forever()
    except KeyboardInterrupt:
        LOGGER.info("generation worker stopped")
    finally:
        worker.close()


if __name__ == "__main__":
    main()
