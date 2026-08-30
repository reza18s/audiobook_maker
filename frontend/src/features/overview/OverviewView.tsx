import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import type { ChapterSummary, Project, ProjectOverview } from "../../types";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Field } from "../../shared/ui/Field";
import { PageHeader } from "../../shared/ui/PageHeader";
import { ProgressBar } from "../../shared/ui/ProgressBar";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Textarea } from "../../shared/ui/Textarea";
import { TextField } from "../../shared/ui/TextField";

export function OverviewView({ client, project }: { client: ApiClient; project: Project }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: ["project-overview", project.id],
    queryFn: () => client.projectOverview(project.id),
    refetchInterval: 2000,
  });

  if (overview.isLoading) {
    return <section><PageHeader eyebrow="PROJECT OVERVIEW" title={project.name} description="Preparing the production dashboard…" /><EmptyState loading title="Loading project readiness" description="Collecting chapter, sentence, and document status." /></section>;
  }
  if (overview.isError || !overview.data) {
    return <section><PageHeader eyebrow="PROJECT OVERVIEW" title={project.name} description="The production dashboard could not be loaded." /><EmptyState title="Project overview unavailable" description={overview.error instanceof Error ? overview.error.message : "The gateway did not return project status."} action={<Button variant="outline" onClick={() => void overview.refetch()}>Try again</Button>} /></section>;
  }

  const data = overview.data;
  const readiness = readinessCopy(data);
  return <OverviewContent client={client} project={project} data={data} readiness={readiness} navigate={navigate} queryClient={queryClient} />;
}

function OverviewContent({ client, project, data, readiness, navigate, queryClient }: { client: ApiClient; project: Project; data: ProjectOverview; readiness: ReturnType<typeof readinessCopy>; navigate: ReturnType<typeof useNavigate>; queryClient: ReturnType<typeof useQueryClient> }) {
  const [metadata, setMetadata] = useState(() => projectMetadata(data.project));
  useEffect(() => setMetadata(projectMetadata(data.project)), [data.project]);
  const saveMetadata = useMutation({
    mutationFn: () => client.updateProject(project.id, project.name, metadata),
    onSuccess: (updated) => {
      queryClient.setQueryData<ProjectOverview>(["project-overview", project.id], (current) => current ? { ...current, project: updated } : current);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const updateMetadata = (field: keyof ProjectMetadata, value: string) => setMetadata((current) => ({ ...current, [field]: value }));
  return <section className="project-overview">
    <PageHeader eyebrow="PROJECT OVERVIEW" title={project.name} description="See what is ready, what needs attention, and where to continue production." actions={<Button variant="primary" onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/sentences`)}>Open sentence review</Button>} />
    <div className="project-readiness-grid">
      <Card className={`readiness-panel readiness-${data.readiness}`} title="Production readiness" description={readiness.description}>
        <div className="readiness-heading"><StatusBadge dot tone={readiness.tone}>{readiness.label}</StatusBadge><strong>{Math.round(data.progress_percent)}%</strong></div>
        <ProgressBar value={data.progress_percent} label="Audiobook audio" showValue aria-label="Audiobook audio progress" />
        {data.blockers.length ? <div className="blocker-list"><strong>Next actions</strong><ul>{data.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : <p className="success-note">Every sentence has audio and the project is ready to export.</p>}
      </Card>
      <Card title="Production summary" description="Live counts from the gateway.">
        <div className="production-stat-grid">
          <Stat label="Sentences" value={data.totals.sentence_count} />
          <Stat label="Generated" value={data.totals.completed_count} tone="success" />
          <Stat label="Needs audio" value={data.totals.pending_count} tone={data.totals.pending_count ? "warning" : undefined} />
          <Stat label="Failed" value={data.totals.failed_count} tone={data.totals.failed_count ? "danger" : undefined} />
          <Stat label="Missing speakers" value={data.totals.missing_speaker_count} tone={data.totals.missing_speaker_count ? "warning" : undefined} />
          <Stat label="Active jobs" value={data.totals.active_count} tone={data.totals.active_count ? "info" : undefined} />
        </div>
      </Card>
    </div>
    <Card className="project-metadata-card" title="Book identity" description="Save the metadata that will be reused by future audiobook exports." actions={<Button variant="outline" loading={saveMetadata.isPending} loadingLabel="Saving…" onClick={() => saveMetadata.mutate()}>Save metadata</Button>}>
      <div className="project-metadata-grid"><TextField label="Author" value={metadata.author} onValueChange={(value) => updateMetadata("author", value)} /><TextField label="Narrator" value={metadata.narrator} onValueChange={(value) => updateMetadata("narrator", value)} /><TextField label="Language" value={metadata.language} onValueChange={(value) => updateMetadata("language", value)} placeholder="en" /><TextField label="Series" value={metadata.series} onValueChange={(value) => updateMetadata("series", value)} /><Field label="Description"><Textarea rows={2} value={metadata.description} onChange={(event) => updateMetadata("description", event.target.value)} placeholder="Optional audiobook description" /></Field></div>
      {saveMetadata.isError && <StatusBadge tone="danger" live="assertive">{saveMetadata.error instanceof Error ? saveMetadata.error.message : "Could not save metadata"}</StatusBadge>}
      {saveMetadata.isSuccess && <StatusBadge tone="success" live="polite">Metadata saved</StatusBadge>}
    </Card>
    <div className="section-heading"><div><div className="eyebrow">PRODUCTION MAP</div><h2>Chapters</h2></div><span className="muted">Review progress chapter by chapter.</span></div>
    {!data.chapters.length ? <EmptyState title="No chapters yet" description="Import a document to create the first production chapter." action={<Button variant="outline" onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/documents`)}>Import a document</Button>} /> : <div className="chapter-list">{data.chapters.map((chapter) => <ChapterCard chapter={chapter} key={chapter.id} onOpen={() => navigate(`/projects/${encodeURIComponent(project.id)}/sentences`)} />)}</div>}
    <div className="overview-footer-actions"><Button variant="outline" onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/documents`)}>Manage documents</Button><Button variant="outline" onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/speakers`)}>Manage voices</Button><Button variant="outline" onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/export`)}>Open export studio</Button></div>
  </section>;
}

function ChapterCard({ chapter, onOpen }: { chapter: ChapterSummary; onOpen: () => void }) {
  const title = chapter.title && chapter.title !== String(chapter.number) ? chapter.title : chapter.number > 0 ? `Chapter ${chapter.number}` : "Unchaptered text";
  const isReady = chapter.progress_percent === 100 && chapter.missing_speaker_count === 0 && chapter.failed_count === 0;
  const hasIssues = chapter.failed_count > 0 || chapter.missing_speaker_count > 0;
  return <article className="chapter-card"><div className="chapter-card-heading"><div><div className="eyebrow">{chapter.document_filename}</div><h3>{title}</h3></div><StatusBadge tone={isReady ? "success" : hasIssues ? "danger" : chapter.pending_count ? "warning" : "neutral"}>{isReady ? "Ready" : hasIssues ? "Needs attention" : "In progress"}</StatusBadge></div><div className="chapter-card-progress"><ProgressBar value={chapter.progress_percent} label={`${chapter.completed_count.toLocaleString()} of ${chapter.sentence_count.toLocaleString()} sentences generated`} showValue aria-label={`${title} audio progress`} /></div><div className="chapter-card-meta"><span>{chapter.sentence_count.toLocaleString()} sentences</span>{chapter.missing_speaker_count > 0 && <span>{chapter.missing_speaker_count.toLocaleString()} missing speakers</span>}{chapter.failed_count > 0 && <span>{chapter.failed_count.toLocaleString()} failed</span>}</div><Button variant="ghost" size="sm" onClick={onOpen}>Review sentences <span aria-hidden="true">→</span></Button></article>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "info" | "success" | "warning" }) {
  return <div className={tone ? `production-stat production-stat-${tone}` : "production-stat"}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>;
}

type ProjectMetadata = Pick<Required<Project>, "author" | "narrator" | "language" | "series" | "description">;

function projectMetadata(project: Project): ProjectMetadata {
  return { author: project.author ?? "", narrator: project.narrator ?? "", language: project.language ?? "en", series: project.series ?? "", description: project.description ?? "" };
}

function readinessCopy(data: ProjectOverview): { label: string; description: string; tone: "danger" | "neutral" | "success" | "warning" } {
  if (data.readiness === "ready") return { label: "Ready to export", description: "All imported sentences have generated audio and assigned speakers.", tone: "success" };
  if (data.readiness === "empty") return { label: "Waiting for content", description: "Import a source document to begin production.", tone: "neutral" };
  if (data.readiness === "in_progress") return { label: "Production in progress", description: "Imports or generation jobs are still running.", tone: "warning" };
  return { label: "Needs attention", description: "Resolve the blockers below before exporting the audiobook.", tone: "danger" };
}
