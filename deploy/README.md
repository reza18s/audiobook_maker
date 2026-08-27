# Docker deployment

The Compose stack runs the gateway, durable generation worker, external media
worker, and the two production engine image slots. Engine images are built and
published by the separate `audiobook-maker-engines` repository. The current
engine images expose `/health`, `/info`, `/load`, and `/generate` on ports 8001
and 8002; the generation worker also accepts a future `/v1` prefix.

## Local host

```powershell
Copy-Item deploy\.env.example deploy\.env
# Edit deploy\.env and replace AUDIOBOOK_API_TOKEN
docker compose --env-file deploy\.env -f deploy\docker-compose.yml up -d --build
```

The default bind is `127.0.0.1`, so the gateway is local-only.

## Linux NVIDIA server

Install Docker with the NVIDIA Container Toolkit, set a random token, and
restrict the host firewall to the server's Tailscale interface.  Then start:

```text
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.nvidia.yml up -d --build
```

For a remote Tailscale client, set `GATEWAY_BIND_ADDRESS=0.0.0.0` and expose
port 8000 only through the host firewall/Tailscale network.  Do not publish
the engine ports or expose the server directly to the public internet.

Persistent data is held in `project-data`, `sqlite-data`, `f5tts-models`, and
`chatterbox-models`.  Back up the first two before upgrades and keep model
volumes when replacing an engine image.

The supplied engine repository currently publishes Chatterbox and debug TTS
images, but not an F5-TTS image. Set `F5TTS_IMAGE` only after an F5-TTS image
adapted to the shared engine contract is available.
