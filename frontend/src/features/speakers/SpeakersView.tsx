import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import type { Capability, Project } from "../../types";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Field } from "../../shared/ui/Field";
import { Input } from "../../shared/ui/Input";
import { PageHeader } from "../../shared/ui/PageHeader";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Select } from "../../shared/ui/Select";
import { TextField } from "../../shared/ui/TextField";
import { CapabilitySettings } from "./CapabilitySettings";
import { VoiceVariantPanel } from "./VoiceVariantPanel";

export function SpeakersView({ client, project, capabilities }: { client: ApiClient; project: Project; capabilities: Capability[] }) {
  const queryClient = useQueryClient();
  const speakers = useQuery({ queryKey: ["speakers", project.id], queryFn: () => client.speakers(project.id) });
  const [name, setName] = useState("");
  const [engine, setEngine] = useState(capabilities[0]?.id ?? "");
  const [voice, setVoice] = useState("");
  const [sample, setSample] = useState<File | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const selectedCapability = capabilities.find((capability) => capability.id === engine);
  const createSpeaker = useMutation({
    mutationFn: async () => {
      const created = await client.createSpeaker(project.id, { name, color: "#8EE6C6", engine_id: engine, voice, settings });
      if (sample) await client.uploadSpeakerSample(created.id, sample);
      return created;
    },
    onSuccess: () => {
      setName("");
      setSample(null);
      setSettings({});
      void queryClient.invalidateQueries({ queryKey: ["speakers", project.id] });
    },
  });
  const create = () => { if (name.trim() && engine) createSpeaker.mutate(); };

  return <section><PageHeader eyebrow="SPEAKERS & PROFILES" title="Voice configuration" description="Build reusable narrator and character profiles before generating a chapter." />{speakers.data && <VoiceVariantPanel client={client} project={project} speakers={speakers.data.items} capabilities={capabilities} variants={speakers.data.variants ?? []} />}<div className="speaker-layout"><Card title="Add speaker"><TextField label="Name" value={name} onValueChange={setName} placeholder="Narrator or character" /><Field label="Engine"><Select value={engine} onChange={(event) => { setEngine(event.target.value); setSettings({}); }}><option value="">Select engine</option>{capabilities.map((item) => <option value={item.id} key={item.id}>{item.display_name} · {item.version}</option>)}</Select></Field><TextField label="Voice identifier" value={voice} onValueChange={setVoice} placeholder="Optional voice identifier" /><Field label="Speaker sample (.wav)" description={sample ? sample.name : "Optional WAV sample"}><Input type="file" accept="audio/wav,.wav" onChange={(event) => setSample(event.target.files?.[0] ?? null)} /></Field>{selectedCapability && <CapabilitySettings capability={selectedCapability} settings={settings} onChange={setSettings} />}<Button variant="primary" loading={createSpeaker.isPending} loadingLabel="Adding…" onClick={create}>Add speaker</Button>{createSpeaker.isError && <StatusBadge tone="danger" live="assertive">{createSpeaker.error instanceof Error ? createSpeaker.error.message : "Could not add speaker"}</StatusBadge>}</Card><div className="speaker-list" aria-busy={speakers.isFetching}>{speakers.isLoading ? <EmptyState loading title="Loading speakers" description="Retrieving speaker profiles…" /> : speakers.isError ? <EmptyState title="Could not load speakers" description={speakers.error instanceof Error ? speakers.error.message : "The speaker list is unavailable."} /> : !speakers.data?.items.length ? <EmptyState title="No speakers yet" description="Add a speaker to configure narration voices." /> : speakers.data.items.map((speaker) => <article className={`speaker-card ${speakers.data.profiles.some((profile) => profile.speaker_id === speaker.id) ? "speaker-card-configured" : "speaker-card-incomplete"}`} key={speaker.id}><span className="speaker-dot" style={{ background: speaker.color }} /><div><strong>{speaker.name}</strong><span className="speaker-card-profile">{speakers.data.profiles.find((profile) => profile.speaker_id === speaker.id)?.engine_id ?? "Profile incomplete"}</span><small>{speaker.sentence_count?.toLocaleString() ?? 0} assigned sentences · {speaker.generated_count?.toLocaleString() ?? 0} generated</small></div></article>)}</div></div></section>;
}
