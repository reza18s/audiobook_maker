# Audiobook Maker v3
This application utilizes open-source deep-learning text-to-speech and speech-to-speech models to create audiobooks.  The main goal of the project is to be able to seamlessly create high-quality audiobooks by using these advancements in machine learning/AI.

The supported desktop client is a **Windows Tauri 2 application**. The Python
gateway, generation worker, media worker, and TTS engines run as services.

## Table of Contents
- [Features](#features)
- [Windows Package Installation](#windows-package-installation)
- [Manual Installation Windows 10/11](#manual-installation-windows-1011)
- [Engine services](#engine-services)
- [Usage](#usage)
- [Acknowledgements](#acknowledgements)

## Features
:heavy_check_mark: Multi-speaker/engine generation, allowing you to select who speaks which sentence etc.

:heavy_check_mark: Audio playback of individually generated sentences, or playback all to listen as it generates

:heavy_check_mark: Save in place to continue generating later (continue from where you stopped at)

:heavy_check_mark: Bulk sentence regeneration and editting to regenerate audio for a sentence or change which speaker and/or engine is being used for a sentence

:heavy_check_mark: Reloading previous audiobooks and exporting audiobooks

:heavy_check_mark: Sentence remapping in case you need to update the original text file that was used for generation

:heavy_check_mark: Generation uses TTS engine workers configured for the connected gateway; available engines depend on the deployment.

:heavy_check_mark: Project production dashboard with chapter progress, missing-voice blockers, stale-audio tracking, and export preflight

:heavy_check_mark: TXT, EPUB, and selectable-text PDF import with resumable ingestion and chapter detection

:heavy_check_mark: Voice variants with engine settings and isolated sample previews

:heavy_check_mark: Audiobook metadata, cover art, MP3/WAV export, and chaptered M4B export

## Windows Package Installation

The Windows package is available through [YouTube channel membership](https://www.youtube.com/channel/UCwNdsF7ZXOlrTKhSoGJPnlQ/join) or [Buy Me a Coffee](https://buymeacoffee.com/jarodsjourney/extras).

The Windows client is the Tauri application. The gateway and TTS engine
workers run separately; see the [Docker deployment guide](deploy/README.md)
for setup.

## Manual Installation Windows 10/11

### Prerequisites

- Docker Desktop for the local gateway and workers.
- Rust with the stable MSVC toolchain and Bun when building the Tauri client.
- NVIDIA Container Toolkit when using the NVIDIA engine profile; see the Docker deployment guide.

### Tauri desktop installation

The supported desktop client is the Tauri application. The Python gateway and
engine services run through Docker; see [deploy/README.md](deploy/README.md)
for local and remote setup.

1. Install Rust with the stable MSVC toolchain and install Bun.
2. Copy `deploy/.env.example` to `deploy/.env`, then set real engine image
   names and a long API token.
3. Start the gateway, generation worker, and media worker:
   ```powershell
   .\start_docker.bat
   ```
4. To include configured TTS workers, run:
   ```powershell
   .\start_docker.bat engines
   ```
   On a host with NVIDIA Container Toolkit, use:
   ```powershell
   .\start_docker.bat nvidia
   ```
5. Build the Windows client:
   ```powershell
   cd frontend
   bun install
   bun run tauri build
   ```

After building, `start.bat` launches the Windows client. Without a release
build it starts the Tauri development client.

## Engine Services

TTS engines run as Docker services and are supplied by separately built or
published engine images. See the [Docker deployment guide](deploy/README.md)
for image configuration and startup options.

## Usage

1. Connect the desktop client to the gateway using the URL and API token from
   `deploy/.env`.
2. Create a project from the home screen, then open its **Documents** tab and
   import a TXT, EPUB, or selectable-text PDF. Review the file and chapter
   marker before confirming the import.
3. Open **Speakers** and create a speaker profile for each narrator or
   character. Upload a WAV sample when the selected engine needs one. Save a
   voice variant when you want alternate delivery settings, preview it, and
   use it as the speaker's default production profile when ready.
4. Use **Overview** to monitor chapter progress and resolve blockers. Editing
   sentence text or changing its speaker marks existing audio as stale, so the
   sentence is safely included in the next generation pass.
5. Open **Sentences** to review chapter text, assign speakers, filter for
   missing or stale audio, listen to generated lines, and queue selected
   sentences. The **Queue** tab shows durable jobs and allows cancellation.
6. Open **Export**, complete the title/author/narrator metadata and optional
   cover, then resolve every preflight blocker. M4B exports include chapter
   markers and embedded metadata; MP3 and WAV are available for simpler
   workflows.

Generated files and project metadata stay under `project-data`; the SQLite
database and queue state stay under `sqlite-data`. Back up both folders before
upgrading or moving the deployment. Engine availability is shown by the
gateway health state, and the app remains usable for importing and reviewing
projects when no engine is currently ready.


## Acknowledgements
This has been put together using a variety of open-source models and libraries.  Wouldn't have been possible without them.

TTS Engines:
- Tortoise TTS: https://github.com/neonbjb/tortoise-tts
- StyleTTS: https://github.com/yl4579/StyleTTS2
- F5TTS: https://github.com/SWivid/F5-TTS/tree/main
- GPT-SoVITS: https://github.com/RVC-Boss/GPT-SoVITS

S2S Engines:
- RVC: https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI
  - Installable RVC Library: https://github.com/daswer123/rvc-python

## Licensing
Each engine being used here is MIT or Apache-2.0.  However, base-pretrained models may have their own licenses or use limitations so please be aware of that depending on your use case. I am not a lawyer, so I will just state what the licenses are.

### StyleTTS 2
The pretrained model states: 
>*Before using these pre-trained models, you agree to inform the listeners that the speech samples are synthesized by the pre-trained models, unless you have the permission to use the voice you synthesize. That is, you agree to only use voices whose speakers grant the permission to have their voice cloned, either directly or by license before making synthesized voices public, or you have to publicly announce that these voices are synthesized if you do not have the permission to use these voices.*

### F5 TTS
The pretrained base was trained on the [Emilia dataset](https://huggingface.co/datasets/amphion/Emilia-Dataset), so it is Non-Commerical CC-By-NC-4.0.

