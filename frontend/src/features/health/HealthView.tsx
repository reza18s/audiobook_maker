import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import { Card } from "../../shared/ui/Card";
import { EmptyState } from "../../shared/ui/EmptyState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { StatusBadge } from "../../shared/ui/StatusBadge";

export function HealthView({ client }: { client: ApiClient }) {
  const health = useQuery({ queryKey: ["health"], queryFn: () => client.health() });
  const capabilities = useQuery({ queryKey: ["capabilities"], queryFn: () => client.capabilities() });
  return <section><PageHeader eyebrow="ENGINE & GPU HEALTH" title="Server status" />{health.isError || capabilities.isError ? <EmptyState title="Health information unavailable" description="The gateway did not return its current status." /> : <><div className="health-grid"><Card as="div" className="metric-card" title="Gateway" loading={health.isLoading} loadingLabel="Checking gateway…"><StatusBadge status={health.data?.status} live="polite">{health.data?.status ?? "checking"}</StatusBadge><small>Contract v{health.data?.contract_version ?? "—"}</small></Card><Card as="div" className="metric-card" title="Storage" loading={health.isLoading} loadingLabel="Checking storage…"><StatusBadge tone="success">Connected</StatusBadge><small>{health.data?.storage ?? "—"}</small></Card><Card as="div" className="metric-card" title="Production engines" loading={capabilities.isLoading} loadingLabel="Discovering engines…"><strong>{capabilities.data?.length ?? 0}</strong><small>Discovered by gateway</small></Card></div>{!capabilities.isLoading && !capabilities.data?.length ? <EmptyState title="No production engines discovered" description="Engine capabilities will appear here when workers are available." /> : <div className="capability-list">{capabilities.data?.map((capability) => { const healthy = capability.healthy !== false; return <Card as="article" className="capability-card" key={capability.id}><div className="engine-setting-title"><strong>{capability.display_name}</strong><StatusBadge tone={healthy ? "success" : "danger"} live="polite">{healthy ? "Available" : "Offline"}</StatusBadge></div><span>{capability.version} · {capability.requires_gpu ? "GPU required" : "CPU capable"}</span><small>{capability.supported_languages?.join(", ") || "Languages reported by worker"}</small></Card>; })}</div>}</>}</section>;
}
