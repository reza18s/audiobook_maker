import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import type { Project } from "../../types";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Field } from "../../shared/ui/Field";
import { PageHeader } from "../../shared/ui/PageHeader";
import { ProgressBar } from "../../shared/ui/ProgressBar";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { TextField } from "../../shared/ui/TextField";

export function DocumentsView({ client, project }: { client: ApiClient; project: Project }) {
  const queryClient = useQueryClient();
  const documents = useQuery({ queryKey: ["documents", project.id], queryFn: () => client.documents(project.id), refetchInterval: 1500 });
  const [upload, setUpload] = useState(0);
  const [message, setMessage] = useState("");
  const [chapterMarker, setChapterMarker] = useState("");
  const uploadDocument = useMutation({
    mutationFn: (file: File) => client.uploadDocument(project.id, file, setUpload, chapterMarker),
    onSuccess: () => {
      setMessage("Upload accepted; chapter detection and ingestion are running in the gateway.");
      void queryClient.invalidateQueries({ queryKey: ["documents", project.id] });
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : "Upload failed"),
  });
  const onFile = (file: File) => { setMessage(""); uploadDocument.mutate(file); };

  return <section><PageHeader eyebrow="DOCUMENT IMPORT" title="Bring in a book" description="TXT and selectable-text PDF files are processed incrementally on the server." actions={<div className="document-import-actions"><TextField className="chapter-marker-field" label="Custom chapter marker" value={chapterMarker} onValueChange={setChapterMarker} placeholder="Optional line, e.g. [NEW CHAPTER]" helpText="Chapter headings and --- CHAPTER END --- are detected automatically." /><Field className="upload-button" label="Import document"><input type="file" accept=".txt,.pdf,text/plain,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); }} /></Field></div>} />{upload > 0 && upload < 100 && <ProgressBar value={upload} label="Uploading document" showValue />}{message && <div className="info-banner" role="status" aria-live="polite">{message}</div>}<div className="document-list" aria-busy={documents.isFetching}>{documents.isLoading ? <EmptyState loading title="Loading documents" description="Retrieving imported documents…" /> : documents.isError ? <EmptyState title="Could not load documents" description={documents.error instanceof Error ? documents.error.message : "The document list is unavailable."} /> : !documents.data?.length ? <EmptyState title="No documents yet" description="Import a TXT or selectable-text PDF to begin." /> : documents.data.map((document) => <article className="document-card" key={document.id}><div><strong>{document.filename}</strong><span>{document.kind.toUpperCase()} · {document.persisted_sentences.toLocaleString()} sentences</span></div><StatusBadge status={document.status} live="polite">{document.status}</StatusBadge>{document.error && <small className="error-text" role="alert">{document.error}</small>}</article>)}</div></section>;
}
