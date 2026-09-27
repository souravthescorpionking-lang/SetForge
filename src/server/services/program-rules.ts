// Pure cursor & status rules for Part 5 (no DB, no IO) — every function here is
// deterministic and unit-testable. The service layer feeds it plain data.
//
// Core invariants enforced by these rules:
//  1. A SESSION logged on a cursor WORKOUT day never advances the cursor
//     (provenance check: sourceRoutineId must equal the active routine).
//  2. Date-based advances (REST auto-advance, FINISH_OR_MIDNIGHT midnight) are
//     idempotent via `lastAdvancedForDate` (local YYYY-MM-DD).
//  3. Lazy schedule-status transitions never revert DONE/SKIPPED/MISSED.

// ---------- local dates ----------

/** Local calendar date (YYYY-MM-DD) of `now` in IANA timezone `tz`. */
export function localDateKey(tz: string, now: Date): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(now); // en-CA gives YYYY-MM-DD
  } catch {
    // invalid tz → fall back to UTC
    return now.toISOString().slice(0, 10);
  }
}

/** Epoch ms of the NEXT local midnight in `tz` after `now` (for client timers). */
export function nextLocalMidnightMs(tz: string, now: Date): number {
  const key = localDateKey(tz, now);
  // Try increasing offsets until the local date rolls over (max 2 days out).
  for (let add = 1; add <= 2; add++) {
    const candidate = new Date(now.getTime() + add * 24 * 60 * 60 * 1000);
    if (localDateKey(tz, candidate) !== key) {
      // binary-search the exact boundary (minute precision is enough for timers)
      let lo = now.getTime();
      let hi = candidate.getTime();
      for (let i = 0; i < 20 && hi - lo > 1000; i++) {
        const mid = Math.floor((lo + hi) / 2);
        if (localDateKey(tz, new Date(mid)) === key) lo = mid;
        else hi = mid;
      }
      return hi;
    }
  }
  return now.getTime() + 24 * 60 * 60 * 1000;
}

/** Compare two YYYY-MM-DD keys: -1 | 0 | 1. */
export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Add N days to a YYYY-MM-DD key (UTC arithmetic — keys are calendar dates). */
export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days between two YYYY-MM-DD keys (a - b). */
export function diffDateKeys(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00.000Z`).getTime();
  const dbb = new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.round((da - dbb) / 86400000);
}

// ---------- cursor math ----------

export type ProgramDay = { id: string; name: string; dayType: string };

/** Clamp a cursor index into [0, len-1] (len 0 → 0). */
export function clampCursor(index: number, len: number): number {
  if (len <= 0) return 0;
  return Math.min(Math.max(index, 0), len - 1);
}

/** Advance with modulo wrap-around. */
export function advanceIndex(index: number, len: number, n = 1): number {
  if (len <= 0) return 0;
  return ((index + n) % len + len) % len;
}

/**
 * One step of the lazy rule engine: decide whether the cursor should advance
 * from the current day, given all rule inputs. Pure — returns the number of
 * advances to apply (0 or 1 per call; caller loops).
 *
 * @param day            current cursor day
 * @param todayKey       local date now
 * @param anchorKey      local date the cursor last moved (lastAdvancedForDate or
 *                       local date of startedAt) — advances happen at most once
 *                       per local date
 * @param settings       user program settings
 * @param qualifying     workout logged from THIS day with ≥1 set of real data
 *                       (provenance-matched, schedule-checked by caller), or null
 */
export function shouldAdvanceCursor(input: {
  day: ProgramDay;
  todayKey: string;
  anchorKey: string;
  settings: { autoAdvanceRest: boolean; advanceTrigger: string };
  qualifyingWorkout: { hasLoggedData: boolean; dateKey: string; finished: boolean } | null;
}): boolean {
  const { day, todayKey, anchorKey, settings, qualifyingWorkout } = input;

  if (day.dayType === "REST") {
    // REST auto-advance: first request on/after the midnight following the
    // anchor date (i.e. today is strictly after the anchor).
    return settings.autoAdvanceRest && compareDateKeys(todayKey, anchorKey) > 0;
  }

  // WORKOUT day: needs a provenance-matched workout.
  if (!qualifyingWorkout) return false;

  // a finished workout always advances (the Finish action completed the day)
  if (qualifyingWorkout.finished) return true;

  if (!qualifyingWorkout.hasLoggedData) return false;

  if (settings.advanceTrigger === "FIRST_SET") {
    // advances as soon as the first set is saved — any date (incl. today)
    return compareDateKeys(anchorKey, todayKey) < 0 || qualifyingWorkout.dateKey === todayKey;
  }

  // FINISH_OR_MIDNIGHT: else first request after local midnight if ≥1 set
  // (workout date strictly before today), once.
  return compareDateKeys(qualifyingWorkout.dateKey, todayKey) < 0;
}

// ---------- lazy schedule status ----------

export type EntryStatusInput = {
  storedStatus: string;
  dateKey: string;
  todayKey: string;
  linkedWorkoutHasData: boolean;
  linkedWorkoutFinished: boolean;
  /**
   * Part 6 (§4.13): absolute ms cutoff for time-of-day scheduling —
   * `toDayUtc(dateKey) + timeOfDay + MISSED_GRACE_HOURS`. Null = all-day entry
   * (midnight rule only). Callers compute this from their timezone context.
   */
  missedCutoffMs?: number | null;
  nowMs?: number;
};

/**
 * Lazy status transition (applied on read, persisted opportunistically):
 *   PLANNED → DONE   when the linked workout has ≥1 logged set AND
 *                     (finishedAt set OR entry date < today)
 *   PLANNED → MISSED when date < today AND no linked workout with data
 *                     (all-day) — or, with a time-of-day, once
 *                     now > date + timeOfDay + 4h grace (§4.13)
 *   DONE/SKIPPED/MISSED never auto-revert. Reopen → PLANNED is user-driven and
 *   only allowed for date ≥ today.
 */
export function deriveEntryStatus(input: EntryStatusInput): string {
  const { storedStatus, dateKey, todayKey, linkedWorkoutHasData, linkedWorkoutFinished } = input;
  if (storedStatus !== "PLANNED") return storedStatus;

  const past = compareDateKeys(dateKey, todayKey) < 0;
  if (linkedWorkoutHasData && (linkedWorkoutFinished || past)) return "DONE";
  if (input.missedCutoffMs != null && input.nowMs != null && input.nowMs > input.missedCutoffMs) {
    return "MISSED";
  }
  if (past && !linkedWorkoutHasData) return "MISSED";
  return "PLANNED";
}

/** Compute the §4.13 missed cutoff (ms) for a date + "HH:MM" time-of-day. */
export function missedCutoffMs(dateKey: string, timeOfDay: string | null | undefined, graceHours = 4): number | null {
  if (!timeOfDay) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay.trim());
  if (!m) return null;
  const [y, mo, d] = dateKey.split("-").map(Number);
  const base = Date.UTC(y, mo - 1, d);
  return base + (Number(m[1]) * 3600 + Number(m[2]) * 60) * 1000 + graceHours * 3600 * 1000;
}

// ---------- projection ----------

/**
 * Project the cursor forward over `count` days from `todayKey` for the upcoming
 * strip / calendar ghosts. Assumes the happy path: each WORKOUT day is logged
 * (advances next day per trigger semantics we simplify to "next day") and each
 * REST day advances when autoAdvanceRest, otherwise it lingers.
 */
export function projectCursor(input: {
  days: ProgramDay[];
  startIndex: number;
  todayKey: string;
  settings: { autoAdvanceRest: boolean };
  count: number;
}): Array<{ dateKey: string; day: ProgramDay; index: number }> {
  const { days, startIndex, todayKey, settings, count } = input;
  const out: Array<{ dateKey: string; day: ProgramDay; index: number }> = [];
  if (days.length === 0) return out;

  let idx = clampCursor(startIndex, days.length);
  let date = todayKey;
  for (let i = 0; i < count; i++) {
    date = addDaysKey(date, 1);
    const day = days[idx];
    // advance simulation: WORKOUT day assumed logged; REST day advances only
    // when autoAdvanceRest, otherwise it repeats (the workout day behind it
    // would also stall, but the strip is informational)
    if (day.dayType === "REST") {
      if (settings.autoAdvanceRest) idx = advanceIndex(idx, days.length, 1);
    } else {
      idx = advanceIndex(idx, days.length, 1);
    }
    out.push({ dateKey: date, day: days[idx], index: idx });
  }
  return out;
}

/** Does this routine qualify to be followed? ROUTINE kind + ≥1 WORKOUT day. */
export function isFollowable(kind: string, days: Array<{ dayType: string }>): boolean {
  return kind === "ROUTINE" && days.some((d) => d.dayType !== "REST");
}

/** SESSION integrity: exactly one day and it must be a WORKOUT day. */
export function isValidSession(kind: string, days: Array<{ dayType: string }>): boolean {
  return kind !== "SESSION" || (days.length === 1 && days[0].dayType !== "REST");
}
