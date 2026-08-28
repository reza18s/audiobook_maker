import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ApiClient } from "./api";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { AppShell } from "./components/AppShell";
import { ConnectionScreen } from "./features/connection/ConnectionScreen";
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
  return <ErrorBoundary><Routes>
    <Route path="/" element={<Navigate to="/home" replace />} />
    <Route path="/home" element={shell} />
    <Route path="/health" element={shell} />
    <Route path="/settings" element={<Navigate to="/settings/engines" replace />} />
    <Route path="/settings/:section" element={shell} />
    <Route path="/projects/:projectId" element={<Navigate to="documents" replace />} />
    <Route path="/projects/:projectId/:tab" element={shell} />
    <Route path="/project/:projectId/:tab" element={shell} />
    <Route path="*" element={<Navigate to="/home" replace />} />
  </Routes></ErrorBoundary>;
}
