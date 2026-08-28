export type Tab = "documents" | "sentences" | "speakers" | "queue" | "export" | "health";
export type AppView = "home" | "project" | "settings" | "health";
export type SettingsTab = "engines" | "app";

export const projectTabs: Array<Exclude<Tab, "health">> = ["documents", "sentences", "speakers", "queue", "export"];
