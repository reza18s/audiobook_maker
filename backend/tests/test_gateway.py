import unittest

from backend.app.contracts import (
    DependencyKind,
    DependencyRequirement,
    DownloadApproval,
    EngineCapability,
    GenerateRequest,
    JobStatus,
)
from backend.app.gateway import Gateway


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.gateway = Gateway(
            [
                EngineCapability(
                    id="f5tts",
                    display_name="F5-TTS",
                    version="1",
                    dependencies=(
                        DependencyRequirement(
                            id="f5-model",
                            kind=DependencyKind.MODEL,
                            name="F5-TTS model",
                        ),
                    ),
                )
            ]
        )

    def test_missing_model_pauses_job_until_approved(self):
        request = GenerateRequest("job-1", "f5tts", "Hello")
        waiting = self.gateway.submit(request)
        self.assertEqual(waiting.status, JobStatus.WAITING_FOR_DEPENDENCY)

        queued = self.gateway.approve_dependency(DownloadApproval("f5-model", True))
        self.assertEqual(queued.status, JobStatus.QUEUED)
        self.assertEqual(queued.dependencies, ())

    def test_declining_download_does_not_start_job(self):
        self.gateway.submit(GenerateRequest("job-2", "f5tts", "Hello"))
        failed = self.gateway.approve_dependency(DownloadApproval("f5-model", False))
        self.assertEqual(failed.status, JobStatus.FAILED)
        self.assertIn("declined", failed.error)

    def test_cancel_waiting_job_is_terminal(self):
        self.gateway.submit(GenerateRequest("job-3", "f5tts", "Hello"))
        cancelled = self.gateway.cancel("job-3")
        self.assertEqual(cancelled.status, JobStatus.CANCELLED)


if __name__ == "__main__":
    unittest.main()
