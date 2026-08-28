import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClient } from "./api";
import { loadToken, saveToken } from "./secureToken";
import { SentenceTable } from "./SentenceTable";
import type { Capability, Project } from "./types";
import "./styles.css";

type Tab = "documents" | "sentences" | "speakers" | "queue" | "export" | "health";
type AppView = "home" | "project" | "settings" | "health";
type SettingsTab = "engines" | "app";

export default function App() {
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000");
  const [token, setToken] = useState("");
  const [client, setClient] = useState<ApiClient | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("documents");
  const [view, setView] = useState<AppView>("home");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("engines");
  const [error, setError] = useState("");

  useEffect(() => { void loadToken().then(setToken); }, []);

  const connect = async () => {
    setError("");
    const next = new ApiClient(baseUrl, token.trim());
    try { await next.health(); await saveToken(token.trim()); setSelectedProject(null); setView("home"); setClient(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Connection failed"); }
  };

  if (!client) return <ConnectionScreen baseUrl={baseUrl} token={token} error={error} onUrl={setBaseUrl} onToken={setToken} onConnect={connect} />;
  return <ConnectedApp client={client} project={selectedProject} setProject={setSelectedProject} tab={tab} setTab={setTab} view={view} setView={setView} settingsTab={settingsTab} setSettingsTab={setSettingsTab} onDisconnect={() => setClient(null)} />;
}

function ConnectionScreen({ baseUrl, token, error, onUrl, onToken, onConnect }: { baseUrl: string; token: string; error: string; onUrl: (value: string) => void; onToken: (value: string) => void; onConnect: () => void }) {
  return <main className="connection-page"><section className="connection-card"><div className="eyebrow">AUDIOBOOK MAKER</div><h1>Connect your workspace</h1><p className="muted">Connect to the gateway running locally or on your trusted Tailscale server.</p><label>Gateway URL<input value={baseUrl} onChange={(event) => onUrl(event.target.value)} placeholder="http://localhost:8000" /></label><label>API token<input value={token} onChange={(event) => onToken(event.target.value)} type="password" placeholder="Stored in Windows Credential Manager" /></label>{error && <div className="error-banner">{error}</div>}<button className="primary wide" onClick={onConnect}>Connect securely</button></section></main>;
}

function ConnectedApp({ client, project, setProject, tab, setTab, view, setView, settingsTab, setSettingsTab, onDisconnect }: { client: ApiClient; project: Project | null; setProject: (project: Project | null) => void; tab: Tab; setTab: (tab: Tab) => void; view: AppView; setView: (view: AppView) => void; settingsTab: SettingsTab; setSettingsTab: (tab: SettingsTab) => void; onDisconnect: () => void }) {
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => client.projects() });
  const capabilities = useQuery({ queryKey: ["capabilities"], queryFn: () => client.capabilities() });
  useEffect(() => { const stop = client.events(() => { void queryClient.invalidateQueries({ queryKey: ["jobs"] }); }); return stop; }, [client, queryClient]);
  const createProject = useMutation({ mutationFn: (name: string) => client.createProject(name), onSuccess: (created) => { void queryClient.invalidateQueries({ queryKey: ["projects"] }); setProject(created); setTab("documents"); setView("project"); } });

  if (projects.isLoading) return <div className="loading">Loading projects…</div>;
  if (projects.isError) return <div className="loading"><div className="error-banner">{(projects.error as Error).message}</div><button onClick={onDisconnect}>Back to connection</button></div>;
  const openHome = () => { setProject(null); setView("home"); };
  const openProject = (next: Project) => { setProject(next); setTab("documents"); setView("project"); };
  const openSettings = (section: SettingsTab = "engines") => { setSettingsTab(section); setView("settings"); };
  const sentenceView = view === "project" && tab === "sentences";
  return <div className="app-shell"><WorkspaceSidebar projects={projects.data ?? []} project={project} view={view} tab={tab} onHome={openHome} onProject={openProject} onTab={(next) => { setTab(next); setView(next === "health" ? "health" : "project"); }} onSettings={openSettings} onDisconnect={onDisconnect} /><div className="app-main"><header className="topbar"><div><div className="eyebrow">AUDIOBOOK MAKER</div><strong>{view === "home" ? "Your projects" : view === "settings" ? "Settings" : view === "health" ? "Server health" : project?.name ?? "Project"}</strong></div><div className="topbar-actions"><span className="connection-status"><span className="status-dot" /> Gateway connected</span><button className="ghost" onClick={onDisconnect}>Disconnect</button></div></header><main className={`content ${sentenceView ? "sentence-content" : ""}`}>{view === "home" && <HomeView projects={projects.data ?? []} onSelect={openProject} onCreate={(name) => createProject.mutate(name)} />}{view === "settings" && <SettingsView client={client} capabilities={capabilities.data ?? []} section={settingsTab} onSection={setSettingsTab} onBack={openHome} onDisconnect={onDisconnect} />}{view === "health" && <HealthView client={client} />}{view === "project" && project && <ProjectWorkspace client={client} project={project} tab={tab} capabilities={capabilities.data ?? []} />}</main></div></div>;
}

function WorkspaceSidebar({ projects, project, view, tab, onHome, onProject, onTab, onSettings, onDisconnect }: { projects: Project[]; project: Project | null; view: AppView; tab: Tab; onHome: () => void; onProject: (project: Project) => void; onTab: (tab: Tab) => void; onSettings: (section?: SettingsTab) => void; onDisconnect: () => void }) {
  return <aside className="workspace-sidebar"><div className="sidebar-brand"><span className="brand-mark">AM</span><div><strong>Audiobook</strong><span>Maker Studio</span></div></div><nav className="sidebar-nav"><button className={`sidebar-item ${view === "home" ? "active" : ""}`} onClick={onHome}><span className="nav-icon">⌂</span>Home</button></nav><div className="sidebar-section"><div className="sidebar-section-title"><span>Projects</span><span className="sidebar-count">{projects.length}</span></div><div className="project-nav-list">{projects.map((item) => <button className={`sidebar-item project-item ${view === "project" && project?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => onProject(item)}><span className="project-avatar">{item.name.slice(0, 1).toUpperCase()}</span><span className="project-nav-name">{item.name}</span><span className="project-nav-count">{item.document_count}</span></button>)}{!projects.length && <span className="sidebar-empty">Create your first audiobook project.</span>}</div></div>{view === "project" && project && <div className="sidebar-section project-navigation"><div className="sidebar-section-title">Current project</div>{(["documents", "sentences", "speakers", "queue", "export"] as Tab[]).map((item) => <button className={`sidebar-item nested-item ${tab === item ? "active" : ""}`} key={item} onClick={() => onTab(item)}><span className="nav-icon">{({ documents: "▣", sentences: "≡", speakers: "◉", queue: "↗", export: "⇩" } as Record<string, string>)[item]}</span>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>}<div className="sidebar-spacer" /><div className="sidebar-section sidebar-bottom"><div className="sidebar-section-title">System</div><button className={`sidebar-item ${view === "health" ? "active" : ""}`} onClick={() => onTab("health")}><span className="nav-icon">◌</span>Server health</button><button className={`sidebar-item ${view === "settings" ? "active" : ""}`} onClick={() => onSettings()}><span className="nav-icon">⚙</span>Settings</button><button className="sidebar-item disconnect-item" onClick={onDisconnect}><span className="nav-icon">↪</span>Disconnect</button></div></aside>;
}

function ProjectWorkspace({ client, project, tab, capabilities }: { client: ApiClient; project: Project; tab: Tab; capabilities: Capability[] }) {
  return <>{tab === "documents" && <DocumentsView client={client} project={project} />}{tab === "sentences" && <SentencesView client={client} project={project} capabilities={capabilities} />}{tab === "speakers" && <SpeakersView client={client} project={project} capabilities={capabilities} />}{tab === "queue" && <QueueView client={client} />}{tab === "export" && <ExportView client={client} project={project} />}</>;
}

function HomeView({ projects, onSelect, onCreate }: { projects: Project[]; onSelect: (project: Project) => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  const documents = projects.reduce((total, project) => total + project.document_count, 0);
  const sentences = projects.reduce((total, project) => total + project.sentence_count, 0);
  return <section className="home-view"><div className="page-heading home-heading"><div><div className="eyebrow">WORKSPACE OVERVIEW</div><h1>Good to see you.</h1><p className="muted">Choose a project to continue writing, narrating, and exporting your audiobook.</p></div><div className="home-badge"><span className="status-dot" /> All systems connected</div></div><div className="overview-strip"><div><span>Projects</span><strong>{projects.length}</strong><small>Your audiobook workspaces</small></div><div><span>Documents</span><strong>{documents.toLocaleString()}</strong><small>Imported source files</small></div><div><span>Sentences</span><strong>{sentences.toLocaleString()}</strong><small>Ready to narrate</small></div></div><div className="section-heading"><div><div className="eyebrow">YOUR LIBRARY</div><h2>All projects</h2></div><span className="muted">Select a project from the cards or the sidebar.</span></div><div className="project-grid">{projects.map((project) => <button className="project-card" key={project.id} onClick={() => onSelect(project)}><span className="project-card-top"><span className="project-avatar large">{project.name.slice(0, 1).toUpperCase()}</span><span className="project-arrow">→</span></span><strong>{project.name}</strong><span>{project.document_count} documents · {project.sentence_count.toLocaleString()} sentences</span><small>Updated {new Date(project.updated_at).toLocaleDateString()}</small></button>)}<form className="project-card new-project" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { onCreate(name.trim()); setName(""); } }}><span className="new-project-icon">+</span><strong>Start a new project</strong><span>Give your next audiobook a home.</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" /><button className="primary" type="submit">Create workspace</button></form></div></section>;
}

function SettingsView({ client, capabilities, section, onSection, onBack, onDisconnect }: { client: ApiClient; capabilities: Capability[]; section: SettingsTab; onSection: (section: SettingsTab) => void; onBack: () => void; onDisconnect: () => void }) {
  return <div className="settings-shell"><aside className="settings-sidebar"><div className="settings-sidebar-heading"><span className="nav-icon">⚙</span><div><strong>Settings</strong><span>Workspace preferences</span></div></div><div className="settings-nav"><button className={`settings-nav-item ${section === "engines" ? "active" : ""}`} onClick={() => onSection("engines")}><span className="nav-icon">◈</span><span><strong>Engine settings</strong><small>Models and availability</small></span></button><button className={`settings-nav-item ${section === "app" ? "active" : ""}`} onClick={() => onSection("app")}><span className="nav-icon">⌘</span><span><strong>App settings</strong><small>Connection and preferences</small></span></button></div><div className="settings-sidebar-footer"><button className="ghost" onClick={onBack}>← Back to projects</button><button className="settings-disconnect" onClick={onDisconnect}>Disconnect</button></div></aside><section className="settings-content">{section === "engines" ? <EngineSettings capabilities={capabilities} /> : <AppSettings client={client} onDisconnect={onDisconnect} />}</section></div>;
}

function EngineSettings({ capabilities }: { capabilities: Capability[] }) {
  return <section><div className="page-heading"><div><div className="eyebrow">ENGINE CONFIGURATION</div><h1>TTS engines</h1><p className="muted">Review the isolated voice engines connected to your audiobook workspace.</p></div></div>{!capabilities.length && <div className="settings-empty"><span className="settings-empty-icon">◌</span><div><strong>No engines detected</strong><p>Connect an engine container to configure voices and generate narration. Your projects are still available.</p></div></div>}<div className="engine-setting-list">{capabilities.map((capability) => { const healthy = capability.healthy !== false; return <article className="engine-setting-card" key={capability.id}><span className="engine-icon">{capability.display_name.slice(0, 1).toUpperCase()}</span><div className="engine-setting-info"><div className="engine-setting-title"><strong>{capability.display_name}</strong><span className={`status ${healthy ? "status-ready" : "status-failed"}`}>{healthy ? "Available" : "Offline"}</span></div><span>{capability.version} · {capability.requires_gpu ? "GPU engine" : "CPU capable"}</span><small>{capability.supported_languages?.join(", ") || "Languages reported by worker"}</small></div><span className="engine-setting-state">{capability.model_loaded ? "Model loaded" : "Ready to load"}</span></article>; })}</div><div className="settings-note"><span>i</span><p>Engine-specific voice and generation controls are assigned per speaker inside each project.</p></div></section>;
}

function AppSettings({ client, onDisconnect }: { client: ApiClient; onDisconnect: () => void }) {
  return <section><div className="page-heading"><div><div className="eyebrow">APPLICATION SETTINGS</div><h1>Workspace preferences</h1><p className="muted">Manage the connection used by this desktop app.</p></div></div><div className="settings-panels"><div className="panel settings-panel"><div className="settings-panel-heading"><div><h2>Gateway connection</h2><p className="muted">This app is connected to your local or trusted remote server.</p></div><span className="home-badge compact"><span className="status-dot" /> Connected</span></div><div className="setting-row"><div><span>Gateway URL</span><small>The active audiobook backend</small></div><strong>{client.baseUrl}</strong></div><div className="setting-row"><div><span>API token</span><small>Stored securely on this device</small></div><strong>••••••••••••</strong></div><button className="ghost danger-action" onClick={onDisconnect}>Disconnect gateway</button></div><div className="panel settings-panel"><div><h2>Appearance</h2><p className="muted">Keep your writing workspace calm and focused.</p></div><div className="setting-row"><div><span>Theme</span><small>Application color scheme</small></div><strong>Dark studio</strong></div><div className="setting-row"><div><span>Window layout</span><small>Navigation and project panels</small></div><strong>Studio layout</strong></div></div></div></section>;
}

function DocumentsView({ client, project }: { client: ApiClient; project: Project }) {
  const queryClient = useQueryClient();
  const documents = useQuery({ queryKey: ["documents", project.id], queryFn: () => client.documents(project.id), refetchInterval: 1500 });
  const [upload, setUpload] = useState(0);
  const [message, setMessage] = useState("");
  const onFile = async (file: File) => { setMessage(""); try { await client.uploadDocument(project.id, file, setUpload); setMessage("Upload accepted; ingestion is running in the gateway."); void queryClient.invalidateQueries({ queryKey: ["documents", project.id] }); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Upload failed"); } };
  return <section><div className="page-heading"><div><div className="eyebrow">DOCUMENT IMPORT</div><h1>Bring in a book</h1><p className="muted">TXT and selectable-text PDF files are processed incrementally on the server.</p></div><label className="upload-button"><input type="file" accept=".txt,.pdf,text/plain,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); }} />Import document</label></div>{upload > 0 && upload < 100 && <div className="progress"><span style={{ width: `${upload}%` }} /></div>}{message && <div className="info-banner">{message}</div>}<div className="document-list">{documents.data?.map((document) => <article className="document-card" key={document.id}><div><strong>{document.filename}</strong><span>{document.kind.toUpperCase()} · {document.persisted_sentences.toLocaleString()} sentences</span></div><span className={`status status-${document.status}`}>{document.status}</span>{document.error && <small className="error-text">{document.error}</small>}</article>)}</div></section>;
}

function SentencesView({ client, project, capabilities }: { client: ApiClient; project: Project; capabilities: Capability[] }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [engine, setEngine] = useState(capabilities[0]?.id ?? "");
  const [model, setModel] = useState("");
  const [voice, setVoice] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [settingsMessage, setSettingsMessage] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const page = useQuery({ queryKey: ["sentences", project.id, offset, query], queryFn: () => client.sentences(project.id, { offset, limit: 100, query, status: "", speakerId: "" }), refetchInterval: 2000 });
  const speakers = useQuery({ queryKey: ["speakers", project.id], queryFn: () => client.speakers(project.id) });
  const update = async (id: string, changes: { text?: string; speaker_id?: string | null }) => { await client.updateSentence(id, changes); void queryClient.invalidateQueries({ queryKey: ["sentences", project.id] }); };
  const queue = async () => { if (selected.length) { await client.queueGeneration(project.id, selected); setSelected([]); void queryClient.invalidateQueries({ queryKey: ["jobs"] }); } };
  const items = page.data?.items ?? [];
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

  const selectAll = () => { setSelected(items.map((item) => item.id)); setMoreOpen(false); };
  const clearSelection = () => { setSelected([]); setMoreOpen(false); };
  const refresh = () => { void page.refetch(); setMoreOpen(false); };
  return <section className="sentence-workspace"><div className="sentence-header"><div className="sentence-project-details"><span className="project-avatar large">{project.name.slice(0, 1).toUpperCase()}</span><div><div className="eyebrow">{project.document_count} DOCUMENTS · PROJECT</div><h1>{project.name}</h1><span>{(page.data?.total ?? 0).toLocaleString()} sentences · {speakerItems.length} speakers</span></div></div><div className="sentence-header-actions"><label className="search-field"><span>Search sentences</span><input value={query} onChange={(event) => { setOffset(0); setQuery(event.target.value); }} placeholder="Search sentences…" /></label><div className="action-menu-wrap"><button className="ghost" type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>More <span className="menu-chevron">⌄</span></button>{moreOpen && <div className="action-menu" role="menu"><button type="button" onClick={selectAll}>Select all on page</button><button type="button" onClick={clearSelection}>Clear selection</button><button type="button" onClick={refresh}>Refresh sentences</button></div>}</div><button className="primary" disabled={!selected.length} onClick={() => void queue()}>Generate {selected.length || "selected"}</button></div></div><div className="sentence-body"><div className="sentence-main"><div className="sentence-summary"><span>{selected.length ? `${selected.length} selected` : "Select sentences to generate"}</span><span>{page.isFetching ? "Updating…" : `Showing ${items.length ? offset + 1 : 0}–${Math.min(offset + 100, page.data?.total ?? 0)}`}</span></div><SentenceTable sentences={items} speakers={speakerItems} selectedIds={new Set(selected)} onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} loadAudio={(id) => client.audio(id)} onEdit={(sentence, text) => void update(sentence.id, { text })} onSpeaker={(sentence, speaker_id) => void update(sentence.id, { speaker_id: speaker_id || null })} /><div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous</button><span>{offset + 1}–{Math.min(offset + 100, page.data?.total ?? 0)} of {page.data?.total ?? 0}</span><button disabled={offset + 100 >= (page.data?.total ?? 0)} onClick={() => setOffset(offset + 100)}>Next</button></div></div><NarrationSettingsPanel speakers={speakerItems} profile={selectedProfile} capabilities={capabilities} selectedSpeakerId={selectedSpeakerId} onSpeaker={setSelectedSpeakerId} engine={engine} onEngine={(next) => { setEngine(next); setModel(""); setSettings({}); }} model={model} models={models} onModel={setModel} voice={voice} onVoice={setVoice} settings={settings} onSettings={setSettings} message={settingsMessage} saving={savingSettings} onSave={() => void saveSettings()} /></div></section>;
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

function NarrationSettingsPanel({ speakers, profile, capabilities, selectedSpeakerId, onSpeaker, engine, onEngine, model, models, onModel, voice, onVoice, settings, onSettings, message, saving, onSave }: { speakers: { id: string; name: string }[]; profile?: { engine_id: string; voice: string; settings: string }; capabilities: Capability[]; selectedSpeakerId: string; onSpeaker: (id: string) => void; engine: string; onEngine: (id: string) => void; model: string; models: string[]; onModel: (model: string) => void; voice: string; onVoice: (voice: string) => void; settings: Record<string, unknown>; onSettings: (settings: Record<string, unknown>) => void; message: string; saving: boolean; onSave: () => void }) {
  const selectedCapability = capabilities.find((item) => item.id === engine);
  return <aside className="narration-sidebar"><div className="narration-sidebar-heading"><div><div className="eyebrow">VOICE WORKSPACE</div><h2>Narration settings</h2><p>Configure the profile used for generated audio.</p></div><span className="settings-sliders">☷</span></div>{!speakers.length ? <div className="settings-empty compact-empty"><span className="settings-empty-icon">◌</span><div><strong>No speakers yet</strong><p>Add a speaker before assigning an engine.</p></div></div> : <><label>Speaker<select value={selectedSpeakerId} onChange={(event) => onSpeaker(event.target.value)}>{speakers.map((speaker) => <option value={speaker.id} key={speaker.id}>{speaker.name}</option>)}</select></label><label>Engine<select value={engine} onChange={(event) => onEngine(event.target.value)}><option value="">Select engine</option>{capabilities.map((capability) => <option value={capability.id} key={capability.id}>{capability.display_name}</option>)}</select></label><label>Model{models.length ? <select value={model} onChange={(event) => onModel(event.target.value)}><option value="">Engine default model</option>{models.map((item) => <option value={item} key={item}>{item}</option>)}</select> : <input value={model} onChange={(event) => onModel(event.target.value)} placeholder="Engine default model" />}</label><label>Voice or sample ID<input value={voice} onChange={(event) => onVoice(event.target.value)} placeholder="Optional voice identifier" /></label>{selectedCapability && <CapabilitySettings capability={selectedCapability} settings={settings} onChange={onSettings} />}<div className="settings-sidebar-actions"><button className="primary wide" disabled={!engine || saving} onClick={onSave}>{saving ? "Saving…" : "Save settings"}</button>{message && <span className={message.startsWith("Saved") ? "settings-success" : "error-text"}>{message}</span>}</div><div className="settings-note"><span>i</span><p>{profile ? "Changes apply to this speaker's future narration jobs." : "This speaker does not have a saved profile yet."}</p></div></>}</aside>;
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

function HealthView({ client }: { client: ApiClient }) { const health = useQuery({ queryKey: ["health"], queryFn: () => client.health() }); const capabilities = useQuery({ queryKey: ["capabilities"], queryFn: () => client.capabilities() }); return <section><div className="page-heading"><div><div className="eyebrow">ENGINE & GPU HEALTH</div><h1>Server status</h1></div></div><div className="health-grid"><div className="metric-card"><span>Gateway</span><strong>{health.data?.status ?? "checking"}</strong><small>Contract v{health.data?.contract_version ?? "—"}</small></div><div className="metric-card"><span>Storage</span><strong>Connected</strong><small>{health.data?.storage ?? "—"}</small></div><div className="metric-card"><span>Production engines</span><strong>{capabilities.data?.length ?? 0}</strong><small>Discovered by gateway</small></div></div><div className="capability-list">{capabilities.data?.map((capability) => <article className="capability-card" key={capability.id}><strong>{capability.display_name}</strong><span>{capability.version} · {capability.requires_gpu ? "GPU required" : "CPU capable"}</span><small>{capability.supported_languages?.join(", ") || "Languages reported by worker"}</small></article>)}</div></section>; }
