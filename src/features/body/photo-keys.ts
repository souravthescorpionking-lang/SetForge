"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 §4.14 — progress-photo query keys (shared by the Track tab photo
// section and the #/body/compare screen). Kept inside the body feature so the
// two files invalidate the same family without touching src/lib/client/query.
//
// Key family:  ["photos"]              → all photos of the user (compare screen)
//              ["photos", recordId]    → photos of one measurement record
// Invalidating the ["photos"] prefix refreshes BOTH (TanStack prefix matching).
// ─────────────────────────────────────────────────────────────────────────────

import type { QueryClient } from "@tanstack/react-query";

export const photosKeys = {
  all: ["photos"] as const,
  record: (recordId: string) => ["photos", recordId] as const,
};

/** Invalidate every photos query (call after attach/remove mutations). */
export function invalidatePhotos(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: photosKeys.all });
}
