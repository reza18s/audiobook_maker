# Project memo

- `src/tts_engines.py` is the current desktop engine adapter and exposes the two supported F5-TTS variants.
- `backend/app/contracts.py` is the transport-independent Phase 1 contract shared by the future gateway, engine workers, and Tauri client.
- Dependency downloads are opt-in: missing packages/models use `approval_required` and jobs use `waiting_for_dependency`; no download is automatic.
- Contract tests run with `python -m unittest discover -s backend/tests -v` and intentionally require no new package installation.
- `frontend/src/App.tsx` owns connection/bootstrap state; `frontend/src/components/AppShell.tsx` owns global shell and sidebar/sentence state, with navigation in `AppNavigation.tsx` and page composition under `frontend/src/pages/`.
- `frontend/src/styles.css` owns shared shell variables and responsive drawer/collapse behavior.
- Chapter-aware ingestion lives in `backend/app/ingestion.py`; chapter state and the optional per-document marker are persisted in SQLite, and `frontend/src/SentenceTable.tsx` renders structural chapter dividers.
- The frontend uses `HashRouter` for Tauri-safe navigation, TanStack Query from `frontend/src/main.tsx`, and Zustand session/UI state in `frontend/src/store.ts`.
- Frontend validation is `cd frontend; bun run typecheck; bun run build`; when Bun cannot execute local Windows symlinks, the bundled Node runtime can invoke TypeScript and Vite directly.
