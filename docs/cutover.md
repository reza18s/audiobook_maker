# Phase 9 cutover

The Tauri client is the target desktop application.  The legacy PySide
frontend remains in the repository until the production engine-worker path
has passed this checklist; this prevents a release that can edit projects but
cannot finish generation.

## Readiness checklist

- [ ] F5-TTS and Chatterbox production worker images respond to `/v1/health`
  and `/v1/capabilities`.
- [ ] A clean Windows machine can install the Tauri NSIS package and connect
  with a token through the local or Tailscale gateway.
- [ ] TXT and selectable-text PDF imports resume after gateway restart.
- [ ] Generation completes through the durable queue, retries three times,
  and continues with later sentences after a failure.
- [ ] Cancellation works for queued and active generation jobs.
- [ ] Sentence audio can be reviewed and regenerated from the Tauri client.
- [ ] MP3 and WAV exports complete, report progress, and cancel safely.
- [ ] Project and SQLite volumes have a tested backup and restore procedure.
- [ ] No project is created in PySide during the release candidate test.

Run the static gate from the repository root:

```powershell
python scripts\phase9_readiness.py
```

The gate intentionally fails until the two production engine image names are
provided through `F5TTS_IMAGE` and `CHATTERBOX_IMAGE`.  Once the runtime
checklist is complete, remove the legacy launcher and PySide modules in a
separate release commit.
