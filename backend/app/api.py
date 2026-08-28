"""FastAPI transport for the gateway domain services."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
from pathlib import Path
from typing import Any
from uuid import uuid4

from .contracts import GenerateRequest, JobStatus, to_json_dict
from .database import DatabaseError, SQLiteStore
from .engine_client import EngineRegistry
from .ingestion import DocumentIngestor, IngestionError
from .media import MediaExportService
from .queue import QueueError, SQLiteQueue


try:
    from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, UploadFile, WebSocket
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse
except ImportError:  # pragma: no cover - depends on optional deployment extras
    BackgroundTasks = Depends = FastAPI = File = Header = HTTPException = UploadFile = WebSocket = None
    CORSMiddleware = FileResponse = None


class ApiConfigurationError(ValueError):
    """The HTTP gateway is missing required deployment configuration."""


def create_app(
    *,
    database_path: str | Path = "sqlite-data/audiobook.sqlite3",
    storage_root: str | Path = "project-data",
    api_token: str | None = None,
    capabilities: list[dict[str, Any]] | None = None,
):
    """Create the versioned API application.

    FastAPI remains optional at module import time so the standard-library
    contracts and queue can still be used without the HTTP deployment extras.
    """

    if FastAPI is None:
        raise ApiConfigurationError("FastAPI extras are required to run the gateway")

    expected_token = api_token or os.environ.get("AUDIOBOOK_API_TOKEN")
    if not expected_token:
        raise ApiConfigurationError("AUDIOBOOK_API_TOKEN must be configured")
    root = Path(storage_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    store = SQLiteStore(database_path)
    queue = SQLiteQueue(database_path)
    ingestor = DocumentIngestor(store)
    media = MediaExportService(store)
    engine_registry = EngineRegistry.from_environment()
    engine_capabilities = list(capabilities) if capabilities is not None else []
    external_media_worker = os.environ.get("MEDIA_WORKER_EXTERNAL", "0").lower() in {"1", "true", "yes", "on"}
    app = FastAPI(title="Audiobook Maker Gateway", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["tauri://localhost", "http://tauri.localhost", "http://localhost:1420"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.store = store
    app.state.queue = queue
    app.state.ingestor = ingestor
    app.state.media = media
    app.state.ingestion_tasks = set()
    app.state.engine_registry = engine_registry

    def schedule_ingestion(document_id: str) -> None:
        task = asyncio.create_task(asyncio.to_thread(ingestor.ingest, document_id))
        app.state.ingestion_tasks.add(task)
        task.add_done_callback(app.state.ingestion_tasks.discard)

    @app.on_event("startup")
    async def resume_ingestion() -> None:
        if capabilities is None:
            engine_capabilities[:] = await asyncio.to_thread(engine_registry.discover)
        for document in store.list_incomplete_documents():
            schedule_ingestion(document["id"])

    @app.on_event("shutdown")
    def close_services() -> None:
        queue.close()
        store.close()

    def require_token(authorization: str | None = Header(default=None)) -> None:
        if authorization != f"Bearer {expected_token}":
            raise HTTPException(status_code=401, detail="invalid API token")

    def project_dir(project_id: str) -> Path:
        path = (root / project_id).resolve()
        if path.parent != root:
            raise HTTPException(status_code=400, detail="invalid project path")
        path.mkdir(parents=True, exist_ok=True)
        return path

    def handle_domain_error(error: Exception) -> None:
        if isinstance(error, (DatabaseError, QueueError, IngestionError, ValueError)):
            raise HTTPException(status_code=400, detail=str(error)) from error
        raise error

    @app.get("/v1/health")
    def health(_: None = Depends(require_token)) -> dict[str, str]:
        return {"status": "ready", "contract_version": "1", "storage": str(root)}

    @app.get("/v1/capabilities")
    def get_capabilities(_: None = Depends(require_token)) -> list[dict[str, Any]]:
        if capabilities is None:
            engine_capabilities[:] = engine_registry.discover()
        return engine_capabilities

    @app.get("/v1/projects")
    def list_projects(_: None = Depends(require_token)) -> list[dict]:
        return store.list_projects()

    @app.post("/v1/projects", status_code=201)
    def create_project(payload: dict[str, Any], _: None = Depends(require_token)) -> dict:
        try:
            return store.create_project(str(payload.get("name", "")))
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.get("/v1/projects/{project_id}/documents")
    def list_documents(project_id: str, _: None = Depends(require_token)) -> list[dict]:
        try:
            return store.list_documents(project_id)
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.post("/v1/projects/{project_id}/documents", status_code=202)
    def upload_document(
        project_id: str,
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        _: None = Depends(require_token),
    ) -> dict:
        try:
            project = store.get_project(project_id)
            filename = Path(file.filename or "document").name
            suffix = Path(filename).suffix.lower()
            if suffix not in {".txt", ".pdf"}:
                raise IngestionError("only TXT and selectable-text PDF files are supported")
            document_id = str(uuid4())
            destination = project_dir(project["id"]) / "documents" / f"{document_id}{suffix}"
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("wb") as output:
                shutil.copyfileobj(file.file, output, length=1024 * 1024)
            document = store.create_document(
                project_id,
                filename,
                str(destination),
                suffix[1:],
                document_id=document_id,
                total_bytes=destination.stat().st_size,
            )
            background_tasks.add_task(ingestor.ingest, document_id)
            return document
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.get("/v1/documents/{document_id}")
    def get_document(document_id: str, _: None = Depends(require_token)) -> dict:
        try:
            return store.get_document(document_id)
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.get("/v1/projects/{project_id}/sentences")
    def list_sentences(
        project_id: str,
        offset: int = 0,
        limit: int = 100,
        query: str = "",
        status: str = "",
        speaker_id: str = "",
        _: None = Depends(require_token),
    ) -> dict:
        try:
            return {
                "items": store.list_sentences(
                    project_id, offset=offset, limit=limit, query=query, status=status, speaker_id=speaker_id
                ),
                "offset": offset,
                "limit": limit,
                "total": store.count_sentences(project_id, query=query, status=status, speaker_id=speaker_id),
            }
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.patch("/v1/sentences/{sentence_id}")
    def update_sentence(sentence_id: str, payload: dict[str, Any], _: None = Depends(require_token)) -> dict:
        try:
            if "text" in payload and not str(payload["text"]).strip():
                raise DatabaseError("sentence text cannot be empty")
            return store.update_sentence(sentence_id, **payload)
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.get("/v1/sentences/{sentence_id}/audio")
    def sentence_audio(sentence_id: str, _: None = Depends(require_token)):
        try:
            sentence = store.get_sentence(sentence_id)
            audio_path = Path(sentence["audio_path"] or "")
            if not audio_path.is_absolute():
                audio_path = (root / audio_path).resolve()
            else:
                audio_path = audio_path.resolve()
            try:
                audio_path.relative_to(root)
            except ValueError as error:
                raise DatabaseError("audio path is outside the configured project volume") from error
            if not audio_path.is_file():
                raise DatabaseError("sentence audio is not available")
            return FileResponse(audio_path)
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.get("/v1/projects/{project_id}/speakers")
    def list_speakers(project_id: str, _: None = Depends(require_token)) -> dict:
        try:
            return {"items": store.list_speakers(project_id), "profiles": store.list_engine_profiles(project_id)}
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.post("/v1/projects/{project_id}/speakers", status_code=201)
    def create_speaker(project_id: str, payload: dict[str, Any], _: None = Depends(require_token)) -> dict:
        try:
            speaker = store.create_speaker(project_id, str(payload.get("name", "")), str(payload.get("color", "#FFFFFF")))
            if payload.get("engine_id"):
                store.upsert_engine_profile(
                    speaker["id"], str(payload["engine_id"]), str(payload.get("voice", "")),
                    json.dumps(payload.get("settings", {})),
                )
            return speaker
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.put("/v1/speakers/{speaker_id}/profile")
    def update_profile(speaker_id: str, payload: dict[str, Any], _: None = Depends(require_token)) -> dict:
        try:
            return store.upsert_engine_profile(
                speaker_id,
                str(payload.get("engine_id", "")),
                str(payload.get("voice", "")),
                json.dumps(payload.get("settings", {})),
            )
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.post("/v1/speakers/{speaker_id}/sample", status_code=201)
    async def upload_speaker_sample(
        speaker_id: str,
        file: UploadFile = File(...),
        _: None = Depends(require_token),
    ) -> dict:
        try:
            speaker = store.get_speaker(speaker_id)
            filename = Path(file.filename or "speaker.wav").name
            if Path(filename).suffix.lower() != ".wav":
                raise DatabaseError("speaker samples must be WAV files")
            sample_id = str(uuid4())
            sample_name = f"{sample_id}.wav"
            destination = project_dir(speaker["project_id"]) / "samples" / sample_name
            destination.parent.mkdir(parents=True, exist_ok=True)
            total_bytes = 0
            with destination.open("wb") as output:
                while chunk := await file.read(1024 * 1024):
                    total_bytes += len(chunk)
                    if total_bytes > 100 * 1024 * 1024:
                        destination.unlink(missing_ok=True)
                        raise DatabaseError("speaker sample must be 100 MB or smaller")
                    output.write(chunk)
            profiles = store.list_engine_profiles(speaker["project_id"])
            profile = next((item for item in profiles if item["speaker_id"] == speaker_id), None)
            if profile:
                store.upsert_engine_profile(
                    speaker_id, profile["engine_id"], sample_name, profile["settings"]
                )
            return {"sample_id": sample_id, "filename": sample_name, "bytes": total_bytes}
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.post("/v1/projects/{project_id}/generation", status_code=202)
    def queue_generation(project_id: str, payload: dict[str, Any], _: None = Depends(require_token)) -> dict:
        try:
            store.get_project(project_id)
            sentence_ids = [str(item) for item in payload.get("sentence_ids", [])]
            if not sentence_ids:
                sentence_ids = store.select_sentence_ids(
                    project_id,
                    query=str(payload.get("query", "")),
                    status=str(payload.get("status", "pending")),
                    speaker_id=str(payload.get("speaker_id", "")),
                )
            queued = []
            for sentence_id in sentence_ids:
                sentence = store.get_sentence(sentence_id)
                if sentence["project_id"] != project_id:
                    raise QueueError("sentence does not belong to project")
                profile = next(
                    (item for item in store.list_engine_profiles(project_id) if item["speaker_id"] == sentence["speaker_id"]),
                    None,
                )
                if profile is None or not profile["engine_id"]:
                    raise QueueError(f"speaker profile is missing for sentence {sentence_id}")
                job_id = str(uuid4())
                request = GenerateRequest(
                    job_id,
                    profile["engine_id"],
                    sentence["text"],
                    language=str(payload.get("language", "en")).strip() or "en",
                    speaker_sample=str(profile["voice"] or "").strip() or None,
                    parameters=json.loads(profile["settings"] or "{}"),
                )
                queue.enqueue(request)
                store.update_sentence(
                    sentence_id, status="queued", audio_path=None, generation_job_id=job_id, error=None
                )
                queued.append(job_id)
            return {"job_ids": queued, "count": len(queued)}
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.get("/v1/jobs")
    def list_jobs(limit: int = 100, _: None = Depends(require_token)) -> list[dict]:
        return [to_json_dict(item) for item in queue.list_statuses(limit=limit)]

    @app.get("/v1/jobs/{job_id}")
    def get_job(job_id: str, _: None = Depends(require_token)) -> dict:
        try:
            return to_json_dict(queue.get_status(job_id))
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.post("/v1/jobs/{job_id}/cancel")
    def cancel_job(job_id: str, _: None = Depends(require_token)) -> dict:
        try:
            result = queue.cancel(job_id)
            sentence = store.get_sentence_by_generation_job(job_id)
            if sentence and result.status == JobStatus.CANCELLED:
                store.cancel_generation(sentence["id"], job_id)
            return to_json_dict(result)
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.get("/v1/projects/{project_id}/exports")
    def list_exports(project_id: str, _: None = Depends(require_token)) -> list[dict]:
        try:
            return store.list_exports(project_id)
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.post("/v1/projects/{project_id}/exports", status_code=202)
    def create_export(project_id: str, payload: dict[str, Any], background_tasks: BackgroundTasks, _: None = Depends(require_token)) -> dict:
        try:
            output_format = str(payload.get("format", "mp3"))
            output_dir = project_dir(project_id) / "exports"
            export_id = str(uuid4())
            output_path = output_dir / f"audiobook-{export_id}.{output_format}"
            export = store.create_export(project_id, output_format, float(payload.get("pause_seconds", 0)), str(output_path))
            if not external_media_worker:
                background_tasks.add_task(
                    media.export_project,
                    project_id,
                    output_path=output_path,
                    output_format=output_format,
                    pause_seconds=float(payload.get("pause_seconds", 0)),
                    export_id=export_id,
                )
            return export
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.post("/v1/exports/{export_id}/cancel")
    def cancel_export(export_id: str, _: None = Depends(require_token)) -> dict:
        try:
            return media.cancel(export_id)
        except Exception as error:
            handle_domain_error(error)
            raise AssertionError("unreachable")

    @app.websocket("/v1/events")
    async def events(websocket: WebSocket):
        if websocket.query_params.get("token") != expected_token:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        try:
            while True:
                await websocket.send_json({
                    "type": "snapshot",
                    "jobs": [to_json_dict(item) for item in queue.list_statuses(limit=100)],
                })
                await asyncio.sleep(1)
        except Exception:
            return

    return app
