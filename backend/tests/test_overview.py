import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.app.database import SQLiteStore


class ProjectOverviewTests(unittest.TestCase):
    def test_overview_reports_chapter_progress_and_blockers(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            store = SQLiteStore(root / "audiobook.sqlite3")
            project = store.create_project("Overview")
            document = store.create_document(project["id"], "book.txt", str(root / "book.txt"), "txt")
            speaker = store.create_speaker(project["id"], "Narrator")
            store.append_sentences(document["id"], [
                {"text": "Ready.", "sequence": 0, "chapter_number": 1, "chapter_title": "Opening", "speaker_id": speaker["id"]},
                {"text": "Pending.", "sequence": 1, "chapter_number": 1, "chapter_title": "Opening", "speaker_id": speaker["id"]},
                {"text": "Needs a speaker.", "sequence": 2, "chapter_number": 1, "chapter_title": "Opening"},
            ])
            store.update_document_progress(document["id"], status="completed")
            sentences = store.list_sentences(project["id"], limit=10)
            store.update_sentence(sentences[0]["id"], status="completed", audio_path=str(root / "ready.wav"))
            store.update_sentence(sentences[2]["id"], status="failed", error="engine failed")

            try:
                overview = store.get_project_overview(project["id"])

                self.assertEqual(overview["totals"]["sentence_count"], 3)
                self.assertEqual(overview["totals"]["completed_count"], 1)
                self.assertEqual(overview["totals"]["pending_count"], 1)
                self.assertEqual(overview["totals"]["failed_count"], 1)
                self.assertEqual(overview["totals"]["missing_speaker_count"], 1)
                self.assertEqual(overview["readiness"], "blocked")
                self.assertEqual(overview["chapters"][0]["progress_percent"], 33.33)
                self.assertTrue(any("Assign speakers" in blocker for blocker in overview["blockers"]))
            finally:
                store.close()

    def test_voice_variant_lifecycle_and_sentence_edits_mark_audio_stale(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            store = SQLiteStore(root / "audiobook.sqlite3")
            try:
                project = store.create_project("Voices")
                document = store.create_document(project["id"], "book.txt", str(root / "book.txt"), "txt")
                speaker = store.create_speaker(project["id"], "Narrator")
                store.append_sentences(document["id"], [{"text": "Original.", "sequence": 0, "speaker_id": speaker["id"]}])
                sentence = store.list_sentences(project["id"], limit=1)[0]
                store.update_sentence(sentence["id"], status="completed", audio_path=str(root / "audio.wav"))

                variant = store.create_voice_variant(speaker["id"], "Calm", "debug-tts", "calm")
                self.assertEqual(store.list_voice_variants(project["id"])[0]["id"], variant["id"])
                stale = store.update_sentence(sentence["id"], text="Updated.")
                self.assertEqual(stale["status"], "stale")
                self.assertIsNone(stale["audio_path"])

                deleted = store.delete_voice_variant(variant["id"])
                self.assertEqual(deleted["name"], "Calm")
                self.assertEqual(store.list_voice_variants(project["id"]), [])
            finally:
                store.close()


if __name__ == "__main__":
    unittest.main()
