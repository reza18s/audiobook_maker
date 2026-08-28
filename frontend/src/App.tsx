import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ApiClient } from "./api";
import { AppShell } from "./components/AppShell";
import { loadToken, saveToken } from "./secureToken";
import { useAppStore } from "./store";
import "./styles.css";

export default function App() {
  const navigate = useNavigate();
  const baseUrl = useAppStore((state) => state.baseUrl);
  const token = useAppStore((state) => state.token);
  const client = useAppStore((state) => state.client);
  const error = useAppStore((state) => state.connectionError);
  const setBaseUrl = useAppStore((state) => state.setBaseUrl);
  const setToken = useAppStore((state) => state.setToken);
  const setClient = useAppStore((state) => state.setClient);
  const setError = useAppStore((state) => state.setConnectionError);
  const disconnect = useAppStore((state) => state.disconnect);

  useEffect(() => { void loadToken().then(setToken); }, [setToken]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const next = new ApiClient(baseUrl, token.trim());
      await next.health();
      await saveToken(token.trim());
      return next;
    },
    onSuccess: (next) => { setClient(next); navigate("/home", { replace: true }); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Connection failed"),
  });
  const connect = () => { setError(""); connectMutation.mutate(); };

  if (!client) return <ConnectionScreen baseUrl={baseUrl} token={token} error={error} connecting={connectMutation.isPending} onUrl={setBaseUrl} onToken={setToken} onConnect={connect} />;
  const shell = <AppShell client={client} onDisconnect={() => { disconnect(); navigate("/home", { replace: true }); }} />;
  return <Routes>
    <Route path="/" element={<Navigate to="/home" replace />} />
    <Route path="/home" element={shell} />
    <Route path="/health" element={shell} />
    <Route path="/settings" element={<Navigate to="/settings/engines" replace />} />
    <Route path="/settings/:section" element={shell} />
    <Route path="/projects/:projectId" element={<Navigate to="documents" replace />} />
    <Route path="/projects/:projectId/:tab" element={shell} />
    <Route path="/project/:projectId/:tab" element={shell} />
    <Route path="*" element={<Navigate to="/home" replace />} />
  </Routes>;
}

function ConnectionScreen({ baseUrl, token, error, connecting, onUrl, onToken, onConnect }: { baseUrl: string; token: string; error: string; connecting: boolean; onUrl: (value: string) => void; onToken: (value: string) => void; onConnect: () => void }) {
  return <main className="connection-page"><section className="connection-card"><div className="eyebrow">AUDIOBOOK MAKER</div><h1>Connect your workspace</h1><p className="muted">Connect to the gateway running locally or on your trusted Tailscale server.</p><label>Gateway URL<input value={baseUrl} onChange={(event) => onUrl(event.target.value)} placeholder="http://localhost:8000" /></label><label>API token<input value={token} onChange={(event) => onToken(event.target.value)} type="password" placeholder="Stored in Windows Credential Manager" /></label>{error && <div className="error-banner">{error}</div>}<button className="primary wide" disabled={connecting} onClick={onConnect}>{connecting ? "Connecting…" : "Connect securely"}</button></section></main>;
}
