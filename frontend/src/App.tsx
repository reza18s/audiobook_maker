import { useEffect, useState } from "react";
import { ApiClient } from "./api";
import { AppShell } from "./components/AppShell";
import { loadToken, saveToken } from "./secureToken";
import type { AppView, SettingsTab, Tab } from "./app-types";
import type { Project } from "./types";
import "./styles.css";

export default function App() {
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000");
  const [token, setToken] = useState("");
  const [client, setClient] = useState<ApiClient | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("documents");
  const [view, setView] = useState<AppView>("home");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("engines");
  const [error, setError] = useState("");

  useEffect(() => { void loadToken().then(setToken); }, []);

  const connect = async () => {
    setError("");
    const next = new ApiClient(baseUrl, token.trim());
    try { await next.health(); await saveToken(token.trim()); setSelectedProject(null); setView("home"); setClient(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Connection failed"); }
  };

  if (!client) return <ConnectionScreen baseUrl={baseUrl} token={token} error={error} onUrl={setBaseUrl} onToken={setToken} onConnect={connect} />;
  return <AppShell client={client} project={selectedProject} setProject={setSelectedProject} tab={tab} setTab={setTab} view={view} setView={setView} settingsTab={settingsTab} setSettingsTab={setSettingsTab} onDisconnect={() => setClient(null)} />;
}

function ConnectionScreen({ baseUrl, token, error, onUrl, onToken, onConnect }: { baseUrl: string; token: string; error: string; onUrl: (value: string) => void; onToken: (value: string) => void; onConnect: () => void }) {
  return <main className="connection-page"><section className="connection-card"><div className="eyebrow">AUDIOBOOK MAKER</div><h1>Connect your workspace</h1><p className="muted">Connect to the gateway running locally or on your trusted Tailscale server.</p><label>Gateway URL<input value={baseUrl} onChange={(event) => onUrl(event.target.value)} placeholder="http://localhost:8000" /></label><label>API token<input value={token} onChange={(event) => onToken(event.target.value)} type="password" placeholder="Stored in Windows Credential Manager" /></label>{error && <div className="error-banner">{error}</div>}<button className="primary wide" onClick={onConnect}>Connect securely</button></section></main>;
}
