import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import type { Project } from "../../types";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Field } from "../../shared/ui/Field";
import { FilePicker } from "../../shared/ui/FilePicker";
import { Input } from "../../shared/ui/Input";
import { PageHeader } from "../../shared/ui/PageHeader";
import { ProgressBar } from "../../shared/ui/ProgressBar";
import { Select } from "../../shared/ui/Select";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Textarea } from "../../shared/ui/Textarea";
import { TextField } from "../../shared/ui/TextField";

type ExportMetadata = {
  title: string;
  author: string;
  narrator: string;
  language: string;
  series: string;
  description: string;
};

export function ExportView({ client, project }: { client: ApiClient; project: Project }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const exports = useQuery({ queryKey: ["exports", project.id], queryFn: () => client.exports(project.id), refetchInterval: 1500 });
  const preflight = useQuery({ queryKey: ["export-preflight", project.id], queryFn: () => client.exportPreflight(project.id), refetchInterval: 1500 });
  const [format, setFormat] = useState<"mp3" | "wav" | "m4b">("m4b");
  const [pause, setPause] = useState(0.4);
  const [metadata, setMetadata] = useState<ExportMetadata>(() => projectMetadata(project));
  const [coverMessage, setCoverMessage] = useState("");

  useEffect(() => setMetadata(projectMetadata(project)), [project]);

  const createExport = useMutation({
    mutationFn: () => client.createExport(project.id, format, Math.max(0, pause), metadata),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["exports", project.id] }); },
  });
  const cancelExport = useMutation({
    mutationFn: (exportId: string) => client.cancelExport(exportId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["exports", project.id] }); },
  });
  const uploadCover = useMutation({
    mutationFn: (file: File) => client.uploadProjectCover(project.id, file),
    onSuccess: () => { setCoverMessage("Cover saved for future exports."); void queryClient.invalidateQueries({ queryKey: ["projects"] }); void queryClient.invalidateQueries({ queryKey: ["project-overview", project.id] }); },
    onError: (cause) => setCoverMessage(cause instanceof Error ? cause.message : "Could not save cover"),
  });
  const updateMetadata = (field: keyof ExportMetadata, value: string) => setMetadata((current) => ({ ...current, [field]: value }));

  return <section className="export-studio"><PageHeader eyebrow="MEDIA EXPORT" title="Assemble the audiobook" description="Validate the project, add delivery metadata, and create a chapter-aware audiobook file." actions={<div className="export-actions"><Field label="Format"><Select value={format} onChange={(event) => setFormat(event.target.value as "mp3" | "wav" | "m4b")}><option value="m4b">M4B · audiobook</option><option value="mp3">MP3 · 192 kbps</option><option value="wav">WAV · PCM</option></Select></Field><Field label="Pause" description="seconds"><Input type="number" min="0" step="0.1" value={pause} onChange={(event) => setPause(Number(event.target.value))} /></Field><Button variant="primary" loading={createExport.isPending} loadingLabel="Starting…" disabled={!preflight.data?.ready || preflight.isFetching} onClick={() => createExport.mutate()}>Start export</Button></div>} />
    {createExport.isError && <div className="error-banner" role="alert">{createExport.error instanceof Error ? createExport.error.message : "Could not start export"}</div>}
    {preflight.isError ? <div className="error-banner" role="alert">Export preflight is unavailable. Refresh before starting an export.</div> : preflight.isLoading ? <Card title="Export preflight" loading loadingLabel="Checking sentence audio…" /> : preflight.data && <Card className={`export-preflight-card ${preflight.data.ready ? "preflight-ready" : "preflight-blocked"}`} title="Export preflight" description={preflight.data.ready ? "Every sentence has valid audio. This project can be assembled." : "Resolve these items before FFmpeg starts."} actions={<StatusBadge dot tone={preflight.data.ready ? "success" : "danger"}>{preflight.data.ready ? "Ready to export" : `${preflight.data.invalid_count.toLocaleString()} blockers`}</StatusBadge>}><div className="preflight-counts"><span><strong>{preflight.data.ready_count.toLocaleString()}</strong> ready</span><span><strong>{preflight.data.total_sentences.toLocaleString()}</strong> total sentences</span></div>{!preflight.data.ready && <><ul className="blocker-list">{preflight.data.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul><div className="preflight-actions"><Button variant="outline" onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/sentences`)}>Review sentence issues</Button>{preflight.data.invalid.length > 0 && <small>Examples: {preflight.data.invalid.slice(0, 5).map((item) => `#${item.sequence} (${item.reason})`).join(", ")}</small>}</div></>}</Card>}
    <Card className="export-metadata-card" title="Audiobook metadata" description="These fields are embedded in M4B and used as delivery metadata for other formats."><div className="export-metadata-grid"><TextField label="Title" value={metadata.title} onValueChange={(value) => updateMetadata("title", value)} required /><TextField label="Author" value={metadata.author} onValueChange={(value) => updateMetadata("author", value)} /><TextField label="Narrator" value={metadata.narrator} onValueChange={(value) => updateMetadata("narrator", value)} /><TextField label="Language" value={metadata.language} onValueChange={(value) => updateMetadata("language", value)} placeholder="en" /><TextField label="Series" value={metadata.series} onValueChange={(value) => updateMetadata("series", value)} /><Field className="metadata-description-field" label="Description"><Textarea rows={3} value={metadata.description} onChange={(event) => updateMetadata("description", event.target.value)} placeholder="Optional audiobook description" /></Field><div className="cover-upload-field"><FilePicker label="Cover art" description={coverMessage || "JPG, PNG, or WebP up to 20 MB"} accept="image/jpeg,image/png,image/webp" disabled={uploadCover.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadCover.mutate(file); event.currentTarget.value = ""; }} /></div></div></Card>
    {exports.isError ? <EmptyState title="Could not load exports" description="The export history is temporarily unavailable." /> : exports.isLoading ? <EmptyState title="Loading exports" loading loadingLabel="Checking export history…" /> : !exports.data?.length ? <EmptyState title="No exports yet" description="A completed export will appear here with its delivery path." /> : <div className="export-list">{exports.data.map((item) => <Card as="article" className="export-card" key={item.id}><div><strong>{item.format.toUpperCase()} export</strong><span>{item.output_path}</span></div><ProgressBar className="job-progress" value={item.percent} label={`${item.percent}% complete`} /><StatusBadge status={item.status} live="polite">{item.status} · {item.percent}%</StatusBadge>{["queued", "running", "cancelling"].includes(item.status) && <Button variant="ghost" size="sm" loading={cancelExport.isPending} onClick={() => cancelExport.mutate(item.id)}>Cancel</Button>}{item.error && <small className="error-text">{item.error}</small>}</Card>)}</div>}
  </section>;
}

function projectMetadata(project: Project): ExportMetadata {
  return { title: project.name, author: project.author ?? "", narrator: project.narrator ?? "", language: project.language ?? "en", series: project.series ?? "", description: project.description ?? "" };
}
