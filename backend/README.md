# Audiobook Maker backend

The backend contains the stable contracts, durable SQLite generation queue,
project/document/sentence persistence, resumable TXT and selectable-text PDF
ingestion, HTTP engine generation worker, and cancellable FFmpeg media export
worker. The HTTP transport is exposed by `backend.app.api`.

Run the gateway after installing `requirements.txt` and configuring a token:

```text
AUDIOBOOK_API_TOKEN=replace-me uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

The API is versioned under `/v1`; the checked-in contract is
`backend/openapi.yaml`.  Documents are copied into the configured project
volume before ingestion, and sentence APIs always return bounded pages.

The Phase 6 Windows client lives in `frontend/` and is packaged with Tauri 2.

Run the generation worker separately from the gateway when using engine
services:

```text
python -m backend.app.engine_worker
```

Set `F5TTS_URL`, `CHATTERBOX_URL`, or `ENGINE_WORKER_URLS` so it can reach the
engine containers. The engine service contract is documented by the supplied
`audiobook-maker-engines` repository.

The `backend.app.contracts` module is the Phase 1 shared contract between the
desktop application, the gateway, and engine workers.  It is deliberately
transport-independent so the eventual FastAPI service and Tauri client can
share the same JSON shape.

Dependency downloads are opt-in.  A missing Python package or TTS model is
reported as a `DependencyRequirement` with `state: approval_required`, and a
job remains in `waiting_for_dependency` until the desktop user approves it.
No package or model download is triggered by these contracts.
