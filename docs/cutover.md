# Phase 9 cutover

The Tauri client is the supported desktop application. The legacy PySide
frontend, direct local-engine adapters, and their F5-TTS/RVC submodules have
been removed before this runtime checklist passed. The remaining checks still
gate release; without them, a release could edit projects but fail to finish
generation.

## Readiness checklist

- [ ] F5-TTS and Chatterbox production worker images respond to `/health`
  (or `/v1/health`) and report a loaded model.
- [ ] A clean Windows machine can install the Tauri NSIS package and connect
  with a token through the local or Tailscale gateway.
- [ ] TXT and selectable-text PDF imports resume after gateway restart.
- [ ] Generation completes through the durable queue and generation worker,
  retries three times, and continues with later sentences after a failure.
- [ ] Cancellation works for queued and active generation jobs.
- [ ] Sentence audio can be reviewed and regenerated from the Tauri client.
- [ ] Chatterbox speaker WAV samples can be uploaded and reach the isolated
  engine service before generation.
- [ ] MP3 and WAV exports complete, report progress, and cancel safely.
- [ ] Project and SQLite volumes have a tested backup and restore procedure.
- [x] Legacy PySide client and direct local-engine adapters removed; `start.bat`
  launches the Tauri client.

Run the static gate from the repository root:

```powershell
python scripts\phase9_readiness.py
```

The static gate intentionally fails until the two production engine image names
are provided through `F5TTS_IMAGE` and `CHATTERBOX_IMAGE`. The runtime checklist
must also pass before release; the legacy fallback is no longer available.
