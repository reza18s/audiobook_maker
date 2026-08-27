# Docker deployment

The Compose stack runs the gateway, durable generation worker, and external
media worker without requiring any TTS images. Engine images are built and
published by the separate `audiobook-maker-engines` repository. When the
`engines` profile is enabled, each TTS engine runs in its own container:
`debug-tts-worker` (8003), `f5tts-worker` (8001), `chatterbox-worker` (8002),
`vibevoice-worker` (8004), and `xtts-worker` (8005).

## Local host

```powershell
Copy-Item deploy\.env.example deploy\.env
# Edit deploy\.env and replace AUDIOBOOK_API_TOKEN
docker compose --env-file deploy\.env -f deploy\docker-compose.yml up -d --build
```

The default bind is `127.0.0.1`, so the gateway is local-only.

This starts the app backend without any engine images. The engine capability
list is empty until an engine is started; the rest of the app remains available.

## Linux NVIDIA server

Install Docker with the NVIDIA Container Toolkit, set a random token, and
restrict the host firewall to the server's Tailscale interface.  Then start:

```text
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.nvidia.yml up -d --build
```

For a remote Tailscale client, set `GATEWAY_BIND_ADDRESS=0.0.0.0` and expose
port 8000 only through the host firewall/Tailscale network.  Do not publish
the engine ports or expose the server directly to the public internet.

Persistent data is held in `project-data`, `sqlite-data`, and one model volume
per engine. Back up the first two before upgrades and keep model volumes when
replacing an engine image.

Build or pull all five TTS images before starting the engine profile. For local images,
use the tags in `deploy\.env.example` (or change each `*_IMAGE` variable to the
matching GHCR image from `audiobook-maker-engines`). The NVIDIA override assigns
one GPU reservation to each production GPU engine; change `*_GPU_ID` when
running engines on different GPU devices.

Start all engine containers alongside the app with:

```powershell
docker compose --profile engines --env-file deploy\.env -f deploy\docker-compose.yml -f deploy\docker-compose.nvidia.yml up -d --build
```

To build the local images from the sibling engine repository:

```powershell
cd ..\audiobook-maker-engines
docker build -t audiobook-maker-debug-tts:latest -f tts\debug-tts\Dockerfile .
docker build -t audiobook-maker-f5tts:latest -f tts\f5tts\Dockerfile .
docker build -t audiobook-maker-chatterbox:latest -f tts\chatterbox\Dockerfile .
docker build -t audiobook-maker-vibevoice:latest -f tts\vibevoice\Dockerfile .
docker build -t audiobook-maker-xtts:latest -f tts\xtts\Dockerfile .
```
