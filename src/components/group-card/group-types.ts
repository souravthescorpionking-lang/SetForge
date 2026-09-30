// group-types.ts — the normalized prop contract shared by SetRow + GroupCard
// (the Part 8 single-source-of-truth card system; supersedes Part 3's
// card-types). Pure types + tiny pure helpers only: no React, no rendering,
// so both components can import it without a module cycle.
//
// CardSet/CardExercise deliberately flatten the DTO shapes (SetDTO /
// PredefinedSetDTO / ExerciseDTO) so every mode renders through ONE row +
// ONE card. `toCardSet` is the cheap normalizer consumers call at the edge.

import { formatRestSec, type SetField } from "@/lib/constants";
import type { WeightKind } from "@/lib/grouping";

// ---------- modes ----------

/**
 * Part 8 §2.3 render modes:
 *   view — Program detail, Session detail (Reps / Tempo / ⏱ rows)
 *   read — Log detail (set rows read-only "100 · 5 🏆")
 *   edit — Builder editors (same as view; fields tappable; ≡ drag replaces 💡)
 *   log  — Logging screen (Tempo row + SetRow list + + set)
 * Legacy Part 3 modes kept for in-flight consumers (removed as screens migrate).
 */
export type CardMode = "view" | "read" | "edit" | "log" | "edit-legacy" | "preview" | "template" | "summary";
/** Legacy Part 3 mode → Part 8 mode mapping for the migration period. */
export function mapLegacyMode(mode: CardMode): "view" | "read" | "edit" | "log" {
  switch (mode) {
    case "view":
    case "preview":
    case "template":
      return "view";
    case "read":
    case "summary":
      return "read";
    case "edit":
      return "log";
    case "log":
      return "log";
    case "edit-legacy":
      return "edit";
  }
}

// ---------- exercise ----------

export type CardExercise = {
  id: string;
  name: string;
  /** Category display label (e.g. "Chest"). */
  categoryLabel: string;
  /** Category colour (hex) — drives the 4px bar on singleton groups. */
  categoryColour: string;
  /** Exercise modality — an EXERCISE_TYPES value (fieldsForType resolves f1/f2). */
  modality: string;
  /** Weight unit label (e.g. "kg"); defaults to "kg" when rendering. */
  unit?: string | null;
  /** Stepper step for the weight field (defaults to 1). */
  weightIncrement?: number | null;
  /** Part 8 §2.4: per-exercise column visibility (not global). */
  showRpe?: boolean | null;
  showTempo?: boolean | null;
  showRest?: boolean | null;
  /** Part 8 §6.5: rest when the pointer moves to the next group (null = settings). */
  transitionRestSec?: number | null;
  /** Part 8 §6.2 flag: exercise has a warm-up scheme attached (chip in editors). */
  hasWarmup?: boolean;
  /** Part 8 §6.3 flag: exercise has a progression rule (chip "↑ +2.5 next"). */
  progressionDelta?: number | null;
  /** Part 8 §6.3 flag: next session applies a deload. */
  progressionDeload?: boolean;
};

// ---------- set ----------

export type CardSet = {
  id: string;
  /** 1-based set index (the `#` column). */
  index: number;
  /** NORMAL | WARMUP | DROP | FAILURE | AMRAP (null = unset, template blank). */
  setType?: string | null;
  weightKg?: number | null;
  reps?: number | null;
  distanceM?: number | null;
  timeSec?: number | null;
  rpe?: number | null;
  tempo?: string | null;
  restPlannedSec?: number | null;
  restActualSec?: number | null;
  done?: boolean;
  /** preview mode selection state. */
  selected?: boolean;
  isNewPr?: boolean;
  note?: string | null;
  /** Part 8 §6.4: weight prescription kind + % (when set, weightKg holds the resolved value). */
  weightKind?: WeightKind | null;
  pct?: number | null;
};

// ---------- settings-driven column visibility ----------

export type CardVisibleColumns = {
  setType: boolean;
  rpe: boolean;
  tempo: boolean;
  rest: boolean;
};

// ---------- action contract (discriminated union) ----------

/** Field keys an "apply to all sets" fan-out can carry (§4.10d). */
export type ApplyToAllFields = Partial<
  Pick<
    CardSet,
    "weightKg" | "reps" | "distanceM" | "timeSec" | "rpe" | "tempo" | "restPlannedSec"
  >
>;

export type CardAction =
  | { type: "toggle-collapse" }
  | { type: "add-set" }
  | { type: "update-set"; setId: string; patch: Partial<CardSet> }
  | { type: "toggle-done"; setId: string }
  | { type: "toggle-select"; setId: string }
  | { type: "copy-last"; setId: string }
  | { type: "remove-set"; setId: string }
  | { type: "notes" }
  | { type: "rest-timer"; setId?: string }
  | { type: "move-up" }
  | { type: "move-down" }
  | { type: "add-to-group" }
  | { type: "replace" }
  | { type: "remove" }
  | { type: "select" }
  | { type: "open" }
  /** §4.10d builder speed: copy this row's selected field values onto every
   *  set of the card. GroupCard fans this out into per-set update-set
   *  actions internally — consumers never need to handle it. */
  | { type: "apply-to-all"; fields: ApplyToAllFields }
  /** Part 8 §2.4: long-press row expansion actions. */
  | { type: "toggle-rpe-always"; exerciseId: string }
  /** Part 8 §6.5: per-session transition rest override. */
  | { type: "transition-rest"; exerciseId: string; sec: number }
  /** Part 8 §2.2: … popover navigations. */
  | { type: "history"; exerciseId: string }
  | { type: "graph"; exerciseId: string }
  | { type: "records"; exerciseId: string }
  | { type: "detail"; exerciseId: string }
  | { type: "edit-sets"; exerciseId: string }
  /** Part 9 §5: day … menu — open the §5.1 rearrange editor for this day. */
  | { type: "rearrange-series" };

// ---------- toCardSet mapper ----------

/** Anything shaped like a SetDTO / PredefinedSetDTO (server rows) normalizes cheaply. */
export type ToCardSetInput = {
  id?: string;
  weight?: number | null;
  reps?: number | null;
  distance?: number | null;
  timeSec?: number | null;
  setType?: string | null;
  rpe?: number | null;
  tempo?: string | null;
  restPlannedSec?: number | null;
  restActualSec?: number | null;
  isComplete?: boolean;
  comment?: string | null;
  newPr?: boolean;
  sortOrder?: number;
  /** Part 8 §6.4 */
  weightKind?: WeightKind | null;
  pct?: number | null;
};

/** Normalize a SetDTO- or PredefinedSetDTO-shaped row into a CardSet. */
export function toCardSet(input: ToCardSetInput, index: number): CardSet {
  return {
    id: input.id ?? "",
    index,
    setType: input.setType ?? null,
    weightKg: input.weight ?? null,
    reps: input.reps ?? null,
    distanceM: input.distance ?? null,
    timeSec: input.timeSec ?? null,
    rpe: input.rpe ?? null,
    tempo: input.tempo ?? null,
    restPlannedSec: input.restPlannedSec ?? null,
    restActualSec: input.restActualSec ?? null,
    done: input.isComplete ?? false,
    selected: false,
    isNewPr: input.newPr ?? false,
    note: input.comment ?? null,
    weightKind: input.weightKind ?? null,
    pct: input.pct ?? null,
  };
}

// ---------- field helpers (shared by SetRow cells + GroupCard meta) ----------

/** CardSet key that stores a given modality field. */
export const FIELD_TO_KEY: Record<SetField, keyof CardSet> = {
  weight: "weightKg",
  reps: "reps",
  distance: "distanceM",
  timeSec: "timeSec",
};

/** Human labels for aria-labels / steppers. */
export const FIELD_LABEL: Record<SetField, string> = {
  weight: "Weight",
  reps: "Reps",
  distance: "Distance",
  timeSec: "Time",
};

/**
 * Stepper step per field. Weight/reps per spec ("weightIncrement ?? 1" / "1");
 * distance/time are unspecified by the spec — 100 m / 15 s chosen to match the
 * rest-timer ±15s pattern (documented deviation).
 */
export function stepForField(field: SetField, exercise: CardExercise): number {
  switch (field) {
    case "weight":
      return exercise.weightIncrement ?? 1;
    case "reps":
      return 1;
    case "distance":
      return 100;
    case "timeSec":
      return 15;
  }
}

/** Trim float noise: 100 → "100", 62.5 → "62.5", 3.0000001 → "3". */
export function trimNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Metres → "800 m" / "5 km" (read-mode + header meta). */
export function formatDistanceM(m: number): string {
  if (Math.abs(m) >= 1000) return `${trimNum(m / 1000)} km`;
  return `${trimNum(m)} m`;
}

/** Read-mode cell text: "100 kg", "5", "800 m", "1:30". */
export function formatFieldValue(
  field: SetField,
  value: number | null | undefined,
  unit?: string | null,
): string {
  if (value == null || !Number.isFinite(value)) return "–";
  switch (field) {
    case "weight":
      return `${trimNum(value)} ${unit ?? "kg"}`;
    case "reps":
      return trimNum(value);
    case "distance":
      return formatDistanceM(value);
    case "timeSec":
      return formatRestSec(value);
  }
}

/**
 * Parse a value-cell input.
 * "" → null (explicit clear) · invalid text → undefined (keep previous value)
 * · timeSec also accepts "m:ss" / "h:mm:ss".
 */
export function parseFieldValue(field: SetField, raw: string): number | null | undefined {
  const cleaned = raw.trim().replace(",", ".");
  if (field === "timeSec" && cleaned.includes(":")) {
    const parts = cleaned.split(":").map((p) => p.trim());
    if (parts.length === 2 || parts.length === 3) {
      const nums = parts.map(Number);
      if (nums.every((n) => Number.isFinite(n) && n >= 0)) {
        return Math.round(nums[0] * 3600 + nums[1] * 60 + (nums[2] ?? 0));
      }
    }
    return undefined;
  }
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Parse a duration input ("90", "1:30", "1:30:00") → seconds, or null. */
export function parseDurationInput(raw: string): number | null {
  const v = parseFieldValue("timeSec", raw);
  return typeof v === "number" ? v : null;
}

/** RPE display: 8 → "8", 8.5 → "8.5". */
export function formatRpe(value: number): string {
  return value.toFixed(value % 1 ? 1 : 0);
}
