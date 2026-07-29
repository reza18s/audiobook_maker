import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch


sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import tts_engines


class FakeF5TTS:
    def __init__(self, **kwargs):
        self.options = kwargs


class FakeLoadedEngine:
    def __init__(self):
        self.infer_options = None

    def infer(self, **kwargs):
        self.infer_options = kwargs
        with open(kwargs["file_wave"], "wb") as audio_file:
            audio_file.write(b"audio")


class F5TTS1122Tests(unittest.TestCase):
    def test_configuration_exposes_both_f5_engines(self):
        engine_names = [
            engine.name for engine in tts_engines.load_tts_config().tts_engines
        ]

        self.assertIn("F5TTS", engine_names)
        self.assertIn("F5TTS 1.1.22", engine_names)

    def test_loads_v1_model_without_replacing_legacy_configuration(self):
        with patch.object(
            tts_engines, "_require_f5tts", return_value=FakeF5TTS
        ):
            engine = tts_engines.load_with_f5tts_1_1_22(
                f5tts_1_1_22_model="Default",
                f5tts_1_1_22_tokenizer="Default",
            )

        self.assertEqual(engine.options["model"], "F5TTS_v1_Base")
        self.assertEqual(engine.options["ckpt_file"], "")
        self.assertEqual(engine.options["vocab_file"], "")
        self.assertTrue(
            os.path.normpath(engine.options["hf_cache_dir"]).endswith(
                os.path.join("engines", "f5tts_1_1_22", "models")
            )
        )

    def test_generation_reuses_legacy_voice_and_maps_random_seed(self):
        with tempfile.TemporaryDirectory() as temp_directory:
            voice_name = "narrator"
            voice_directory = os.path.join(temp_directory, voice_name)
            os.makedirs(voice_directory)
            open(os.path.join(voice_directory, f"{voice_name}.wav"), "wb").close()
            with open(
                os.path.join(voice_directory, f"{voice_name}.txt"),
                "w",
                encoding="utf-8",
            ) as reference_file:
                reference_file.write("Reference text")

            config = SimpleNamespace(
                tts_engines=[
                    SimpleNamespace(
                        name="F5TTS 1.1.22",
                        parameters=[
                            SimpleNamespace(
                                attribute="f5tts_1_1_22_voice",
                                folder_path=temp_directory,
                            ),
                            SimpleNamespace(
                                attribute="f5tts_1_1_22_speed",
                                step=100,
                            ),
                        ],
                    )
                ]
            )
            engine = FakeLoadedEngine()
            output_path = os.path.join(temp_directory, "output.wav")

            with (
                patch.object(tts_engines, "_require_f5tts"),
                patch.object(tts_engines, "load_tts_config", return_value=config),
            ):
                generated = tts_engines.generate_with_f5tts_1_1_22(
                    engine,
                    "Generated text",
                    {
                        "f5tts_1_1_22_voice": voice_name,
                        "f5tts_1_1_22_speed": 125,
                        "f5tts_1_1_22_seed": -1,
                    },
                    output_path,
                )

        self.assertTrue(generated)
        self.assertEqual(engine.infer_options["speed"], 1.25)
        self.assertIsNone(engine.infer_options["seed"])
        self.assertEqual(engine.infer_options["ref_text"], "Reference text")


if __name__ == "__main__":
    unittest.main()
