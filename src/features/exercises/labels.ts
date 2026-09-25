// Label maps + unit-aware formatting helpers shared by the exercises manager
// and the exercise overview (both folders owned by task 4-b).
import { fieldsForType } from "@/lib/constants";
import { formatDuration, formatPace } from "@/lib/formulas";
import { round1, round2 } from "@/lib/client/format";

export const EXERCISE_TYPE_LABELS: Record<string, string> = {
  WEIGHT_REPS: "Weight + Reps",
  DISTANCE_TIME: "Distance + Time",
  WEIGHT_DISTANCE: "Weight + Distance",
  WEIGHT_TIME: "Weight + Time",
  REPS_DISTANCE: "Reps + Distance",
  REPS_TIME: "Reps + Time",
  WEIGHT: "Weight only",
  REPS: "Reps only",
  DISTANCE: "Distance only",
  TIME: "Time only",
};

export function typeLabel(type: string): string {
  return EXERCISE_TYPE_LABELS[type] ?? type;
}

export const GRAPH_METRIC_LABELS: Record<string, string> = {
  EST_1RM: "Estimated 1RM",
  MAX_WEIGHT: "Max weight",
  VOLUME: "Total volume",
  TOTAL_REPS: "Total reps",
  MAX_REPS: "Max reps",
  WEIGHT_FOR_REPS: "Weight for reps",
  REP_MAXES: "Rep maxes (nRM)",
  MAX_DISTANCE: "Max distance",
  MAX_TIME: "Max time",
  MAX_SPEED: "Max speed",
  MAX_PACE: "Best pace",
};

export function graphMetricLabel(metric: string): string {
  return GRAPH_METRIC_LABELS[metric] ?? metric;
}

export const GOAL_TYPE_LABELS: Record<string, string> = {
  ONE_RM: "Estimated 1RM",
  MAX_WEIGHT: "Max weight",
  MAX_REPS: "Max reps",
  MAX_DISTANCE: "Max distance",
  MAX_TIME: "Max time",
  VOLUME: "Total volume",
};

export function goalTypeLabel(type: string): string {
  return GOAL_TYPE_LABELS[type] ?? type;
}

// ---------- units ----------

export type WeightUnit = "kg" | "lbs";

export function defaultUnitFor(settings: { unitSystem?: string } | null | undefined): WeightUnit {
  return settings?.unitSystem === "imperial" ? "lbs" : "kg";
}

/** The unit an exercise's weights are expressed in (per-exercise override → settings). */
export function exerciseUnit(
  exercise: { weightUnit?: string | null },
  settings: { unitSystem?: string } | null | undefined,
): WeightUnit {
  if (exercise.weightUnit === "lbs") return "lbs";
  if (exercise.weightUnit === "kg") return "kg";
  return defaultUnitFor(settings);
}

// ---------- metric suitability ----------

/** Graph metrics that make sense for a given exercise type. */
export function metricsForType(type: string): string[] {
  const f = new Set(fieldsForType(type));
  const hasW = f.has("weight");
  const hasR = f.has("reps");
  const hasD = f.has("distance");
  const hasT = f.has("timeSec");
  const all = [
    "EST_1RM",
    "MAX_WEIGHT",
    "VOLUME",
    "TOTAL_REPS",
    "MAX_REPS",
    "WEIGHT_FOR_REPS",
    "REP_MAXES",
    "MAX_DISTANCE",
    "MAX_TIME",
    "MAX_SPEED",
    "MAX_PACE",
  ];
  const ok: Record<string, boolean> = {
    EST_1RM: hasW && hasR,
    MAX_WEIGHT: hasW,
    VOLUME: hasW && hasR,
    TOTAL_REPS: hasR,
    MAX_REPS: hasR,
    WEIGHT_FOR_REPS: hasW && hasR,
    REP_MAXES: hasW && hasR,
    MAX_DISTANCE: hasD,
    MAX_TIME: hasT,
    MAX_SPEED: hasD && hasT,
    MAX_PACE: hasD && hasT,
  };
  return all.filter((m) => ok[m]);
}

/** Preferred metric for a type when the exercise has no default yet. */
export function fallbackMetricForType(type: string): string {
  const allowed = metricsForType(type);
  if (allowed.includes("EST_1RM")) return "EST_1RM";
  if (allowed.includes("MAX_DISTANCE")) return "MAX_DISTANCE";
  if (allowed.includes("MAX_TIME")) return "MAX_TIME";
  return allowed[0] ?? "EST_1RM";
}

// ---------- value formatting ----------

/** Formatter for graph Y axis / tooltips, metric- and unit-aware. */
export function metricValueFormatter(metric: string, unit: WeightUnit): (v: number) => string {
  switch (metric) {
    case "MAX_TIME":
      return (v) => formatDuration(v);
    case "MAX_PACE":
      return (v) => `${formatPace(v)}/km`;
    case "MAX_DISTANCE":
      return (v) => `${round2(v)} km`;
    case "MAX_SPEED":
      return (v) => `${round2(v)} km/h`;
    default:
      return (v) => `${round1(v)} ${unit}`;
  }
}

/** Compact value label for goal cards / records. */
export function goalValueLabel(type: string, v: number | null | undefined, unit: WeightUnit): string {
  if (v == null) return "–";
  switch (type) {
    case "MAX_TIME":
      return formatDuration(v);
    case "MAX_DISTANCE":
      return `${round2(v)} km`;
    case "MAX_REPS":
      return `${Math.round(v)} reps`;
    default:
      return `${round1(v)} ${unit}`;
  }
}

/** Weight label with unit, e.g. "82.5 kg". */
export function weightLabel(v: number | null | undefined, unit: WeightUnit): string {
  if (v == null) return "–";
  return `${round1(v)} ${unit}`;
}

/** Which goal target field a goal type uses. */
export function goalTargetField(type: string): "targetWeight" | "targetReps" | "targetDistance" | "targetTimeSec" {
  switch (type) {
    case "MAX_REPS":
      return "targetReps";
    case "MAX_DISTANCE":
      return "targetDistance";
    case "MAX_TIME":
      return "targetTimeSec";
    default:
      return "targetWeight"; // ONE_RM, MAX_WEIGHT, VOLUME
  }
}
