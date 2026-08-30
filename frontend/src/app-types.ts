export type Tab = "overview" | "documents" | "sentences" | "speakers" | "queue" | "export" | "health";
export type AppView = "home" | "project" | "settings" | "health";
export type SettingsTab = "engines" | "app";

export const projectTabItems = [
  { id: "overview", icon: "◈" },
  { id: "documents", icon: "▣" },
  { id: "sentences", icon: "≡" },
  { id: "speakers", icon: "◉" },
  { id: "queue", icon: "↗" },
  { id: "export", icon: "⇩" },
] as const satisfies Array<{ id: Exclude<Tab, "health">; icon: string }>;

export const projectTabs: Array<Exclude<Tab, "health">> = projectTabItems.map((item) => item.id);
