import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClient } from "./api";
import { loadToken, saveToken } from "./secureToken";
import { SentenceTable } from "./SentenceTable";
import type { Capability, Project, SentencePage } from "./types";
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
  return <AppShell client={client} project={selectedProject} setProject={setSelectedProject} tab={tab} setTab={setTab} view={view} setView={setView} settingsTab={settingsTab} setSettingsTab={setSettingsTab} onDisconnect={() => setClient(null)} />;
}

function ConnectionScreen({ baseUrl, token, error, onUrl, onToken, onConnect }: { baseUrl: string; token: string; error: string; onUrl: (value: string) => void; onToken: (value: string) => void; onConnect: () => void }) {
  return <main className="connection-page"><section className="connection-card"><div className="eyebrow">AUDIOBOOK MAKER</div><h1>Connect your workspace</h1><p className="muted">Connect to the gateway running locally or on your trusted Tailscale server.</p><label>Gateway URL<input value={baseUrl} onChange={(event) => onUrl(event.target.value)} placeholder="http://localhost:8000" /></label><label>API token<input value={token} onChange={(event) => onToken(event.target.value)} type="password" placeholder="Stored in Windows Credential Manager" /></label>{error && <div className="error-banner">{error}</div>}<button className="primary wide" onClick={onConnect}>Connect securely</button></section></main>;
}

function AppShell({ client, project, setProject, tab, setTab, view, setView, settingsTab, setSettingsTab, onDisconnect }: { client: ApiClient; project: Project | null; setProject: (project: Project | null) => void; tab: Tab; setTab: (tab: Tab) => void; view: AppView; setView: (view: AppView) => void; settingsTab: SettingsTab; setSettingsTab: (tab: SettingsTab) => void; onDisconnect: () => void }) {
  const queryClient = useQueryClient();
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(true);
  const [settingsSidebarOpen, setSettingsSidebarOpen] = useState(true);
  const [narrationSidebarOpen, setNarrationSidebarOpen] = useState(true);
  const [sentenceQuery, setSentenceQuery] = useState("");
  const [sentenceOffset, setSentenceOffset] = useState(0);
  const [sentenceSelected, setSentenceSelected] = useState<string[]>([]);
  const [sentenceMoreOpen, setSentenceMoreOpen] = useState(false);
  const sentenceView = view === "project" && tab === "sentences";
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => client.projects() });
  const capabilities = useQuery({ queryKey: ["capabilities"], queryFn: () => client.capabilities() });
  const sentencePage = useQuery({ queryKey: ["sentences", project?.id ?? "", sentenceOffset, sentenceQuery], queryFn: () => client.sentences(project!.id, { offset: sentenceOffset, limit: 100, query: sentenceQuery, status: "", speakerId: "" }), enabled: sentenceView && Boolean(project), refetchInterval: sentenceView ? 2000 : false });
  const sentenceSpeakers = useQuery({ queryKey: ["speakers", project?.id ?? ""], queryFn: () => client.speakers(project!.id), enabled: sentenceView && Boolean(project) });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const sync = () => setWorkspaceSidebarOpen(!media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => { const stop = client.events(() => { void queryClient.invalidateQueries({ queryKey: ["jobs"] }); }); return stop; }, [client, queryClient]);
  useEffect(() => {
    const closeDrawersOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || sentenceMoreOpen) return;
      if (sentenceView && narrationSidebarOpen) { setNarrationSidebarOpen(false); return; }
      if (view === "settings" && settingsSidebarOpen) { setSettingsSidebarOpen(false); return; }
      if (window.matchMedia("(max-width: 760px)").matches && workspaceSidebarOpen) setWorkspaceSidebarOpen(false);
    };
    window.addEventListener("keydown", closeDrawersOnEscape);
    return () => window.removeEventListener("keydown", closeDrawersOnEscape);
  }, [sentenceMoreOpen, sentenceView, narrationSidebarOpen, view, settingsSidebarOpen, workspaceSidebarOpen]);

  const resetSentenceState = () => { setSentenceQuery(""); setSentenceOffset(0); setSentenceSelected([]); setSentenceMoreOpen(false); };
  const createProject = useMutation({ mutationFn: (name: string) => client.createProject(name), onSuccess: (created) => { void queryClient.invalidateQueries({ queryKey: ["projects"] }); resetSentenceState(); setProject(created); setTab("documents"); setView("project"); } });

  if (projects.isLoading) return <div className="loading">Loading projects…</div>;
  if (projects.isError) return <div className="loading"><div className="error-banner">{(projects.error as Error).message}</div><button type="button" onClick={onDisconnect}>Back to connection</button></div>;

  const openHome = () => { resetSentenceState(); setProject(null); setView("home"); };
  const openProject = (next: Project) => { resetSentenceState(); setProject(next); setTab("documents"); setView("project"); };
  const openSettings = (section: SettingsTab = "engines") => { setSettingsTab(section); setView("settings"); };
  const sentenceItems = sentencePage.data?.items ?? [];
  const queueSelectedSentences = async () => { if (!project || !sentenceSelected.length) return; await client.queueGeneration(project.id, sentenceSelected); setSentenceSelected([]); void queryClient.invalidateQueries({ queryKey: ["jobs"] }); void queryClient.invalidateQueries({ queryKey: ["sentences", project.id] }); };
  const selectAllSentences = () => { setSentenceSelected(sentenceItems.map((item) => item.id)); setSentenceMoreOpen(false); };
  const clearSentenceSelection = () => { setSentenceSelected([]); setSentenceMoreOpen(false); };
  const refreshSentences = () => { void sentencePage.refetch(); setSentenceMoreOpen(false); };

  return <div className={`app-shell ${workspaceSidebarOpen ? "" : "workspace-nav-collapsed"}`}><WorkspaceSidebar open={workspaceSidebarOpen} onToggle={() => setWorkspaceSidebarOpen((open) => !open)} projects={projects.data ?? []} project={project} view={view} tab={tab} onHome={openHome} onProject={openProject} onTab={(next) => { setTab(next); setView(next === "health" ? "health" : "project"); }} onSettings={openSettings} onDisconnect={onDisconnect} /><div className="app-main"><Topbar view={view} project={project} workspaceSidebarOpen={workspaceSidebarOpen} onToggleWorkspaceSidebar={() => setWorkspaceSidebarOpen((open) => !open)} settingsSidebarOpen={settingsSidebarOpen} onToggleSettingsSidebar={() => setSettingsSidebarOpen((open) => !open)} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={() => setNarrationSidebarOpen((open) => !open)} sentenceView={sentenceView} sentenceTotal={sentencePage.data?.total ?? 0} sentenceSpeakerCount={sentenceSpeakers.data?.items.length ?? 0} sentenceSelectedCount={sentenceSelected.length} sentenceQuery={sentenceQuery} onSentenceQuery={(value) => { setSentenceOffset(0); setSentenceQuery(value); }} sentenceMoreOpen={sentenceMoreOpen} onToggleSentenceMore={() => setSentenceMoreOpen((open) => !open)} onCloseSentenceMore={() => setSentenceMoreOpen(false)} onSelectAllSentences={selectAllSentences} onClearSentenceSelection={clearSentenceSelection} onRefreshSentences={refreshSentences} onGenerateSentences={() => void queueSelectedSentences()} onDisconnect={onDisconnect} /><PageContent projects={projects.data ?? []} view={view} project={project} tab={tab} client={client} capabilities={capabilities.data ?? []} settingsTab={settingsTab} setSettingsTab={setSettingsTab} onHome={openHome} onProject={openProject} onDisconnect={onDisconnect} settingsSidebarOpen={settingsSidebarOpen} onToggleSettingsSidebar={() => setSettingsSidebarOpen((open) => !open)} sentencePage={sentencePage.data} sentenceIsFetching={sentencePage.isFetching} sentenceOffset={sentenceOffset} sentenceSelected={sentenceSelected} onSentenceOffset={setSentenceOffset} onToggleSentence={(id) => setSentenceSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={() => setNarrationSidebarOpen((open) => !open)} onCreateProject={(name) => createProject.mutate(name)} /></div></div>;
}

function SidebarToggle({ open, onClick, label, controls }: { open: boolean; onClick: () => void; label: string; controls: string }) {
  return <button className="ghost sidebar-toggle" type="button" aria-label={`${open ? "Close" : "Open"} ${label} sidebar`} aria-expanded={open} aria-controls={controls} title={`${open ? "Hide" : "Show"} ${label}`} onClick={onClick}><span aria-hidden="true">{open ? "‹" : "›"}</span><span className="toggle-label">{open ? "Hide" : "Show"} {label}</span></button>;
}

function Topbar({ view, project, workspaceSidebarOpen, onToggleWorkspaceSidebar, settingsSidebarOpen, onToggleSettingsSidebar, narrationSidebarOpen, onToggleNarrationSidebar, sentenceView, sentenceTotal, sentenceSpeakerCount, sentenceSelectedCount, sentenceQuery, onSentenceQuery, sentenceMoreOpen, onToggleSentenceMore, onCloseSentenceMore, onSelectAllSentences, onClearSentenceSelection, onRefreshSentences, onGenerateSentences, onDisconnect }: { view: AppView; project: Project | null; workspaceSidebarOpen: boolean; onToggleWorkspaceSidebar: () => void; settingsSidebarOpen: boolean; onToggleSettingsSidebar: () => void; narrationSidebarOpen: boolean; onToggleNarrationSidebar: () => void; sentenceView: boolean; sentenceTotal: number; sentenceSpeakerCount: number; sentenceSelectedCount: number; sentenceQuery: string; onSentenceQuery: (value: string) => void; sentenceMoreOpen: boolean; onToggleSentenceMore: () => void; onCloseSentenceMore: () => void; onSelectAllSentences: () => void; onClearSentenceSelection: () => void; onRefreshSentences: () => void; onGenerateSentences: () => void; onDisconnect: () => void }) {
  const pageTitle = view === "home" ? "Your projects" : view === "settings" ? "Settings" : view === "health" ? "Server health" : project?.name ?? "Project";
  return <header className={`topbar ${sentenceView ? "sentence-topbar" : ""}`}>{sentenceView && project ? <><div className="topbar-leading"><SidebarToggle open={workspaceSidebarOpen} onClick={onToggleWorkspaceSidebar} label="navigation" controls="workspace-sidebar" /></div><div className="sentence-project-details"><span className="project-avatar large">{project.name.slice(0, 1).toUpperCase()}</span><div><div className="eyebrow">{project.document_count} DOCUMENTS · PROJECT</div><h1>{project.name}</h1><span>{sentenceTotal.toLocaleString()} sentences · {sentenceSpeakerCount.toLocaleString()} speakers</span></div></div><TopbarActions query={sentenceQuery} onQuery={onSentenceQuery} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={onToggleNarrationSidebar} moreOpen={sentenceMoreOpen} onToggleMore={onToggleSentenceMore} onCloseMore={onCloseSentenceMore} onSelectAll={onSelectAllSentences} onClearSelection={onClearSentenceSelection} onRefresh={onRefreshSentences} selectedCount={sentenceSelectedCount} canSelectAll={Boolean(sentenceTotal)} onGenerate={onGenerateSentences} onDisconnect={onDisconnect} /></> : <><div className="topbar-leading"><SidebarToggle open={workspaceSidebarOpen} onClick={onToggleWorkspaceSidebar} label="navigation" controls="workspace-sidebar" /><div><div className="eyebrow">AUDIOBOOK MAKER</div><strong>{pageTitle}</strong></div></div><div className="topbar-actions">{view === "settings" && <SidebarToggle open={settingsSidebarOpen} onClick={onToggleSettingsSidebar} label="sections" controls="settings-sidebar" />}<span className="connection-status"><span className="status-dot" /> Gateway connected</span><button className="ghost" type="button" onClick={onDisconnect}>Disconnect</button></div></>}</header>;
}

function TopbarActions({ query, onQuery, narrationSidebarOpen, onToggleNarrationSidebar, moreOpen, onToggleMore, onCloseMore, onSelectAll, onClearSelection, onRefresh, selectedCount, canSelectAll, onGenerate, onDisconnect }: { query: string; onQuery: (value: string) => void; narrationSidebarOpen: boolean; onToggleNarrationSidebar: () => void; moreOpen: boolean; onToggleMore: () => void; onCloseMore: () => void; onSelectAll: () => void; onClearSelection: () => void; onRefresh: () => void; selectedCount: number; canSelectAll: boolean; onGenerate: () => void; onDisconnect: () => void }) {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => { onCloseMore(); moreButtonRef.current?.focus(); };
  const toggleMenu = () => { if (moreOpen) closeMenu(); else onToggleMore(); };
  const selectAll = () => { onSelectAll(); closeMenu(); };
  const clearSelection = () => { onClearSelection(); closeMenu(); };
  const refresh = () => { onRefresh(); closeMenu(); };
  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !moreButtonRef.current?.contains(target)) closeMenu();
    };
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => { window.removeEventListener("keydown", closeOnEscape); document.removeEventListener("mousedown", closeOnOutsideClick); };
  }, [moreOpen, onCloseMore]);
  return <div className="topbar-actions sentence-topbar-actions"><label className="search-field"><span>Search sentences</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search sentences…" /></label><SidebarToggle open={narrationSidebarOpen} onClick={onToggleNarrationSidebar} label="narration settings" controls="narration-sidebar" /><div className="action-menu-wrap"><button ref={moreButtonRef} className="ghost" type="button" aria-expanded={moreOpen} aria-haspopup="menu" aria-controls="sentence-more-menu" onClick={toggleMenu}>More <span className="menu-chevron">⌄</span></button>{moreOpen && <div ref={menuRef} id="sentence-more-menu" className="action-menu" role="menu"><button type="button" role="menuitem" disabled={!canSelectAll} onClick={selectAll}>Select all on page</button><button type="button" role="menuitem" disabled={!selectedCount} onClick={clearSelection}>Clear selection</button><button type="button" role="menuitem" onClick={refresh}>Refresh sentences</button></div>}</div><button className="primary" type="button" disabled={!selectedCount} onClick={onGenerate}>Generate {selectedCount || "selected"}</button><span className="connection-status compact-connection" role="status" aria-live="polite"><span className="status-dot" /> Connected</span><button className="ghost sentence-disconnect" type="button" onClick={onDisconnect}>Disconnect</button></div>;
}

function PageContent({ projects, view, project, tab, client, capabilities, settingsTab, setSettingsTab, onHome, onProject, onDisconnect, settingsSidebarOpen, onToggleSettingsSidebar, sentencePage, sentenceIsFetching, sentenceOffset, sentenceSelected, onSentenceOffset, onToggleSentence, narrationSidebarOpen, onToggleNarrationSidebar, onCreateProject }: { projects: Project[]; view: AppView; project: Project | null; tab: Tab; client: ApiClient; capabilities: Capability[]; settingsTab: SettingsTab; setSettingsTab: (tab: SettingsTab) => void; onHome: () => void; onProject: (project: Project) => void; onDisconnect: () => void; settingsSidebarOpen: boolean; onToggleSettingsSidebar: () => void; sentencePage?: SentencePage; sentenceIsFetching: boolean; sentenceOffset: number; sentenceSelected: string[]; onSentenceOffset: (offset: number) => void; onToggleSentence: (id: string) => void; narrationSidebarOpen: boolean; onToggleNarrationSidebar: () => void; onCreateProject: (name: string) => void }) {
  const sentenceView = view === "project" && tab === "sentences";
  return <main className={`content ${sentenceView ? "sentence-content" : ""}`}>{view === "home" && <HomeView projects={projects} onSelect={onProject} onCreate={onCreateProject} />}{view === "settings" && <SettingsView client={client} capabilities={capabilities} section={settingsTab} onSection={setSettingsTab} onBack={onHome} onDisconnect={onDisconnect} sidebarOpen={settingsSidebarOpen} onToggleSidebar={onToggleSettingsSidebar} />}{view === "health" && <HealthView client={client} />}{view === "project" && project && <ProjectWorkspace client={client} project={project} tab={tab} capabilities={capabilities} sentencePage={sentencePage} sentenceIsFetching={sentenceIsFetching} sentenceOffset={sentenceOffset} sentenceSelected={sentenceSelected} onSentenceOffset={onSentenceOffset} onToggleSentence={onToggleSentence} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={onToggleNarrationSidebar} />}</main>;
}

function WorkspaceSidebar({ open, onToggle, projects, project, view, tab, onHome, onProject, onTab, onSettings, onDisconnect }: { open: boolean; onToggle: () => void; projects: Project[]; project: Project | null; view: AppView; tab: Tab; onHome: () => void; onProject: (project: Project) => void; onTab: (tab: Tab) => void; onSettings: (section?: SettingsTab) => void; onDisconnect: () => void }) {
  const projectTabs: Array<{ id: Exclude<Tab, "health">; icon: string }> = [
    { id: "documents", icon: "▣" },
    { id: "sentences", icon: "≡" },
    { id: "speakers", icon: "◉" },
    { id: "queue", icon: "↗" },
    { id: "export", icon: "⇩" },
  ];
  return <aside id="workspace-sidebar" className="workspace-sidebar" aria-label="Workspace navigation"><div className="sidebar-brand"><span className="brand-mark">AM</span><div><strong>Audiobook</strong><span>Maker Studio</span></div><button className="sidebar-collapse-button" type="button" aria-label={`${open ? "Collapse" : "Expand"} workspace sidebar`} aria-expanded={open} aria-controls="workspace-sidebar" title={`${open ? "Collapse" : "Expand"} workspace sidebar`} onClick={onToggle}><span aria-hidden="true">{open ? "‹" : "›"}</span></button></div><nav className="sidebar-nav" aria-label="Primary navigation"><button className={`sidebar-item ${view === "home" ? "active" : ""}`} type="button" data-tooltip="Home" onClick={onHome}><span className="nav-icon" aria-hidden="true">⌂</span><span className="sidebar-label">Home</span></button></nav><div className="sidebar-section"><div className="sidebar-section-title"><span className="sidebar-label">Projects</span><span className="sidebar-count" aria-label={`${projects.length} projects`}>{projects.length}</span></div><div className="project-nav-list">{projects.map((item) => <button className={`sidebar-item project-item ${view === "project" && project?.id === item.id ? "active" : ""}`} type="button" data-tooltip={item.name} key={item.id} onClick={() => onProject(item)}><span className="project-avatar" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span><span className="project-nav-name sidebar-label">{item.name}</span><span className="project-nav-count">{item.document_count}</span></button>)}{!projects.length && <span className="sidebar-empty">Create your first audiobook project.</span>}</div></div>{view === "project" && project && <div className="sidebar-section project-navigation"><div className="sidebar-section-title"><span className="sidebar-label">Current project</span></div>{projectTabs.map((item) => <button className={`sidebar-item nested-item ${tab === item.id ? "active" : ""}`} type="button" data-tooltip={item.id[0].toUpperCase() + item.id.slice(1)} key={item.id} onClick={() => onTab(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span className="sidebar-label">{item.id[0].toUpperCase() + item.id.slice(1)}</span></button>)}</div>}<div className="sidebar-spacer" /><div className="sidebar-section sidebar-bottom"><div className="sidebar-section-title"><span className="sidebar-label">System</span></div><button className={`sidebar-item ${view === "health" ? "active" : ""}`} type="button" data-tooltip="Server health" onClick={() => onTab("health")}><span className="nav-icon" aria-hidden="true">◌</span><span className="sidebar-label">Server health</span></button><button className={`sidebar-item ${view === "settings" ? "active" : ""}`} type="button" data-tooltip="Settings" onClick={() => onSettings()}><span className="nav-icon" aria-hidden="true">⚙</span><span className="sidebar-label">Settings</span></button><button className="sidebar-item disconnect-item" type="button" data-tooltip="Disconnect" onClick={onDisconnect}><span className="nav-icon" aria-hidden="true">↪</span><span className="sidebar-label">Disconnect</span></button></div></aside>;
}

function ProjectWorkspace({ client, project, tab, capabilities, sentencePage, sentenceIsFetching, sentenceOffset, sentenceSelected, onSentenceOffset, onToggleSentence, narrationSidebarOpen, onToggleNarrationSidebar }: { client: ApiClient; project: Project; tab: Tab; capabilities: Capability[]; sentencePage?: SentencePage; sentenceIsFetching?: boolean; sentenceOffset?: number; sentenceSelected?: string[]; onSentenceOffset?: (offset: number) => void; onToggleSentence?: (id: string) => void; narrationSidebarOpen?: boolean; onToggleNarrationSidebar?: () => void }) {
  return <>{tab === "documents" && <DocumentsView client={client} project={project} />}{tab === "sentences" && <SentencesView client={client} project={project} capabilities={capabilities} sentencePage={sentencePage} sentenceIsFetching={sentenceIsFetching ?? false} offset={sentenceOffset ?? 0} selected={sentenceSelected ?? []} onOffset={onSentenceOffset ?? (() => undefined)} onToggleSentence={onToggleSentence ?? (() => undefined)} narrationSidebarOpen={narrationSidebarOpen ?? true} onToggleNarrationSidebar={onToggleNarrationSidebar ?? (() => undefined)} />}{tab === "speakers" && <SpeakersView client={client} project={project} capabilities={capabilities} />}{tab === "queue" && <QueueView client={client} />}{tab === "export" && <ExportView client={client} project={project} />}</>;
}

function HomeView({ projects, onSelect, onCreate }: { projects: Project[]; onSelect: (project: Project) => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  const documents = projects.reduce((total, project) => total + project.document_count, 0);
  const sentences = projects.reduce((total, project) => total + project.sentence_count, 0);
  return <section className="home-view"><div className="page-heading home-heading"><div><div className="eyebrow">WORKSPACE OVERVIEW</div><h1>Good to see you.</h1><p className="muted">Choose a project to continue writing, narrating, and exporting your audiobook.</p></div><div className="home-badge"><span className="status-dot" /> All systems connected</div></div><div className="overview-strip"><div><span>Projects</span><strong>{projects.length}</strong><small>Your audiobook workspaces</small></div><div><span>Documents</span><strong>{documents.toLocaleString()}</strong><small>Imported source files</small></div><div><span>Sentences</span><strong>{sentences.toLocaleString()}</strong><small>Ready to narrate</small></div></div><div className="section-heading"><div><div className="eyebrow">YOUR LIBRARY</div><h2>All projects</h2></div><span className="muted">Select a project from the cards or the sidebar.</span></div><div className="project-grid">{projects.map((project) => <button className="project-card" key={project.id} onClick={() => onSelect(project)}><span className="project-card-top"><span className="project-avatar large">{project.name.slice(0, 1).toUpperCase()}</span><span className="project-arrow">→</span></span><strong>{project.name}</strong><span>{project.document_count} documents · {project.sentence_count.toLocaleString()} sentences</span><small>Updated {new Date(project.updated_at).toLocaleDateString()}</small></button>)}<form className="project-card new-project" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { onCreate(name.trim()); setName(""); } }}><span className="new-project-icon">+</span><strong>Start a new project</strong><span>Give your next audiobook a home.</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" /><button className="primary" type="submit">Create workspace</button></form></div></section>;
}

function SettingsView({ client, capabilities, section, onSection, onBack, onDisconnect, sidebarOpen, onToggleSidebar }: { client: ApiClient; capabilities: Capability[]; section: SettingsTab; onSection: (section: SettingsTab) => void; onBack: () => void; onDisconnect: () => void; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  return <div className={`settings-shell ${sidebarOpen ? "" : "settings-sidebar-closed"}`}><SettingsSidebar section={section} onSection={onSection} onBack={onBack} onDisconnect={onDisconnect} onToggle={onToggleSidebar} /><section className="settings-content">{section === "engines" ? <EngineSettings capabilities={capabilities} /> : <AppSettings client={client} onDisconnect={onDisconnect} />}</section></div>;
}

function SettingsSidebar({ section, onSection, onBack, onDisconnect, onToggle }: { section: SettingsTab; onSection: (section: SettingsTab) => void; onBack: () => void; onDisconnect: () => void; onToggle: () => void }) {
  return <aside id="settings-sidebar" className="settings-sidebar" aria-label="Settings navigation"><div className="settings-sidebar-heading"><span className="nav-icon" aria-hidden="true">⚙</span><div><strong>Settings</strong><span>Workspace preferences</span></div><button className="settings-sliders" type="button" aria-label="Close settings sidebar" aria-expanded="true" aria-controls="settings-sidebar" title="Close settings sidebar" onClick={onToggle}>☷</button></div><nav id="settings-sidebar-content" className="settings-nav" aria-label="Settings sections"><button className={`settings-nav-item ${section === "engines" ? "active" : ""}`} type="button" onClick={() => onSection("engines")}><span className="nav-icon" aria-hidden="true">◈</span><span><strong>Engine settings</strong><small>Models and availability</small></span></button><button className={`settings-nav-item ${section === "app" ? "active" : ""}`} type="button" onClick={() => onSection("app")}><span className="nav-icon" aria-hidden="true">⌘</span><span><strong>App settings</strong><small>Connection and preferences</small></span></button></nav><div className="settings-sidebar-footer"><button className="ghost" type="button" onClick={onBack}>← Back to projects</button><button className="settings-disconnect" type="button" onClick={onDisconnect}>Disconnect</button></div></aside>;
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

function HealthView({ client }: { client: ApiClient }) { const health = useQuery({ queryKey: ["health"], queryFn: () => client.health() }); const capabilities = useQuery({ queryKey: ["capabilities"], queryFn: () => client.capabilities() }); return <section><div className="page-heading"><div><div className="eyebrow">ENGINE & GPU HEALTH</div><h1>Server status</h1></div></div><div className="health-grid"><div className="metric-card"><span>Gateway</span><strong>{health.data?.status ?? "checking"}</strong><small>Contract v{health.data?.contract_version ?? "—"}</small></div><div className="metric-card"><span>Storage</span><strong>Connected</strong><small>{health.data?.storage ?? "—"}</small></div><div className="metric-card"><span>Production engines</span><strong>{capabilities.data?.length ?? 0}</strong><small>Discovered by gateway</small></div></div><div className="capability-list">{capabilities.data?.map((capability) => <article className="capability-card" key={capability.id}><strong>{capability.display_name}</strong><span>{capability.version} · {capability.requires_gpu ? "GPU required" : "CPU capable"}</span><small>{capability.supported_languages?.join(", ") || "Languages reported by worker"}</small></article>)}</div></section>; }
