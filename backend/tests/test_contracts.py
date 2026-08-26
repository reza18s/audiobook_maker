import unittest

from backend.app.contracts import (
    CONTRACT_VERSION,
    DependencyKind,
    DependencyRequirement,
    GenerateRequest,
    JobStatus,
    JobStatusResponse,
    Progress,
    to_json_dict,
)


class ContractTests(unittest.TestCase):
    def test_version_and_retry_limit_are_stable(self):
        self.assertEqual(CONTRACT_VERSION, "1")
        response = JobStatusResponse("job-1", JobStatus.RETRYING, attempts=2)
        self.assertEqual(response.max_attempts, 3)

    def test_missing_dependency_is_explicit_and_serializable(self):
        dependency = DependencyRequirement(
            id="f5tts-model",
            kind=DependencyKind.MODEL,
            name="F5-TTS v1 base model",
            source="Hugging Face",
            reason="Required by the selected engine",
        )
        response = JobStatusResponse(
            "job-1",
            JobStatus.WAITING_FOR_DEPENDENCY,
            dependencies=(dependency,),
        )

        payload = to_json_dict(response)
        self.assertEqual(payload["status"], "waiting_for_dependency")
        self.assertEqual(payload["dependencies"][0]["kind"], "model")
        self.assertEqual(payload["dependencies"][0]["state"], "approval_required")

    def test_invalid_generation_request_is_rejected(self):
        with self.assertRaises(ValueError):
            GenerateRequest("job-1", "f5tts", "   ")

    def test_progress_cannot_exceed_total(self):
        with self.assertRaises(ValueError):
            Progress(completed=2, total=1, percent=100)


if __name__ == "__main__":
    unittest.main()
