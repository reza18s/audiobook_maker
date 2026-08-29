import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import type { Project } from "../../types";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Field } from "../../shared/ui/Field";
import { Input } from "../../shared/ui/Input";
import { PageHeader } from "../../shared/ui/PageHeader";
import { ProgressBar } from "../../shared/ui/ProgressBar";
import { Select } from "../../shared/ui/Select";
import { StatusBadge } from "../../shared/ui/StatusBadge";

export function ExportView({ client, project }: { client: ApiClient; project: Project }) {
  const queryClient = useQueryClient();
  const exports = useQuery({ queryKey: ["exports", project.id], queryFn: () => client.exports(project.id), refetchInterval: 1500 });
  const [format, setFormat] = useState<"mp3" | "wav">("mp3");
  const [pause, setPause] = useState(0.4);
  const createExport = useMutation({ mutationFn: () => client.createExport(project.id, format, pause), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["exports", project.id] }); } });
  const cancelExport = useMutation({ mutationFn: (exportId: string) => client.cancelExport(exportId), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["exports", project.id] }); } });
  return <section><PageHeader eyebrow="MEDIA EXPORT" title="Assemble the audiobook" description="Missing or failed sentence audio is reported before FFmpeg starts." actions={<><Field label="Format"><Select value={format} onChange={(event) => setFormat(event.target.value as "mp3" | "wav")}><option value="mp3">MP3 · 192 kbps</option><option value="wav">WAV · PCM</option></Select></Field><Field label="Pause" description="seconds"><Input type="number" min="0" step="0.1" value={pause} onChange={(event) => setPause(Number(event.target.value))} /></Field><Button variant="primary" loading={createExport.isPending} loadingLabel="Starting…" onClick={() => createExport.mutate()}>Start export</Button></>} />{exports.isError ? <EmptyState title="Could not load exports" description="The export history is temporarily unavailable." /> : exports.isLoading ? <EmptyState title="Loading exports" loading loadingLabel="Checking export history…" /> : !exports.data?.length ? <EmptyState title="No exports yet" description="Start an export to assemble the audiobook." /> : <div className="export-list">{exports.data.map((item) => <Card as="article" className="export-card" key={item.id}><div><strong>{item.format.toUpperCase()} export</strong><span>{item.output_path}</span></div><ProgressBar className="job-progress" value={item.percent} label={`${item.percent}% complete`} /><StatusBadge status={item.status} live="polite">{item.status} · {item.percent}%</StatusBadge>{["queued", "running", "cancelling"].includes(item.status) && <Button variant="ghost" size="sm" loading={cancelExport.isPending} onClick={() => cancelExport.mutate(item.id)}>Cancel</Button>}{item.error && <small className="error-text">{item.error}</small>}</Card>)}</div>}</section>;
}
