"""Bounded, resumable TXT, EPUB, and selectable-text PDF ingestion."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from posixpath import dirname, normpath
from typing import Callable, Iterable, Iterator, TextIO
from urllib.parse import unquote
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree

from .database import SQLiteStore


class IngestionError(ValueError):
    """Raised when a document cannot be ingested safely."""


DEFAULT_CHAPTER_MARKER = "--- CHAPTER END ---"
CHAPTER_TITLE_RE = re.compile(r"^chapter(?:\s+|\s*[:.\-]\s*)(?P<title>.+)$", re.IGNORECASE)


@dataclass(frozen=True)
class ChapterState:
    number: int = 0
    title: str | None = None


@dataclass(frozen=True)
class IngestedSentence:
    text: str
    source_offset: int
    source_end: int
    page_number: int = 0
    chapter_number: int = 0
    chapter_title: str | None = None

    def as_dict(self, sequence: int) -> dict:
        return {
            "sequence": sequence,
            "text": self.text,
            "source_offset": self.source_offset,
            "page_number": self.page_number,
            "chapter_number": self.chapter_number,
            "chapter_title": self.chapter_title,
        }


ProgressCallback = Callable[[dict], None]


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\s+", " ", value).strip()


def segment_text(
    text: str,
    *,
    source_offset: int = 0,
    page_number: int = 0,
    final: bool = True,
    chapter_state: ChapterState | None = None,
    chapter_marker: str = DEFAULT_CHAPTER_MARKER,
) -> tuple[list[IngestedSentence], str, int, ChapterState]:
    """Return complete sentences plus an unconsumed text remainder.

    The parser deliberately uses punctuation and line boundaries rather than a
    text-size limit.  A remainder is carried to the next chunk so a sentence
    split across reads is persisted exactly once.
    """

    boundaries = re.compile(r"(?<=[.!?。！？])[\"'»”’\)\]]*(?=\s)|\n+")
    sentences: list[IngestedSentence] = []
    state = chapter_state or ChapterState()
    consumed = 0
    for match in boundaries.finditer(text):
        raw = text[consumed : match.end()]
        transition = detect_chapter_transition(raw, state, chapter_marker)
        if transition is not None:
            state = transition
        else:
            cleaned = normalize_text(raw)
        if transition is None and cleaned:
            if state.number == 0:
                state = ChapterState(number=1)
            sentences.append(
                IngestedSentence(
                    text=cleaned,
                    source_offset=source_offset + consumed,
                    source_end=source_offset + match.end(),
                    page_number=page_number,
                    chapter_number=state.number,
                    chapter_title=state.title,
                )
            )
        consumed = match.end()
    if final and consumed < len(text):
        raw = text[consumed:]
        transition = detect_chapter_transition(raw, state, chapter_marker)
        if transition is not None:
            state = transition
        else:
            cleaned = normalize_text(raw)
        if transition is None and cleaned:
            if state.number == 0:
                state = ChapterState(number=1)
            sentences.append(
                IngestedSentence(
                    text=cleaned,
                    source_offset=source_offset + consumed,
                    source_end=source_offset + len(text),
                    page_number=page_number,
                    chapter_number=state.number,
                    chapter_title=state.title,
                )
            )
        consumed = len(text)
    return sentences, text[consumed:], source_offset + consumed, state


def detect_chapter_transition(raw: str, state: ChapterState, chapter_marker: str) -> ChapterState | None:
    """Return the next chapter state when a complete structural line is found."""

    line = normalize_text(raw)
    if not line:
        return None
    marker = normalize_text(chapter_marker)
    markers = {DEFAULT_CHAPTER_MARKER.casefold()}
    if marker:
        markers.add(marker.casefold())
    if line.casefold() in markers:
        return ChapterState(number=max(1, state.number + 1))
    match = CHAPTER_TITLE_RE.fullmatch(line)
    if not match:
        return None
    title = match.group("title").strip()
    number_match = re.match(r"(?P<number>\d+)\b", title)
    number = int(number_match.group("number")) if number_match else max(1, state.number + 1)
    return ChapterState(number=number, title=title)


class DocumentIngestor:
    """Stream a document and insert sentence batches into ``SQLiteStore``."""

    def __init__(self, store: SQLiteStore, batch_size: int = 100) -> None:
        if batch_size < 1:
            raise IngestionError("batch size must be at least 1")
        self.store = store
        self.batch_size = batch_size

    def ingest(self, document_id: str, *, on_progress: ProgressCallback | None = None, chunk_size: int = 64 * 1024) -> dict:
        document = self.store.get_document(document_id)
        source_path = Path(document["source_path"])
        if not source_path.is_file():
            error = f"source document does not exist: {source_path}"
            self.store.update_document_progress(document_id, status="failed", error=error)
            raise IngestionError(error)
        if document["kind"] not in {"txt", "pdf", "epub"}:
            raise IngestionError(f"unsupported document kind: {document['kind']}")
        self.store.update_document_progress(document_id, status="processing", error=None)
        try:
            if document["kind"] == "txt":
                self._ingest_txt(document, source_path, on_progress, chunk_size)
            elif document["kind"] == "epub":
                self._ingest_epub(document, source_path, on_progress)
            else:
                self._ingest_pdf(document, source_path, on_progress)
        except Exception as error:
            self.store.update_document_progress(document_id, status="failed", error=str(error))
            if isinstance(error, IngestionError):
                raise
            raise IngestionError(str(error)) from error
        return self.store.update_document_progress(document_id, status="completed", error=None)

    def _ingest_txt(
        self,
        document: dict,
        source_path: Path,
        on_progress: ProgressCallback | None,
        chunk_size: int,
    ) -> None:
        document_id = document["id"]
        checkpoint = int(document["checkpoint_offset"])
        sequence = self.store.next_sentence_sequence(document_id)
        total_bytes = max(int(document["total_bytes"]), source_path.stat().st_size)
        with source_path.open("r", encoding="utf-8", errors="replace", newline="") as stream:
            if checkpoint:
                skipped = stream.read(checkpoint)
                if len(skipped) < checkpoint:
                    raise IngestionError("document changed before ingestion could resume")
            buffer = ""
            buffer_offset = checkpoint
            read_bytes = len(skipped.encode("utf-8")) if checkpoint else 0
            chapter_state = ChapterState(
                number=int(document.get("chapter_number") or 0),
                title=document.get("chapter_title"),
            )
            chapter_marker = str(document.get("chapter_marker") or DEFAULT_CHAPTER_MARKER)
            while True:
                chunk = stream.read(chunk_size)
                if not chunk:
                    break
                buffer += chunk
                sentences, buffer, consumed_offset, chapter_state = segment_text(
                    buffer,
                    source_offset=buffer_offset,
                    final=False,
                    chapter_state=chapter_state,
                    chapter_marker=chapter_marker,
                )
                buffer_offset = consumed_offset
                read_bytes = min(total_bytes, read_bytes + len(chunk.encode("utf-8")))
                sequence = self._persist_batch(
                    document_id, sentences, sequence, total_bytes, read_bytes, on_progress
                )
            sentences, buffer, consumed_offset, chapter_state = segment_text(
                buffer,
                source_offset=buffer_offset,
                final=True,
                chapter_state=chapter_state,
                chapter_marker=chapter_marker,
            )
            self._persist_batch(
                document_id, sentences, sequence, total_bytes, total_bytes, on_progress
            )
            if not sentences and buffer.strip():
                raise IngestionError("document could not be segmented")

    def _persist_batch(
        self,
        document_id: str,
        sentences: list[IngestedSentence],
        sequence: int,
        total_bytes: int,
        processed_bytes: int,
        on_progress: ProgressCallback | None,
    ) -> int:
        if not sentences:
            return sequence
        for start in range(0, len(sentences), self.batch_size):
            batch = sentences[start : start + self.batch_size]
            self.store.append_sentences(
                document_id,
                [item.as_dict(sequence + index) for index, item in enumerate(batch)],
            )
            sequence += len(batch)
            last = batch[-1]
            current = self.store.update_document_progress(
                document_id,
                processed_bytes=processed_bytes,
                persisted_sentences=sequence,
                checkpoint_offset=last.source_end,
                chapter_number=last.chapter_number,
                chapter_title=last.chapter_title,
            )
            if on_progress:
                on_progress(current)
        return sequence

    def _ingest_pdf(
        self,
        document: dict,
        source_path: Path,
        on_progress: ProgressCallback | None,
    ) -> None:
        document_id = document["id"]
        start_page = int(document["checkpoint_page"])
        sequence = self.store.next_sentence_sequence(document_id)
        page_count = 0
        source_offset = 0
        chapter_state = ChapterState(
            number=int(document.get("chapter_number") or 0),
            title=document.get("chapter_title"),
        )
        chapter_marker = str(document.get("chapter_marker") or DEFAULT_CHAPTER_MARKER)
        for page_number, page_text in enumerate(iter_pdf_pages(source_path), start=1):
            page_count = page_number
            if page_number <= start_page:
                source_offset += len(page_text)
                continue
            sentences, _, _, chapter_state = segment_text(
                page_text,
                source_offset=source_offset,
                page_number=page_number,
                final=True,
                chapter_state=chapter_state,
                chapter_marker=chapter_marker,
            )
            source_offset += len(page_text)
            for start in range(0, len(sentences), self.batch_size):
                batch = sentences[start : start + self.batch_size]
                self.store.append_sentences(
                    document_id,
                    [item.as_dict(sequence + index) for index, item in enumerate(batch)],
                )
                sequence += len(batch)
            current = self.store.update_document_progress(
                document_id,
                processed_bytes=source_path.stat().st_size,
                processed_pages=page_number,
                persisted_sentences=sequence,
                checkpoint_page=page_number,
                chapter_number=sentences[-1].chapter_number if sentences else chapter_state.number,
                chapter_title=sentences[-1].chapter_title if sentences else chapter_state.title,
            )
            if on_progress:
                on_progress(current)
        if page_count == 0:
            raise IngestionError("PDF contains no selectable text pages")

    def _ingest_epub(
        self,
        document: dict,
        source_path: Path,
        on_progress: ProgressCallback | None,
    ) -> None:
        document_id = document["id"]
        start_page = int(document["checkpoint_page"])
        sequence = self.store.next_sentence_sequence(document_id)
        chapter_state = ChapterState(
            number=int(document.get("chapter_number") or 0),
            title=document.get("chapter_title"),
        )
        chapter_marker = str(document.get("chapter_marker") or DEFAULT_CHAPTER_MARKER)
        page_count = 0
        source_offset = 0
        text_seen = False
        source_size = source_path.stat().st_size
        for page_number, page_text in enumerate(iter_epub_pages(source_path), start=1):
            page_count = page_number
            if page_number <= start_page:
                source_offset += len(page_text)
                continue
            if page_text.strip():
                text_seen = True
            sentences, _, _, chapter_state = segment_text(
                page_text,
                source_offset=source_offset,
                page_number=page_number,
                final=True,
                chapter_state=chapter_state,
                chapter_marker=chapter_marker,
            )
            source_offset += len(page_text)
            for start in range(0, len(sentences), self.batch_size):
                batch = sentences[start : start + self.batch_size]
                self.store.append_sentences(
                    document_id,
                    [item.as_dict(sequence + index) for index, item in enumerate(batch)],
                )
                sequence += len(batch)
            current = self.store.update_document_progress(
                document_id,
                processed_bytes=source_size,
                processed_pages=page_number,
                persisted_sentences=sequence,
                checkpoint_page=page_number,
                chapter_number=sentences[-1].chapter_number if sentences else chapter_state.number,
                chapter_title=sentences[-1].chapter_title if sentences else chapter_state.title,
            )
            if on_progress:
                on_progress(current)
        if page_count == 0 or not text_seen:
            raise IngestionError("EPUB contains no readable text chapters")


def iter_pdf_pages(path: Path) -> Iterator[str]:
    """Yield one page at a time, preferring pdfplumber and falling back to PyPDF2."""

    try:
        import pdfplumber  # type: ignore
    except ImportError:
        pdfplumber = None
    if pdfplumber is not None:
        try:
            with pdfplumber.open(path) as pdf:
                for page in pdf.pages:
                    yield page.extract_text() or ""
            return
        except Exception:
            # A malformed page can make pdfplumber fail before any useful
            # output.  PyPDF2 remains a useful selectable-text fallback.
            pass
    try:
        from PyPDF2 import PdfReader  # type: ignore
    except ImportError as error:
        raise IngestionError("PDF support requires pdfplumber or PyPDF2") from error
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted and not reader.decrypt(""):
            raise IngestionError("PDF is encrypted and has no empty-password access")
        for page in reader.pages:
            yield page.extract_text() or ""
    except IngestionError:
        raise
    except Exception as error:
        raise IngestionError(f"PDF extraction failed: {error}") from error


class _EpubTextExtractor(HTMLParser):
    """Extract readable XHTML text while preserving paragraph boundaries."""

    _BLOCK_TAGS = {"address", "article", "aside", "blockquote", "br", "div", "h1", "h2", "h3", "h4", "h5", "h6", "header", "li", "p", "section", "table", "tr"}
    _IGNORED_TAGS = {"audio", "canvas", "iframe", "img", "script", "style", "svg", "video"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        if tag in self._IGNORED_TAGS:
            self._ignored_depth += 1
        if self._ignored_depth == 0 and tag in self._BLOCK_TAGS:
            self.parts.append("\n")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._ignored_depth == 0 and tag.casefold() in self._BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag in self._IGNORED_TAGS and self._ignored_depth:
            self._ignored_depth -= 1
        if self._ignored_depth == 0 and tag in self._BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._ignored_depth == 0 and data.strip():
            self.parts.append(data)

    def text(self) -> str:
        return "\n".join(line.strip() for line in "".join(self.parts).splitlines() if line.strip())


def iter_epub_pages(path: Path) -> Iterator[str]:
    """Yield the EPUB spine's XHTML documents in reading order."""

    try:
        with ZipFile(path) as archive:
            names = set(archive.namelist())
            try:
                container = ElementTree.fromstring(archive.read("META-INF/container.xml"))
            except (KeyError, ElementTree.ParseError) as error:
                raise IngestionError("EPUB is missing a valid container manifest") from error
            rootfile = next(
                (element.attrib.get("full-path") for element in container.iter() if element.tag.rsplit("}", 1)[-1] == "rootfile"),
                None,
            )
            if not rootfile or rootfile not in names:
                raise IngestionError("EPUB does not declare a valid package file")
            try:
                package = ElementTree.fromstring(archive.read(rootfile))
            except (KeyError, ElementTree.ParseError) as error:
                raise IngestionError("EPUB package metadata is invalid") from error
            manifest: dict[str, tuple[str, str]] = {}
            for item in package.iter():
                if item.tag.rsplit("}", 1)[-1] != "item":
                    continue
                item_id = item.attrib.get("id", "")
                href = item.attrib.get("href", "").split("#", 1)[0]
                media_type = item.attrib.get("media-type", "")
                if item_id and href and media_type in {"application/xhtml+xml", "text/html"}:
                    item_path = normpath("/" + dirname(rootfile) + "/" + unquote(href)).lstrip("/")
                    if item_path in names:
                        manifest[item_id] = (item_path, media_type)
            ordered_ids = [
                itemref.attrib.get("idref", "")
                for itemref in package.iter()
                if itemref.tag.rsplit("}", 1)[-1] == "itemref"
            ]
            ordered_paths = [manifest[item_id][0] for item_id in ordered_ids if item_id in manifest]
            if not ordered_paths:
                ordered_paths = [item_path for item_path, _ in manifest.values()]
            for item_path in ordered_paths:
                parser = _EpubTextExtractor()
                try:
                    parser.feed(archive.read(item_path).decode("utf-8", errors="replace"))
                    parser.close()
                except (KeyError, UnicodeError) as error:
                    raise IngestionError(f"EPUB chapter could not be read: {item_path}") from error
                yield parser.text()
    except BadZipFile as error:
        raise IngestionError("EPUB is not a valid ZIP package") from error
