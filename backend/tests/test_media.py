import tempfile
import unittest
from pathlib import Path

from backend.app.database import SQLiteStore
from backend.app.media import ExportError, MediaExportService


class MediaExportTests(unittest.TestCase):
    def test_queued_export_can_be_cancelled_before_worker_starts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = SQLiteStore(root / "database.sqlite3")
            project = store.create_project("Cancel export")
            export = store.create_export(project["id"], "wav", 0, str(root / "out.wav"))

            result = MediaExportService(store).cancel(export["id"])

            self.assertEqual(result["status"], "cancelled")
            store.close()

    def test_export_rejects_missing_or_failed_sentence_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = SQLiteStore(root / "database.sqlite3")
            project = store.create_project("Export test")
            source = root / "book.txt"
            source.write_text("A sentence.", encoding="utf-8")
            document = store.create_document(project["id"], source.name, str(source), "txt")
            store.append_sentences(document["id"], [{"text": "A sentence.", "sequence": 0}])

            with self.assertRaisesRegex(ExportError, "missing or failed"):
                MediaExportService(store).export_project(
                    project["id"], output_path=root / "out.wav", output_format="wav"
                )
            store.close()

    def test_external_worker_marks_invalid_queued_export_failed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = SQLiteStore(root / "database.sqlite3")
            project = store.create_project("Worker export")
            source = root / "book.txt"
            source.write_text("A sentence.", encoding="utf-8")
            document = store.create_document(project["id"], source.name, str(source), "txt")
            store.append_sentences(document["id"], [{"text": "A sentence.", "sequence": 0}])
            export = store.create_export(project["id"], "wav", 0, str(root / "out.wav"))

            with self.assertRaises(ExportError):
                MediaExportService(store).export_project(
                    project["id"], output_path=root / "out.wav", output_format="wav", export_id=export["id"]
                )
            self.assertEqual(store.get_export(export["id"])["status"], "failed")
            store.close()


if __name__ == "__main__":
    unittest.main()
