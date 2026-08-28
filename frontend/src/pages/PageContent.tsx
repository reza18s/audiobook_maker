import type { ApiClient } from "../api";
import type { AppView, SettingsTab, Tab } from "../app-types";
import type { Capability, Project, SentencePage } from "../types";
import { HomeView } from "./HomeView";
import { SettingsView } from "./SettingsView";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { HealthView } from "./ProjectWorkspace";

export type PageContentProps = {
  projects: Project[];
  view: AppView;
  project: Project | null;
  tab: Tab;
  client: ApiClient;
  capabilities: Capability[];
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  onHome: () => void;
  onProject: (project: Project) => void;
  onDisconnect: () => void;
  settingsSidebarOpen: boolean;
  onToggleSettingsSidebar: () => void;
  sentencePage?: SentencePage;
  sentenceIsFetching: boolean;
  sentenceOffset: number;
  sentenceSelected: string[];
  onSentenceOffset: (offset: number) => void;
  onToggleSentence: (id: string) => void;
  narrationSidebarOpen: boolean;
  onToggleNarrationSidebar: () => void;
  onCreateProject: (name: string) => void;
};

export function PageContent({ projects, view, project, tab, client, capabilities, settingsTab, setSettingsTab, onHome, onProject, onDisconnect, settingsSidebarOpen, onToggleSettingsSidebar, sentencePage, sentenceIsFetching, sentenceOffset, sentenceSelected, onSentenceOffset, onToggleSentence, narrationSidebarOpen, onToggleNarrationSidebar, onCreateProject }: PageContentProps) {
  const sentenceView = view === "project" && tab === "sentences";
  return <main className={`content ${sentenceView ? "sentence-content" : ""}`}>{view === "home" && <HomeView projects={projects} onSelect={onProject} onCreate={onCreateProject} />}{view === "settings" && <SettingsView client={client} capabilities={capabilities} section={settingsTab} onSection={setSettingsTab} onBack={onHome} onDisconnect={onDisconnect} sidebarOpen={settingsSidebarOpen} onToggleSidebar={onToggleSettingsSidebar} />}{view === "health" && <HealthView client={client} />}{view === "project" && project && <ProjectWorkspace client={client} project={project} tab={tab} capabilities={capabilities} sentencePage={sentencePage} sentenceIsFetching={sentenceIsFetching} sentenceOffset={sentenceOffset} sentenceSelected={sentenceSelected} onSentenceOffset={onSentenceOffset} onToggleSentence={onToggleSentence} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={onToggleNarrationSidebar} />}</main>;
}
