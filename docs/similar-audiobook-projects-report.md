# GitHub audiobook-production benchmark and Audiobook Maker improvement report

Date: 2026-08-30

## Executive summary

I interpreted “semelare project” as “similar projects.” I could not verify a public GitHub repository or account named exactly `Semelare`, so this report does not invent one or attribute its features to another project. Instead, it compares four public projects that are relevant to Audiobook Maker:

1. [Audiobook Studio](https://github.com/senigami/audiobook-studio) — the closest product benchmark for a serious local-first audiobook production workflow.
2. [Audio Worker](https://github.com/GenLix/audio_worker) — a scene-oriented, reviewable, LLM-assisted audiobook editor.
3. [ebook2audiobook](https://github.com/DrewThomasson/ebook2audiobook) — a broad converter with many input/output formats, engines, languages, and CLI/Docker paths.
4. [nathandstory/audiobook-maker](https://github.com/nathandstory/audiobook-maker) — a focused Kokoro-based application with particularly clear onboarding, previews, resume behavior, and M4B packaging.

The main conclusion is that your app already has a stronger backend foundation than many lightweight alternatives: a Tauri 2 desktop client, a Python gateway, SQLite persistence, separate generation/media workers, capability-driven engines, resumable document ingestion, a durable retryable queue, cancellation, per-sentence audio, and a WebSocket event path. The main product gap is not “add more models.” It is to turn the current infrastructure into a production editor where the user can preview, compare, repair, and export a complete audiobook without leaving the active project.

The recommended direction is:

> Keep the private, multi-engine, Windows-first architecture; add a chapter-centric production workspace, a real voice lab, visible repair/take history, in-context queue progress, and metadata-rich M4B/MP3 export.

Do not copy another project’s exact branding or layout. Borrow the patterns that reduce user uncertainty: show what will happen, let the user preview before committing to a long render, preserve completed work, make failures actionable, and keep privacy/model costs explicit.

## 1. Research scope and confidence

This is a source-backed review of public repository pages, README files, package manifests, source trees, and the public Audiobook Studio showcase. Project contents and repository metrics can change after this report date. Product capabilities are treated as confirmed when the project’s own README or source describes them. Visual observations are based on the published showcase/assets and CSS/source structure; they are not claims about every hidden or unreleased screen.

The exact spelling `Semelare` did not produce a verifiable public GitHub project during the search. If you meant a private repository or a different spelling, its URL would be needed for a project-specific audit.

## 2. Comparable GitHub projects

### 2.1 Audiobook Studio — closest product benchmark

Repository: [senigami/audiobook-studio](https://github.com/senigami/audiobook-studio)

#### What it uses

- Frontend: React 19, TypeScript, Vite, React Router, `framer-motion`, `lucide-react`, `clsx`, and `tailwind-merge`, according to its frontend package manifest: [frontend/package.json](https://github.com/senigami/audiobook-studio/blob/main/frontend/package.json).
- Backend/runtime: Python 3.10+, a local web server, FFmpeg, and a separate XTTS environment. The repository describes FastAPI and exposes a browser application on the local machine.
- Local voice engine: Coqui XTTS-v2 for voice cloning and local generation.
- Optional cloud engine: Voxtral through a user-supplied Mistral API key. The cloud path is opt-in and appears only after configuration.
- Storage: local project and voice directories, with SQLite files visible in the repository structure and a project-oriented filesystem workflow.
- Installation: Pinokio for easier setup, source scripts for advanced users, Windows PowerShell support, a built-in demo library, and a documented manual path.
- Validation: Python tests, frontend linting, frontend build, and a documented wiki/getting-started path.

#### Features

The project is deliberately framed as a production pipeline rather than a “paste text and generate” tool. Its README describes:

- Multiple projects and chapters.
- Reusable voice profiles.
- Voice variants such as a default, angry, or calm delivery.
- Voice samples, previews, latent/cache assets, and portable profile files.
- Character, narrator, paragraph, and segment-level voice assignment.
- Chapter-level generation and partial requeue.
- Segment-level repair so one changed line does not require regenerating the whole book.
- A persistent production queue with progress and recovery from interruption.
- Chapter assembly and long-form export with FFmpeg.
- Optional local/cloud engine mixing.
- Local-first privacy for manuscripts, voice samples, and rendered audio.
- More explicit first-run visibility for model downloads and setup progress.

The documented workflow is: import or create a project, split it into chapters, build/import voice profiles, assign voices, generate and inspect, repair only the lines that need work, and assemble the finished outputs. See the project’s [README workflow and feature sections](https://github.com/senigami/audiobook-studio#readme).

#### Design and UX patterns

The public [Audiobook Studio showcase](https://senigami.github.io/audiobook-studio/) presents the product as a visual studio rather than a technical dashboard:

- A central project library with book-oriented cards and production status.
- A “Narrator Studio” / voice-lab concept for building and auditioning voices.
- A production workspace for character assignment and segment repair.
- A smart queue with hardware-aware progress and ETA language.
- A privacy/local-first section that explains the boundary between local XTTS and optional cloud Voxtral.
- A demo project that lets a new user listen and navigate before importing their own manuscript.
- Strong marketing hierarchy: hero statement, audio proof, visual screenshots, feature tour, comparison, and installation choices.

The visual direction is dark and studio-like, with restrained surfaces, card-based sections, clear status colors, and a strong primary accent. The repository’s frontend CSS and component structure support a dense professional workspace rather than a mobile-first consumer app.

#### What is worth learning from it

Audiobook Studio’s biggest strength is its mental model: the unit of work is not a single TTS request; it is a book moving through a production pipeline. Its strongest ideas for your app are reusable voice profiles, variants, repair at the smallest changed unit, visible progress in the active production context, and a ready-to-use demo.

#### What not to copy blindly

- Its setup still has multiple environments and a meaningful first-run cost. A more controlled Tauri/Docker packaging path can be easier for your Windows audience if the installer and engine checks are polished.
- Its optional cloud voice path is useful as a pattern, but it should not be added to your app without an explicit privacy, credential, and cost design.
- A visually attractive project page is not enough if generation, cancellation, backup, and restart recovery are not proven. Your existing cutover checklist should remain the release authority.

### 2.2 Audio Worker — structured scene and review model

Repository: [GenLix/audio_worker](https://github.com/GenLix/audio_worker)

#### What it uses

- Runtime: Bun `>=1.3.14`.
- Language/UI: TypeScript and React 19.
- Tooling: TypeScript, Biome, Bun tests, and a built editor build step.
- Local service: a browser editor served from `127.0.0.1:8788`.
- Model workflow: a configured LLM for scene interpretation/prompt arrangement and official SeedAudio for explicit paid generation.
- Storage: a local library with `library.sqlite` and project-namespaced media directories.
- Security posture: loopback binding, Host/Origin checks, explicit configuration gates, masked credential previews, and no automatic paid generation.

The package manifest is available at [audio_worker/package.json](https://github.com/GenLix/audio_worker/blob/main/package.json). Its UI source is organized into focused workflows such as [project shelf](https://github.com/GenLix/audio_worker/blob/main/editor/src/project-shelf.tsx), [character library](https://github.com/GenLix/audio_worker/tree/main/editor/src), [anchored scene script](https://github.com/GenLix/audio_worker/blob/main/editor/src/anchored-scene-script.tsx), [assembly](https://github.com/GenLix/audio_worker/blob/main/editor/src/assembly-page.tsx), [queue/production files](https://github.com/GenLix/audio_worker/tree/main/editor/src), and [settings](https://github.com/GenLix/audio_worker/blob/main/editor/src/settings-page.tsx).

#### Features

- A project → chapter → scene hierarchy.
- LLM-assisted chapter planning and scene interpretation.
- Reviewable proposals before accepted scenes are created.
- A character library scoped to a project.
- Scene-local temporary roles for one-off characters.
- Anchored script editing where text ranges connect dialogue, performance, sound, and BGM.
- Exact text-anchor protection so edits do not silently drift away from accepted source text.
- Multiple generated candidates for a scene.
- Candidate review and selection.
- Explicit prompt generation and explicit paid audio generation.
- Scene assembly with gaps, crossfades, overlays, and a canonical 48 kHz WAV.
- Cleanup actions that distinguish generated media from LLM records and preserve accepted work.
- Strict validation of model output, stale-safe acceptance, and redacted validation feedback.

#### Design and UX patterns

Audio Worker’s design is more editorial and operational than consumer-oriented:

- It makes review state and blockers visible in the ordinary workspace.
- It uses a shelf/library surface for projects and a focused editor for one scene.
- It keeps a clear boundary between accepted content, generated prompt text, candidate audio, and final assembly.
- It uses a compact dark theme with near-black green surfaces, light text, a lime primary accent, amber warnings, blue information, and red errors. Its CSS defines a small, coherent token set rather than many semantic color aliases.
- The editor source is split by user responsibility: project shelf, chapter import, character library, director workspace, scene script, proposal panel, assembly, cleanup, and settings.
- The UI is intentionally dense, but uses a consistent status vocabulary such as saved, dirty, invalid, connected, and ready.

#### What is worth learning from it

The most valuable idea is the separation of states. Your app should distinguish at least:

`source text → parsed sentence → assigned voice → queued → generating → candidate ready → approved/selected → stale → exported`

That state model makes it possible to explain why a sentence cannot be generated, why a profile change invalidates audio, and which work can safely be preserved.

The anchored editing idea is also relevant even without an LLM. If a sentence changes, the app can mark only that sentence’s audio as stale. If a speaker profile changes, it can mark the affected sentences as needing review rather than hiding the impact.

#### What not to copy blindly

- The scene/LLM model is more complex than your current document/sentence model. Introduce it only if your product needs story planning, sound design, or multi-layer scenes.
- A large all-in-one CSS file and many editor states can become difficult to maintain. Your existing layered token/control/layout CSS is a better base; bring over the interaction ideas, not the implementation shape.
- External paid generation and multiple LLM calls require especially clear user confirmation and cost/privacy messaging.

### 2.3 ebook2audiobook — breadth and compatibility benchmark

Repository: [DrewThomasson/ebook2audiobook](https://github.com/DrewThomasson/ebook2audiobook)

#### What it uses

The project is Python-based, provides a Gradio web interface, has command-line/headless modes, and includes Docker/Podman paths. The repository contains model, engine, component, Docker, and launcher directories.

Its README lists these TTS engines:

- XTTSv2
- Bark
- Fairseq
- VITS
- Tacotron2
- Tortoise
- GlowTTS
- YourTTS

It also documents custom models, fine-tuned presets, CPU/GPU/XPU/MPS/ROCm/Jetson device options, and voice cloning through a reference file.

#### Features

- EPUB, MOBI, AZW3, FB2, LRF, RB, SNB, TCR, PDF, TXT, RTF, DOC, DOCX, HTML, ODT, image formats, and archive-related inputs.
- OCR for image-based pages.
- Short text directly in a textarea.
- Voice cloning.
- More than one thousand language/dialect entries through the selected model/language stack.
- SML-style tags for pauses and voice switching.
- Custom model upload and fine-tuned presets.
- Mono/stereo output.
- AAC, FLAC, MP3, M4B, M4A, MP4, MOV, OGG, WAV, and WEBM output options.
- CLI and headless operation.
- Docker and compose operation.
- Session resume after interruption.
- Audiobookshelf-related options in the CLI.

See the project’s [feature and usage sections](https://github.com/DrewThomasson/ebook2audiobook#features).

#### Design and UX patterns

The project’s strength is power and reach rather than a tightly curated studio experience. The Gradio-based UI is likely to feel like a utility panel: many controls, engine choices, language/device settings, output settings, and advanced parameters. Its README emphasizes demos, compatibility, and a large option surface rather than a single guided production path.

That makes it a useful reference for an advanced settings layer, but not a good visual model for your main workflow. Your app should keep advanced engine parameters behind capability-aware drawers or an “Advanced” disclosure instead of presenting every parameter at once.

#### What is worth learning from it

- Broader input support has high practical value.
- Output compatibility matters: M4B with chapters is more useful to many listeners than a raw WAV alone.
- A headless/CLI path helps advanced users automate batches.
- Device fallback and low-resource messaging make the product more resilient.
- SML-like pause and voice controls can inspire a safe, explicit markup or pronunciation layer.

#### What not to copy blindly

- Do not chase a huge number of engines and languages before the core workflow is reliable.
- Avoid showing every inference parameter in the primary screen.
- OCR, translation, and broad format support should be staged because each adds validation, licensing, error reporting, and testing cost.

### 2.4 nathandstory/audiobook-maker — onboarding and delivery benchmark

Repository: [nathandstory/audiobook-maker](https://github.com/nathandstory/audiobook-maker)

#### What it uses

- Kokoro for local speech synthesis.
- Python local server and JSON API.
- Plain HTML, CSS, and JavaScript frontend with no frontend build step.
- FastAPI, PyMuPDF, EbookLib, FFmpeg, and related Python tooling.
- Optional CPU/GPU selection with fallback behavior.
- Windows batch launchers, an optional desktop shortcut, and automatic setup prompts.

#### Features

- EPUB, PDF, TXT/Markdown, and HTML inputs.
- Chapter detection and metadata extraction.
- A short curated voice catalog with sample playback.
- Adjustable reading speed.
- Chaptered M4B with cover art and title/author tags.
- Numbered, tagged MP3 files per chapter.
- Resume-after-stop behavior that keeps finished chapters.
- Clear handling for DRM-protected books and scanned PDFs.
- A one-click Windows flow that offers to install missing Python/FFmpeg dependencies.
- A simple “test one chapter first” workflow.

The repository’s README explains these features and the setup flow at [audiobook-maker README](https://github.com/nathandstory/audiobook-maker#readme).

#### Design and UX patterns

The strongest design lesson is communication, not visual sophistication. The README presents a three-step user journey:

`Choose your book → Pick a voice → Make it`

It tells the user when the first launch downloads models, what happens if a PDF is scanned, where output files go, how long generation may take, and how to preserve completed chapters. The product reduces anxiety before the user presses the long-running button.

#### What is worth learning from it

- Put a guided “first successful audiobook” path in your app.
- Let users generate one chapter or a short sample before committing to a full book.
- Make output destinations, metadata, chapter markers, and file compatibility explicit.
- Detect GPU availability and describe the fallback rather than failing halfway through.
- Make setup scripts and status messages understandable to a non-technical user.

#### What not to copy blindly

- Its single-engine model is simpler than your multi-engine architecture.
- A no-build plain frontend is easy to start but gives up the component, routing, and typed state structure you already have.
- Curated fixed voices do not replace your capability-driven speaker profiles.

## 3. Cross-project patterns that matter

Across these projects, the same user needs appear repeatedly:

| User need | Best pattern observed | What it means for your app |
| --- | --- | --- |
| Know what will happen | Guided steps and explicit stage labels | Add a visible production pipeline and next action |
| Avoid wasting long renders | Samples, chapter-first tests, segment repair | Add sample generation and sentence/chapter requeue |
| Keep voice identity consistent | Reusable profiles and variants | Separate a voice profile from a single speaker row |
| Recover from interruptions | Resume, durable jobs, preserved completed work | Make restart/retry behavior visible and testable |
| Understand failures | Blockers, statuses, logs, dependency states | Use actionable errors with “fix”, “retry”, and “why” |
| Deliver usable files | M4B, MP3, metadata, chapter markers | Expand export beyond MP3/WAV |
| Protect private material | Local-first defaults and explicit cloud gates | Keep privacy visible and never hide a cloud boundary |
| Start quickly | One-click launcher and demo project | Ship a sample project and a setup health check |
| Handle advanced users | CLI/headless and advanced parameters | Add later, behind the stable GUI workflow |

## 4. Confirmed current Audiobook Maker baseline

The review below is based on the current checkout at `C:\Users\Asus\Desktop\tts\audiobook_maker`, not on assumptions from the old repository README alone.

### 4.1 Current architecture and stack

- Desktop shell: Tauri 2 for Windows.
- Frontend: React 18, TypeScript, Vite, React Router, TanStack Query, and Zustand.
- Frontend organization: `frontend/src/components/`, `frontend/src/pages/`, `frontend/src/features/`, and `frontend/src/shared/ui/`.
- Backend: Python gateway with FastAPI transport, SQLite persistence, a durable generation queue, an HTTP engine worker, and a cancellable FFmpeg media worker.
- API: versioned `/v1` contract in `backend/openapi.yaml`.
- Engine connection: capability discovery through isolated engine services.
- Current sibling engine catalog: Chatterbox, F5-TTS, VibeVoice, XTTS, Whisper, Silero VAD, spaCy, and lightweight debug/test engines are listed in the sibling `audiobook-maker-engines` repository.
- Security boundary: bearer token for the gateway; local/remote connection is configured through the connection screen; engine ports are intended to remain private.
- Dependency policy: missing packages/models are represented as approval-required dependencies; the contract does not silently download them.

Useful local sources:

- [Current README](../README.md)
- [Backend README](../backend/README.md)
- [OpenAPI contract](../backend/openapi.yaml)
- [Cutover checklist](./cutover.md)
- [Frontend package manifest](../frontend/package.json)
- [Frontend app shell](../frontend/src/components/AppShell.tsx)
- [Frontend navigation](../frontend/src/components/AppNavigation.tsx)
- [Project workspace composition](../frontend/src/pages/ProjectWorkspace.tsx)
- [Sentence production view](../frontend/src/features/sentences/SentencesView.tsx)
- [Sentence table](../frontend/src/SentenceTable.tsx)
- [Speaker view](../frontend/src/features/speakers/SpeakersView.tsx)
- [Queue view](../frontend/src/features/generation-queue/QueueView.tsx)
- [Export view](../frontend/src/features/exports/ExportView.tsx)
- [Shared design tokens](../frontend/src/styles/tokens.css)
- [Shared layout styles](../frontend/src/styles/layout.css)

### 4.2 Features already present

Your current app already provides:

- Multiple projects with create, rename, open, and delete behavior.
- Project-level document, sentence, and speaker counts.
- TXT and selectable-text PDF import.
- Incremental ingestion and persisted chapter checkpoints.
- Optional custom chapter markers.
- Chapter-aware sentence browsing and pagination.
- Sentence search.
- Inline sentence text editing.
- Per-sentence speaker assignment.
- Per-sentence audio playback.
- Speaker creation with color, engine, voice identifier, optional WAV sample, and capability-driven settings.
- Engine health/capability discovery.
- Bulk sentence selection and generation queueing.
- Durable job status, attempts, progress, retry state, and cancellation.
- MP3 or WAV export with configurable pause seconds.
- Export progress, history, error display, and cancellation.
- WebSocket event connection for job invalidation.
- Responsive sidebar/drawer behavior for smaller windows.
- Shared UI primitives for buttons, cards, dialogs, fields, inputs, selects, progress bars, empty states, and status badges.

### 4.3 Current design language

The current frontend is a dark studio UI built around:

- Deep navy/blue-gray surfaces.
- A pale mint accent for primary actions and healthy/active states.
- Gradient card surfaces and subtle shadows.
- A persistent left workspace sidebar.
- Project cards on the home screen.
- A dense sentence table with a sticky header and chapter rows.
- A right-side narration settings panel on the sentence screen.
- Compact status pills, progress bars, and dialog confirmations.
- Responsive collapse of the workspace sidebar and narration drawer.
- Semantic color tokens and reduced-motion handling.

This is already directionally correct for an audio production tool. It feels more like a control room than a generic CRUD application. The next design step is to make the production state visible and make the most important audio action easier to find.

## 5. Current gaps against the benchmark set

These are product gaps found by comparing the current implementation and local cutover documents with the public benchmarks. They are recommendations, not claims that every feature is required for the next release.

### 5.1 Production workflow gaps

1. There is no project-level production dashboard showing source, parsed, assigned, generated, reviewed, and exported progress in one view.
2. The active sentence view is powerful but still table-first. It does not yet present a production-oriented audio review loop with waveform/length, take history, selected take, stale state, and quick regenerate controls.
3. Speakers are currently configured as project rows. There is no full voice-lab concept with reusable profiles, variants, preview history, sample quality checks, or “this profile is used by these sentences” visibility.
4. The queue is a separate page. Comparable projects keep progress close to the chapter or production view, where the user is deciding what to do next.
5. Export is currently MP3/WAV plus pause seconds. The strongest simple benchmark emphasizes chaptered M4B, cover art, title/author metadata, and compatibility with common audiobook players.
6. There is no explicit “generate one sample chapter first” path.

### 5.2 Onboarding and communication gaps

1. The current setup requires understanding the gateway, token, Docker, engine images, and connection URL before the user reaches the writing workspace.
2. A new installation does not appear to have a curated demo project that proves the interface before the user imports a book or configures a speaker.
3. The home screen currently presents `All systems connected` as a fixed success badge. That should be derived from the actual gateway and engine state so the interface never communicates a false readiness state.
4. Long-running operations need a richer status vocabulary: current stage, current chapter/sentence, throughput, ETA, retry reason, and what remains safe to continue.
5. The README has overlapping legacy and Tauri setup paths. The supported path, first-run requirements, engine availability, model licenses, and the legacy cutover status should be separated more clearly.

### 5.3 Technical/product reliability gaps

1. Several screens poll at short intervals even though the app already has a WebSocket event path. Use events for targeted cache updates and retain polling only as a reconnect/fallback mechanism.
2. Sentence, job, and export statuses are represented as strings. A typed status/stage model would make stale audio, waiting for dependency, retrying, cancellation, and partial success easier to represent consistently.
3. The export contract does not yet represent metadata, cover art, chapter markers, sample rate, loudness/normalization, output manifest, or validation results.
4. The UI can expose engine capability parameters, but the user-facing capability model should also describe language, device, GPU requirement, voice-sample requirements, expected limitations, and dependency state in a readable way.
5. The cutover checklist still has open production gates for engine health, clean Windows installation, restart-safe import, durable generation, cancellation, sentence audio review, Chatterbox sample delivery, export progress/cancellation, and backup/restore. These are release gates, not optional polish.
6. The local main repository’s cutover note says the supplied engine repository has no F5-TTS image, while the sibling engine repository currently lists F5-TTS, Chatterbox, VibeVoice, and XTTS production images. Verify the actual image tags and runtime health before changing the checklist or removing legacy code.

### 5.4 Visual and interaction gaps

1. The current UI uses many Unicode glyphs for navigation icons (`⌂`, `◌`, `⚙`, and similar characters). Replace them with a consistent icon set or internal SVG icons so shape, baseline, tooltip behavior, and accessibility are stable across Windows fonts.
2. The base text scale is compact, with many 11–13px labels. Keep the dense studio feel, but raise ordinary body/help text toward 14px where readability matters, especially in long-running status messages and sentence editing.
3. The sentence table is appropriately dense on desktop, but mobile users need a stacked sentence-card mode rather than relying mainly on horizontal scrolling.
4. The visual system has many semantic tokens, which is good, but the next pass should establish stricter roles: background, panel, raised panel, border, text, muted text, accent, warning, danger, and focus. Avoid adding a new color for every component.
5. The home page has useful counters, but the counters do not yet answer the user’s main question: “What should I do next to finish this audiobook?” Add one primary continuation action per project.

## 6. Recommended target experience

The target information architecture should be:

```text
Project library
    ↓
Project overview / readiness dashboard
    ↓
Chapter production workspace
    ├── Text and sentence review
    ├── Audio preview and repair
    ├── Voice lab / profile assignment
    └── In-context queue and progress
    ↓
Export studio
    ├── M4B with chapters and metadata
    ├── MP3 chapter folder/ZIP
    └── WAV master
```

### 6.1 Project library and overview

Each project card should show:

- Cover placeholder or imported cover.
- Project title and author if known.
- Number of chapters, words/sentences, speakers, and rendered duration.
- A readiness indicator such as `12/18 chapters ready`.
- Last activity and the current stage.
- A single primary button: `Continue production`.
- Secondary actions: rename, duplicate/backup, archive, delete.

The overview page should show a five-stage readiness strip:

`Imported → Parsed → Voices assigned → Audio generated → Export ready`

Each stage should link to the screen that resolves its blockers. If no engine is available, the user should see `Connect an engine` with the affected stage, not a generic green success state.

### 6.2 Chapter production workspace

Keep the current sentence table, but add a production layer around it:

- Left: chapter list with sentence count, generated count, failed count, and duration.
- Center: sentence rows with text, speaker, status, play button, selected take, and quick regenerate.
- Right: narration profile for the selected speaker, with a clear preview action.
- Bottom or sticky: an audio player for the selected sentence/take and chapter navigation.

Every sentence should have a visible state:

- Not configured
- Ready to generate
- Queued
- Generating
- Ready for review
- Approved/selected
- Stale after text/profile change
- Failed
- Waiting for dependency

The state should be filterable. For example: `Show failed`, `Show stale`, `Show missing audio`, `Show speaker: Narrator`.

### 6.3 Voice lab

Promote speaker configuration into a reusable voice profile workflow:

- Profile name and purpose: narrator, character, announcement, etc.
- Engine and model with readable local/GPU badges.
- One or more WAV samples with duration, sample rate, and quality checks.
- A preview button that generates a short fixed sample before a full chapter.
- Variants such as `Default`, `Calm`, `Dramatic`, and `Whisper`.
- Effective settings shown in plain language, with advanced parameters collapsed.
- A list of chapters/sentences using the profile.
- A warning when changing the profile will make existing audio stale.
- Consent/licensing note for cloned voices and model restrictions.

Your capability-driven engine contract is the right foundation. The UI should turn raw capability parameters into a guided profile editor instead of exposing a generic form as the primary experience.

### 6.4 Queue and progress

Keep the durable queue, but surface it in two places:

- A global queue drawer or topbar indicator for all active jobs.
- A chapter-local progress panel for the work currently being reviewed.

Each job should show:

- Stage: preparing, generating, validating, assembling, or exporting.
- Project/chapter/sentence scope.
- Current item and total items.
- Percent complete, throughput, and ETA when available.
- GPU/device and engine.
- Retry count and a human-readable failure reason.
- `Retry`, `Cancel`, `Open affected sentences`, and `View details` actions.

Use the existing WebSocket connection to invalidate or patch only the affected project/chapter/job queries. Keep a slower polling fallback for reconnects and missed events.

### 6.5 Export studio

Prioritize these outputs:

1. M4B audiobook with chapter markers, cover image, title, author, narrator, language, and series metadata.
2. MP3 folder/ZIP with numbered chapters and tags.
3. WAV master for editing or archival.

Export controls should include:

- Output format and quality preset.
- Chapter range or selected chapters.
- Pause/gap settings.
- Sample rate and channel selection where appropriate.
- Loudness normalization and silence policy.
- Cover art and metadata editor.
- Preflight validation: missing audio, failed sentences, stale audio, long gaps, and unsupported characters/paths.
- Output manifest with file paths, duration, chapter count, and validation result.
- Open output folder and copy output path.

The export screen should tell the user exactly what will be created before the long job starts.

### 6.6 Import and text quality

Do not immediately add every format from ebook2audiobook. Stage imports in this order:

1. Stabilize TXT and selectable-text PDF with accurate chapter detection and restart recovery.
2. Add EPUB because it contains useful chapters, title, author, and cover metadata.
3. Add HTML/DOCX/RTF if your target users need manuscript workflows.
4. Add OCR only as an explicit, clearly labeled capability for scanned PDFs.

Add a preflight preview before ingestion commits:

- Detected title/author/cover.
- Detected chapters.
- Estimated word/sentence count.
- Warnings for empty chapters, headers/footers, page numbers, duplicate text, and scanned pages.
- A small preview of the first chapter.

### 6.7 Onboarding and demo

Add a first-run path inspired by the simplest benchmark:

- Launch the app.
- Run a local readiness check.
- Offer `Open demo project` or `Import my book`.
- The demo project includes a short text, at least one speaker, one generated sample, and one export preview.
- Explain where data, models, outputs, and logs are stored.
- Explain whether an engine is local, remote, GPU-backed, or waiting for a dependency.
- Give the user a `Generate sample` action before a full chapter.

Keep the actual production stack; improve the sequence and messaging around it.

## 7. Prioritized implementation roadmap

### Phase 0 — truth and release safety

Goal: make the current app trustworthy before adding more surface area.

- Derive home/system readiness from actual gateway and engine health.
- Replace the fixed `All systems connected` copy with accurate states.
- Verify the sibling engine image tags and `/health` responses.
- Finish the open cutover tests: clean Windows installation, restart-safe import, retry/cancel, sentence review/regeneration, sample delivery, export progress/cancel, and backup/restore.
- Document the supported Tauri path separately from deprecated PySide instructions.
- Keep automatic dependency/model downloads approval-gated.

Acceptance criteria:

- A user can tell whether the gateway, each engine, storage, and dependencies are ready.
- A restart does not lose accepted source text or completed audio.
- A failed job has a retry or repair path.
- Release documentation matches the images actually available.

Likely areas: `frontend/src/pages/HomeView.tsx`, `frontend/src/features/health/HealthView.tsx`, `frontend/src/components/AppShell.tsx`, `backend/app/contracts.py`, `backend/app/api.py`, `backend/app/queue.py`, `docs/cutover.md`, and deployment documentation.

### Phase 1 — production dashboard and chapter workspace

Goal: make the existing workflows feel like one production tool.

- Add project readiness fields and an overview page.
- Add chapter list/progress.
- Add sentence status filters: failed, stale, missing, ready, generated.
- Add selected-sentence quick actions: play, regenerate, assign speaker, mark reviewed.
- Add an in-context mini player and current chapter progress.
- Replace mobile horizontal-only table behavior with stacked sentence cards.

Acceptance criteria:

- From one project screen, the user can identify the next blocker.
- The user can review and regenerate one sentence without navigating to a separate queue page.
- Text or voice changes visibly mark affected audio stale.

Likely areas: `frontend/src/pages/ProjectWorkspace.tsx`, `frontend/src/features/sentences/SentencesView.tsx`, `frontend/src/SentenceTable.tsx`, `frontend/src/components/AppNavigation.tsx`, `frontend/src/store.ts`, `backend/openapi.yaml`, and the corresponding database methods.

### Phase 2 — voice lab and sample-first generation

Goal: make voice selection understandable and safe.

- Add preview generation for a short selected sentence or fixed sample.
- Add voice profile cards and variants.
- Show sample metadata and engine/model requirements.
- Add profile usage and stale-audio impact.
- Add explicit model license/voice-consent copy where relevant.
- Provide engine comparison for the same sentence when multiple engines are available.

Acceptance criteria:

- A user can hear a voice before generating a chapter.
- A user can understand which engine, model, sample, and settings produced a take.
- Changing a profile cannot silently leave outdated audio marked ready.

Likely areas: `frontend/src/features/speakers/`, `frontend/src/features/sentences/`, `frontend/src/types.ts`, `backend/app/contracts.py`, `backend/app/database.py`, and new versioned API fields.

### Phase 3 — export studio and metadata

Goal: create files people can actually use as audiobooks.

- Add M4B with chapter markers.
- Add cover/title/author/narrator/language/series metadata.
- Keep MP3/WAV outputs.
- Add export preflight and an output manifest.
- Add normalized loudness and safe pause presets.
- Add open-folder/copy-path actions.

Acceptance criteria:

- An exported M4B opens with chapters in common players.
- MP3 chapter files are numbered and tagged.
- Missing, failed, or stale audio is reported before FFmpeg starts.
- The output record preserves format, metadata, duration, and validation result.

Likely areas: `frontend/src/features/exports/ExportView.tsx`, `frontend/src/types.ts`, `frontend/src/api.ts`, `backend/openapi.yaml`, `backend/app/media.py`, `backend/app/media_worker.py`, and the export database schema.

### Phase 4 — onboarding, import preview, and documentation

Goal: reduce first-run friction and support the non-technical user.

- Add a readiness wizard.
- Add a demo project fixture.
- Add import preview and metadata extraction.
- Add EPUB support.
- Add clear Windows installer/launcher behavior.
- Rewrite README structure around the supported Tauri workflow, then put legacy migration notes in a separate document.
- Explain model download size, GPU requirements, local paths, privacy, and licenses before the user starts a long task.

Acceptance criteria:

- A new user can open the demo, hear a sample, and understand the next action without reading the legacy installation section.
- A user can preview chapters and metadata before import is committed.
- Setup errors state the cause and the next action.

Likely areas: `frontend/src/features/connection/`, `frontend/src/features/documents/`, `frontend/src/pages/HomeView.tsx`, `README.md`, `backend/app/ingestion.py`, and deployment scripts.

### Phase 5 — advanced capabilities

Only after the previous phases are reliable:

- Headless batch CLI.
- OCR for scanned PDFs.
- Pronunciation dictionary and custom lexicon.
- SML-like explicit pause/voice annotations.
- Audio quality analysis through Silero VAD or debug/audio services.
- Optional cloud engines behind an explicit privacy/cost gate.
- Rich scene sound/BGM editing if the product direction expands beyond narration.

## 8. Design system recommendations

### Keep

- Dark studio direction.
- Mint accent for primary action and success.
- Left project navigation.
- Right-side narration controls on desktop.
- Semantic tokens and reduced-motion support.
- Cards, status badges, progress bars, and confirmation dialogs.

### Improve

- Replace Unicode navigation glyphs with one consistent icon source.
- Raise ordinary body/help text for readability while preserving small eyebrow/meta text.
- Use a stronger page hierarchy: title, readiness summary, primary next action, then details.
- Use a consistent status grammar: `Ready`, `Needs attention`, `Generating`, `Stale`, `Failed`, `Blocked`.
- Reserve gradients for major surfaces; avoid making every card visually compete with the primary action.
- Add visible audio affordances: waveform or duration, play/pause, selected take, and current playback position.
- Add desktop keyboard shortcuts for play, regenerate, next sentence, previous sentence, and mark reviewed.
- Add a high-contrast/focus pass for table rows, menu items, selected state, danger actions, and disabled controls.
- Design a compact mobile sentence card with the sentence text first, then speaker/status/actions below it.

### Suggested visual hierarchy

```text
Project title + readiness + Continue
    ↓
Chapter progress and blockers
    ↓
Sentence/audio review surface
    ↓
Secondary engine/profile details
    ↓
Technical logs and advanced parameters
```

The user should not need to understand Docker, engine URLs, or model parameters to review a sentence or export an audiobook.

## 9. Recommended data and API additions

The current contract is a good foundation. Add fields in a backward-compatible, versioned way.

### Project

- `title`, `author`, `narrator`, `language`.
- `cover_path` or a project-local asset reference.
- `word_count`, `estimated_duration`, `rendered_duration`.
- `production_stage` and a computed readiness summary.

### Chapter

- Stable order and editable title.
- `word_count`, `sentence_count`, `rendered_duration`.
- `generated_count`, `failed_count`, `stale_count`.
- Chapter status and last activity.

### Sentence

- Typed status/stage.
- `audio_duration`, `audio_sample_rate`, `audio_updated_at`.
- `stale_reason`.
- `selected_take_id` and `reviewed_at`.

### Voice profile

- Profile identity separate from the speaker assignment.
- Engine/model/device.
- Sample list and sample metadata.
- Variant name and style description.
- Settings hash so changes can invalidate only affected audio.
- Usage references or a computed affected-sentence count.

### Audio take

- Sentence/profile/engine/model/settings references.
- File path, duration, quality result, created time, selected/rejected state.
- Error and provenance fields.

### Job

- Scope: project, chapter, sentence, or export.
- Stage, current item, throughput, ETA, worker, device, and correlation ID.
- Typed dependency requirements.
- Retry and cancellation detail.

### Export

- Format, profile, metadata, cover, selected chapters, sample rate, channel, bitrate.
- Output manifest and validation warnings.
- Duration, chapter count, file size, and output path.

## 10. Success metrics

Use product metrics that reflect audiobook production rather than generic page usage:

- Time from first launch to first audible sample.
- Time from import to first ready chapter.
- Percentage of projects that reach a valid export.
- Percentage of failed jobs recovered by retry or repair.
- Median time to regenerate one changed sentence.
- Percentage of generated audio reviewed before export.
- Number of sentences regenerated per changed sentence, where lower is better.
- Export preflight failures caught before FFmpeg starts.
- Restart recovery rate for import, generation, and export.
- Number of users who complete the demo project.

## 11. Final recommendation

Your app should become a private “Audiobook Production Studio,” not just a larger model launcher.

The competitive advantage is already present in the architecture: Windows desktop packaging, multi-engine support, isolated services, local/remote gateway flexibility, durable jobs, and per-sentence control. The next investment should make those capabilities legible and pleasant:

1. Make readiness and failure states truthful.
2. Finish the current production cutover gates.
3. Add project/chapter readiness and a sentence-level repair loop.
4. Build a real voice lab with sample-first previews and variants.
5. Add M4B/MP3/WAV export with metadata, cover art, and chapter validation.
6. Add a demo project, import preview, and simpler Windows onboarding.
7. Polish accessibility, icon consistency, typography, and mobile sentence review.

That sequence will produce a more complete product than simply adding every engine or copying another project’s screen design.

## Sources

- [Audiobook Studio repository](https://github.com/senigami/audiobook-studio)
- [Audiobook Studio README](https://github.com/senigami/audiobook-studio#readme)
- [Audiobook Studio frontend package manifest](https://github.com/senigami/audiobook-studio/blob/main/frontend/package.json)
- [Audiobook Studio public showcase](https://senigami.github.io/audiobook-studio/)
- [Audio Worker repository](https://github.com/GenLix/audio_worker)
- [Audio Worker README](https://github.com/GenLix/audio_worker#readme)
- [Audio Worker package manifest](https://github.com/GenLix/audio_worker/blob/main/package.json)
- [Audio Worker editor source tree](https://github.com/GenLix/audio_worker/tree/main/editor/src)
- [Audio Worker editor stylesheet](https://github.com/GenLix/audio_worker/blob/main/editor/src/styles.css)
- [ebook2audiobook repository](https://github.com/DrewThomasson/ebook2audiobook)
- [ebook2audiobook README](https://github.com/DrewThomasson/ebook2audiobook#readme)
- [nathandstory/audiobook-maker repository](https://github.com/nathandstory/audiobook-maker)
- [nathandstory/audiobook-maker README](https://github.com/nathandstory/audiobook-maker#readme)
