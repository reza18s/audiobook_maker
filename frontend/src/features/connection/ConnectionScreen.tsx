import { Button } from "../../shared/ui/Button";
import { TextField } from "../../shared/ui/TextField";

type ConnectionScreenProps = {
  baseUrl: string;
  token: string;
  error: string;
  connecting: boolean;
  onUrl: (value: string) => void;
  onToken: (value: string) => void;
  onConnect: () => void;
};

export function ConnectionScreen({ baseUrl, token, error, connecting, onUrl, onToken, onConnect }: ConnectionScreenProps) {
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
