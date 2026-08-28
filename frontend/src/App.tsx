import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ApiClient } from "./api";
import { AppShell } from "./components/AppShell";
import { loadToken, saveToken } from "./secureToken";
import { Button } from "./shared/ui/Button";
import { TextField } from "./shared/ui/TextField";
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
  return (
    <main className="connection-page">
      <section className="connection-card" aria-labelledby="connection-title">
        <div className="connection-brand" aria-hidden="true">
          <span className="connection-brand-mark">A</span>
          <span className="connection-brand-name">Audiobook Maker</span>
        </div>
        <div className="eyebrow">PRIVATE AUDIO WORKSPACE</div>
        <h1 id="connection-title">Connect your workspace</h1>
        <p className="muted">Connect to the gateway running locally or on your trusted Tailscale server.</p>
        <form className="connection-form" onSubmit={(event) => { event.preventDefault(); onConnect(); }}>
          <TextField
            label="Gateway URL"
            name="gateway-url"
            value={baseUrl}
            onValueChange={onUrl}
            placeholder="http://localhost:8000"
            autoComplete="url"
            spellCheck={false}
          />
          <TextField
            label="API token"
            name="api-token"
            value={token}
            onValueChange={onToken}
            type="password"
            placeholder="Stored in Windows Credential Manager"
            autoComplete="current-password"
          />
          {error && <div className="error-banner" role="alert">{error}</div>}
          <Button type="submit" fullWidth loading={connecting} loadingLabel="Connecting…">Connect securely</Button>
        </form>
      </section>
    </main>
  );
}
