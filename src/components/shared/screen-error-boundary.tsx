"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — ScreenErrorBoundary (§4.17). Wraps every routed screen; fallback is
// a 200px block with error id + [Reload screen] (re-mount) + [Go home].
// Crashes are logged to POST /api/client-errors (rate-limited server-side).
// ─────────────────────────────────────────────────────────────────────────────
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { clientErrorsApi } from "@/lib/client/api";
import { hapticError } from "@/lib/client/haptics";

interface Props {
  route: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorId: string;
}

function errorIdOf(error: Error): string {
  // Stable short id: hash of message+name — enough for support correlation.
  let h = 0;
  const s = `${error.name}:${error.message}`;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `E${(h >>> 0).toString(36).toUpperCase().slice(0, 6)}`;
}

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorId: errorIdOf(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    hapticError();
    clientErrorsApi.report({
      message: error.message.slice(0, 1000),
      stack: info.componentStack?.slice(0, 1000),
      route: this.props.route,
    });
  }

  private reload = () => this.setState({ error: null, errorId: "" });
  private goHome = () => {
    window.location.hash = "#/home";
    this.setState({ error: null, errorId: "" });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full w-full items-center justify-center p-4" role="alert">
        <div className="flex w-full max-w-[720px] flex-col items-center gap-4 rounded-lg border bg-card px-6 py-10 text-center lg:max-w-[1100px]">
          <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
          <div className="text-base font-semibold">Something went wrong</div>
          <div className="text-xs tabular-nums text-muted-foreground">Error {this.state.errorId} · {this.props.route}</div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.reload}
              className="flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> Reload screen
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="flex h-11 items-center gap-2 rounded-md border px-4 text-xs font-bold"
            >
              <Home className="h-4 w-4" aria-hidden /> Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
