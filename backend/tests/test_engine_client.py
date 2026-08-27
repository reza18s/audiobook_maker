import json
import unittest
from unittest.mock import Mock, patch

from backend.app.contracts import GenerateRequest
from backend.app.engine_client import EngineClient, configured_engine_urls


class FakeResponse:
    def __init__(self, body: bytes, content_type: str = "application/json") -> None:
        self.body = body
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return self.body


class EngineClientTests(unittest.TestCase):
    def test_environment_supports_named_and_generic_engine_urls(self):
        urls = configured_engine_urls(
            {
                "F5TTS_URL": "http://f5:8001/",
                "ENGINE_URL_DEBUG_TTS": "http://debug:8003/",
            }
        )
        self.assertEqual(urls, {"f5tts": "http://f5:8001", "debug-tts": "http://debug:8003"})

    @patch("backend.app.engine_client.urlopen")
    def test_generate_uses_engine_repository_payload(self, urlopen):
        urlopen.return_value = FakeResponse(b"RIFF" + b"\x00" * 8 + b"WAVE", "audio/wav")

        result = EngineClient("http://engine").generate(
            GenerateRequest(
                "job-1",
                "chatterbox",
                "Hello",
                language="he",
                speaker_sample="speaker.wav",
                parameters={"temperature": 0.8},
            )
        )

        payload = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(result[:4], b"RIFF")
        self.assertEqual(payload["ttsSpeakerWav"], "speaker.wav")
        self.assertEqual(payload["language"], "he")
        self.assertEqual(payload["parameters"]["temperature"], 0.8)

    @patch("backend.app.engine_client.urlopen")
    def test_ensure_ready_loads_reported_default_model(self, urlopen):
        responses = [
            FakeResponse(json.dumps({"status": "ready", "engineModelLoaded": False}).encode()),
            FakeResponse(json.dumps({"defaultModel": "multilingual", "models": []}).encode()),
            FakeResponse(json.dumps({"status": "loaded"}).encode()),
            FakeResponse(json.dumps({"status": "ready", "engineModelLoaded": True}).encode()),
        ]
        urlopen.side_effect = responses

        health = EngineClient("http://engine").ensure_ready()

        self.assertTrue(health["engineModelLoaded"])
        load_payload = json.loads(urlopen.call_args_list[2].args[0].data.decode("utf-8"))
        self.assertEqual(load_payload, {"engineModelName": "multilingual"})


if __name__ == "__main__":
    unittest.main()
