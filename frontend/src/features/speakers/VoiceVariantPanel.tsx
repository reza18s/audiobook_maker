import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import type { Capability, Project, Speaker, VoiceVariant } from "../../types";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Dialog } from "../../shared/ui/Dialog";
import { Field } from "../../shared/ui/Field";
import { Input } from "../../shared/ui/Input";
import { Select } from "../../shared/ui/Select";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { TextField } from "../../shared/ui/TextField";
import { Textarea } from "../../shared/ui/Textarea";
import { CapabilitySettings } from "./CapabilitySettings";

export function VoiceVariantPanel({ client, project, speakers, capabilities, variants }: { client: ApiClient; project: Project; speakers: Speaker[]; capabilities: Capability[]; variants: VoiceVariant[] }) {
  const queryClient = useQueryClient();
  const [speakerId, setSpeakerId] = useState("");
  const [name, setName] = useState("");
  const [engine, setEngine] = useState(capabilities[0]?.id ?? "");
  const [voice, setVoice] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [previewText, setPreviewText] = useState("This is a short preview of the selected audiobook voice.");
  const [deleting, setDeleting] = useState<VoiceVariant | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewingVariant, setPreviewingVariant] = useState<string | null>(null);
  const createVariant = useMutation({
    mutationFn: () => client.createVoiceVariant(speakerId, { name, engine_id: engine, voice, settings }),
    onSuccess: () => {
      setName("");
      setVoice("");
      setSettings({});
      void queryClient.invalidateQueries({ queryKey: ["speakers", project.id] });
    },
  });
  const deleteVariant = useMutation({
    mutationFn: (variantId: string) => client.deleteVoiceVariant(variantId),
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["speakers", project.id] });
    },
  });
  const previewVariant = useMutation({
    mutationFn: (variant: VoiceVariant) => client.previewVoiceVariant(variant.id, previewText),
    onMutate: (variant) => { setPreviewingVariant(variant.id); setPreviewUrl(""); },
    onSuccess: (audio) => setPreviewUrl(URL.createObjectURL(audio)),
    onSettled: () => setPreviewingVariant(null),
  });
  const applyVariant = useMutation({
    mutationFn: (variant: VoiceVariant) => client.updateProfile(variant.speaker_id, {
      engine_id: variant.engine_id,
      voice: variant.voice,
      settings: parseSettings(variant.settings),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["speakers", project.id] });
    },
  });

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!speakerId && speakers[0]) setSpeakerId(speakers[0].id);
  }, [speakerId, speakers]);

  const selectedCapability = capabilities.find((capability) => capability.id === engine);

  return <Card className="voice-variant-panel" title="Voice variants" description="Save alternate delivery styles without replacing the speaker's default profile.">
    <div className="voice-variant-form"><Field label="Speaker"><Select value={speakerId} onChange={(event) => setSpeakerId(event.target.value)} disabled={!speakers.length}><option value="">Select speaker</option>{speakers.map((speaker) => <option value={speaker.id} key={speaker.id}>{speaker.name}</option>)}</Select></Field><TextField label="Variant name" value={name} onValueChange={setName} placeholder="Calm, dramatic, whisper…" /><Field label="Engine"><Select value={engine} onChange={(event) => { setEngine(event.target.value); setSettings({}); }} disabled={!capabilities.length}><option value="">Select engine</option>{capabilities.map((capability) => <option value={capability.id} key={capability.id}>{capability.display_name}</option>)}</Select></Field><TextField label="Voice or sample ID" value={voice} onValueChange={setVoice} placeholder="Optional identifier" /><Button variant="primary" loading={createVariant.isPending} loadingLabel="Saving…" disabled={!speakerId || !name.trim() || !engine} onClick={() => createVariant.mutate()}>Save variant</Button></div>
    {selectedCapability && <CapabilitySettings capability={selectedCapability} settings={settings} onChange={setSettings} />}
    {createVariant.isError && <StatusBadge tone="danger" live="assertive">{createVariant.error instanceof Error ? createVariant.error.message : "Could not save voice variant"}</StatusBadge>}
    <div className="voice-preview-box"><Field label="Preview text"><Textarea value={previewText} onChange={(event) => setPreviewText(event.target.value)} maxLength={2000} /></Field><small>{previewText.length}/2000 characters · preview audio is not added to the production queue</small>{previewUrl && <audio controls src={previewUrl} aria-label="Voice variant preview" />}</div>
    {previewVariant.isError && <StatusBadge tone="danger" live="assertive">{previewVariant.error instanceof Error ? previewVariant.error.message : "Could not generate preview"}</StatusBadge>}
    {applyVariant.isError && <StatusBadge tone="danger" live="assertive">{applyVariant.error instanceof Error ? applyVariant.error.message : "Could not apply voice variant"}</StatusBadge>}
    {applyVariant.isSuccess && <StatusBadge tone="success" live="polite">Default profile updated</StatusBadge>}
    {variants.length ? <div className="voice-variant-list" aria-label="Saved voice variants">{variants.map((variant) => <article className="voice-variant-card" key={variant.id}><div><strong>{variant.name}</strong><span>{speakers.find((speaker) => speaker.id === variant.speaker_id)?.name ?? "Unknown speaker"} · {variant.engine_id}</span></div><StatusBadge tone="success">Saved</StatusBadge><Button variant="outline" size="sm" loading={previewingVariant === variant.id} loadingLabel="Previewing…" disabled={!previewText.trim() || Boolean(previewingVariant) || applyVariant.isPending} onClick={() => previewVariant.mutate(variant)}>Preview</Button><Button variant="outline" size="sm" loading={applyVariant.isPending} loadingLabel="Applying…" disabled={Boolean(previewingVariant)} onClick={() => applyVariant.mutate(variant)}>Use as default</Button><Button variant="destructive" size="sm" disabled={applyVariant.isPending} onClick={() => setDeleting(variant)}>Delete</Button></article>)}</div> : <p className="muted voice-variant-empty">No variants saved yet.</p>}
    <Dialog open={Boolean(deleting)} title="Delete voice variant?" description={`This removes ${deleting?.name ?? "this saved variant"} from the project.`} disabled={deleteVariant.isPending} onClose={() => setDeleting(null)} footer={<><Button variant="ghost" disabled={deleteVariant.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" loading={deleteVariant.isPending} loadingLabel="Deleting…" onClick={() => deleting && deleteVariant.mutate(deleting.id)}>Delete variant</Button></>}>
      <p className="dialog-warning">The speaker’s default profile and generated audio are not changed.</p>
      {deleteVariant.isError && <StatusBadge tone="danger" live="assertive">{deleteVariant.error instanceof Error ? deleteVariant.error.message : "Could not delete voice variant"}</StatusBadge>}
    </Dialog>
  </Card>;
}

function parseSettings(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
