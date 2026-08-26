import type {
  Capability,
  Document,
  EngineProfile,
  ExportRecord,
  Job,
  Project,
  SentencePage,
  Speaker,
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

  health() { return this.request<{ status: string; contract_version: string; storage: string }>("/v1/health"); }
  capabilities() { return this.request<Capability[]>("/v1/capabilities"); }
  projects() { return this.request<Project[]>("/v1/projects"); }
  createProject(name: string) { return this.request<Project>("/v1/projects", { method: "POST", body: JSON.stringify({ name }) }); }
  documents(projectId: string) { return this.request<Document[]>(`/v1/projects/${projectId}/documents`); }
  sentences(projectId: string, params: { offset: number; limit: number; query: string; status: string; speakerId: string }) {
    const search = new URLSearchParams({ offset: String(params.offset), limit: String(params.limit) });
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
  speakers(projectId: string) { return this.request<{ items: Speaker[]; profiles: EngineProfile[] }>(`/v1/projects/${projectId}/speakers`); }
  createSpeaker(projectId: string, payload: { name: string; color: string; engine_id?: string; voice?: string; settings?: Record<string, unknown> }) {
    return this.request<Speaker>(`/v1/projects/${projectId}/speakers`, { method: "POST", body: JSON.stringify(payload) });
  }
  updateProfile(speakerId: string, payload: { engine_id: string; voice: string; settings: Record<string, unknown> }) {
    return this.request<EngineProfile>(`/v1/speakers/${speakerId}/profile`, { method: "PUT", body: JSON.stringify(payload) });
  }
  queueGeneration(projectId: string, sentenceIds: string[]) {
    return this.request<{ job_ids: string[]; count: number }>(`/v1/projects/${projectId}/generation`, { method: "POST", body: JSON.stringify({ sentence_ids: sentenceIds }) });
  }
  jobs() { return this.request<Job[]>("/v1/jobs"); }
  cancelJob(jobId: string) { return this.request<Job>(`/v1/jobs/${jobId}/cancel`, { method: "POST" }); }
  exports(projectId: string) { return this.request<ExportRecord[]>(`/v1/projects/${projectId}/exports`); }
  createExport(projectId: string, format: "mp3" | "wav", pauseSeconds: number) {
    return this.request<ExportRecord>(`/v1/projects/${projectId}/exports`, { method: "POST", body: JSON.stringify({ format, pause_seconds: pauseSeconds }) });
  }
  cancelExport(exportId: string) { return this.request<ExportRecord>(`/v1/exports/${exportId}/cancel`, { method: "POST" }); }

  uploadDocument(projectId: string, file: File, onProgress: (percent: number) => void): Promise<Document> {
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
      request.send(form);
    });
  }

  events(onMessage: (message: unknown) => void): () => void {
    const url = new URL(`${this.baseUrl.replace(/^http/, "ws")}/v1/events`);
    url.searchParams.set("token", this.token);
    const socket = new WebSocket(url);
    socket.onmessage = (event) => onMessage(JSON.parse(event.data as string));
    return () => socket.close();
  }
}
