// Offline outbox — queues mutations while offline, flushes them on reconnect.
// The queue stores request descriptors; flush replays them in order, then callers
// invalidate their queries (AppRoot triggers a global invalidation after flush).
"use client";

export type QueuedMutation = {
  id: string;
  path: string;
  method: string;
  body?: string;
  label?: string;
  queuedAt: number;
};

const KEY = "setforge:outbox";
const listeners = new Set<() => void>();

function read(): QueuedMutation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedMutation[];
  } catch {
    return [];
  }
}

function write(items: QueuedMutation[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l());
}

export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function outboxCount(): number {
  return read().length;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Queue a mutation for later replay. Called by feature hooks when offline. */
export function queueMutation(path: string, method: string, body?: unknown, label?: string): void {
  const items = read();
  items.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    label,
    queuedAt: Date.now(),
  });
  write(items);
}

export type FlushResult = { flushed: number; failed: number };

/** Replay all queued mutations sequentially. Returns counts. */
export async function flushOutbox(): Promise<FlushResult> {
  const items = read();
  if (items.length === 0) return { flushed: 0, failed: 0 };
  const remaining: QueuedMutation[] = [];
  let flushed = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const res = await fetch(item.path, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        ...(item.body !== undefined ? { body: item.body } : {}),
      });
      if (res.ok || res.status === 404 || res.status === 409 || res.status === 400) {
        // 4xx = the server legitimately rejected it (e.g. duplicate); drop from queue
        flushed++;
      } else {
        remaining.push(item); // transient failure — retry later
        failed++;
      }
    } catch {
      remaining.push(item);
      failed++;
    }
  }
  write(remaining);
  return { flushed, failed };
}

export function clearOutbox(): void {
  write([]);
}

/** Wipe all local user data (logout). */
export function wipeLocalData(): void {
  clearOutbox();
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("setforge:")) keysToRemove.push(k);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}
