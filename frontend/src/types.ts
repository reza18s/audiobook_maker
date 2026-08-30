export type Project = {
  id: string;
  name: string;
  document_count: number;
  sentence_count: number;
  created_at: string;
  updated_at: string;
};

export type Health = {
  status: string;
  contract_version: string;
  storage: string;
};

export type ChapterSummary = Chapter & {
  completed_count: number;
  failed_count: number;
  pending_count: number;
  missing_speaker_count: number;
  progress_percent: number;
};

export type ProjectOverview = {
  project: Project;
  documents: Document[];
  chapters: ChapterSummary[];
  totals: {
    sentence_count: number;
    completed_count: number;
    failed_count: number;
    pending_count: number;
    active_count: number;
    missing_speaker_count: number;
  };
  progress_percent: number;
  readiness: "empty" | "in_progress" | "blocked" | "ready";
  blockers: string[];
};

export type Document = {
  id: string;
  project_id: string;
  filename: string;
  source_path: string;
  kind: "txt" | "pdf";
  status: string;
  total_bytes: number;
  processed_bytes: number;
  processed_pages: number;
  persisted_sentences: number;
  checkpoint_offset: number;
  checkpoint_page: number;
  chapter_marker: string;
  chapter_number: number;
  chapter_title: string | null;
  error: string | null;
};

export type Chapter = {
  id: string;
  document_id: string;
  document_filename: string;
  number: number;
  title: string | null;
  sentence_count: number;
};

export type Sentence = {
  id: string;
  document_id: string;
  sequence: number;
  text: string;
  page_number: number;
  source_offset: number;
  chapter_number: number;
  chapter_title: string | null;
  speaker_id: string | null;
  status: string;
  audio_path: string | null;
  generation_job_id: string | null;
  error: string | null;
  document_filename: string;
};

export type SentencePage = {
  items: Sentence[];
  offset: number;
  limit: number;
  total: number;
};

export type Capability = {
  id: string;
  display_name: string;
  version: string;
  supported_languages?: string[];
  requires_gpu?: boolean;
  max_concurrency?: number;
  healthy?: boolean;
  model_loaded?: boolean;
  device?: string;
  parameters?: Record<string, unknown> | Array<Record<string, unknown>>;
};

export type Speaker = {
  id: string;
  project_id: string;
  name: string;
  color: string;
};

export type EngineProfile = {
  id: string;
  speaker_id: string;
  engine_id: string;
  voice: string;
  settings: string;
};

export type Job = {
  job_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  progress: { completed: number; total: number; percent: number; message: string };
  error: string | null;
  audio_path: string | null;
};

export type ExportRecord = {
  id: string;
  project_id: string;
  status: string;
  format: "mp3" | "wav";
  pause_seconds: number;
  output_path: string;
  total_sentences: number;
  completed_sentences: number;
  percent: number;
  error: string | null;
};
