# Project memo

- `src/tts_engines.py` is the current desktop engine adapter and exposes the two supported F5-TTS variants.
- `backend/app/contracts.py` is the transport-independent Phase 1 contract shared by the future gateway, engine workers, and Tauri client.
- Dependency downloads are opt-in: missing packages/models use `approval_required` and jobs use `waiting_for_dependency`; no download is automatic.
- Contract tests run with `python -m unittest discover -s backend/tests -v` and intentionally require no new package installation.
- `frontend/src/App.tsx` owns connection/bootstrap state; `frontend/src/components/AppShell.tsx` owns global shell and sidebar/sentence state, with navigation in `AppNavigation.tsx` and page composition under `frontend/src/pages/`.
- `frontend/src/styles.css` owns shared shell variables and responsive drawer/collapse behavior.
- `frontend/src/styles.css` imports the layered visual system from `frontend/src/styles/` in token, global, control, feedback, layout, and responsive order.
- Chapter-aware ingestion lives in `backend/app/ingestion.py`; chapter state and the optional per-document marker are persisted in SQLite, and `frontend/src/SentenceTable.tsx` renders structural chapter dividers.
- Chapter navigation is supplied by `GET /v1/projects/{project_id}/chapters`; sentence queries accept a document/chapter pair and `AppShell.tsx` treats each chapter as one pagination unit.
- Project/document metadata CRUD is implemented in `backend/app/database.py` and `backend/app/api.py`; changing a document marker requires an explicit reprocess and rebuilds its sentences before ingestion resumes.
- The frontend uses `HashRouter` for Tauri-safe navigation, TanStack Query from `frontend/src/main.tsx`, and Zustand session/UI state in `frontend/src/store.ts`.
- Project workflows are composed by `frontend/src/pages/ProjectWorkspace.tsx` from feature views under `frontend/src/features/`; reusable interaction primitives live under `frontend/src/shared/ui/`.
- `GET /v1/projects/{project_id}/overview` is the production dashboard source; it reports chapter progress and blockers, while `GET /v1/projects/{project_id}/export-preflight` blocks exports with missing/stale audio.
- `backend/app/ingestion.py` supports standard-library EPUB spine extraction in addition to TXT/PDF; EPUB chapters use the same sentence/chapter persistence path and are covered by `backend/tests/test_ingestion.py`.
- `voice_variants` stores alternate engine settings; the variant preview route generates isolated WAV directly from the configured engine and never creates a production sentence or queue job.
- M4B export is chapter-aware and metadata-aware; FFmpeg remains the runtime requirement for media assembly and cover embedding.
- Frontend validation is `cd frontend; bun run typecheck; bun run build`; when Bun cannot execute local Windows symlinks, the bundled Node runtime can invoke TypeScript and Vite directly.
