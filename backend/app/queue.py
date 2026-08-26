"""Durable SQLite queue used by the Phase 3 worker boundary."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock

from .contracts import (
    DependencyKind,
    DependencyRequirement,
    DependencyState,
    GenerateRequest,
    JobStatus,
    JobStatusResponse,
    Progress,
)


class QueueError(ValueError):
    """A queue operation cannot be completed."""


class SQLiteQueue:
    """A small, restart-safe queue with configurable active-job capacity."""

    def __init__(self, database_path: str | Path, max_concurrency: int = 1) -> None:
        if max_concurrency < 1:
            raise QueueError("max concurrency must be at least 1")
        self.database_path = str(database_path)
        self.max_concurrency = max_concurrency
        self._lock = RLock()
        self._connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute("PRAGMA foreign_keys=ON")
        self._create_schema()
        self.recover_running()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def enqueue(
        self,
        request: GenerateRequest,
        *,
        status: JobStatus = JobStatus.QUEUED,
        dependencies: tuple[DependencyRequirement, ...] = (),
        max_attempts: int = 3,
    ) -> JobStatusResponse:
        if max_attempts < 1:
            raise QueueError("max attempts must be at least 1")
        progress_message = "Waiting for dependency approval" if dependencies else "Queued"
        now = _timestamp()
        with self._lock:
            try:
                self._connection.execute(
                    """
                    INSERT INTO jobs (
                        job_id, engine_id, text, language, speaker_sample, parameters,
                        status, attempts, max_attempts, completed, total, percent,
                        message, error, audio_path, dependencies, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, 0, ?, NULL, NULL, ?, ?, ?)
                    """,
                    (
                        request.job_id,
                        request.engine_id,
                        request.text,
                        request.language,
                        request.speaker_sample,
                        json.dumps(dict(request.parameters)),
                        status.value,
                        max_attempts,
                        progress_message,
                        json.dumps([_dependency_to_dict(item) for item in dependencies]),
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as error:
                raise QueueError(f"job already exists: {request.job_id}") from error
            self._connection.commit()
            return self.get_status(request.job_id)

    def get_request(self, job_id: str) -> GenerateRequest:
        row = self._row(job_id)
        return GenerateRequest(
            job_id=row["job_id"],
            engine_id=row["engine_id"],
            text=row["text"],
            language=row["language"],
            speaker_sample=row["speaker_sample"],
            parameters=json.loads(row["parameters"]),
        )

    def get_status(self, job_id: str) -> JobStatusResponse:
        row = self._row(job_id)
        return _status_from_row(row)

    def list_statuses(self, *, limit: int = 100) -> list[JobStatusResponse]:
        if limit < 1 or limit > 1000:
            raise QueueError("job limit must be between 1 and 1000")
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC, job_id LIMIT ?", (limit,)
            ).fetchall()
        return [_status_from_row(row) for row in rows]

    def claim_next(self) -> GenerateRequest | None:
        """Atomically claim the oldest queued job, respecting max concurrency."""

        with self._lock:
            active = self._connection.execute(
                "SELECT COUNT(*) FROM jobs WHERE status IN (?, ?, ?)",
                (JobStatus.RUNNING.value, JobStatus.RETRYING.value, JobStatus.CANCEL_REQUESTED.value),
            ).fetchone()[0]
            if active >= self.max_concurrency:
                return None
            row = self._connection.execute(
                "SELECT * FROM jobs WHERE status = ? ORDER BY created_at, job_id LIMIT 1",
                (JobStatus.QUEUED.value,),
            ).fetchone()
            if row is None:
                return None
            self._connection.execute(
                "UPDATE jobs SET status = ?, attempts = attempts + 1, message = ?, updated_at = ? WHERE job_id = ?",
                (JobStatus.RUNNING.value, "Running", _timestamp(), row["job_id"]),
            )
            self._connection.commit()
            return self.get_request(row["job_id"])

    def update_progress(self, job_id: str, progress: Progress) -> JobStatusResponse:
        with self._lock:
            self._row(job_id)
            self._connection.execute(
                "UPDATE jobs SET completed = ?, total = ?, percent = ?, message = ?, updated_at = ? WHERE job_id = ?",
                (progress.completed, progress.total, progress.percent, progress.message, _timestamp(), job_id),
            )
            self._connection.commit()
            return self.get_status(job_id)

    def complete(self, job_id: str, audio_path: str | None = None) -> JobStatusResponse:
        return self._set_terminal(job_id, JobStatus.COMPLETED, audio_path=audio_path, message="Completed")

    def fail(self, job_id: str, error: str) -> JobStatusResponse:
        with self._lock:
            row = self._row(job_id)
            next_status = (
                JobStatus.RETRYING
                if row["attempts"] < row["max_attempts"]
                else JobStatus.FAILED
            )
            self._connection.execute(
                "UPDATE jobs SET status = ?, error = ?, message = ?, updated_at = ? WHERE job_id = ?",
                (next_status.value, error, "Retrying" if next_status == JobStatus.RETRYING else "Failed", _timestamp(), job_id),
            )
            self._connection.commit()
            return self.get_status(job_id)

    def requeue_retry(self, job_id: str) -> JobStatusResponse:
        with self._lock:
            row = self._row(job_id)
            if row["status"] != JobStatus.RETRYING.value:
                raise QueueError("only retrying jobs can be requeued")
            self._connection.execute(
                "UPDATE jobs SET status = ?, updated_at = ? WHERE job_id = ?",
                (JobStatus.QUEUED.value, _timestamp(), job_id),
            )
            self._connection.commit()
            return self.get_status(job_id)

    def cancel(self, job_id: str) -> JobStatusResponse:
        with self._lock:
            row = self._row(job_id)
            current = JobStatus(row["status"])
            if current in {JobStatus.QUEUED, JobStatus.WAITING_FOR_DEPENDENCY}:
                status, message = JobStatus.CANCELLED, "Cancelled"
            elif current in {JobStatus.RUNNING, JobStatus.RETRYING}:
                status, message = JobStatus.CANCEL_REQUESTED, "Cancellation requested"
            else:
                return _status_from_row(row)
            self._connection.execute(
                "UPDATE jobs SET status = ?, message = ?, updated_at = ? WHERE job_id = ?",
                (status.value, message, _timestamp(), job_id),
            )
            self._connection.commit()
            return self.get_status(job_id)

    def recover_running(self) -> None:
        """Return interrupted jobs to the queue after a process restart."""

        with self._lock:
            now = _timestamp()
            self._connection.execute(
                "UPDATE jobs SET status = ?, message = ?, updated_at = ? WHERE status = ? AND attempts < max_attempts",
                (JobStatus.QUEUED.value, "Recovered after restart", now, JobStatus.RUNNING.value),
            )
            self._connection.execute(
                "UPDATE jobs SET status = ?, error = ?, message = ?, updated_at = ? WHERE status = ? AND attempts >= max_attempts",
                (JobStatus.FAILED.value, "Worker stopped after the retry limit", "Failed", now, JobStatus.RUNNING.value),
            )
            self._connection.commit()

    def _create_schema(self) -> None:
        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                engine_id TEXT NOT NULL,
                text TEXT NOT NULL,
                language TEXT NOT NULL,
                speaker_sample TEXT,
                parameters TEXT NOT NULL,
                status TEXT NOT NULL,
                attempts INTEGER NOT NULL,
                max_attempts INTEGER NOT NULL,
                completed INTEGER NOT NULL,
                total INTEGER NOT NULL,
                percent REAL NOT NULL,
                message TEXT NOT NULL,
                error TEXT,
                audio_path TEXT,
                dependencies TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS jobs_status_created_idx ON jobs(status, created_at, job_id);
            """
        )
        self._connection.commit()

    def _row(self, job_id: str) -> sqlite3.Row:
        row = self._connection.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if row is None:
            raise QueueError(f"unknown job: {job_id}")
        return row

    def _set_terminal(self, job_id: str, status: JobStatus, *, audio_path: str | None, message: str) -> JobStatusResponse:
        with self._lock:
            self._row(job_id)
            self._connection.execute(
                "UPDATE jobs SET status = ?, audio_path = ?, percent = 100, message = ?, updated_at = ? WHERE job_id = ?",
                (status.value, audio_path, message, _timestamp(), job_id),
            )
            self._connection.commit()
            return self.get_status(job_id)


def _timestamp() -> str:
    return datetime.now(UTC).isoformat()


def _dependency_to_dict(dependency: DependencyRequirement) -> dict:
    return {
        "id": dependency.id,
        "kind": dependency.kind.value,
        "name": dependency.name,
        "version": dependency.version,
        "source": dependency.source,
        "size_bytes": dependency.size_bytes,
        "reason": dependency.reason,
        "state": dependency.state.value,
    }


def _dependency_from_dict(value: dict) -> DependencyRequirement:
    return DependencyRequirement(
        id=value["id"],
        kind=DependencyKind(value["kind"]),
        name=value["name"],
        version=value.get("version", ""),
        source=value.get("source", ""),
        size_bytes=value.get("size_bytes"),
        reason=value.get("reason", ""),
        state=DependencyState(value.get("state", DependencyState.APPROVAL_REQUIRED.value)),
    )


def _status_from_row(row: sqlite3.Row) -> JobStatusResponse:
    return JobStatusResponse(
        job_id=row["job_id"],
        status=JobStatus(row["status"]),
        attempts=row["attempts"],
        max_attempts=row["max_attempts"],
        progress=Progress(
            completed=row["completed"],
            total=row["total"],
            percent=row["percent"],
            message=row["message"],
        ),
        error=row["error"],
        audio_path=row["audio_path"],
        dependencies=tuple(_dependency_from_dict(item) for item in json.loads(row["dependencies"])),
    )
