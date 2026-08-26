import tempfile
import unittest
from pathlib import Path

from backend.app.database import SQLiteStore
from backend.app.ingestion import DocumentIngestor


class LargeDocumentTests(unittest.TestCase):
    def test_many_sentences_are_inserted_in_bounded_batches(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "large.txt"
            source.write_text(" ".join(f"Sentence {index}." for index in range(4000)), encoding="utf-8")
            store = SQLiteStore(root / "database.sqlite3")
            project = store.create_project("Large document")
            document = store.create_document(project["id"], source.name, str(source), "txt", total_bytes=source.stat().st_size)

            DocumentIngestor(store, batch_size=37).ingest(document["id"], chunk_size=257)

            self.assertEqual(store.count_sentences(project["id"]), 4000)
            self.assertEqual(store.get_document(document["id"])["status"], "completed")
            store.close()


if __name__ == "__main__":
    unittest.main()
