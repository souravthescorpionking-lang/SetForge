// Core domain formulas — pure functions, shared client + server.

/** Brzycki estimated 1RM: w * 36 / (37 - r). Guide only. */
export function estOneRm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const r = Math.max(1, Math.round(reps));
  if (r >= 37) return weight;
  return (weight * 36) / (37 - r);
}

/** Estimated nRM from a known 1RM: oneRM * (37 - n) / 36. */
export function estRm(oneRm: number, n: number): number {
  if (n <= 0 || n >= 37) return oneRm;
  return (oneRm * (37 - n)) / 36;
}

/** Total volume: Σ(weight × reps). */
export function totalVolume(sets: Array<{ weight?: number | null; reps?: number | null }>): number {
  return sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
}

/** Total reps. */
export function totalReps(sets: Array<{ reps?: number | null }>): number {
  return sets.reduce((sum, s) => sum + (s.reps ?? 0), 0);
}

/** Speed in distance-units per hour (e.g. km/h). */
export function speed(distance: number, timeSec: number): number {
  if (timeSec <= 0) return 0;
  return distance / (timeSec / 3600);
}

/** Pace in seconds per distance-unit (e.g. s/km). */
export function paceSec(distance: number, timeSec: number): number {
  if (distance <= 0) return 0;
  return timeSec / distance;
}

/** Round x to the nearest multiple of step (step > 0). */
export function roundToStep(x: number, step: number): number {
  if (!step || step <= 0) return x;
  return Math.round(x / step) * step;
}

export type PlateLike = { weight: number; count: number; isAvailable?: boolean };

/** Greedy plate loading: returns per-side plates to reach `target` total, or null if unreachable. */
export function plateGreedy(
  target: number,
  barWeight: number,
  plates: PlateLike[],
): Array<{ weight: number; count: number }> | null {
  const perSideTarget = (target - barWeight) / 2;
  if (perSideTarget < 0) return null;
  const avail = plates
    .filter((p) => p.isAvailable !== false && p.count > 0 && p.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const result: Array<{ weight: number; count: number }> = [];
  let remaining = perSideTarget;
  const EPS = 1e-9;
  for (const p of avail) {
    if (remaining + EPS < p.weight) continue;
    const use = Math.min(Math.floor((remaining + EPS) / p.weight), Math.floor(p.count / 2));
    if (use > 0) {
      result.push({ weight: p.weight, count: use });
      remaining -= use * p.weight;
    }
  }
  if (Math.abs(remaining) > 0.05) return null; // could not load exactly
  return result;
}

/** kg ↔ lbs conversion factor. */
export const KG_PER_LB = 0.45359237;
export function kgToLbs(kg: number): number {
  return kg / KG_PER_LB;
}
export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

/** Format seconds as hh:mm:ss (or mm:ss when under an hour). */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Format pace (sec per unit) as m:ss /u. */
export function formatPace(secPerUnit: number): string {
  if (!Number.isFinite(secPerUnit) || secPerUnit <= 0) return "–";
  const m = Math.floor(secPerUnit / 60);
  const s = Math.round(secPerUnit % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
