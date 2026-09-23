# Legacy PySide Removal Plan

## Goal

Remove the deprecated PySide application and its F5-TTS/RVC submodule folders requested by the user, while keeping the supported Tauri, gateway, and Docker engine-service paths coherent.

## Scope

- Remove `src/`, `configs/`, `modules/F5-TTS`, and `modules/rvc-python`, plus the root `base.css` stylesheet and their submodule registrations.
- Remove files whose only purpose is to install, launch, update, or test that legacy application, including the root `requirements.txt`, legacy updater batch files, old adapter test, and obsolete work memo.
- Update the README, cutover checklist, readiness gate, project status report, and maintained project memo so they no longer treat the legacy app as a supported path.
- Preserve user data and unrelated local changes, including `deploy/.env`, model/voice/audiobook data, and current Tauri/backend/frontend changes. Move the ignored RVC base models into the existing `engines/rvc/` cache before removing the submodule checkout.

## Release impact

The Phase 9 runtime checklist is still open. Removing the PySide fallback before it passes means the Tauri/Docker path is the only supported application path and release readiness remains unproven.

## Steps

- [x] Verify target paths and nested submodule worktrees are clean.
- [x] Remove the requested code/config/submodule folders and directly dependent legacy launch, update, dependency, and test files.
- [x] Move the ignored RVC base models into `engines/rvc/base_model` and preserve other engine/model data.
- [x] Update documentation, readiness messaging, and the maintained project memo.
- [x] Review the final diff and search for dangling references. Docker services and test suites were not run for this removal task.
