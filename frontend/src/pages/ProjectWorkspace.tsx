import type { ApiClient } from "../api";
import type { Capability, Project, SentencePage } from "../types";
import type { Tab } from "../app-types";
import { DocumentsView } from "../features/documents/DocumentsView";
import { ExportView } from "../features/exports/ExportView";
import { HealthView } from "../features/health/HealthView";
import { QueueView } from "../features/generation-queue/QueueView";
import { SentencesView } from "../features/sentences/SentencesView";
import { SpeakersView } from "../features/speakers/SpeakersView";

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

export { HealthView } from "../features/health/HealthView";
