import io
import tempfile
import unittest
import wave
from pathlib import Path

from backend.app.contracts import GenerateRequest, JobStatus
from backend.app.engine_worker import GenerationWorker


def wav_bytes() -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\x00\x00" * 80)
    return output.getvalue()


class FakeEngine:
    def __init__(self, failures: int = 0) -> None:
        self.failures = failures
        self.requests = []
        self.samples = []

    def ensure_ready(self) -> dict:
        return {"status": "ready", "engineModelLoaded": True}

    def generate(self, request: GenerateRequest) -> bytes:
        self.requests.append(request)
        if self.failures:
            self.failures -= 1
            raise RuntimeError("temporary engine failure")
        return wav_bytes()

    def upload_sample(self, sample_id: str, audio: bytes) -> dict:
        self.samples.append((sample_id, audio))
        return {"status": "ok"}


class GenerationWorkerTests(unittest.TestCase):
    def test_worker_persists_engine_audio_on_the_sentence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            engine = FakeEngine()
            worker = GenerationWorker(root / "database.sqlite3", root / "projects", clients={"debug-tts": engine})
            project = worker.store.create_project("Worker test")
            document = worker.store.create_document(project["id"], "book.txt", str(root / "book.txt"), "txt")
            worker.store.append_sentences(document["id"], [{"text": "Hello.", "sequence": 0}])
            sentence = worker.store.list_sentences(project["id"], limit=1)[0]
            sample_path = worker.root / project["id"] / "samples" / "speaker.wav"
            sample_path.parent.mkdir(parents=True, exist_ok=True)
            sample_path.write_bytes(wav_bytes())
            request = GenerateRequest(
                "job-1", "debug-tts", sentence["text"], language="en", speaker_sample="speaker.wav"
            )
            worker.queue.enqueue(request)
            worker.store.update_sentence(sentence["id"], status="queued", generation_job_id=request.job_id)

            self.assertTrue(worker.run_once())
            self.assertEqual(worker.queue.get_status(request.job_id).status, JobStatus.COMPLETED)
            completed = worker.store.get_sentence(sentence["id"])
            self.assertEqual(completed["status"], "completed")
            self.assertTrue((worker.root / completed["audio_path"]).is_file())
            self.assertEqual(engine.requests[0].language, "en")
            self.assertEqual(engine.samples[0][0], "speaker")
            worker.close()

    def test_three_failures_mark_one_sentence_failed_and_continue(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            engine = FakeEngine(failures=3)
            worker = GenerationWorker(root / "database.sqlite3", root / "projects", clients={"debug-tts": engine})
            project = worker.store.create_project("Retry test")
            document = worker.store.create_document(project["id"], "book.txt", str(root / "book.txt"), "txt")
            worker.store.append_sentences(
                document["id"], [{"text": "First.", "sequence": 0}, {"text": "Second.", "sequence": 1}]
            )
            sentences = worker.store.list_sentences(project["id"], limit=2)
            for index, sentence in enumerate(sentences, start=1):
                job_id = f"job-{index}"
                worker.queue.enqueue(GenerateRequest(job_id, "debug-tts", sentence["text"], language="en"))
                worker.store.update_sentence(sentence["id"], status="queued", generation_job_id=job_id)

            for _ in range(4):
                self.assertTrue(worker.run_once())

            self.assertEqual(worker.queue.get_status("job-1").status, JobStatus.FAILED)
            self.assertEqual(worker.queue.get_status("job-2").status, JobStatus.COMPLETED)
            self.assertEqual(worker.store.get_sentence(sentences[0]["id"])["status"], "failed")
            self.assertEqual(worker.store.get_sentence(sentences[1]["id"])["status"], "completed")
            worker.close()


if __name__ == "__main__":
    unittest.main()
