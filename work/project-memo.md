# Project memo

- `src/tts_engines.py` loads legacy F5-TTS from `modules/F5-TTS/src` and F5-TTS 1.1.22 from the pinned `f5-tts==1.1.22` site package. Because both use the `f5_tts` namespace, the loader clears that namespace and switches its import source when engines change.
- `configs/tts_config.json` exposes `F5TTS` and `F5TTS 1.1.22` separately. They share `voices/f5tts`; 1.1.22 custom checkpoints/tokenizers use `engines/f5tts_1_1_22`.
- F5-TTS 1.1.22 reuses a complete local Vocos snapshot from `engines/f5tts/vocoders` when present, avoiding an unnecessary Hugging Face download.
- Focused engine checks: `python -m unittest tests.test_tts_engines -v`, `python -m py_compile src/tts_engines.py src/model.py tests/test_tts_engines.py`, and `python -m json.tool configs/tts_config.json`.
