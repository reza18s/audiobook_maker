import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

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
        self.assertEqual(edited["status"], "stale")
        self.assertIsNone(edited["audio_path"])

    def test_sentence_pages_are_bounded(self):
        source = self.root / "book.txt"
        source.write_text("One. Two. Three.", encoding="utf-8")
        document = self.store.create_document(self.project["id"], source.name, str(source), "txt")
        DocumentIngestor(self.store).ingest(document["id"])

        page = self.store.list_sentences(self.project["id"], offset=1, limit=1)
        self.assertEqual(len(page), 1)
        self.assertEqual(page[0]["text"], "Two.")

    def test_sentences_can_be_deleted_without_affecting_other_sentences(self):
        source = self.root / "book.txt"
        source.write_text("One. Two. Three.", encoding="utf-8")
        document = self.store.create_document(self.project["id"], source.name, str(source), "txt")
        DocumentIngestor(self.store).ingest(document["id"])
        sentences = self.store.list_sentences(self.project["id"], limit=10)

        deleted = self.store.delete_sentences([sentences[0]["id"], sentences[2]["id"]])

        self.assertEqual([item["text"] for item in deleted], ["One.", "Three."])
        remaining = self.store.list_sentences(self.project["id"], limit=10)
        self.assertEqual([item["text"] for item in remaining], ["Two."])
        self.assertEqual(self.store.get_document(document["id"])["persisted_sentences"], 1)
        self.assertEqual(self.store.get_project(self.project["id"])["sentence_count"], 1)

    def test_txt_checkpoint_resume_does_not_duplicate_sentences(self):
        source = self.root / "resume.txt"
        source.write_text("One. Two.", encoding="utf-8")
        document = self.store.create_document(self.project["id"], source.name, str(source), "txt")
        self.store.append_sentences(document["id"], [{"text": "One.", "sequence": 0}])
        self.store.update_document_progress(
            document["id"], status="processing", checkpoint_offset=4, persisted_sentences=1
        )

        DocumentIngestor(self.store).ingest(document["id"], chunk_size=3)

        sentences = self.store.list_sentences(self.project["id"], limit=10)
        self.assertEqual([item["text"] for item in sentences], ["One.", "Two."])

    def test_chapters_use_headings_end_markers_and_custom_markers(self):
        source = self.root / "chapters.txt"
        source.write_text(
            "Chapter 1\nOpening scene.\n--- CHAPTER END ---\nSecond scene.\n[BREAK]\nFinal scene.",
            encoding="utf-8",
        )
        document = self.store.create_document(
            self.project["id"], source.name, str(source), "txt", chapter_marker="[BREAK]"
        )

        result = DocumentIngestor(self.store).ingest(document["id"], chunk_size=7)

        sentences = self.store.list_sentences(self.project["id"], limit=10)
        self.assertEqual([item["text"] for item in sentences], [
            "Opening scene.", "Second scene.", "Final scene."
        ])
        self.assertEqual(
            [(item["chapter_number"], item["chapter_title"]) for item in sentences],
            [(1, "1"), (2, None), (3, None)],
        )
        self.assertEqual((result["chapter_number"], result["chapter_title"]), (3, None))

    def test_chapter_listing_and_project_document_updates(self):
        source = self.root / "editable.txt"
        source.write_text(
            "Chapter One\nOpening scene.\n--- CHAPTER END ---\nClosing scene.",
            encoding="utf-8",
        )
        document = self.store.create_document(
            self.project["id"], source.name, str(source), "txt", total_bytes=source.stat().st_size
        )
        DocumentIngestor(self.store).ingest(document["id"])

        chapters = self.store.list_chapters(self.project["id"])
        self.assertEqual([chapter["number"] for chapter in chapters], [1, 2])
        self.assertEqual(chapters[0]["sentence_count"], 1)
        chapter_sentences = self.store.list_sentences(
            self.project["id"], document_id=document["id"], chapter_number=2
        )
        self.assertEqual([item["text"] for item in chapter_sentences], ["Closing scene."])

        renamed = self.store.update_project(self.project["id"], name="Renamed book")
        self.assertEqual(renamed["name"], "Renamed book")
        edited = self.store.update_document(
            document["id"], filename="renamed.txt", chapter_marker="[BREAK]", reprocess=True
        )
        self.assertEqual(edited["filename"], "renamed.txt")
        self.assertEqual(edited["status"], "pending")
        self.assertEqual(self.store.count_sentences(self.project["id"]), 0)

        self.store.delete_document(document["id"])
        with self.assertRaisesRegex(ValueError, "unknown document"):
            self.store.get_document(document["id"])
        self.store.delete_project(self.project["id"])
        with self.assertRaisesRegex(ValueError, "unknown project"):
            self.store.get_project(self.project["id"])

    def test_epub_spine_is_extracted_in_reading_order(self):
        source = self.root / "book.epub"
        container = """<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"""
        package = """<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="first" href="chapter%201.xhtml" media-type="application/xhtml+xml"/><item id="second" href="chapter2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>"""
        with ZipFile(source, "w") as archive:
            archive.writestr("META-INF/container.xml", container)
            archive.writestr("OPS/package.opf", package)
            archive.writestr("OPS/chapter 1.xhtml", "<html><body><h1>Chapter 1</h1><p>Opening scene.</p></body></html>")
            archive.writestr("OPS/chapter2.xhtml", "<html><body><h1>Chapter 2</h1><p>Closing scene.</p></body></html>")
        document = self.store.create_document(
            self.project["id"], source.name, str(source), "epub", total_bytes=source.stat().st_size
        )

        result = DocumentIngestor(self.store).ingest(document["id"])

        self.assertEqual(result["status"], "completed")
        sentences = self.store.list_sentences(self.project["id"], limit=10)
        self.assertEqual([item["text"] for item in sentences], ["Opening scene.", "Closing scene."])
        self.assertEqual([item["chapter_number"] for item in sentences], [1, 2])


if __name__ == "__main__":
    unittest.main()
