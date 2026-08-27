"""Static safety gate for the final desktop cutover."""

from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLACEHOLDER_IMAGES = {
    "audiobook-maker-f5tts:latest",
    "audiobook-maker-chatterbox:latest",
}


def main() -> int:
    required = {
        "Tauri client": ROOT / "frontend/src-tauri/src/lib.rs",
        "Gateway API": ROOT / "backend/app/api.py",
        "OpenAPI contract": ROOT / "backend/openapi.yaml",
        "Compose deployment": ROOT / "deploy/docker-compose.yml",
        "Media worker": ROOT / "backend/app/media_worker.py",
        "Engine client": ROOT / "backend/app/engine_client.py",
        "Generation worker": ROOT / "backend/app/engine_worker.py",
        "Supported launcher": ROOT / "start.bat",
    }
    failures = [f"missing {name}: {path}" for name, path in required.items() if not path.is_file()]
    for variable in ("F5TTS_IMAGE", "CHATTERBOX_IMAGE"):
        image = os.environ.get(variable, "").strip()
        if not image:
            failures.append(f"{variable} is not set to a production engine image")
        elif image in PLACEHOLDER_IMAGES:
            failures.append(f"{variable} still uses the local placeholder image name")
    launcher = required["Supported launcher"]
    if launcher.is_file() and "controller.py" in launcher.read_text(encoding="utf-8").lower():
        failures.append("start.bat still launches the legacy PySide client")
    if failures:
        print("Phase 9 cutover is not ready:")
        for failure in failures:
            print(f"- {failure}")
        print("The legacy PySide frontend must remain available until runtime parity is verified.")
        return 1
    print("Static Phase 9 cutover gate passed. Complete the runtime checklist before removing legacy code.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
