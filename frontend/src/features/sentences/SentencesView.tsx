import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../../api";
import type { Capability, Chapter, Project, SentencePage } from "../../types";
import { SentenceTable } from "../../SentenceTable";
import { Button } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Field } from "../../shared/ui/Field";
import { Input } from "../../shared/ui/Input";
import { Select } from "../../shared/ui/Select";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { CapabilitySettings } from "../speakers/CapabilitySettings";

export type SentencesViewProps = {
  client: ApiClient;
  project: Project;
  capabilities: Capability[];
  sentencePage?: SentencePage;
  sentenceIsFetching: boolean;
  chapters: Chapter[];
  chapter: Chapter | null;
  chapterIndex: number;
  onChapterIndex: (index: number) => void;
  selected: string[];
  onToggleSentence: (id: string) => void;
  narrationSidebarOpen: boolean;
  onToggleNarrationSidebar: () => void;
};

export function SentencesView({ client, project, capabilities, sentencePage, sentenceIsFetching, chapters, chapter, chapterIndex, onChapterIndex, selected, onToggleSentence, narrationSidebarOpen, onToggleNarrationSidebar }: SentencesViewProps) {
  const queryClient = useQueryClient();
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [engine, setEngine] = useState(capabilities[0]?.id ?? "");
  const [model, setModel] = useState("");
  const [voice, setVoice] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [settingsMessage, setSettingsMessage] = useState("");
  const speakers = useQuery({ queryKey: ["speakers", project.id], queryFn: () => client.speakers(project.id) });
  const updateSentence = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: { text?: string; speaker_id?: string | null } }) => client.updateSentence(id, changes),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["sentences", project.id] }); },
  });
  const saveProfile = useMutation({
    mutationFn: ({ speakerId, engineId, selectedVoice, profileSettings }: { speakerId: string; engineId: string; selectedVoice: string; profileSettings: Record<string, unknown> }) => client.updateProfile(speakerId, { engine_id: engineId, voice: selectedVoice, settings: profileSettings }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["speakers", project.id] }); setSettingsMessage("Saved to this speaker profile."); },
    onError: (cause) => setSettingsMessage(cause instanceof Error ? cause.message : "Could not save settings"),
  });
  const items = sentencePage?.items ?? [];
  const speakerItems = speakers.data?.items ?? [];
  const profiles = speakers.data?.profiles ?? [];
  const selectedProfile = profiles.find((profile) => profile.speaker_id === selectedSpeakerId);
  const selectedCapability = capabilities.find((capability) => capability.id === engine);
  const models = capabilityModels(selectedCapability);

  useEffect(() => {
    if (!selectedSpeakerId && speakerItems[0]) setSelectedSpeakerId(speakerItems[0].id);
  }, [selectedSpeakerId, speakerItems]);

  useEffect(() => {
    if (!selectedSpeakerId) {
      setEngine(capabilities[0]?.id ?? "");
      setModel("");
      setVoice("");
      setSettings({});
      return;
    }
    const profile = profiles.find((item) => item.speaker_id === selectedSpeakerId);
    const profileSettings = parseProfileSettings(profile?.settings);
    const savedModel = typeof profileSettings.model === "string" ? profileSettings.model : "";
    delete profileSettings.model;
    setEngine(profile?.engine_id ?? capabilities[0]?.id ?? "");
    setModel(savedModel);
    setVoice(profile?.voice ?? "");
    setSettings(profileSettings);
    setSettingsMessage("");
  }, [selectedSpeakerId, profiles, capabilities]);

  const saveSettings = () => {
    if (!selectedSpeakerId || !engine) return;
    setSettingsMessage("");
    const profileSettings = { ...settings, ...(model.trim() ? { model: model.trim() } : {}) };
    saveProfile.mutate({ speakerId: selectedSpeakerId, engineId: engine, selectedVoice: voice, profileSettings });
  };

  return <section className="sentence-workspace"><div className={`sentence-body ${narrationSidebarOpen ? "" : "narration-sidebar-closed"}`}><div className="sentence-main"><div className="sentence-summary" role="status" aria-live="polite"><span>{selected.length ? `${selected.length} selected` : "Select sentences to generate"}</span><span>{sentenceIsFetching ? "Updating…" : chapter ? `${formatChapter(chapter)} · ${items.length.toLocaleString()} sentences` : "No chapters"}</span></div>{sentenceIsFetching && !sentencePage && !chapter ? <EmptyState loading title="Loading chapters" description="Retrieving chapter data…" /> : !chapters.length ? <EmptyState title="No sentences yet" description="Import a document to create chapters and sentences for narration." /> : sentencePage && !items.length ? <EmptyState title="No sentences in this chapter" description="This chapter has no sentences matching the current search." /> : <SentenceTable sentences={items} speakers={speakerItems} selectedIds={new Set(selected)} onToggle={onToggleSentence} loadAudio={(id) => client.audio(id)} onEdit={(sentence, text) => updateSentence.mutate({ id: sentence.id, changes: { text } })} onSpeaker={(sentence, speaker_id) => updateSentence.mutate({ id: sentence.id, changes: { speaker_id: speaker_id || null } })} />}<div className="pagination"><Button size="sm" variant="outline" disabled={chapterIndex === 0 || sentenceIsFetching} onClick={() => onChapterIndex(Math.max(0, chapterIndex - 1))}>Previous chapter</Button><div className="pagination-label"><strong>{chapter ? formatChapter(chapter) : "No chapter selected"}</strong><span>{chapters.length ? `Chapter ${chapterIndex + 1} of ${chapters.length} · ${chapter?.sentence_count.toLocaleString() ?? 0} sentences` : "—"}</span></div><Button size="sm" variant="outline" disabled={chapterIndex >= chapters.length - 1 || sentenceIsFetching} onClick={() => onChapterIndex(Math.min(chapters.length - 1, chapterIndex + 1))}>Next chapter</Button></div></div>{narrationSidebarOpen && <NarrationSidebar speakers={speakerItems} profile={selectedProfile} capabilities={capabilities} selectedSpeakerId={selectedSpeakerId} onSpeaker={setSelectedSpeakerId} engine={engine} onEngine={(next) => { setEngine(next); setModel(""); setSettings({}); }} model={model} models={models} onModel={setModel} voice={voice} onVoice={setVoice} settings={settings} onSettings={setSettings} message={settingsMessage} saving={saveProfile.isPending} onSave={saveSettings} onToggle={onToggleNarrationSidebar} />}</div></section>;
}

function formatChapter(chapter: Chapter): string {
  const label = chapter.number > 0 ? `Chapter ${chapter.number}` : "Unchaptered";
  return chapter.title && chapter.title !== String(chapter.number) ? `${label}: ${chapter.title}` : label;
}

function parseProfileSettings(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...(parsed as Record<string, unknown>) } : {};
  } catch {
    return {};
  }
}

function capabilityModels(capability: Capability | undefined): string[] {
  const parameters = capability?.parameters;
  if (Array.isArray(parameters)) {
    const field = parameters.find((item) => String(item.name ?? item.key ?? "").toLowerCase() === "model");
    return Array.isArray(field?.options) ? field.options.map(String) : [];
  }
  const modelOptions = parameters?.model;
  return Array.isArray(modelOptions) ? modelOptions.map(String) : [];
}

function NarrationSidebar({ speakers, profile, capabilities, selectedSpeakerId, onSpeaker, engine, onEngine, model, models, onModel, voice, onVoice, settings, onSettings, message, saving, onSave, onToggle }: { speakers: { id: string; name: string }[]; profile?: { engine_id: string; voice: string; settings: string }; capabilities: Capability[]; selectedSpeakerId: string; onSpeaker: (id: string) => void; engine: string; onEngine: (id: string) => void; model: string; models: string[]; onModel: (model: string) => void; voice: string; onVoice: (voice: string) => void; settings: Record<string, unknown>; onSettings: (settings: Record<string, unknown>) => void; message: string; saving: boolean; onSave: () => void; onToggle: () => void }) {
  const selectedCapability = capabilities.find((item) => item.id === engine);
  return <aside id="narration-sidebar" className="narration-sidebar" aria-label="Narration settings"><div className="narration-sidebar-heading"><div><div className="eyebrow">VOICE WORKSPACE</div><h2>Narration settings</h2><p>Configure the profile used for generated audio.</p></div><Button className="settings-sliders" variant="ghost" size="icon" aria-label="Close narration sidebar" aria-expanded="true" aria-controls="narration-sidebar" title="Close narration sidebar" onClick={onToggle}>☷</Button></div>{!speakers.length ? <EmptyState className="compact-empty" title="No speakers yet" description="Add a speaker before assigning an engine." /> : <><Field label="Speaker"><Select value={selectedSpeakerId} onChange={(event) => onSpeaker(event.target.value)}>{speakers.map((speaker) => <option value={speaker.id} key={speaker.id}>{speaker.name}</option>)}</Select></Field><Field label="Engine"><Select value={engine} onChange={(event) => onEngine(event.target.value)}><option value="">Select engine</option>{capabilities.map((capability) => <option value={capability.id} key={capability.id}>{capability.display_name}</option>)}</Select></Field><Field label="Model">{models.length ? <Select value={model} onChange={(event) => onModel(event.target.value)}><option value="">Engine default model</option>{models.map((item) => <option value={item} key={item}>{item}</option>)}</Select> : <Input value={model} onChange={(event) => onModel(event.target.value)} placeholder="Engine default model" />}</Field><Field label="Voice or sample ID"><Input value={voice} onChange={(event) => onVoice(event.target.value)} placeholder="Optional voice identifier" /></Field>{selectedCapability && <CapabilitySettings capability={selectedCapability} settings={settings} onChange={onSettings} />}<div className="settings-sidebar-actions"><Button className="wide" variant="primary" fullWidth disabled={!engine || saving} onClick={onSave}>{saving ? "Saving…" : "Save settings"}</Button>{message && <StatusBadge className={message.startsWith("Saved") ? "settings-success" : "error-text"} tone={message.startsWith("Saved") ? "success" : "danger"} live="polite">{message}</StatusBadge>}</div><div className="settings-note"><span>i</span><p>{profile ? "Changes apply to this speaker's future narration jobs." : "This speaker does not have a saved profile yet."}</p></div></>}</aside>;
}
