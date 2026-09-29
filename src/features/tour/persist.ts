// ─────────────────────────────────────────────────────────────────────────────
// Tour state persistence (Part 7).
//
// SIMPLIFICATION (documented in the worklog): tour state uses a localStorage
// mirror instead of IndexedDB + the offline outbox.
//   • Online: the server is the source of truth — every change is written
//     through with a fire-and-forget PUT (optimistic; failures are silently
//     queued by simply STAYING in the mirror).
//   • Offline: the localStorage mirror `setforge:tours` IS the source of
//     truth. On the next load, mirror records that differ from (or are
//     missing on) the server are re-PUT (retry).
// The mirror stores the owning userId — a different account on the same
// browser never reads (or re-uploads) another user's tour state.
// ─────────────────────────────────────────────────────────────────────────────

import { toursApi } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import type { TourStatus } from "@/lib/types";

/** Seen record for one screenId (mirrors UserTourState columns). */
export type SeenRecord = {
  version: string;
  status: TourStatus;
  stepReached: number;
  updatedAt: string;
};

type Mirror = { userId: string; states: Record<string, SeenRecord>; hints: Record<string, string> };

const KEY = "setforge:tours";

function currentUserId(): string | null {
  return useApp.getState().session?.user.id ?? null;
}

function readRaw(): Mirror | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Mirror;
    if (!parsed || typeof parsed !== "object" || typeof parsed.userId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Mirror for the given user only (cross-account isolation). */
export function readMirrorFor(userId: string): { states: Record<string, SeenRecord>; hints: Record<string, string> } | null {
  const raw = readRaw();
  if (!raw || raw.userId !== userId) return null;
  return { states: raw.states ?? {}, hints: raw.hints ?? {} };
}

/** Overwrite the mirror with the given (already merged) state. */
export function writeMirror(states: Record<string, SeenRecord>, hints: Record<string, string>): void {
  const userId = currentUserId();
  if (!userId) return; // logged out — nothing to mirror
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ userId, states, hints }));
  } catch {
    /* storage full / private mode — the server copy still exists */
  }
}

/** Fire-and-forget PUT of one screen's tour outcome (silently retried on next load). */
export function putStateRemote(screenId: string, rec: SeenRecord): void {
  void toursApi
    .putState(screenId, { version: rec.version, status: rec.status, stepReached: rec.stepReached })
    .catch(() => undefined);
}

/** Fire-and-forget PUT of one seen hint. */
export function markHintRemote(hintId: string): void {
  void toursApi.markHint(hintId).catch(() => undefined);
}
