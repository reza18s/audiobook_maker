import type { ApiClient } from "../api";
import type { Capability, Chapter, Project, SentencePage } from "../types";
import type { Tab } from "../app-types";
import { DocumentsView } from "../features/documents/DocumentsView";
import { ExportView } from "../features/exports/ExportView";
import { HealthView } from "../features/health/HealthView";
import { QueueView } from "../features/generation-queue/QueueView";
import { OverviewView } from "../features/overview/OverviewView";
import { SentencesView } from "../features/sentences/SentencesView";
import { SpeakersView } from "../features/speakers/SpeakersView";

export type SentencePageState = {
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
};

type ProjectWorkspaceProps = SentencePageState & {
  client: ApiClient;
  project: Project;
  tab: Tab;
  capabilities: Capability[];
};

export function ProjectWorkspace({ client, project, tab, capabilities, sentencePage, sentenceIsFetching, chapters, sentenceChapter, sentenceChapterIndex, onSentenceChapterIndex, sentenceSelected, onToggleSentence, narrationSidebarOpen, onToggleNarrationSidebar }: ProjectWorkspaceProps) {
  return <>{tab === "overview" && <OverviewView client={client} project={project} />}{tab === "documents" && <DocumentsView client={client} project={project} />}{tab === "sentences" && <SentencesView client={client} project={project} capabilities={capabilities} sentencePage={sentencePage} sentenceIsFetching={sentenceIsFetching} chapters={chapters} chapter={sentenceChapter} chapterIndex={sentenceChapterIndex} onChapterIndex={onSentenceChapterIndex} selected={sentenceSelected} onToggleSentence={onToggleSentence} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={onToggleNarrationSidebar} />}{tab === "speakers" && <SpeakersView client={client} project={project} capabilities={capabilities} />}{tab === "queue" && <QueueView client={client} />}{tab === "export" && <ExportView client={client} project={project} />}</>;
}

export { HealthView } from "../features/health/HealthView";
