import { invoke } from "@tauri-apps/api/core";

let browserToken: string | null = null;

const inTauri = () => "__TAURI_INTERNALS__" in window;

export async function loadToken(): Promise<string> {
  if (inTauri()) return (await invoke<string | null>("load_api_token")) ?? "";
  return browserToken ?? "";
}

export async function saveToken(token: string): Promise<void> {
  if (inTauri()) await invoke("save_api_token", { token });
  else browserToken = token;
}
