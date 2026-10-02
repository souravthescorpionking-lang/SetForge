"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ChunkLoadError auto-recovery (hotfix-chunk-1).
//
// The sandbox reaper intermittently kills the dev server; the watchdog
// restarts it, but Turbopack serves content-hashed chunks — and while the
// server is down (or mid-rebuild) an open tab that lazy-loads a route chunk
// (e.g. src_features_logs) gets a ChunkLoadError. Worse, the HMR client
// chunk itself can fail, so the tab can never hot-reload itself back to
// health and the user is stuck on the "Something went wrong" boundary.
//
// This bridge listens for chunk/script load failures — both ErrorEvent
// messages and resource errors on /_next/ assets — then waits until the
// server answers a HEAD probe again and reloads exactly once per 30s window
// (loop guard). location.reload() preserves the hash route, so the user
// lands back on the screen they were on.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";

const RELOAD_KEY = "sf.chunk.reload.at";
const RETRY_MS = 30_000; // min spacing between auto-reloads (loop guard)
const PROBE_INTERVAL_MS = 3_000;
const PROBE_MAX = 20; // ≤ 60s waiting for the dev server to come back

const CHUNK_ERROR_RE =
  /(ChunkLoadError|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed|Loading CSS chunk \d+ failed|Unable to load preload)/i;

/** True when the message looks like a chunk/import load failure. */
export function isChunkFailureMessage(message: unknown): boolean {
  return typeof message === "string" && CHUNK_ERROR_RE.test(message);
}

function recentlyReloaded(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_KEY));
    return Number.isFinite(at) && Date.now() - at < RETRY_MS;
  } catch {
    return false; // private mode / sandboxed iframe — best effort
  }
}

async function serverReachable(): Promise<boolean> {
  try {
    // Any HTTP answer (even 4xx/5xx) means the dev server is up again.
    await fetch(location.pathname || "/", { method: "HEAD", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

let recovering = false;

/** Shared recovery entry point (also used by ScreenErrorBoundary). */
export async function recoverFromChunkFailure(reason: string): Promise<void> {
  if (recovering || recentlyReloaded()) return;
  recovering = true;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // best effort only
  }
  // If the server is mid-restart a reload would land on a dead origin and
  // drop the route; poll until it answers, then reload.
  for (let i = 0; i < PROBE_MAX; i += 1) {
    if (await serverReachable()) break;
    await new Promise((resolve) => setTimeout(resolve, PROBE_INTERVAL_MS));
  }
  console.info(`[setforge] recovering from chunk load failure (${reason}) — reloading`);
  location.reload();
}

export function ChunkRecovery() {
  useEffect(() => {
    // Script/link load errors don't bubble, but reach window in the capture
    // phase; JS errors bubble. One capture listener sees both shapes.
    const onError = (event: ErrorEvent) => {
      if (isChunkFailureMessage(event.message)) {
        void recoverFromChunkFailure(event.message);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
        const src = target instanceof HTMLScriptElement ? target.src : target.href;
        if (src.includes("/_next/") && !recentlyReloaded()) {
          void recoverFromChunkFailure(src.split("/").pop() ?? "chunk");
        }
      }
    };
    // Dynamic import() rejections surface as unhandled promise rejections.
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
      if (isChunkFailureMessage(reason)) void recoverFromChunkFailure(reason);
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
