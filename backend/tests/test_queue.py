import tempfile
import unittest
from pathlib import Path

from backend.app.contracts import GenerateRequest, JobStatus, Progress
from backend.app.queue import SQLiteQueue


class SQLiteQueueTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.queue = SQLiteQueue(Path(self.temp_dir.name) / "jobs.sqlite3")

    def tearDown(self):
        self.queue.close()
        self.temp_dir.cleanup()

    def test_claim_is_fifo_and_default_is_sequential(self):
        self.queue.enqueue(GenerateRequest("job-1", "f5tts", "First"))
        self.queue.enqueue(GenerateRequest("job-2", "f5tts", "Second"))

        first = self.queue.claim_next()
        self.assertEqual(first.job_id, "job-1")
        self.assertIsNone(self.queue.claim_next())
        self.assertEqual(self.queue.get_status("job-1").status, JobStatus.RUNNING)

    def test_retry_is_limited_and_then_fails(self):
        self.queue.enqueue(GenerateRequest("job-1", "f5tts", "Retry me"))
        for attempt in range(1, 4):
            self.queue.claim_next()
            result = self.queue.fail("job-1", "temporary error")
            if attempt < 3:
                self.assertEqual(result.status, JobStatus.RETRYING)
                self.queue.requeue_retry("job-1")
            else:
                self.assertEqual(result.status, JobStatus.FAILED)

    def test_progress_and_cancellation_survive_reopen(self):
        self.queue.enqueue(GenerateRequest("job-1", "f5tts", "Persist me"))
        self.queue.claim_next()
        self.queue.update_progress("job-1", Progress(completed=1, total=2, percent=50, message="Halfway"))
        self.queue.close()

        reopened = SQLiteQueue(Path(self.temp_dir.name) / "jobs.sqlite3")
        status = reopened.get_status("job-1")
        self.assertEqual(status.status, JobStatus.QUEUED)
        self.assertEqual(status.progress.percent, 50)
        self.assertEqual(status.progress.message, "Recovered after restart")
        reopened.cancel("job-1")
        self.assertEqual(reopened.get_status("job-1").status, JobStatus.CANCELLED)
        reopened.close()


if __name__ == "__main__":
    unittest.main()
