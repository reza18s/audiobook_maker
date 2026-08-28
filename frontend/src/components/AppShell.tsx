import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { ApiClient } from "../api";
import type { AppView, SettingsTab, Tab } from "../app-types";
import { projectTabs } from "../app-types";
import { useAppStore } from "../store";
import { SidebarControlDock, Topbar, WorkspaceSidebar } from "./AppNavigation";
import { PageContent } from "../pages/PageContent";
import type { Project } from "../types";

export type AppShellProps = { client: ApiClient; onDisconnect: () => void };

type RouteState = { view: AppView; tab: Tab; projectId: string | null; settingsTab: SettingsTab };

function routeState(pathname: string): RouteState {
  if (pathname === "/health") return { view: "health", tab: "health", projectId: null, settingsTab: "engines" };
  const settingsMatch = matchPath({ path: "/settings/:section", end: true }, pathname);
  if (settingsMatch) return { view: "settings", tab: "documents", projectId: null, settingsTab: settingsMatch.params.section === "app" ? "app" : "engines" };
  const projectMatch = matchPath({ path: "/projects/:projectId/:tab", end: true }, pathname) ?? matchPath({ path: "/project/:projectId/:tab", end: true }, pathname);
  if (projectMatch) {
    const requestedTab = projectMatch.params.tab as Exclude<Tab, "health">;
    return { view: "project", tab: projectTabs.includes(requestedTab) ? requestedTab : "documents", projectId: projectMatch.params.projectId ?? null, settingsTab: "engines" };
  }
  return { view: "home", tab: "documents", projectId: null, settingsTab: "engines" };
}

export function AppShell({ client, onDisconnect }: AppShellProps) {
  const navigate = useNavigate();
  const route = routeState(useLocation().pathname);
  const queryClient = useQueryClient();
  const workspaceSidebarOpen = useAppStore((state) => state.workspaceSidebarOpen);
  const settingsSidebarOpen = useAppStore((state) => state.settingsSidebarOpen);
  const narrationSidebarOpen = useAppStore((state) => state.narrationSidebarOpen);
  const sentenceQuery = useAppStore((state) => state.sentenceQuery);
  const sentenceOffset = useAppStore((state) => state.sentenceOffset);
  const sentenceSelected = useAppStore((state) => state.sentenceSelected);
  const sentenceMoreOpen = useAppStore((state) => state.sentenceMoreOpen);
  const setWorkspaceSidebarOpen = useAppStore((state) => state.setWorkspaceSidebarOpen);
  const setSettingsSidebarOpen = useAppStore((state) => state.setSettingsSidebarOpen);
  const setNarrationSidebarOpen = useAppStore((state) => state.setNarrationSidebarOpen);
  const setSentenceQuery = useAppStore((state) => state.setSentenceQuery);
  const setSentenceOffset = useAppStore((state) => state.setSentenceOffset);
  const setSentenceSelected = useAppStore((state) => state.setSentenceSelected);
  const setSentenceMoreOpen = useAppStore((state) => state.setSentenceMoreOpen);
  const resetSentenceState = useAppStore((state) => state.resetSentenceState);
  const sentenceView = route.view === "project" && route.tab === "sentences";
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => client.projects() });
  const capabilities = useQuery({ queryKey: ["capabilities"], queryFn: () => client.capabilities() });
  const project = projects.data?.find((item) => item.id === route.projectId) ?? null;
  const sentencePage = useQuery({ queryKey: ["sentences", project?.id ?? "", sentenceOffset, sentenceQuery], queryFn: () => client.sentences(project!.id, { offset: sentenceOffset, limit: 100, query: sentenceQuery, status: "", speakerId: "" }), enabled: sentenceView && Boolean(project), refetchInterval: sentenceView ? 2000 : false });
  const sentenceSpeakers = useQuery({ queryKey: ["speakers", project?.id ?? ""], queryFn: () => client.speakers(project!.id), enabled: sentenceView && Boolean(project) });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const sync = () => setWorkspaceSidebarOpen(!media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [setWorkspaceSidebarOpen]);
  useEffect(() => {
    const stop = client.events(() => { void queryClient.invalidateQueries({ queryKey: ["jobs"] }); });
    return stop;
  }, [client, queryClient]);
  useEffect(() => {
    const closeDrawersOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || sentenceMoreOpen) return;
      if (sentenceView && narrationSidebarOpen) { setNarrationSidebarOpen(false); return; }
      if (route.view === "settings" && settingsSidebarOpen) { setSettingsSidebarOpen(false); return; }
      if (window.matchMedia("(max-width: 760px)").matches && workspaceSidebarOpen) setWorkspaceSidebarOpen(false);
    };
    window.addEventListener("keydown", closeDrawersOnEscape);
    return () => window.removeEventListener("keydown", closeDrawersOnEscape);
  }, [sentenceMoreOpen, sentenceView, narrationSidebarOpen, route.view, settingsSidebarOpen, workspaceSidebarOpen, setNarrationSidebarOpen, setSettingsSidebarOpen, setWorkspaceSidebarOpen]);

  const resetAndNavigate = (path: string) => { resetSentenceState(); navigate(path); };
  const openHome = () => resetAndNavigate("/home");
  const openProject = (next: Project) => resetAndNavigate(`/projects/${encodeURIComponent(next.id)}/documents`);
  const openSettings = (section: SettingsTab = "engines") => navigate(`/settings/${section}`);
  const createProject = useMutation({ mutationFn: (name: string) => client.createProject(name), onSuccess: (created) => { void queryClient.invalidateQueries({ queryKey: ["projects"] }); resetAndNavigate(`/projects/${encodeURIComponent(created.id)}/documents`); } });

  if (projects.isLoading) return <div className="loading">Loading projects…</div>;
  if (projects.isError) return <div className="loading"><div className="error-banner">{(projects.error as Error).message}</div><button type="button" onClick={onDisconnect}>Back to connection</button></div>;
  const sentenceItems = sentencePage.data?.items ?? [];
  const queueSelectedSentences = async () => { if (!project || !sentenceSelected.length) return; await client.queueGeneration(project.id, sentenceSelected); setSentenceSelected([]); void queryClient.invalidateQueries({ queryKey: ["jobs"] }); void queryClient.invalidateQueries({ queryKey: ["sentences", project.id] }); };
  const selectAllSentences = () => { setSentenceSelected(sentenceItems.map((item) => item.id)); setSentenceMoreOpen(false); };
  const clearSentenceSelection = () => { setSentenceSelected([]); setSentenceMoreOpen(false); };
  const refreshSentences = () => { void sentencePage.refetch(); setSentenceMoreOpen(false); };
  const toggleWorkspaceSidebar = () => setWorkspaceSidebarOpen((open) => !open);
  const toggleSettingsSidebar = () => setSettingsSidebarOpen((open) => !open);
  const toggleNarrationSidebar = () => setNarrationSidebarOpen((open) => !open);
  return <div className={`app-shell ${workspaceSidebarOpen ? "" : "workspace-nav-collapsed"}`}>
    <WorkspaceSidebar open={workspaceSidebarOpen} onToggle={toggleWorkspaceSidebar} projects={projects.data ?? []} project={project} view={route.view} tab={route.tab} onHome={openHome} onProject={openProject} onTab={(next) => navigate(next === "health" ? "/health" : `/projects/${encodeURIComponent(project!.id)}/${next}`)} onSettings={openSettings} />
    <div className="app-main">
      <Topbar view={route.view} project={project} settingsSidebarOpen={settingsSidebarOpen} onToggleSettingsSidebar={toggleSettingsSidebar} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={toggleNarrationSidebar} sentenceView={sentenceView} sentenceTotal={sentencePage.data?.total ?? 0} sentenceSpeakerCount={sentenceSpeakers.data?.items.length ?? 0} sentenceSelectedCount={sentenceSelected.length} sentenceQuery={sentenceQuery} onSentenceQuery={setSentenceQuery} sentenceMoreOpen={sentenceMoreOpen} onToggleSentenceMore={() => setSentenceMoreOpen((open) => !open)} onCloseSentenceMore={() => setSentenceMoreOpen(false)} onSelectAllSentences={selectAllSentences} onClearSentenceSelection={clearSentenceSelection} onRefreshSentences={refreshSentences} onGenerateSentences={() => void queueSelectedSentences()} />
      <PageContent projects={projects.data ?? []} view={route.view} project={project} tab={route.tab} client={client} capabilities={capabilities.data ?? []} settingsTab={route.settingsTab} setSettingsTab={openSettings} onHome={openHome} onProject={openProject} onDisconnect={onDisconnect} settingsSidebarOpen={settingsSidebarOpen} onToggleSettingsSidebar={toggleSettingsSidebar} sentencePage={sentencePage.data} sentenceIsFetching={sentencePage.isFetching} sentenceOffset={sentenceOffset} sentenceSelected={sentenceSelected} onSentenceOffset={setSentenceOffset} onToggleSentence={(id) => setSentenceSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={toggleNarrationSidebar} onCreateProject={(name) => createProject.mutate(name)} />
    </div>
    {route.view === "settings" && <SidebarControlDock settingsSidebarOpen={settingsSidebarOpen} onToggleSettingsSidebar={toggleSettingsSidebar} />}
  </div>;
}
