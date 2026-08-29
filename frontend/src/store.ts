import { create } from "zustand";
import type { ApiClient } from "./api";

type AppStore = {
  baseUrl: string;
  token: string;
  client: ApiClient | null;
  connectionError: string;
  workspaceSidebarOpen: boolean;
  settingsSidebarOpen: boolean;
  narrationSidebarOpen: boolean;
  sentenceQuery: string;
  sentenceChapterIndex: number;
  sentenceSelected: string[];
  sentenceMoreOpen: boolean;
  setBaseUrl: (baseUrl: string) => void;
  setToken: (token: string) => void;
  setClient: (client: ApiClient | null) => void;
  setConnectionError: (connectionError: string) => void;
  setWorkspaceSidebarOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  setSettingsSidebarOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  setNarrationSidebarOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  setSentenceQuery: (sentenceQuery: string) => void;
  setSentenceChapterIndex: (sentenceChapterIndex: number) => void;
  setSentenceSelected: (sentenceSelected: string[] | ((current: string[]) => string[])) => void;
  setSentenceMoreOpen: (sentenceMoreOpen: boolean | ((current: boolean) => boolean)) => void;
  resetSentenceState: () => void;
  disconnect: () => void;
};

const resolveBoolean = (value: boolean | ((current: boolean) => boolean), current: boolean) =>
  typeof value === "function" ? value(current) : value;

const resolveList = (value: string[] | ((current: string[]) => string[]), current: string[]) =>
  typeof value === "function" ? value(current) : value;

export const useAppStore = create<AppStore>((set) => ({
  baseUrl: "http://localhost:8000",
  token: "",
  client: null,
  connectionError: "",
  workspaceSidebarOpen: true,
  settingsSidebarOpen: true,
  narrationSidebarOpen: true,
  sentenceQuery: "",
  sentenceChapterIndex: 0,
  sentenceSelected: [],
  sentenceMoreOpen: false,
  setBaseUrl: (baseUrl) => set({ baseUrl }),
  setToken: (token) => set({ token }),
  setClient: (client) => set({ client }),
  setConnectionError: (connectionError) => set({ connectionError }),
  setWorkspaceSidebarOpen: (open) => set((state) => ({ workspaceSidebarOpen: resolveBoolean(open, state.workspaceSidebarOpen) })),
  setSettingsSidebarOpen: (open) => set((state) => ({ settingsSidebarOpen: resolveBoolean(open, state.settingsSidebarOpen) })),
  setNarrationSidebarOpen: (open) => set((state) => ({ narrationSidebarOpen: resolveBoolean(open, state.narrationSidebarOpen) })),
  setSentenceQuery: (sentenceQuery) => set({ sentenceQuery, sentenceChapterIndex: 0 }),
  setSentenceChapterIndex: (sentenceChapterIndex) => set({ sentenceChapterIndex }),
  setSentenceSelected: (sentenceSelected) => set((state) => ({ sentenceSelected: resolveList(sentenceSelected, state.sentenceSelected) })),
  setSentenceMoreOpen: (sentenceMoreOpen) => set((state) => ({ sentenceMoreOpen: resolveBoolean(sentenceMoreOpen, state.sentenceMoreOpen) })),
  resetSentenceState: () => set({ sentenceQuery: "", sentenceChapterIndex: 0, sentenceSelected: [], sentenceMoreOpen: false }),
  disconnect: () => set({ client: null, connectionError: "" }),
}));
