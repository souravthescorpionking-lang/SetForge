// ─────────────────────────────────────────────────────────────────────────────
// Part 8 §2.1 — grouping semantics (single source of truth).
//
// Every exercise belongs to exactly one group: a real superset group when
// grouped, or its own singleton group when ungrouped. Series code: letter =
// group order in the day (A, B, C…); number = position within group (1, 2…).
// Group label by size: 1 → "" · 2 → "Superset" · 3 → "Triset" · 4+ → "Giant set".
//
// Codes are DERIVED on every reorder/regroup and stored only as a cache
// (WorkoutGroup/RoutineGroup.code/size) — never user-edited.
// Pure + deterministic.
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupingInput {
  id: string;
  groupId: string | null;
  sortOrder?: number;
}

export interface DerivedGroup<E extends GroupingInput> {
  /** groupId for real groups, `solo:{id}` for singleton groups. */
  key: string;
  /** Real groupId (null for singletons). */
  groupId: string | null;
  /** Group letter ("A"). */
  code: string;
  /** Label by size: "" | "Superset" | "Triset" | "Giant set". */
  label: string;
  /** Member count. */
  size: number;
  /** Members in order. */
  members: E[];
}

/** Group label by member count (§2.1). */
export function groupLabelForSize(size: number): string {
  if (size <= 1) return "";
  if (size === 2) return "Superset";
  if (size === 3) return "Triset";
  return "Giant set";
}

/**
 * Derive the ordered group list from sortOrder-sorted members. Groups appear
 * in order of their first member; singleton (ungrouped) exercises become
 * their own group of 1 at their position. Letters follow group order
 * (A, B, C… — wrapped mod 26).
 */
export function deriveGroups<E extends GroupingInput>(items: E[]): DerivedGroup<E>[] {
  const ordered = [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const buckets = new Map<string, E[]>();
  const order: string[] = [];
  for (const item of ordered) {
    const key = item.groupId ?? `solo:${item.id}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }
  return order.map((key, i) => {
    const members = buckets.get(key)!;
    return {
      key,
      groupId: key.startsWith("solo:") ? null : key,
      code: String.fromCharCode(65 + (i % 26)),
      label: groupLabelForSize(members.length),
      size: members.length,
      members,
    };
  });
}

/** Series code for one member ("A1") given the derived group. */
export function memberCode(groupCode: string, indexInGroup: number): string {
  return `${groupCode}${indexInGroup + 1}`;
}

// ── §6.2 warm-up generator ──────────────────────────────────────────────────

export type WarmupScheme = "NONE" | "STANDARD" | "LIGHT" | "CUSTOM";

export interface WarmupStep {
  pct: number; // % of the first working weight
  reps: number;
}

/** STANDARD: 40/60/80% × 5/3/2 · LIGHT: 50/70% × 5/3 (spec §6.2). */
export const WARMUP_SCHEMES: Record<"STANDARD" | "LIGHT", WarmupStep[]> = {
  STANDARD: [
    { pct: 40, reps: 5 },
    { pct: 60, reps: 3 },
    { pct: 80, reps: 2 },
  ],
  LIGHT: [
    { pct: 50, reps: 5 },
    { pct: 70, reps: 3 },
  ],
};

/**
 * Generate warm-up steps for a first working weight. Weight is rounded to the
 * exercise's plate step (weightIncrement, default 2.5). Excluded from
 * PRs/e1RM/volume (existing WARMUP set-type rule).
 */
export function generateWarmup(
  firstWorkingWeight: number,
  scheme: WarmupScheme,
  custom?: WarmupStep[] | null,
  plateStep = 2.5,
): Array<{ weight: number; reps: number }> {
  const steps =
    scheme === "STANDARD"
      ? WARMUP_SCHEMES.STANDARD
      : scheme === "LIGHT"
        ? WARMUP_SCHEMES.LIGHT
        : scheme === "CUSTOM"
          ? (custom ?? [])
          : [];
  const round = (w: number) => Math.max(0, Math.round(w / plateStep) * plateStep);
  return steps.map((s) => ({ weight: round((firstWorkingWeight * s.pct) / 100), reps: s.reps }));
}

// ── §6.3 progression evaluation ─────────────────────────────────────────────

export type ProgressionType = "LINEAR" | "DOUBLE" | "NONE";
export type ProgressionCondition = "ALL_SETS_HIT" | "LAST_SET_HIT";

export interface ProgressionRuleLike {
  type: ProgressionType;
  increment: number;
  unit: string; // kg | lbs | %
  condition: ProgressionCondition;
  failStreakForDeload: number;
  deloadPct: number;
}

export interface PerformedSetLike {
  weight?: number | null;
  reps?: number | null;
  targetReps?: number | null;
  isComplete?: boolean;
  setType?: string | null;
}

export interface ProgressionStateLike {
  nextWeightDelta: number;
  failStreak: number;
}

/**
 * Evaluate one exercise's progression after a session sourced from its
 * routine (spec §6.3). Hit = every (or the last) set completed its target
 * reps. Success → +increment (DOUBLE doubles after 2 consecutive hits);
 * failure → failStreak+1, deload ×(1-pct) after failStreakForDeload.
 */
export function evaluateProgression(
  rule: ProgressionRuleLike,
  sets: PerformedSetLike[],
  prev: ProgressionStateLike,
  plateStep = 2.5,
): ProgressionStateLike {
  if (rule.type === "NONE") return { nextWeightDelta: 0, failStreak: 0 };

  const target = (s: PerformedSetLike) => s.targetReps ?? s.reps ?? 0;
  const done = (s: PerformedSetLike) => (s.isComplete ?? false) && (s.reps ?? 0) >= target(s);
  const relevant = rule.condition === "LAST_SET_HIT" ? sets.slice(-1) : sets;
  const hit = relevant.length > 0 && relevant.every(done);

  const round = (d: number) => Math.round(d / plateStep) * plateStep;

  if (hit) {
    const double = rule.type === "DOUBLE" && prev.failStreak === 0 && prev.nextWeightDelta > 0;
    const delta = round(prev.nextWeightDelta + rule.increment * (double ? 2 : 1));
    return { nextWeightDelta: delta, failStreak: 0 };
  }

  const failStreak = prev.failStreak + 1;
  if (failStreak >= rule.failStreakForDeload) {
    // Deload (§6.3): next working weight = this session's first working
    // weight × (1-pct). copy-last(next) resolves to this session's weight,
    // so the delta REPLACES the accumulated increment with -pct% of it.
    // Without performed weights we fall back to scaling the accumulated delta.
    const firstWorking = sets.find((s) => s.weight != null && s.setType !== "WARMUP")?.weight ?? null;
    const delta =
      firstWorking != null
        ? -round((firstWorking * rule.deloadPct) / 100)
        : round(prev.nextWeightDelta * (1 - rule.deloadPct / 100));
    return { nextWeightDelta: delta, failStreak: 0 };
  }
  return { nextWeightDelta: prev.nextWeightDelta, failStreak };
}

// ── §6.4 %1RM resolution ────────────────────────────────────────────────────

export type WeightKind = "FIXED" | "COPY_LAST" | "PERCENT_1RM";

/**
 * Resolve a prescribed weight to a concrete number (spec §6.4).
 * PERCENT_1RM: e1RM × pct/100, rounded to the plate step; no e1RM yet →
 * falls back to copy-last (null). COPY_LAST/FIXED without a value → null
 * (copy-last semantics: filled at log time).
 */
export function resolvePrescribedWeight(
  kind: WeightKind | null | undefined,
  pct: number | null | undefined,
  fixedWeight: number | null | undefined,
  e1rm: number | null,
  plateStep = 2.5,
): number | null {
  if (kind === "PERCENT_1RM") {
    if (e1rm == null || !pct) return null; // fallback → copy-last
    const round = (w: number) => Math.round(w / plateStep) * plateStep;
    return Math.max(0, round((e1rm * pct) / 100));
  }
  if (kind === "FIXED") return fixedWeight ?? null;
  return null; // COPY_LAST or unset
}

// ── §6.6 7-day moving average ───────────────────────────────────────────────

/** 7-day moving average series (primary body-trend value; raw shown 12px muted). */
export function movingAverage7(values: Array<{ at: number; value: number }>): Array<{ at: number; value: number }> {
  const sorted = [...values].sort((a, b) => a.at - b.at);
  const out: Array<{ at: number; value: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const window = sorted.slice(Math.max(0, i - 6), i + 1);
    out.push({ at: sorted[i].at, value: window.reduce((s, v) => s + v.value, 0) / window.length });
  }
  return out;
}
