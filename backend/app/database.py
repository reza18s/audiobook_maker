"""SQLite persistence for the audiobook domain.

The gateway and workers share this small repository.  SQLite is opened in WAL
mode and all writes are guarded by one process-local lock, which is enough for
the trusted single-user deployment described by the architecture.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from uuid import uuid4


class DatabaseError(ValueError):
    """Raised when a domain persistence operation cannot be completed."""


class SQLiteStore:
    """Domain repository backed by one coordinated SQLite connection."""

    def __init__(self, database_path: str | Path) -> None:
        self.database_path = str(database_path)
        self._lock = RLock()
        self._connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute("PRAGMA foreign_keys=ON")
        self._create_schema()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def create_project(self, name: str, project_id: str | None = None) -> dict:
        clean_name = name.strip()
        if not clean_name:
            raise DatabaseError("project name is required")
        project_id = project_id or str(uuid4())
        now = _timestamp()
        with self._lock:
            try:
                self._connection.execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                    (project_id, clean_name, now, now),
                )
                self._connection.commit()
            except sqlite3.IntegrityError as error:
                raise DatabaseError(f"project already exists: {project_id}") from error
        return self.get_project(project_id)

    def update_project(self, project_id: str, *, name: str) -> dict:
        clean_name = name.strip()
        if not clean_name:
            raise DatabaseError("project name is required")
        self.get_project(project_id)
        with self._lock:
            self._connection.execute(
                "UPDATE projects SET name = ?, updated_at = ? WHERE id = ?",
                (clean_name, _timestamp(), project_id),
            )
            self._connection.commit()
        return self.get_project(project_id)

    def delete_project(self, project_id: str) -> dict:
        project = self.get_project(project_id)
        with self._lock:
            self._connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            self._connection.commit()
        return project

    def list_projects(self) -> list[dict]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT p.*, COUNT(DISTINCT d.id) AS document_count,
                       COUNT(s.id) AS sentence_count
                FROM projects p
                LEFT JOIN documents d ON d.project_id = p.id
                LEFT JOIN sentences s ON s.document_id = d.id
                GROUP BY p.id
                ORDER BY p.updated_at DESC, p.id
                """
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def get_project(self, project_id: str) -> dict:
        with self._lock:
            row = self._connection.execute(
                """
                SELECT p.*, COUNT(DISTINCT d.id) AS document_count,
                       COUNT(s.id) AS sentence_count
                FROM projects p
                LEFT JOIN documents d ON d.project_id = p.id
                LEFT JOIN sentences s ON s.document_id = d.id
                WHERE p.id = ?
                GROUP BY p.id
                """,
                (project_id,),
            ).fetchone()
        if row is None:
            raise DatabaseError(f"unknown project: {project_id}")
        return _row_dict(row)

    def create_document(
        self,
        project_id: str,
        filename: str,
        source_path: str,
        kind: str,
        *,
        document_id: str | None = None,
        total_bytes: int = 0,
        chapter_marker: str = "",
    ) -> dict:
        self.get_project(project_id)
        if kind not in {"txt", "pdf"}:
            raise DatabaseError("document kind must be txt or pdf")
        document_id = document_id or str(uuid4())
        now = _timestamp()
        with self._lock:
            try:
                self._connection.execute(
                    """
                    INSERT INTO documents (
                        id, project_id, filename, source_path, kind, status,
                        total_bytes, processed_bytes, processed_pages,
                        persisted_sentences, checkpoint_offset, checkpoint_page,
                        chapter_marker, chapter_number, chapter_title,
                        error, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, 0, 0, 0, 0, ?, 0, NULL, NULL, ?, ?)
                    """,
                    (
                        document_id, project_id, filename, source_path, kind, total_bytes,
                        chapter_marker.strip(), now, now,
                    ),
                )
                self._connection.execute(
                    "UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id)
                )
                self._connection.commit()
            except sqlite3.IntegrityError as error:
                raise DatabaseError(f"document already exists: {document_id}") from error
        return self.get_document(document_id)

    def get_document(self, document_id: str) -> dict:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM documents WHERE id = ?", (document_id,)
            ).fetchone()
        if row is None:
            raise DatabaseError(f"unknown document: {document_id}")
        return _row_dict(row)

    def list_documents(self, project_id: str) -> list[dict]:
        self.get_project(project_id)
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM documents WHERE project_id = ? ORDER BY created_at, id",
                (project_id,),
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def update_document(
        self,
        document_id: str,
        *,
        filename: str | None = None,
        chapter_marker: str | None = None,
        reprocess: bool = False,
    ) -> dict:
        document = self.get_document(document_id)
        clean_filename = document["filename"] if filename is None else filename.strip()
        if not clean_filename:
            raise DatabaseError("document filename is required")
        if Path(clean_filename).name != clean_filename:
            raise DatabaseError("document filename must be a file name")
        clean_marker = document["chapter_marker"] if chapter_marker is None else chapter_marker.strip()
        marker_changed = clean_marker != document["chapter_marker"]
        if marker_changed and document["status"] == "processing":
            raise DatabaseError("wait for document processing to finish before changing its chapter marker")
        if marker_changed and document["persisted_sentences"] and not reprocess:
            raise DatabaseError("changing a chapter marker requires reprocess=true")

        now = _timestamp()
        with self._lock:
            if reprocess:
                self._connection.execute("DELETE FROM sentences WHERE document_id = ?", (document_id,))
                self._connection.execute(
                    """
                    UPDATE documents SET filename = ?, chapter_marker = ?, status = 'pending',
                        processed_bytes = 0, processed_pages = 0, persisted_sentences = 0,
                        checkpoint_offset = 0, checkpoint_page = 0, chapter_number = 0,
                        chapter_title = NULL, error = NULL, updated_at = ? WHERE id = ?
                    """,
                    (clean_filename, clean_marker, now, document_id),
                )
            else:
                self._connection.execute(
                    "UPDATE documents SET filename = ?, chapter_marker = ?, updated_at = ? WHERE id = ?",
                    (clean_filename, clean_marker, now, document_id),
                )
            self._connection.execute(
                "UPDATE projects SET updated_at = ? WHERE id = ?", (now, document["project_id"])
            )
            self._connection.commit()
        return self.get_document(document_id)

    def delete_document(self, document_id: str) -> dict:
        document = self.get_document(document_id)
        with self._lock:
            self._connection.execute("DELETE FROM documents WHERE id = ?", (document_id,))
            self._connection.execute(
                "UPDATE projects SET updated_at = ? WHERE id = ?",
                (_timestamp(), document["project_id"]),
            )
            self._connection.commit()
        return document

    def list_document_sentence_ids(self, document_id: str) -> list[str]:
        self.get_document(document_id)
        with self._lock:
            rows = self._connection.execute(
                "SELECT id FROM sentences WHERE document_id = ?", (document_id,)
            ).fetchall()
        return [str(row[0]) for row in rows]

    def list_incomplete_documents(self) -> list[dict]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM documents WHERE status IN ('pending', 'processing') ORDER BY created_at, id"
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def list_chapters(
        self,
        project_id: str,
        *,
        query: str = "",
        status: str = "",
        speaker_id: str = "",
    ) -> list[dict]:
        self.get_project(project_id)
        where, params = _sentence_filters(project_id, query, status, speaker_id)
        with self._lock:
            rows = self._connection.execute(
                f"""
                SELECT d.id AS document_id, d.filename AS document_filename,
                       d.created_at AS document_created_at, s.chapter_number,
                       MIN(s.chapter_title) AS chapter_title, COUNT(*) AS sentence_count
                FROM sentences s
                JOIN documents d ON d.id = s.document_id
                WHERE {where}
                GROUP BY d.id, d.filename, d.created_at, s.chapter_number
                ORDER BY d.created_at, d.id, s.chapter_number
                """,
                params,
            ).fetchall()
        chapters = []
        for row in rows:
            number = int(row["chapter_number"] or 0)
            chapters.append({
                "id": f"{row['document_id']}:{number}",
                "document_id": row["document_id"],
                "document_filename": row["document_filename"],
                "number": number,
                "title": row["chapter_title"],
                "sentence_count": int(row["sentence_count"]),
            })
        return chapters

    def get_project_overview(self, project_id: str) -> dict:
        """Return the persisted production state needed by the project dashboard."""

        project = self.get_project(project_id)
        documents = self.list_documents(project_id)
        with self._lock:
            chapter_rows = self._connection.execute(
                """
                SELECT d.id AS document_id, d.filename AS document_filename,
                       s.chapter_number, MIN(s.chapter_title) AS chapter_title,
                       COUNT(*) AS sentence_count,
                       SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                       SUM(CASE WHEN s.status IN ('failed', 'cancelled') THEN 1 ELSE 0 END) AS failed_count,
                       SUM(CASE WHEN s.status IN ('pending', 'stale') THEN 1 ELSE 0 END) AS pending_count,
                       SUM(CASE WHEN s.speaker_id IS NULL THEN 1 ELSE 0 END) AS missing_speaker_count
                FROM sentences s
                JOIN documents d ON d.id = s.document_id
                WHERE d.project_id = ?
                GROUP BY d.id, d.filename, s.chapter_number
                ORDER BY d.created_at, d.id, s.chapter_number
                """,
                (project_id,),
            ).fetchall()
            totals_row = self._connection.execute(
                """
                SELECT COUNT(*) AS sentence_count,
                       SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                       SUM(CASE WHEN s.status IN ('failed', 'cancelled') THEN 1 ELSE 0 END) AS failed_count,
                       SUM(CASE WHEN s.status IN ('pending', 'stale') THEN 1 ELSE 0 END) AS pending_count,
                       SUM(CASE WHEN s.status IN ('queued', 'running', 'retrying', 'waiting_for_dependency', 'cancel_requested') THEN 1 ELSE 0 END) AS active_count,
                       SUM(CASE WHEN s.speaker_id IS NULL THEN 1 ELSE 0 END) AS missing_speaker_count
                FROM sentences s
                JOIN documents d ON d.id = s.document_id
                WHERE d.project_id = ?
                """,
                (project_id,),
            ).fetchone()

        total_sentences = int(totals_row["sentence_count"] or 0)
        completed_sentences = int(totals_row["completed_count"] or 0)
        failed_sentences = int(totals_row["failed_count"] or 0)
        pending_sentences = int(totals_row["pending_count"] or 0)
        active_sentences = int(totals_row["active_count"] or 0)
        missing_speaker_sentences = int(totals_row["missing_speaker_count"] or 0)
        failed_documents = sum(document["status"] == "failed" for document in documents)
        active_documents = sum(document["status"] in {"pending", "processing"} for document in documents)

        blockers: list[str] = []
        if not documents:
            blockers.append("Import a document to create chapters.")
        if failed_documents:
            blockers.append(f"Fix {failed_documents} failed document import{'' if failed_documents == 1 else 's'}.")
        if active_documents:
            blockers.append(f"Wait for {active_documents} document import{'' if active_documents == 1 else 's'} to finish.")
        if documents and not total_sentences and not active_documents and not failed_documents:
            blockers.append("No sentences were found in the imported documents.")
        if missing_speaker_sentences:
            blockers.append(f"Assign speakers to {missing_speaker_sentences:,} sentence{'' if missing_speaker_sentences == 1 else 's'}.")
        if pending_sentences:
            blockers.append(f"Generate {pending_sentences:,} sentence{'' if pending_sentences == 1 else 's'} without audio.")
        if failed_sentences:
            blockers.append(f"Review or retry {failed_sentences:,} failed sentence{'' if failed_sentences == 1 else 's'}.")
        if active_sentences:
            blockers.append(f"Wait for {active_sentences:,} sentence job{'' if active_sentences == 1 else 's'} to finish.")

        if not total_sentences:
            readiness = "empty"
        elif not blockers:
            readiness = "ready"
        elif active_documents or active_sentences:
            readiness = "in_progress"
        else:
            readiness = "blocked"

        chapters = []
        for row in chapter_rows:
            sentence_count = int(row["sentence_count"] or 0)
            completed_count = int(row["completed_count"] or 0)
            chapters.append({
                "id": f"{row['document_id']}:{int(row['chapter_number'] or 0)}",
                "document_id": row["document_id"],
                "document_filename": row["document_filename"],
                "number": int(row["chapter_number"] or 0),
                "title": row["chapter_title"],
                "sentence_count": sentence_count,
                "completed_count": completed_count,
                "failed_count": int(row["failed_count"] or 0),
                "pending_count": int(row["pending_count"] or 0),
                "missing_speaker_count": int(row["missing_speaker_count"] or 0),
                "progress_percent": round(completed_count / sentence_count * 100, 2) if sentence_count else 0,
            })

        return {
            "project": project,
            "documents": documents,
            "chapters": chapters,
            "totals": {
                "sentence_count": total_sentences,
                "completed_count": completed_sentences,
                "failed_count": failed_sentences,
                "pending_count": pending_sentences,
                "active_count": active_sentences,
                "missing_speaker_count": missing_speaker_sentences,
            },
            "progress_percent": round(completed_sentences / total_sentences * 100, 2) if total_sentences else 0,
            "readiness": readiness,
            "blockers": blockers,
        }

    def update_document_progress(
        self,
        document_id: str,
        *,
        status: str | None = None,
        processed_bytes: int | None = None,
        processed_pages: int | None = None,
        persisted_sentences: int | None = None,
        checkpoint_offset: int | None = None,
        checkpoint_page: int | None = None,
        chapter_number: int | None = None,
        chapter_title: str | None = None,
        error: str | None = None,
    ) -> dict:
        document = self.get_document(document_id)
        values = {
            "status": status if status is not None else document["status"],
            "processed_bytes": processed_bytes if processed_bytes is not None else document["processed_bytes"],
            "processed_pages": processed_pages if processed_pages is not None else document["processed_pages"],
            "persisted_sentences": persisted_sentences if persisted_sentences is not None else document["persisted_sentences"],
            "checkpoint_offset": checkpoint_offset if checkpoint_offset is not None else document["checkpoint_offset"],
            "checkpoint_page": checkpoint_page if checkpoint_page is not None else document["checkpoint_page"],
            "chapter_number": chapter_number if chapter_number is not None else document.get("chapter_number", 0),
            "chapter_title": chapter_title if chapter_number is not None else document.get("chapter_title"),
            "error": error,
            "updated_at": _timestamp(),
        }
        with self._lock:
            self._connection.execute(
                """
                UPDATE documents SET status = ?, processed_bytes = ?, processed_pages = ?,
                    persisted_sentences = ?, checkpoint_offset = ?, checkpoint_page = ?,
                    chapter_number = ?, chapter_title = ?, error = ?, updated_at = ? WHERE id = ?
                """,
                (
                    values["status"], values["processed_bytes"], values["processed_pages"],
                    values["persisted_sentences"], values["checkpoint_offset"], values["checkpoint_page"],
                    values["chapter_number"], values["chapter_title"], values["error"],
                    values["updated_at"], document_id,
                ),
            )
            self._connection.commit()
        return self.get_document(document_id)

    def append_sentences(self, document_id: str, sentences: list[dict]) -> int:
        if not sentences:
            return 0
        document = self.get_document(document_id)
        sequence = self.next_sentence_sequence(document_id)
        now = _timestamp()
        inserted = 0
        with self._lock:
            for item in sentences:
                item_sequence = item.get("sequence")
                if item_sequence is None:
                    item_sequence = sequence
                sequence = max(sequence, int(item_sequence) + 1)
                cursor = self._connection.execute(
                    """
                    INSERT OR IGNORE INTO sentences (
                        id, document_id, sequence, text, page_number, source_offset,
                        chapter_number, chapter_title,
                        speaker_id, status, audio_path, generation_job_id, error,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)
                    """,
                    (
                        item.get("id") or str(uuid4()), document_id, int(item_sequence),
                        str(item["text"]), item.get("page_number", 0),
                        item.get("source_offset", 0), item.get("chapter_number", 0),
                        item.get("chapter_title"), item.get("speaker_id"), now, now,
                    ),
                )
                inserted += cursor.rowcount
            self._connection.execute(
                """
                UPDATE documents SET persisted_sentences = (
                    SELECT COUNT(*) FROM sentences WHERE document_id = ?
                ), updated_at = ? WHERE id = ?
                """,
                (document_id, now, document_id),
            )
            self._connection.execute(
                "UPDATE projects SET updated_at = ? WHERE id = ?", (now, document["project_id"])
            )
            self._connection.commit()
        return inserted

    def next_sentence_sequence(self, document_id: str) -> int:
        with self._lock:
            row = self._connection.execute(
                "SELECT COALESCE(MAX(sequence) + 1, 0) FROM sentences WHERE document_id = ?",
                (document_id,),
            ).fetchone()
        return int(row[0])

    def count_sentences(
        self,
        project_id: str,
        *,
        query: str = "",
        status: str = "",
        speaker_id: str = "",
        document_id: str = "",
        chapter_number: int | None = None,
    ) -> int:
        where, params = _sentence_filters(
            project_id, query, status, speaker_id, document_id, chapter_number
        )
        with self._lock:
            row = self._connection.execute(
                f"""
                SELECT COUNT(*) FROM sentences s
                JOIN documents d ON d.id = s.document_id
                WHERE {where}
                """,
                params,
            ).fetchone()
        return int(row[0])

    def list_sentences(
        self,
        project_id: str,
        *,
        offset: int = 0,
        limit: int = 100,
        query: str = "",
        status: str = "",
        speaker_id: str = "",
        document_id: str = "",
        chapter_number: int | None = None,
    ) -> list[dict]:
        chapter_page = bool(document_id) or chapter_number is not None
        if chapter_page and (not document_id or chapter_number is None):
            raise DatabaseError("chapter pagination requires document_id and chapter_number")
        if offset < 0 or limit < 1 or limit > 1000:
            raise DatabaseError("sentence pagination must use offset >= 0 and limit between 1 and 1000")
        where, params = _sentence_filters(
            project_id, query, status, speaker_id, document_id, chapter_number
        )
        page_clause = "" if chapter_page else " LIMIT ? OFFSET ?"
        page_params = () if chapter_page else (limit, offset)
        with self._lock:
            rows = self._connection.execute(
                f"""
                SELECT s.*, d.project_id, d.filename AS document_filename
                FROM sentences s
                JOIN documents d ON d.id = s.document_id
                WHERE {where}
                ORDER BY d.created_at, s.sequence, s.id
                {page_clause}
                """,
                (*params, *page_params),
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def select_sentence_ids(
        self,
        project_id: str,
        *,
        query: str = "",
        status: str = "",
        speaker_id: str = "",
    ) -> list[str]:
        """Select all matching IDs without returning the full book to a client."""

        where, params = _sentence_filters(project_id, query, status, speaker_id)
        with self._lock:
            rows = self._connection.execute(
                f"""
                SELECT s.id FROM sentences s
                JOIN documents d ON d.id = s.document_id
                WHERE {where}
                ORDER BY d.created_at, s.sequence, s.id
                """,
                params,
            ).fetchall()
        return [str(row[0]) for row in rows]

    def get_sentence(self, sentence_id: str) -> dict:
        with self._lock:
            row = self._connection.execute(
                """
                SELECT s.*, d.project_id, d.filename AS document_filename
                FROM sentences s JOIN documents d ON d.id = s.document_id
                WHERE s.id = ?
                """,
                (sentence_id,),
            ).fetchone()
        if row is None:
            raise DatabaseError(f"unknown sentence: {sentence_id}")
        return _row_dict(row)

    def get_sentence_by_generation_job(self, job_id: str) -> dict | None:
        with self._lock:
            row = self._connection.execute(
                """
                SELECT s.*, d.project_id, d.filename AS document_filename
                FROM sentences s JOIN documents d ON d.id = s.document_id
                WHERE s.generation_job_id = ?
                """,
                (job_id,),
            ).fetchone()
        return _row_dict(row) if row is not None else None

    def complete_generation(self, sentence_id: str, job_id: str, audio_path: str) -> bool:
        return self._finish_generation(sentence_id, job_id, "completed", audio_path, None)

    def fail_generation(self, sentence_id: str, job_id: str, error: str) -> bool:
        return self._finish_generation(sentence_id, job_id, "failed", None, error)

    def cancel_generation(self, sentence_id: str, job_id: str) -> bool:
        return self._finish_generation(sentence_id, job_id, "cancelled", None, "Cancelled")

    def _finish_generation(
        self, sentence_id: str, job_id: str, status: str, audio_path: str | None, error: str | None
    ) -> bool:
        with self._lock:
            cursor = self._connection.execute(
                """
                UPDATE sentences SET status = ?, audio_path = ?, error = ?, updated_at = ?
                WHERE id = ? AND generation_job_id = ?
                """,
                (status, audio_path, error, _timestamp(), sentence_id, job_id),
            )
            self._connection.commit()
        return cursor.rowcount == 1

    def update_sentence(self, sentence_id: str, **changes: object) -> dict:
        allowed = {"text", "speaker_id", "status", "audio_path", "generation_job_id", "error"}
        unknown = set(changes) - allowed
        if unknown:
            raise DatabaseError(f"unsupported sentence fields: {', '.join(sorted(unknown))}")
        if not changes:
            return self.get_sentence(sentence_id)
        self.get_sentence(sentence_id)
        if "text" in changes or "speaker_id" in changes:
            # Text or speaker changes invalidate the existing audio artifact.
            changes = {
                **changes,
                "status": "pending",
                "audio_path": None,
                "generation_job_id": None,
                "error": None,
            }
        assignments = ", ".join(f"{field} = ?" for field in changes)
        values = [changes[field] for field in changes]
        with self._lock:
            self._connection.execute(
                f"UPDATE sentences SET {assignments}, updated_at = ? WHERE id = ?",
                (*values, _timestamp(), sentence_id),
            )
            self._connection.commit()
        return self.get_sentence(sentence_id)

    def create_speaker(self, project_id: str, name: str, color: str = "#FFFFFF") -> dict:
        self.get_project(project_id)
        if not name.strip():
            raise DatabaseError("speaker name is required")
        speaker_id = str(uuid4())
        now = _timestamp()
        with self._lock:
            self._connection.execute(
                "INSERT INTO speakers (id, project_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (speaker_id, project_id, name.strip(), color, now, now),
            )
            self._connection.commit()
        return self.get_speaker(speaker_id)

    def list_speakers(self, project_id: str) -> list[dict]:
        self.get_project(project_id)
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM speakers WHERE project_id = ? ORDER BY created_at, id", (project_id,)
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def get_speaker(self, speaker_id: str) -> dict:
        with self._lock:
            row = self._connection.execute("SELECT * FROM speakers WHERE id = ?", (speaker_id,)).fetchone()
        if row is None:
            raise DatabaseError(f"unknown speaker: {speaker_id}")
        return _row_dict(row)

    def upsert_engine_profile(
        self, speaker_id: str, engine_id: str, voice: str = "", settings: str = "{}"
    ) -> dict:
        self.get_speaker(speaker_id)
        now = _timestamp()
        profile_id = str(uuid4())
        with self._lock:
            self._connection.execute(
                """
                INSERT INTO engine_profiles (id, speaker_id, engine_id, voice, settings, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(speaker_id) DO UPDATE SET engine_id = excluded.engine_id,
                    voice = excluded.voice, settings = excluded.settings, updated_at = excluded.updated_at
                """,
                (profile_id, speaker_id, engine_id, voice, settings, now, now),
            )
            self._connection.commit()
            row = self._connection.execute(
                "SELECT * FROM engine_profiles WHERE speaker_id = ?", (speaker_id,)
            ).fetchone()
        return _row_dict(row)

    def list_engine_profiles(self, project_id: str) -> list[dict]:
        self.get_project(project_id)
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT ep.* FROM engine_profiles ep
                JOIN speakers s ON s.id = ep.speaker_id
                WHERE s.project_id = ? ORDER BY s.created_at, ep.id
                """,
                (project_id,),
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def create_export(self, project_id: str, output_format: str, pause_seconds: float, output_path: str) -> dict:
        self.get_project(project_id)
        if output_format not in {"mp3", "wav"}:
            raise DatabaseError("export format must be mp3 or wav")
        export_id = str(uuid4())
        now = _timestamp()
        with self._lock:
            self._connection.execute(
                """
                INSERT INTO exports (
                    id, project_id, status, format, pause_seconds, output_path,
                    total_sentences, completed_sentences, percent, error, created_at, updated_at
                ) VALUES (?, ?, 'queued', ?, ?, ?, 0, 0, 0, NULL, ?, ?)
                """,
                (export_id, project_id, output_format, pause_seconds, output_path, now, now),
            )
            self._connection.commit()
        return self.get_export(export_id)

    def get_export(self, export_id: str) -> dict:
        with self._lock:
            row = self._connection.execute("SELECT * FROM exports WHERE id = ?", (export_id,)).fetchone()
        if row is None:
            raise DatabaseError(f"unknown export: {export_id}")
        return _row_dict(row)

    def list_exports(self, project_id: str) -> list[dict]:
        self.get_project(project_id)
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM exports WHERE project_id = ? ORDER BY created_at DESC, id",
                (project_id,),
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def recover_exports(self) -> None:
        """Make an interrupted export visible for an explicit retry."""

        with self._lock:
            self._connection.execute(
                "UPDATE exports SET status = 'queued', error = 'Recovered after restart', updated_at = ? WHERE status = 'running'",
                (_timestamp(),),
            )
            self._connection.commit()

    def list_pending_exports(self) -> list[dict]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM exports WHERE status = 'queued' ORDER BY created_at, id"
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def update_export(self, export_id: str, **changes: object) -> dict:
        allowed = {"status", "total_sentences", "completed_sentences", "percent", "error", "output_path"}
        unknown = set(changes) - allowed
        if unknown:
            raise DatabaseError(f"unsupported export fields: {', '.join(sorted(unknown))}")
        self.get_export(export_id)
        if not changes:
            return self.get_export(export_id)
        assignments = ", ".join(f"{field} = ?" for field in changes)
        values = [changes[field] for field in changes]
        with self._lock:
            self._connection.execute(
                f"UPDATE exports SET {assignments}, updated_at = ? WHERE id = ?",
                (*values, _timestamp(), export_id),
            )
            self._connection.commit()
        return self.get_export(export_id)

    def get_export_sentences(self, project_id: str) -> list[dict]:
        self.get_project(project_id)
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT s.*, d.project_id FROM sentences s
                JOIN documents d ON d.id = s.document_id
                WHERE d.project_id = ? ORDER BY d.created_at, s.sequence, s.id
                """,
                (project_id,),
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def _create_schema(self) -> None:
        with self._lock:
            self._connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    filename TEXT NOT NULL, source_path TEXT NOT NULL, kind TEXT NOT NULL,
                    status TEXT NOT NULL, total_bytes INTEGER NOT NULL, processed_bytes INTEGER NOT NULL,
                    processed_pages INTEGER NOT NULL, persisted_sentences INTEGER NOT NULL,
                    checkpoint_offset INTEGER NOT NULL, checkpoint_page INTEGER NOT NULL,
                    chapter_marker TEXT NOT NULL DEFAULT '', chapter_number INTEGER NOT NULL DEFAULT 0,
                    chapter_title TEXT,
                    error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS documents_project_idx ON documents(project_id, created_at);
                CREATE TABLE IF NOT EXISTS speakers (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    name TEXT NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS engine_profiles (
                    id TEXT PRIMARY KEY, speaker_id TEXT NOT NULL UNIQUE REFERENCES speakers(id) ON DELETE CASCADE,
                    engine_id TEXT NOT NULL, voice TEXT NOT NULL, settings TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sentences (
                    id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    sequence INTEGER NOT NULL, text TEXT NOT NULL, page_number INTEGER NOT NULL,
                    source_offset INTEGER NOT NULL, chapter_number INTEGER NOT NULL DEFAULT 0,
                    chapter_title TEXT, speaker_id TEXT REFERENCES speakers(id) ON DELETE SET NULL,
                    status TEXT NOT NULL, audio_path TEXT, generation_job_id TEXT, error TEXT,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    UNIQUE(document_id, sequence)
                );
                CREATE INDEX IF NOT EXISTS sentences_document_sequence_idx ON sentences(document_id, sequence);
                CREATE INDEX IF NOT EXISTS sentences_status_idx ON sentences(status);
                CREATE TABLE IF NOT EXISTS exports (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    status TEXT NOT NULL, format TEXT NOT NULL, pause_seconds REAL NOT NULL,
                    output_path TEXT NOT NULL, total_sentences INTEGER NOT NULL, completed_sentences INTEGER NOT NULL,
                    percent REAL NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS exports_project_idx ON exports(project_id, created_at);
                """
            )
            document_columns = {
                row["name"] for row in self._connection.execute("PRAGMA table_info(documents)").fetchall()
            }
            for statement, column in (
                ("ALTER TABLE documents ADD COLUMN chapter_marker TEXT NOT NULL DEFAULT ''", "chapter_marker"),
                ("ALTER TABLE documents ADD COLUMN chapter_number INTEGER NOT NULL DEFAULT 0", "chapter_number"),
                ("ALTER TABLE documents ADD COLUMN chapter_title TEXT", "chapter_title"),
            ):
                if column not in document_columns:
                    self._connection.execute(statement)

            sentence_columns = {
                row["name"] for row in self._connection.execute("PRAGMA table_info(sentences)").fetchall()
            }
            for statement, column in (
                ("ALTER TABLE sentences ADD COLUMN chapter_number INTEGER NOT NULL DEFAULT 0", "chapter_number"),
                ("ALTER TABLE sentences ADD COLUMN chapter_title TEXT", "chapter_title"),
            ):
                if column not in sentence_columns:
                    self._connection.execute(statement)
            self._connection.commit()


def _sentence_filters(
    project_id: str,
    query: str,
    status: str,
    speaker_id: str,
    document_id: str = "",
    chapter_number: int | None = None,
) -> tuple[str, list[object]]:
    clauses = ["d.project_id = ?"]
    params: list[object] = [project_id]
    if document_id:
        clauses.append("s.document_id = ?")
        params.append(document_id)
    if chapter_number is not None:
        clauses.append("s.chapter_number = ?")
        params.append(chapter_number)
    if query.strip():
        clauses.append("s.text LIKE ?")
        params.append(f"%{query.strip()}%")
    if status.strip():
        clauses.append("s.status = ?")
        params.append(status.strip())
    if speaker_id.strip():
        clauses.append("s.speaker_id = ?")
        params.append(speaker_id.strip())
    return " AND ".join(clauses), params


def _row_dict(row: sqlite3.Row | None) -> dict:
    if row is None:
        raise DatabaseError("database row is missing")
    return dict(row)


def _timestamp() -> str:
    return datetime.now(UTC).isoformat()
