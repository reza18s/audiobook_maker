"""Stable JSON contracts shared by the desktop client and workers.

This module intentionally uses only the Python standard library.  The API
implementation can later use FastAPI or another transport without coupling
the domain contract to that framework.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Mapping


CONTRACT_VERSION = "1"
DEFAULT_MAX_ATTEMPTS = 3


class ContractError(ValueError):
    """Raised when a request cannot be represented by the public contract."""


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    RETRYING = "retrying"
    WAITING_FOR_DEPENDENCY = "waiting_for_dependency"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"


class DependencyKind(str, Enum):
    PACKAGE = "package"
    MODEL = "model"


class DependencyState(str, Enum):
    AVAILABLE = "available"
    APPROVAL_REQUIRED = "approval_required"
    DOWNLOADING = "downloading"
    FAILED = "failed"


@dataclass(frozen=True)
class Progress:
    completed: int = 0
    total: int = 0
    percent: float = 0.0
    message: str = ""

    def __post_init__(self) -> None:
        if self.completed < 0 or self.total < 0:
            raise ContractError("progress values cannot be negative")
        if self.total and self.completed > self.total:
            raise ContractError("completed progress cannot exceed total")
        if not 0 <= self.percent <= 100:
            raise ContractError("progress percent must be between 0 and 100")


@dataclass(frozen=True)
class DependencyRequirement:
    id: str
    kind: DependencyKind
    name: str
    version: str = ""
    source: str = ""
    size_bytes: int | None = None
    reason: str = ""
    state: DependencyState = DependencyState.APPROVAL_REQUIRED

    def __post_init__(self) -> None:
        if not self.id or not self.name:
            raise ContractError("dependency id and name are required")
        if self.size_bytes is not None and self.size_bytes < 0:
            raise ContractError("dependency size cannot be negative")


@dataclass(frozen=True)
class EngineCapability:
    id: str
    display_name: str
    version: str
    engine_type: str = "tts"
    supported_languages: tuple[str, ...] = ()
    requires_gpu: bool = True
    max_concurrency: int = 1
    parameters: Mapping[str, Any] = field(default_factory=dict)
    dependencies: tuple[DependencyRequirement, ...] = ()

    def __post_init__(self) -> None:
        if not self.id or not self.display_name or not self.version:
            raise ContractError("engine id, display name, and version are required")
        if self.max_concurrency < 1:
            raise ContractError("max concurrency must be at least 1")


@dataclass(frozen=True)
class GenerateRequest:
    job_id: str
    engine_id: str
    text: str
    language: str = ""
    speaker_sample: str | None = None
    parameters: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.job_id or not self.engine_id:
            raise ContractError("job id and engine id are required")
        if not self.text.strip():
            raise ContractError("text cannot be empty")


@dataclass(frozen=True)
class JobStatusResponse:
    job_id: str
    status: JobStatus
    attempts: int = 0
    max_attempts: int = DEFAULT_MAX_ATTEMPTS
    progress: Progress = field(default_factory=Progress)
    error: str | None = None
    audio_path: str | None = None
    dependencies: tuple[DependencyRequirement, ...] = ()

    def __post_init__(self) -> None:
        if not self.job_id:
            raise ContractError("job id is required")
        if not 0 <= self.attempts <= self.max_attempts:
            raise ContractError("attempts must be within the configured retry limit")
        if self.max_attempts < 1:
            raise ContractError("max attempts must be at least 1")


@dataclass(frozen=True)
class DownloadApproval:
    requirement_id: str
    approved: bool

    def __post_init__(self) -> None:
        if not self.requirement_id:
            raise ContractError("requirement id is required")


def to_json_dict(value: Any) -> dict[str, Any]:
    """Convert a contract object to JSON-compatible data for an HTTP API."""

    if not hasattr(value, "__dataclass_fields__"):
        raise TypeError("value must be a contract dataclass")
    result = asdict(value)
    return _normalise(result)


def _normalise(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, tuple):
        return [_normalise(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalise(item) for key, item in value.items()}
    return value
