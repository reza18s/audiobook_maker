import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../api";
import type { Capability, Project, SentencePage } from "../types";
import type { Tab } from "../app-types";
import { SentenceTable } from "../SentenceTable";

export type SentencePageState = {
  sentencePage?: SentencePage;
  sentenceIsFetching: boolean;
  sentenceOffset: number;
  sentenceSelected: string[];
  onSentenceOffset: (offset: number) => void;
  onToggleSentence: (id: string) => void;
  narrationSidebarOpen: boolean;
  onToggleNarrationSidebar: () => void;
};

type ProjectWorkspaceProps = SentencePageState & {
  client: ApiClient;
  project: Project;
  tab: Tab;
  capabilities: Capability[];
};

export function ProjectWorkspace({ client, project, tab, capabilities, sentencePage, sentenceIsFetching, sentenceOffset, sentenceSelected, onSentenceOffset, onToggleSentence, narrationSidebarOpen, onToggleNarrationSidebar }: ProjectWorkspaceProps) {
  return <>{tab === "documents" && <DocumentsView client={client} project={project} />}{tab === "sentences" && <SentencesView client={client} project={project} capabilities={capabilities} sentencePage={sentencePage} sentenceIsFetching={sentenceIsFetching} offset={sentenceOffset} selected={sentenceSelected} onOffset={onSentenceOffset} onToggleSentence={onToggleSentence} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={onToggleNarrationSidebar} />}{tab === "speakers" && <SpeakersView client={client} project={project} capabilities={capabilities} />}{tab === "queue" && <QueueView client={client} />}{tab === "export" && <ExportView client={client} project={project} />}</>;
}

function DocumentsView({ client, project }: { client: ApiClient; project: Project }) {
  const queryClient = useQueryClient();
  const documents = useQuery({ queryKey: ["documents", project.id], queryFn: () => client.documents(project.id), refetchInterval: 1500 });
  const [upload, setUpload] = useState(0);
  const [message, setMessage] = useState("");
  const [chapterMarker, setChapterMarker] = useState("");
  const onFile = async (file: File) => {
    setMessage("");
    try {
      await client.uploadDocument(project.id, file, setUpload, chapterMarker);
      setMessage("Upload accepted; chapter detection and ingestion are running in the gateway.");
      void queryClient.invalidateQueries({ queryKey: ["documents", project.id] });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Upload failed");
    }
  };
  return <section><div className="page-heading"><div><div className="eyebrow">DOCUMENT IMPORT</div><h1>Bring in a book</h1><p className="muted">TXT and selectable-text PDF files are processed incrementally on the server.</p></div><div className="document-import-actions"><label className="chapter-marker-field">Custom chapter marker <input value={chapterMarker} onChange={(event) => setChapterMarker(event.target.value)} placeholder="Optional line, e.g. [NEW CHAPTER]" /><span>Chapter headings and --- CHAPTER END --- are detected automatically.</span></label><label className="upload-button"><input type="file" accept=".txt,.pdf,text/plain,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); }} />Import document</label></div></div>{upload > 0 && upload < 100 && <div className="progress"><span style={{ width: `${upload}%` }} /></div>}{message && <div className="info-banner">{message}</div>}<div className="document-list">{documents.data?.map((document) => <article className="document-card" key={document.id}><div><strong>{document.filename}</strong><span>{document.kind.toUpperCase()} · {document.persisted_sentences.toLocaleString()} sentences</span></div><span className={`status status-${document.status}`}>{document.status}</span>{document.error && <small className="error-text">{document.error}</small>}</article>)}</div></section>;
}

function SentencesView({ client, project, capabilities, sentencePage, sentenceIsFetching, offset, selected, onOffset, onToggleSentence, narrationSidebarOpen, onToggleNarrationSidebar }: { client: ApiClient; project: Project; capabilities: Capability[]; sentencePage?: SentencePage; sentenceIsFetching: boolean; offset: number; selected: string[]; onOffset: (offset: number) => void; onToggleSentence: (id: string) => void; narrationSidebarOpen: boolean; onToggleNarrationSidebar: () => void }) {
  const queryClient = useQueryClient();
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [engine, setEngine] = useState(capabilities[0]?.id ?? "");
  const [model, setModel] = useState("");
  const [voice, setVoice] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [settingsMessage, setSettingsMessage] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const speakers = useQuery({ queryKey: ["speakers", project.id], queryFn: () => client.speakers(project.id) });
  const update = async (id: string, changes: { text?: string; speaker_id?: string | null }) => { await client.updateSentence(id, changes); void queryClient.invalidateQueries({ queryKey: ["sentences", project.id] }); };
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

  const saveSettings = async () => {
    if (!selectedSpeakerId || !engine) return;
    setSavingSettings(true);
    setSettingsMessage("");
    const profileSettings = { ...settings, ...(model.trim() ? { model: model.trim() } : {}) };
    try {
      await client.updateProfile(selectedSpeakerId, { engine_id: engine, voice, settings: profileSettings });
      await queryClient.invalidateQueries({ queryKey: ["speakers", project.id] });
      setSettingsMessage("Saved to this speaker profile.");
    } catch (cause) {
      setSettingsMessage(cause instanceof Error ? cause.message : "Could not save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  return <section className="sentence-workspace"><div className={`sentence-body ${narrationSidebarOpen ? "" : "narration-sidebar-closed"}`}><div className="sentence-main"><div className="sentence-summary" role="status" aria-live="polite"><span>{selected.length ? `${selected.length} selected` : "Select sentences to generate"}</span><span>{sentenceIsFetching ? "Updating…" : `Showing ${items.length ? offset + 1 : 0}–${Math.min(offset + 100, sentencePage?.total ?? 0)}`}</span></div><SentenceTable sentences={items} speakers={speakerItems} selectedIds={new Set(selected)} onToggle={onToggleSentence} loadAudio={(id) => client.audio(id)} onEdit={(sentence, text) => void update(sentence.id, { text })} onSpeaker={(sentence, speaker_id) => void update(sentence.id, { speaker_id: speaker_id || null })} /><div className="pagination"><button type="button" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - 100))}>Previous</button><span>{offset + 1}–{Math.min(offset + 100, sentencePage?.total ?? 0)} of {sentencePage?.total ?? 0}</span><button type="button" disabled={offset + 100 >= (sentencePage?.total ?? 0)} onClick={() => onOffset(offset + 100)}>Next</button></div></div>{narrationSidebarOpen && <NarrationSidebar speakers={speakerItems} profile={selectedProfile} capabilities={capabilities} selectedSpeakerId={selectedSpeakerId} onSpeaker={setSelectedSpeakerId} engine={engine} onEngine={(next) => { setEngine(next); setModel(""); setSettings({}); }} model={model} models={models} onModel={setModel} voice={voice} onVoice={setVoice} settings={settings} onSettings={setSettings} message={settingsMessage} saving={savingSettings} onSave={() => void saveSettings()} onToggle={onToggleNarrationSidebar} />}</div></section>;
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
  return <aside id="narration-sidebar" className="narration-sidebar" aria-label="Narration settings"><div className="narration-sidebar-heading"><div><div className="eyebrow">VOICE WORKSPACE</div><h2>Narration settings</h2><p>Configure the profile used for generated audio.</p></div><button className="settings-sliders" type="button" aria-label="Close narration sidebar" aria-expanded="true" aria-controls="narration-sidebar" title="Close narration sidebar" onClick={onToggle}>☷</button></div>{!speakers.length ? <div className="settings-empty compact-empty"><span className="settings-empty-icon">◌</span><div><strong>No speakers yet</strong><p>Add a speaker before assigning an engine.</p></div></div> : <><label>Speaker<select value={selectedSpeakerId} onChange={(event) => onSpeaker(event.target.value)}>{speakers.map((speaker) => <option value={speaker.id} key={speaker.id}>{speaker.name}</option>)}</select></label><label>Engine<select value={engine} onChange={(event) => onEngine(event.target.value)}><option value="">Select engine</option>{capabilities.map((capability) => <option value={capability.id} key={capability.id}>{capability.display_name}</option>)}</select></label><label>Model{models.length ? <select value={model} onChange={(event) => onModel(event.target.value)}><option value="">Engine default model</option>{models.map((item) => <option value={item} key={item}>{item}</option>)}</select> : <input value={model} onChange={(event) => onModel(event.target.value)} placeholder="Engine default model" />}</label><label>Voice or sample ID<input value={voice} onChange={(event) => onVoice(event.target.value)} placeholder="Optional voice identifier" /></label>{selectedCapability && <CapabilitySettings capability={selectedCapability} settings={settings} onChange={onSettings} />}<div className="settings-sidebar-actions"><button className="primary wide" type="button" disabled={!engine || saving} onClick={onSave}>{saving ? "Saving…" : "Save settings"}</button>{message && <span className={message.startsWith("Saved") ? "settings-success" : "error-text"}>{message}</span>}</div><div className="settings-note"><span>i</span><p>{profile ? "Changes apply to this speaker's future narration jobs." : "This speaker does not have a saved profile yet."}</p></div></>}</aside>;
}

function SpeakersView({ client, project, capabilities }: { client: ApiClient; project: Project; capabilities: Capability[] }) {
  const queryClient = useQueryClient();
  const speakers = useQuery({ queryKey: ["speakers", project.id], queryFn: () => client.speakers(project.id) });
  const [name, setName] = useState("");
  const [engine, setEngine] = useState(capabilities[0]?.id ?? "");
  const [voice, setVoice] = useState("");
  const [sample, setSample] = useState<File | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const selectedCapability = capabilities.find((item) => item.id === engine);
  const create = async () => { if (!name.trim() || !engine) return; const created = await client.createSpeaker(project.id, { name, color: "#8EE6C6", engine_id: engine, voice, settings }); if (sample) await client.uploadSpeakerSample(created.id, sample); setName(""); setSample(null); setSettings({}); void queryClient.invalidateQueries({ queryKey: ["speakers", project.id] }); };
  return <section><div className="page-heading"><div><div className="eyebrow">SPEAKERS & PROFILES</div><h1>Voice configuration</h1><p className="muted">Engine controls are supplied by capability schemas from the gateway.</p></div></div><div className="speaker-layout"><div className="panel"><h2>Add speaker</h2><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Narrator or character" /><select value={engine} onChange={(event) => { setEngine(event.target.value); setSettings({}); }}><option value="">Select engine</option>{capabilities.map((item) => <option value={item.id} key={item.id}>{item.display_name} · {item.version}</option>)}</select><input value={voice} onChange={(event) => setVoice(event.target.value)} placeholder="Voice identifier (optional)" /><label>Speaker sample (.wav)<input type="file" accept="audio/wav,.wav" onChange={(event) => setSample(event.target.files?.[0] ?? null)} /></label>{selectedCapability && <CapabilitySettings capability={selectedCapability} settings={settings} onChange={setSettings} />}<button className="primary" onClick={() => void create()}>Add speaker</button></div><div className="speaker-list">{speakers.data?.items.map((speaker) => <article className="speaker-card" key={speaker.id}><span className="speaker-dot" style={{ background: speaker.color }} /><div><strong>{speaker.name}</strong><span>{speakers.data?.profiles.find((profile) => profile.speaker_id === speaker.id)?.engine_id ?? "Profile incomplete"}</span></div></article>)}</div></div></section>;
}

function CapabilitySettings({ capability, settings, onChange }: { capability: Capability; settings: Record<string, unknown>; onChange: (settings: Record<string, unknown>) => void }) {
  type CapabilityField = { name: string; type?: unknown; default?: unknown; label?: unknown; options?: unknown[]; min?: unknown; max?: unknown };
  const schema = capability.parameters;
  const fields: CapabilityField[] = Array.isArray(schema)
    ? schema.map((item) => ({ name: String(item.name ?? item.key ?? "setting"), ...item }))
    : Object.entries(schema ?? {}).map(([name, value]) => ({ name, ...(typeof value === "object" && value !== null ? value : { default: value }) }));
  if (!fields.length) return null;
  return <div className="capability-settings"><div className="settings-label">Generation settings</div>{fields.map((field) => { const type = String(field.type ?? (typeof field.default === "number" ? "number" : "text")); const value = settings[field.name] ?? field.default ?? ""; const setValue = (next: unknown) => onChange({ ...settings, [field.name]: next }); return <label key={field.name}>{String(field.label ?? field.name)}{type === "boolean" ? <input type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(event.target.checked)} /> : Array.isArray(field.options) ? <select value={String(value)} onChange={(event) => setValue(event.target.value)}>{field.options.map((option: unknown) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select> : <input type={type === "number" || type === "integer" ? "number" : "text"} value={String(value)} min={field.min as number | undefined} max={field.max as number | undefined} step={type === "integer" ? 1 : "any"} onChange={(event) => setValue(type === "number" || type === "integer" ? Number(event.target.value) : event.target.value)} />}</label>; })}</div>;
}

function QueueView({ client }: { client: ApiClient }) { const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => client.jobs(), refetchInterval: 1000 }); return <section><div className="page-heading"><div><div className="eyebrow">GENERATION QUEUE</div><h1>Durable jobs</h1></div></div><div className="job-list">{jobs.data?.map((job) => <article className="job-card" key={job.job_id}><div><strong>{job.job_id.slice(0, 8)}</strong><span>{job.progress.message} · attempt {job.attempts}/{job.max_attempts}</span></div><div className="job-progress"><span style={{ width: `${job.progress.percent}%` }} /></div><span className={`status status-${job.status}`}>{job.status}</span>{["queued", "running", "retrying"].includes(job.status) && <button className="ghost" onClick={() => void client.cancelJob(job.job_id)}>Cancel</button>}</article>)}</div></section>; }

function ExportView({ client, project }: { client: ApiClient; project: Project }) { const queryClient = useQueryClient(); const exports = useQuery({ queryKey: ["exports", project.id], queryFn: () => client.exports(project.id), refetchInterval: 1500 }); const [format, setFormat] = useState<"mp3" | "wav">("mp3"); const [pause, setPause] = useState(0.4); const create = async () => { await client.createExport(project.id, format, pause); void queryClient.invalidateQueries({ queryKey: ["exports", project.id] }); }; return <section><div className="page-heading"><div><div className="eyebrow">MEDIA EXPORT</div><h1>Assemble the audiobook</h1><p className="muted">Missing or failed sentence audio is reported before FFmpeg starts.</p></div><div className="inline-actions"><select value={format} onChange={(event) => setFormat(event.target.value as "mp3" | "wav")}><option value="mp3">MP3 · 192 kbps</option><option value="wav">WAV · PCM</option></select><label className="number-field">Pause <input type="number" min="0" step="0.1" value={pause} onChange={(event) => setPause(Number(event.target.value))} /> sec</label><button className="primary" onClick={() => void create()}>Start export</button></div></div><div className="export-list">{exports.data?.map((item) => <article className="export-card" key={item.id}><div><strong>{item.format.toUpperCase()} export</strong><span>{item.output_path}</span></div><div className="job-progress"><span style={{ width: `${item.percent}%` }} /></div><span className={`status status-${item.status}`}>{item.status} · {item.percent}%</span>{["queued", "running", "cancelling"].includes(item.status) && <button className="ghost" onClick={() => void client.cancelExport(item.id)}>Cancel</button>}{item.error && <small className="error-text">{item.error}</small>}</article>)}</div></section>; }

export function HealthView({ client }: { client: ApiClient }) { const health = useQuery({ queryKey: ["health"], queryFn: () => client.health() }); const capabilities = useQuery({ queryKey: ["capabilities"], queryFn: () => client.capabilities() }); return <section><div className="page-heading"><div><div className="eyebrow">ENGINE & GPU HEALTH</div><h1>Server status</h1></div></div><div className="health-grid"><div className="metric-card"><span>Gateway</span><strong>{health.data?.status ?? "checking"}</strong><small>Contract v{health.data?.contract_version ?? "—"}</small></div><div className="metric-card"><span>Storage</span><strong>Connected</strong><small>{health.data?.storage ?? "—"}</small></div><div className="metric-card"><span>Production engines</span><strong>{capabilities.data?.length ?? 0}</strong><small>Discovered by gateway</small></div></div><div className="capability-list">{capabilities.data?.map((capability) => <article className="capability-card" key={capability.id}><strong>{capability.display_name}</strong><span>{capability.version} · {capability.requires_gpu ? "GPU required" : "CPU capable"}</span><small>{capability.supported_languages?.join(", ") || "Languages reported by worker"}</small></article>)}</div></section>; }
