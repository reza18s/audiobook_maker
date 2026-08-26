import tempfile
import unittest
from pathlib import Path

from backend.app.database import SQLiteStore
from backend.app.ingestion import DocumentIngestor


class DocumentIngestionTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(self.root / "database.sqlite3")
        self.project = self.store.create_project("A test book")

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    def test_txt_is_streamed_in_batches_and_persists_source_offsets(self):
        source = self.root / "book.txt"
        source.write_text("First sentence. Second sentence!\nThird sentence?\n\nFinal line", encoding="utf-8")
        document = self.store.create_document(
            self.project["id"], source.name, str(source), "txt", total_bytes=source.stat().st_size
        )

        progress = []
        result = DocumentIngestor(self.store, batch_size=2).ingest(
            document["id"], chunk_size=5, on_progress=progress.append
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["persisted_sentences"], 4)
        self.assertGreaterEqual(len(progress), 2)
        sentences = self.store.list_sentences(self.project["id"], limit=10)
        self.assertEqual([item["text"] for item in sentences], [
            "First sentence.", "Second sentence!", "Third sentence?", "Final line"
        ])
        self.assertEqual([item["sequence"] for item in sentences], [0, 1, 2, 3])
        self.assertEqual(self.store.count_sentences(self.project["id"], query="Third"), 1)

        completed = sentences[0]
        self.store.update_sentence(completed["id"], status="completed", audio_path="audio.wav")
        edited = self.store.update_sentence(completed["id"], text="Edited sentence.")
        self.assertEqual(edited["status"], "pending")
        self.assertIsNone(edited["audio_path"])

    def test_sentence_pages_are_bounded(self):
        source = self.root / "book.txt"
        source.write_text("One. Two. Three.", encoding="utf-8")
        document = self.store.create_document(self.project["id"], source.name, str(source), "txt")
        DocumentIngestor(self.store).ingest(document["id"])

        page = self.store.list_sentences(self.project["id"], offset=1, limit=1)
        self.assertEqual(len(page), 1)
        self.assertEqual(page[0]["text"], "Two.")


if __name__ == "__main__":
    unittest.main()
