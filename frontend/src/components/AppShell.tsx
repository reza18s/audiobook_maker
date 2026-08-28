import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClient } from "../api";
import type { AppView, SettingsTab, Tab } from "../app-types";
import { Topbar } from "./AppNavigation";
import { WorkspaceSidebar } from "./AppNavigation";
import { PageContent } from "../pages/PageContent";
import type { Project } from "../types";

export type AppShellProps = {
  client: ApiClient;
  project: Project | null;
  setProject: (project: Project | null) => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
  view: AppView;
  setView: (view: AppView) => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  onDisconnect: () => void;
};

export function AppShell({ client, project, setProject, tab, setTab, view, setView, settingsTab, setSettingsTab, onDisconnect }: AppShellProps) {
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
  const toggleWorkspaceSidebar = () => setWorkspaceSidebarOpen((open) => !open);
  const toggleSettingsSidebar = () => setSettingsSidebarOpen((open) => !open);
  const toggleNarrationSidebar = () => setNarrationSidebarOpen((open) => !open);

  return <div className={`app-shell ${workspaceSidebarOpen ? "" : "workspace-nav-collapsed"}`}><WorkspaceSidebar open={workspaceSidebarOpen} onToggle={toggleWorkspaceSidebar} projects={projects.data ?? []} project={project} view={view} tab={tab} onHome={openHome} onProject={openProject} onTab={(next) => { setTab(next); setView(next === "health" ? "health" : "project"); }} onSettings={openSettings} onDisconnect={onDisconnect} /><div className="app-main"><Topbar view={view} project={project} workspaceSidebarOpen={workspaceSidebarOpen} onToggleWorkspaceSidebar={toggleWorkspaceSidebar} settingsSidebarOpen={settingsSidebarOpen} onToggleSettingsSidebar={toggleSettingsSidebar} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={toggleNarrationSidebar} sentenceView={sentenceView} sentenceTotal={sentencePage.data?.total ?? 0} sentenceSpeakerCount={sentenceSpeakers.data?.items.length ?? 0} sentenceSelectedCount={sentenceSelected.length} sentenceQuery={sentenceQuery} onSentenceQuery={(value) => { setSentenceOffset(0); setSentenceQuery(value); }} sentenceMoreOpen={sentenceMoreOpen} onToggleSentenceMore={() => setSentenceMoreOpen((open) => !open)} onCloseSentenceMore={() => setSentenceMoreOpen(false)} onSelectAllSentences={selectAllSentences} onClearSentenceSelection={clearSentenceSelection} onRefreshSentences={refreshSentences} onGenerateSentences={() => void queueSelectedSentences()} onDisconnect={onDisconnect} /><PageContent projects={projects.data ?? []} view={view} project={project} tab={tab} client={client} capabilities={capabilities.data ?? []} settingsTab={settingsTab} setSettingsTab={setSettingsTab} onHome={openHome} onProject={openProject} onDisconnect={onDisconnect} settingsSidebarOpen={settingsSidebarOpen} onToggleSettingsSidebar={toggleSettingsSidebar} sentencePage={sentencePage.data} sentenceIsFetching={sentencePage.isFetching} sentenceOffset={sentenceOffset} sentenceSelected={sentenceSelected} onSentenceOffset={setSentenceOffset} onToggleSentence={(id) => setSentenceSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={toggleNarrationSidebar} onCreateProject={(name) => createProject.mutate(name)} /></div></div>;
}
