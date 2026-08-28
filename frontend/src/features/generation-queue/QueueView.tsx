import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { EmptyState } from "../../shared/ui/EmptyState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { ProgressBar } from "../../shared/ui/ProgressBar";
import { StatusBadge } from "../../shared/ui/StatusBadge";

export function QueueView({ client }: { client: ApiClient }) {
  const queryClient = useQueryClient();
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => client.jobs(), refetchInterval: 1000 });
  const cancelJob = useMutation({ mutationFn: (jobId: string) => client.cancelJob(jobId), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["jobs"] }); } });
  return <section><PageHeader eyebrow="GENERATION QUEUE" title="Durable jobs" /><div className="job-list" aria-busy={jobs.isFetching}>{jobs.isLoading ? <EmptyState loading title="Loading jobs" description="Retrieving generation activity…" /> : jobs.isError ? <EmptyState title="Could not load jobs" description={jobs.error instanceof Error ? jobs.error.message : "The generation queue is unavailable."} /> : !jobs.data?.length ? <EmptyState title="Queue is clear" description="Generated audio jobs will appear here." /> : jobs.data.map((job) => <Card className="job-card" key={job.job_id}><div><strong>{job.job_id.slice(0, 8)}</strong><span>{job.progress.message} · attempt {job.attempts}/{job.max_attempts}</span></div><ProgressBar className="job-progress" value={job.progress.percent} label={`Job ${job.job_id.slice(0, 8)} progress`} showValue /><StatusBadge status={job.status} live="polite">{job.status}</StatusBadge>{["queued", "running", "retrying"].includes(job.status) && <Button variant="ghost" size="sm" loading={cancelJob.isPending} loadingLabel="Cancelling…" onClick={() => cancelJob.mutate(job.job_id)}>Cancel</Button>}</Card>)}</div></section>;
}
