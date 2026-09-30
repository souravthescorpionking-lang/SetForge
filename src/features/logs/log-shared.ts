// ─────────────────────────────────────────────────────────────────────────────
// log-shared.ts — pure helpers for the Part 9 §8 Logs screens (list + detail).
// No React, no rendering: name/duration/difficulty derivation shared by both
// screens and the calendar so every surface tells the same story.
//
// sourceLabel contract (server mappers / program-service.sourceLabelFor):
//   ROUTINE_DAY → "{program} · {day}" ("{program} · Day off" for mark-offs)
//   SESSION     → "On demand"
//   FREESTYLE   → "Custom"
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkoutDTO, WorkoutSummaryDTO } from "@/lib/types";

/** The day-name tail of a "program · day" label (whole label when unsplit). */
function labelTail(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const tail = trimmed.includes("·") ? trimmed.split("·").pop()!.trim() : trimmed;
  return tail || null;
}

/**
 * §8 list row L1 name. ROUTINE_DAY logs are named after their day ("Push Day");
 * everything else prefers the session note, then a source-specific fallback.
 * (Exercise names are not part of WorkoutSummaryDTO — documented gap.)
 */
export function logRowName(w: Pick<WorkoutSummaryDTO, "sourceType" | "sourceLabel" | "comment">): string {
  if (w.sourceType === "ROUTINE_DAY") {
    const label = w.sourceLabel?.trim() ?? "";
    return labelTail(label) ?? "Workout";
  }
  const comment = w.comment?.trim();
  if (comment) return comment;
  if (w.sourceType === "SESSION") return "On demand session";
  const label = w.sourceLabel?.trim() ?? "";
  if (label && label !== "Custom") return label;
  return "Workout";
}

/** §8 log-detail TopBar name (sourceLabel-derived, same rules as the list). */
export function logDetailName(w: Pick<WorkoutDTO, "sourceType" | "sourceLabel" | "comment">): string {
  return logRowName(w);
}

/** "THU 26" — day-of-week + date chip for list rows (kept date affordance). */
export function dayBadge(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00.000Z`);
  const dow = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).toUpperCase();
  return `${dow} ${d.getUTCDate()}`;
}

/** §8 short set types for the detail table: W/N/D/F, AMRAP stays "AMRAP". */
export function setTypeShort(setType: string | null | undefined): string {
  switch (setType ?? "NORMAL") {
    case "WARMUP":
      return "W";
    case "DROP":
      return "D";
    case "FAILURE":
      return "F";
    case "AMRAP":
      return "AMRAP";
    default:
      return "N";
  }
}

/** "Started 07:32" from startAt (local clock); falls back to the date label. */
export function startedAtLabel(startAt: string | null, fallback: string): string {
  if (!startAt) return fallback;
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return fallback;
  return `Started ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}
