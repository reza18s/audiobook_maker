# Project memo

- `src/tts_engines.py` is the current desktop engine adapter and exposes the two supported F5-TTS variants.
- `backend/app/contracts.py` is the transport-independent Phase 1 contract shared by the future gateway, engine workers, and Tauri client.
- Dependency downloads are opt-in: missing packages/models use `approval_required` and jobs use `waiting_for_dependency`; no download is automatic.
- Contract tests run with `python -m unittest discover -s backend/tests -v` and intentionally require no new package installation.
