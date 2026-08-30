import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import type { Document, Project } from "../../types";
import { Button } from "../../shared/ui/Button";
import { Dialog } from "../../shared/ui/Dialog";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Input } from "../../shared/ui/Input";
import { Field } from "../../shared/ui/Field";
import { PageHeader } from "../../shared/ui/PageHeader";
import { ProgressBar } from "../../shared/ui/ProgressBar";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { TextField } from "../../shared/ui/TextField";

type DocumentUpdate = {
  document: Document;
  filename: string;
  chapterMarker: string;
};

export function DocumentsView({ client, project }: { client: ApiClient; project: Project }) {
  const queryClient = useQueryClient();
  const documents = useQuery({ queryKey: ["documents", project.id], queryFn: () => client.documents(project.id), refetchInterval: 1500 });
  const [upload, setUpload] = useState(0);
  const [message, setMessage] = useState("");
  const [chapterMarker, setChapterMarker] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<Document | null>(null);
  const [editFilename, setEditFilename] = useState("");
  const [editChapterMarker, setEditChapterMarker] = useState("");
  const [deleting, setDeleting] = useState<Document | null>(null);
  const uploadDocument = useMutation({
    mutationFn: (file: File) => client.uploadDocument(project.id, file, setUpload, chapterMarker),
    onSuccess: () => {
      setMessage("Upload accepted; chapter detection and ingestion are running in the gateway.");
      setUpload(100);
      void invalidateDocumentQueries(queryClient, project.id);
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : "Upload failed"),
  });
  const updateDocument = useMutation({
    mutationFn: ({ document, filename, chapterMarker: nextMarker }: DocumentUpdate) => client.updateDocument(document.id, {
      filename,
      chapter_marker: nextMarker,
      reprocess: nextMarker.trim() !== document.chapter_marker.trim(),
    }),
    onSuccess: () => {
      setEditing(null);
      setMessage("Document updated successfully.");
      void invalidateDocumentQueries(queryClient, project.id);
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : "Could not update document"),
  });
  const deleteDocument = useMutation({
    mutationFn: (documentId: string) => client.deleteDocument(documentId),
    onSuccess: (_result, documentId) => {
      setDeleting(null);
      setMessage("Document deleted.");
      void invalidateDocumentQueries(queryClient, project.id, documentId);
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : "Could not delete document"),
  });

  const onFile = (file: File) => { setMessage(""); setUpload(0); setPendingFile(file); };
  const confirmImport = () => { if (!pendingFile) return; setPendingFile(null); uploadDocument.mutate(pendingFile); };
  const beginEdit = (document: Document) => {
    setEditing(document);
    setEditFilename(document.filename);
    setEditChapterMarker(document.chapter_marker);
    setMessage("");
  };
  const saveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || !editFilename.trim()) return;
    updateDocument.mutate({ document: editing, filename: editFilename.trim(), chapterMarker: editChapterMarker });
  };
  const confirmDelete = () => { if (deleting) deleteDocument.mutate(deleting.id); };

  return (
    <section>
      <PageHeader eyebrow="DOCUMENT IMPORT" title="Bring in a book" description="TXT, EPUB, and selectable-text PDF files are processed incrementally on the server." actions={<div className="document-import-actions"><TextField className="chapter-marker-field" label="Custom chapter marker" value={chapterMarker} onValueChange={setChapterMarker} placeholder="Optional line, e.g. [NEW CHAPTER]" helpText="Chapter headings and --- CHAPTER END --- are detected automatically." /><Field className="upload-button" label="Import document"><Input type="file" accept=".txt,.epub,.pdf,text/plain,application/epub+zip,application/pdf" disabled={uploadDocument.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); event.currentTarget.value = ""; }} /></Field></div>} />
      {upload > 0 && upload < 100 && <ProgressBar value={upload} label="Uploading document" showValue loading={uploadDocument.isPending} />}
      {message && <div className="info-banner" role="status" aria-live="polite">{message}</div>}
      <div className="document-list" aria-busy={documents.isFetching}>
        {documents.isLoading ? <EmptyState loading title="Loading documents" description="Retrieving imported documents…" /> : documents.isError ? <EmptyState title="Could not load documents" description={documents.error instanceof Error ? documents.error.message : "The document list is unavailable."} /> : !documents.data?.length ? <EmptyState title="No documents yet" description="Import a TXT, EPUB, or selectable-text PDF to begin." /> : documents.data.map((document) => <article className="document-card" key={document.id}><div className="document-card-main"><strong>{document.filename}</strong><span className="document-card-meta">{document.kind.toUpperCase()} · {document.persisted_sentences.toLocaleString()} sentences</span><span className="document-card-meta">{document.chapter_number > 0 ? `Processed through chapter ${document.chapter_number}` : "Chapter detection pending"}</span>{document.error && <small className="error-text" role="alert">{document.error}</small>}</div><StatusBadge status={document.status} live="polite">{document.status}</StatusBadge><div className="document-card-actions"><Button variant="ghost" size="sm" onClick={() => beginEdit(document)}>Edit</Button><Button variant="destructive" size="sm" onClick={() => setDeleting(document)}>Delete</Button></div></article>)}
      </div>

      <Dialog open={Boolean(pendingFile)} title="Review import" description="Confirm the source file before it is copied into this project and processed." disabled={uploadDocument.isPending} onClose={() => setPendingFile(null)} footer={<><Button variant="ghost" disabled={uploadDocument.isPending} onClick={() => setPendingFile(null)}>Cancel</Button><Button loading={uploadDocument.isPending} loadingLabel="Importing…" onClick={confirmImport}>Import document</Button></>}>
        {pendingFile && <div className="import-preview"><div><strong>{pendingFile.name}</strong><span>{pendingFile.type || "Document file"} · {formatBytes(pendingFile.size)}</span></div><p>Chapter headings and the selected custom marker will be used during ingestion. The original file remains in the project workspace for resumable processing.</p></div>}
      </Dialog>

      <Dialog open={Boolean(editing)} title="Edit document" description="Update the display name or chapter marker used when the source is processed." disabled={updateDocument.isPending} onClose={() => setEditing(null)} footer={<><Button variant="ghost" disabled={updateDocument.isPending} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="document-edit-form" loading={updateDocument.isPending} loadingLabel="Saving…">Save changes</Button></>}>
        <form id="document-edit-form" onSubmit={saveEdit}>
          <TextField label="Document name" value={editFilename} onValueChange={setEditFilename} required autoFocus />
          <TextField label="Chapter marker" value={editChapterMarker} onValueChange={setEditChapterMarker} placeholder="Optional line, e.g. [NEW CHAPTER]" helpText="Changing this marker reprocesses the document's sentences." />
          {editing && editChapterMarker.trim() !== editing.chapter_marker.trim() && <p className="dialog-warning">The current sentences will be rebuilt with the new chapter boundaries.</p>}
        </form>
      </Dialog>

      <Dialog open={Boolean(deleting)} title="Delete document?" description={`This permanently removes ${deleting?.filename ?? "this document"} and all of its sentences and generated audio.`} disabled={deleteDocument.isPending} onClose={() => setDeleting(null)} footer={<><Button variant="ghost" disabled={deleteDocument.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" loading={deleteDocument.isPending} loadingLabel="Deleting…" onClick={confirmDelete}>Delete document</Button></>}>
        <p className="dialog-warning">This action cannot be undone.</p>
      </Dialog>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function invalidateDocumentQueries(queryClient: ReturnType<typeof useQueryClient>, projectId: string, documentId?: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["documents", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["projects"] }),
    queryClient.invalidateQueries({ queryKey: ["chapters", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["sentences", projectId] }),
    documentId ? queryClient.invalidateQueries({ queryKey: ["sentence-audio"] }) : Promise.resolve(),
  ]);
}
