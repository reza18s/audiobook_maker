"""HTTP client and discovery helpers for isolated TTS engine services."""

from __future__ import annotations

import json
import os
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .contracts import GenerateRequest


class EngineClientError(RuntimeError):
    """An engine service could not satisfy a request."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def configured_engine_urls(environ: Mapping[str, str] | None = None) -> dict[str, str]:
    """Read engine URLs from the deployment environment."""

    values = dict(os.environ if environ is None else environ)
    result: dict[str, str] = {}
    raw_urls = values.get("ENGINE_WORKER_URLS", "").strip()
    if raw_urls:
        try:
            parsed = json.loads(raw_urls)
        except json.JSONDecodeError as error:
            raise EngineClientError("ENGINE_WORKER_URLS must contain valid JSON") from error
        if not isinstance(parsed, dict):
            raise EngineClientError("ENGINE_WORKER_URLS must be a JSON object")
        for engine_id, url in parsed.items():
            if isinstance(engine_id, str) and isinstance(url, str) and url.strip():
                result[engine_id.strip()] = url.strip().rstrip("/")

    named = {"F5TTS_URL": "f5tts", "CHATTERBOX_URL": "chatterbox"}
    for variable, engine_id in named.items():
        url = values.get(variable, "").strip()
        if url:
            result[engine_id] = url.rstrip("/")

    for variable, url in values.items():
        if variable.startswith("ENGINE_URL_") and isinstance(url, str) and url.strip():
            engine_id = variable.removeprefix("ENGINE_URL_").lower().replace("_", "-")
            if engine_id:
                result[engine_id] = url.strip().rstrip("/")
    return result


class EngineClient:
    """Small standard-library client for the engine repository contract."""

    def __init__(self, base_url: str, *, timeout_seconds: float = 300.0, api_prefix: str = "") -> None:
        clean_url = base_url.strip().rstrip("/")
        if not clean_url:
            raise EngineClientError("engine URL cannot be empty")
        self.base_url = clean_url
        self.timeout_seconds = timeout_seconds
        self.api_prefix = "/" + api_prefix.strip("/") if api_prefix.strip("/") else ""

    def health(self) -> dict[str, Any]:
        return self._json_request("/health")

    def info(self) -> dict[str, Any]:
        return self._json_request("/info")

    def load(self, model_name: str) -> dict[str, Any]:
        return self._json_request("/load", method="POST", payload={"engineModelName": model_name})

    def ensure_ready(self) -> dict[str, Any]:
        """Load the configured default model when a service has not loaded one."""

        health = self.health()
        if health.get("status") == "ready" and health.get("engineModelLoaded"):
            return health

        info = self.info()
        model_name = info.get("defaultModel")
        if not model_name:
            models = info.get("models")
            if isinstance(models, list) and models and isinstance(models[0], dict):
                model_name = models[0].get("name")
        if not isinstance(model_name, str) or not model_name:
            raise EngineClientError("engine did not report a default model")
        self.load(model_name)
        health = self.health()
        if health.get("status") != "ready" or not health.get("engineModelLoaded"):
            detail = health.get("error") or health.get("status") or "engine is not ready"
            raise EngineClientError(f"engine model is not ready: {detail}")
        return health

    def generate(self, request: GenerateRequest) -> bytes:
        """Generate one WAV artifact for a durable queue request."""

        payload = {
            "text": request.text,
            "language": request.language.strip() or "en",
            "ttsSpeakerWav": request.speaker_sample or "",
            "parameters": dict(request.parameters),
        }
        body, headers = self._request("/generate", method="POST", payload=payload)
        if not body:
            raise EngineClientError("engine returned an empty audio response")
        if not body.startswith(b"RIFF") or b"WAVE" not in body[:16]:
            content_type = headers.get("Content-Type", "unknown")
            raise EngineClientError(f"engine returned non-WAV audio ({content_type})")
        return body

    def capability(self, configured_id: str) -> dict[str, Any]:
        """Translate engine metadata into the gateway capability shape."""

        info = self.info()
        health = self.health()
        return {
            "id": str(info.get("name") or configured_id),
            "display_name": str(info.get("displayName") or configured_id),
            "version": str(health.get("packageVersion") or "unknown"),
            "engine_type": str(info.get("engineType") or "tts"),
            "supported_languages": info.get("supportedLanguages") or [],
            "requires_gpu": bool(info.get("requiresGpu", False)),
            "max_concurrency": 1,
            "parameters": info.get("parameters") or {},
            "healthy": health.get("status") == "ready",
            "model_loaded": bool(health.get("engineModelLoaded")),
            "device": health.get("device", "unknown"),
        }

    def _json_request(
        self, path: str, *, method: str = "GET", payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        body, _ = self._request(path, method=method, payload=payload)
        try:
            value = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise EngineClientError("engine returned invalid JSON") from error
        if not isinstance(value, dict):
            raise EngineClientError("engine returned a non-object JSON response")
        return value

    def _request(
        self, path: str, *, method: str = "GET", payload: dict[str, Any] | None = None
    ) -> tuple[bytes, Mapping[str, str]]:
        paths = [f"{self.api_prefix}{path}"]
        if not self.api_prefix:
            # The engine repository currently serves the contract at root;
            # the fallback keeps the client compatible with a future /v1 API.
            paths.append(f"/v1{path}")
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        for index, route in enumerate(paths):
            request = Request(
                f"{self.base_url}{route}",
                data=body,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                method=method,
            )
            try:
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    return response.read(), response.headers
            except HTTPError as error:
                response_body = error.read()
                if error.code == 404 and index < len(paths) - 1:
                    continue
                raise EngineClientError(_http_error_detail(response_body, error.code), error.code) from error
            except URLError as error:
                raise EngineClientError(f"engine is unavailable: {error.reason}") from error
            except TimeoutError as error:
                raise EngineClientError("engine request timed out") from error
        raise EngineClientError("engine endpoint was not found", 404)


class EngineRegistry:
    """Discover healthy engine metadata for the desktop capability screen."""

    def __init__(self, endpoints: Mapping[str, str], *, timeout_seconds: float = 2.0) -> None:
        self.clients = {
            engine_id: EngineClient(url, timeout_seconds=timeout_seconds)
            for engine_id, url in endpoints.items()
        }

    @classmethod
    def from_environment(cls, environ: Mapping[str, str] | None = None) -> "EngineRegistry":
        values = dict(os.environ if environ is None else environ)
        timeout = float(values.get("ENGINE_DISCOVERY_TIMEOUT_SECONDS", "2"))
        return cls(configured_engine_urls(values), timeout_seconds=timeout)

    def discover(self) -> list[dict[str, Any]]:
        capabilities = []
        for engine_id, client in self.clients.items():
            try:
                capabilities.append(client.capability(engine_id))
            except EngineClientError:
                continue
        return capabilities


def _http_error_detail(body: bytes, status_code: int) -> str:
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        parsed = None
    if isinstance(parsed, dict) and parsed.get("detail"):
        return f"engine request failed ({status_code}): {parsed['detail']}"
    return f"engine request failed ({status_code})"
