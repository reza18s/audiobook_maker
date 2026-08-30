import type { ApiClient } from "../api";
import type { AppView, SettingsTab, Tab } from "../app-types";
import type { Capability, Chapter, Health, Project, SentencePage } from "../types";
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
  health?: Health;
  healthLoading: boolean;
  healthError: boolean;
  capabilitiesLoading: boolean;
  capabilitiesError: boolean;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  onHome: () => void;
  onProject: (project: Project) => void;
  onDisconnect: () => void;
  settingsSidebarOpen: boolean;
  onToggleSettingsSidebar: () => void;
  sentencePage?: SentencePage;
  sentenceIsFetching: boolean;
  chapters: Chapter[];
  sentenceChapter: Chapter | null;
  sentenceChapterIndex: number;
  onSentenceChapterIndex: (index: number) => void;
  sentenceSelected: string[];
  onToggleSentence: (id: string) => void;
  narrationSidebarOpen: boolean;
  onToggleNarrationSidebar: () => void;
  onCreateProject: (name: string) => void;
  onUpdateProject: (projectId: string, name: string) => void;
  onDeleteProject: (projectId: string) => void;
  projectActionPending: boolean;
  projectActionError: string;
};

export function PageContent({ projects, view, project, tab, client, capabilities, health, healthLoading, healthError, capabilitiesLoading, capabilitiesError, settingsTab, setSettingsTab, onHome, onProject, onDisconnect, settingsSidebarOpen, onToggleSettingsSidebar, sentencePage, sentenceIsFetching, chapters, sentenceChapter, sentenceChapterIndex, onSentenceChapterIndex, sentenceSelected, onToggleSentence, narrationSidebarOpen, onToggleNarrationSidebar, onCreateProject, onUpdateProject, onDeleteProject, projectActionPending, projectActionError }: PageContentProps) {
  const sentenceView = view === "project" && tab === "sentences";
  return <main className={`content ${sentenceView ? "sentence-content" : ""}`}>{view === "home" && <HomeView projects={projects} onSelect={onProject} onCreate={onCreateProject} onUpdate={onUpdateProject} onDelete={onDeleteProject} health={health} healthLoading={healthLoading} healthError={healthError} capabilitiesLoading={capabilitiesLoading} capabilitiesError={capabilitiesError} engineCount={capabilities.length} healthyEngineCount={capabilities.filter((capability) => capability.healthy !== false).length} actionPending={projectActionPending} actionError={projectActionError} />}{view === "settings" && <SettingsView client={client} capabilities={capabilities} section={settingsTab} onSection={setSettingsTab} onBack={onHome} onDisconnect={onDisconnect} sidebarOpen={settingsSidebarOpen} onToggleSidebar={onToggleSettingsSidebar} />}{view === "health" && <HealthView client={client} />}{view === "project" && project && <ProjectWorkspace client={client} project={project} tab={tab} capabilities={capabilities} sentencePage={sentencePage} sentenceIsFetching={sentenceIsFetching} chapters={chapters} sentenceChapter={sentenceChapter} sentenceChapterIndex={sentenceChapterIndex} onSentenceChapterIndex={onSentenceChapterIndex} sentenceSelected={sentenceSelected} onToggleSentence={onToggleSentence} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={onToggleNarrationSidebar} />}</main>;
}
