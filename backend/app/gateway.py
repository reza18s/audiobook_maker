"""Small dependency-free gateway state machine retained for contract tests.

The production HTTP gateway persists queue state and the separate
``backend.app.engine_worker`` calls isolated engine services. This module keeps
the original Phase 2 state-machine contract available without loading model
dependencies.
"""

from __future__ import annotations

from dataclasses import replace
from threading import RLock
from typing import Iterable
from uuid import uuid4

from .contracts import (
    DependencyRequirement,
    DependencyState,
    DownloadApproval,
    EngineCapability,
    GenerateRequest,
    JobStatus,
    JobStatusResponse,
    Progress,
    to_json_dict,
)


class GatewayError(ValueError):
    """A client request cannot be fulfilled by the gateway."""


class Gateway:
    """In-memory Phase 2 gateway; persistence and workers come in later phases."""

    def __init__(self, capabilities: Iterable[EngineCapability] = ()) -> None:
        self._capabilities = {item.id: item for item in capabilities}
        self._jobs: dict[str, JobStatusResponse] = {}
        self._lock = RLock()

    def health(self) -> dict[str, str]:
        return {"status": "ready", "contract_version": "1"}

    def capabilities(self) -> list[dict]:
        return [to_json_dict(item) for item in self._capabilities.values()]

    def submit(self, request: GenerateRequest) -> JobStatusResponse:
        with self._lock:
            if request.engine_id not in self._capabilities:
                raise GatewayError(f"unknown engine: {request.engine_id}")
            if request.job_id in self._jobs:
                raise GatewayError(f"job already exists: {request.job_id}")

            requirements = tuple(
                dependency
                for dependency in self._capabilities[request.engine_id].dependencies
                if dependency.state != DependencyState.AVAILABLE
            )
            status = (
                JobStatus.WAITING_FOR_DEPENDENCY
                if requirements
                else JobStatus.QUEUED
            )
            job = JobStatusResponse(
                job_id=request.job_id,
                status=status,
                dependencies=requirements,
                progress=Progress(message="Waiting for dependency approval" if requirements else "Queued"),
            )
            self._jobs[request.job_id] = job
            return job

    def get_job(self, job_id: str) -> JobStatusResponse:
        with self._lock:
            try:
                return self._jobs[job_id]
            except KeyError as error:
                raise GatewayError(f"unknown job: {job_id}") from error

    def cancel(self, job_id: str) -> JobStatusResponse:
        with self._lock:
            job = self.get_job(job_id)
            if job.status in {JobStatus.QUEUED, JobStatus.WAITING_FOR_DEPENDENCY}:
                job = replace(job, status=JobStatus.CANCELLED, progress=Progress(message="Cancelled"))
                self._jobs[job_id] = job
            elif job.status in {JobStatus.RUNNING, JobStatus.RETRYING}:
                job = replace(job, status=JobStatus.CANCEL_REQUESTED)
                self._jobs[job_id] = job
            return job

    def approve_dependency(self, approval: DownloadApproval) -> JobStatusResponse | None:
        """Record approval and release waiting jobs; actual download is a worker concern."""

        with self._lock:
            for job_id, job in self._jobs.items():
                if not any(item.id == approval.requirement_id for item in job.dependencies):
                    continue
                if not approval.approved:
                    declined = replace(
                        job,
                        status=JobStatus.FAILED,
                        error="Dependency download declined by user",
                    )
                    self._jobs[job_id] = declined
                    return declined
                remaining = tuple(
                    replace(item, state=DependencyState.AVAILABLE)
                    for item in job.dependencies
                    if item.id != approval.requirement_id
                )
                released = replace(
                    job,
                    status=JobStatus.QUEUED if not remaining else JobStatus.WAITING_FOR_DEPENDENCY,
                    dependencies=remaining,
                    progress=Progress(message="Queued" if not remaining else "Waiting for dependency approval"),
                )
                self._jobs[job_id] = released
                return released
            raise GatewayError(f"unknown dependency requirement: {approval.requirement_id}")


def new_job_id() -> str:
    return str(uuid4())
