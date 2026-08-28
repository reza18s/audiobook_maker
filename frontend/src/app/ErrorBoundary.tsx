import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../shared/ui/Button";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { hasError: boolean };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application route failed", error, info);
  }

  private recover = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="connection-page" role="alert" aria-labelledby="app-error-title">
        <section className="connection-card">
          <div className="eyebrow">WORKSPACE RECOVERY</div>
          <h1 id="app-error-title">This page ran into a problem</h1>
          <p className="muted">Reload the workspace to recover and continue where you left off.</p>
          <Button type="button" onClick={this.recover} fullWidth>Reload workspace</Button>
        </section>
      </main>
    );
  }
}
