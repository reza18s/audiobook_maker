import type {
  Capability,
  Chapter,
  Document,
  EngineProfile,
  ExportRecord,
  ExportPreflight,
  Health,
  Job,
  Project,
  ProjectOverview,
  SentencePage,
  Speaker,
  VoiceVariant,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class ApiClient {
  constructor(readonly baseUrl: string, readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { detail?: string };
        detail = body.detail ?? detail;
      } catch {
        // Keep the HTTP status when the gateway returned a non-JSON error.
      }
      throw new ApiError(response.status, detail);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  health() { return this.request<Health>("/v1/health"); }
  capabilities() { return this.request<Capability[]>("/v1/capabilities"); }
  projects() { return this.request<Project[]>("/v1/projects"); }
  projectOverview(projectId: string) { return this.request<ProjectOverview>(`/v1/projects/${encodeURIComponent(projectId)}/overview`); }
  createProject(name: string) { return this.request<Project>("/v1/projects", { method: "POST", body: JSON.stringify({ name }) }); }
  updateProject(projectId: string, name: string, metadata: Partial<Pick<Project, "author" | "narrator" | "language" | "series" | "description">> = {}) { return this.request<Project>(`/v1/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: JSON.stringify({ name, ...metadata }) }); }
  deleteProject(projectId: string) { return this.request<void>(`/v1/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }); }
  uploadProjectCover(projectId: string, file: File) {
    const body = new FormData();
    body.append("file", file, file.name);
    return this.request<{ project: Project; bytes: number }>(`/v1/projects/${encodeURIComponent(projectId)}/cover`, { method: "POST", body });
  }
  documents(projectId: string) { return this.request<Document[]>(`/v1/projects/${projectId}/documents`); }
  updateDocument(documentId: string, payload: { filename: string; chapter_marker: string; reprocess?: boolean }) {
    return this.request<Document>(`/v1/documents/${encodeURIComponent(documentId)}`, { method: "PATCH", body: JSON.stringify(payload) });
  }
  deleteDocument(documentId: string) { return this.request<void>(`/v1/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" }); }
  chapters(projectId: string, params: { query: string; status?: string; speakerId?: string }) {
    const search = new URLSearchParams();
    if (params.query) search.set("query", params.query);
    if (params.status) search.set("status", params.status);
    if (params.speakerId) search.set("speaker_id", params.speakerId);
    const query = search.toString();
    return this.request<Chapter[]>(`/v1/projects/${projectId}/chapters${query ? `?${query}` : ""}`);
  }
  exportPreflight(projectId: string) { return this.request<ExportPreflight>(`/v1/projects/${encodeURIComponent(projectId)}/export-preflight`); }
  sentences(projectId: string, params: { chapter?: Pick<Chapter, "document_id" | "number">; query: string; status?: string; speakerId?: string }) {
    const search = new URLSearchParams();
    if (params.chapter) {
      search.set("document_id", params.chapter.document_id);
      search.set("chapter_number", String(params.chapter.number));
    }
    if (params.query) search.set("query", params.query);
    if (params.status) search.set("status", params.status);
    if (params.speakerId) search.set("speaker_id", params.speakerId);
    return this.request<SentencePage>(`/v1/projects/${projectId}/sentences?${search}`);
  }
  updateSentence(sentenceId: string, changes: { text?: string; speaker_id?: string | null }) {
    return this.request(`/v1/sentences/${sentenceId}`, { method: "PATCH", body: JSON.stringify(changes) });
  }
  async audio(sentenceId: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/sentences/${sentenceId}/audio`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new ApiError(response.status, "sentence audio is unavailable");
    return response.blob();
  }
  speakers(projectId: string) { return this.request<{ items: Speaker[]; profiles: EngineProfile[]; variants: VoiceVariant[] }>(`/v1/projects/${projectId}/speakers`); }
  createSpeaker(projectId: string, payload: { name: string; color: string; engine_id?: string; voice?: string; settings?: Record<string, unknown> }) {
    return this.request<Speaker>(`/v1/projects/${projectId}/speakers`, { method: "POST", body: JSON.stringify(payload) });
  }
  updateProfile(speakerId: string, payload: { engine_id: string; voice: string; settings: Record<string, unknown> }) {
    return this.request<EngineProfile>(`/v1/speakers/${speakerId}/profile`, { method: "PUT", body: JSON.stringify(payload) });
  }
  createVoiceVariant(speakerId: string, payload: { name: string; engine_id: string; voice: string; settings: Record<string, unknown> }) {
    return this.request<VoiceVariant>(`/v1/speakers/${speakerId}/variants`, { method: "POST", body: JSON.stringify(payload) });
  }
  deleteVoiceVariant(variantId: string) { return this.request<void>(`/v1/voice-variants/${encodeURIComponent(variantId)}`, { method: "DELETE" }); }
  async previewVoiceVariant(variantId: string, text: string, language = "en"): Promise<Blob> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/voice-variants/${encodeURIComponent(variantId)}/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    if (!response.ok) {
      let detail = response.statusText;
      try { detail = ((await response.json()) as { detail?: string }).detail ?? detail; } catch { /* keep the HTTP status */ }
      throw new ApiError(response.status, detail);
    }
    return response.blob();
  }
  uploadSpeakerSample(speakerId: string, file: File) {
    const body = new FormData();
    body.append("file", file, file.name);
    return this.request<{ sample_id: string; filename: string; bytes: number }>(`/v1/speakers/${speakerId}/sample`, { method: "POST", body });
  }
  queueGeneration(projectId: string, sentenceIds: string[]) {
    return this.request<{ job_ids: string[]; count: number }>(`/v1/projects/${projectId}/generation`, { method: "POST", body: JSON.stringify({ sentence_ids: sentenceIds }) });
  }
  jobs() { return this.request<Job[]>("/v1/jobs"); }
  cancelJob(jobId: string) { return this.request<Job>(`/v1/jobs/${jobId}/cancel`, { method: "POST" }); }
  exports(projectId: string) { return this.request<ExportRecord[]>(`/v1/projects/${projectId}/exports`); }
  createExport(projectId: string, format: "mp3" | "wav" | "m4b", pauseSeconds: number, metadata: Partial<Record<"title" | "author" | "narrator" | "language" | "series" | "description", string>> = {}) {
    return this.request<ExportRecord>(`/v1/projects/${projectId}/exports`, { method: "POST", body: JSON.stringify({ format, pause_seconds: pauseSeconds, metadata }) });
  }
  cancelExport(exportId: string) { return this.request<ExportRecord>(`/v1/exports/${exportId}/cancel`, { method: "POST" }); }

  uploadDocument(projectId: string, file: File, onProgress: (percent: number) => void, chapterMarker = ""): Promise<Document> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `${this.baseUrl.replace(/\/$/, "")}/v1/projects/${projectId}/documents`);
      request.setRequestHeader("Authorization", `Bearer ${this.token}`);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onerror = () => reject(new ApiError(0, "could not reach the gateway"));
      request.onload = () => {
        let body: { detail?: string } & Document;
        try { body = JSON.parse(request.responseText) as typeof body; } catch { reject(new ApiError(request.status, "invalid gateway response")); return; }
        if (request.status < 200 || request.status >= 300) reject(new ApiError(request.status, body.detail ?? "upload failed"));
        else resolve(body);
      };
      const form = new FormData();
      form.append("file", file, file.name);
      if (chapterMarker.trim()) form.append("chapter_marker", chapterMarker.trim());
      request.send(form);
    });
  }

  events(onMessage: (message: unknown) => void): () => void {
    const url = new URL(`${this.baseUrl.replace(/^http/, "ws")}/v1/events`);
    url.searchParams.set("token", this.token);
    let socket: WebSocket | null = null;
    let stopped = false;
    let reconnectTimer: number | undefined;
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(url);
      socket.onmessage = (event) => onMessage(JSON.parse(event.data as string));
      socket.onclose = () => {
        if (!stopped) reconnectTimer = window.setTimeout(connect, 1000);
      };
    };
    connect();
    return () => { stopped = true; if (reconnectTimer) window.clearTimeout(reconnectTimer); socket?.close(); };
  }
}
