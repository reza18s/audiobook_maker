# Backend contract foundation

The `backend.app.contracts` module is the Phase 1 shared contract between the
desktop application, the gateway, and engine workers.  It is deliberately
transport-independent so the eventual FastAPI service and Tauri client can
share the same JSON shape.

Dependency downloads are opt-in.  A missing Python package or TTS model is
reported as a `DependencyRequirement` with `state: approval_required`, and a
job remains in `waiting_for_dependency` until the desktop user approves it.
No package or model download is triggered by these contracts.
