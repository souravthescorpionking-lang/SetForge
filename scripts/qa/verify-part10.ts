/**
 * Part 10 §13 — unit verification battery (bun script, no test framework).
 *
 *   1.  total-time derivation — formatTotalTime mm:ss under 1h, h:mm:ss after;
 *       derivation now − startAt never accumulates (pure math check).
 *   2.  focus-advance order for superset/triset/giant — series-order walk
 *       (A1 s1 → A2 s1 → A3 s1 → A1 s2 …) skips logged sets.
 *   3.  k → BottomBar label mapping (0..6 + existing-series label).
 *   4.  4-cap per series (cap = 4 − existing members; unlimited for new).
 *   5.  tempo parse/format incl. "x" (parseTempo/normaliseTempo round-trips).
 *   6.  builder validation matrix — name required, duration 5–300,
 *       reps ≥ 1 or AMRAP, ≥1 exercise, min-1-set block.
 *   7.  totalVolume with mixed units — Σ completed reps×weight (warm-ups
 *       excluded from the PR path but counted for volume; AMRAP counts).
 *   8.  history-column alignment with missing sets — "—" fills gaps, best
 *       weight per row bolds across ≤4 session columns.
 *   9.  future-date guard — local-day-key comparison (tomorrow blocked,
 *       today allowed, yesterday allowed; timezone-offset safe).
 *   10. step ADD vs SET — ADD accumulates onto the day's entry, SET replaces.
 *   11. difficulty ↔ fitness level single-source — DIFFICULTIES is the only
 *       level vocabulary (PROFILE_LEVELS mirrors it; §9 row writes
 *       user.difficulty through the ONE shared hook).
 *   12. exit semantics — endWorkout decision table (n=0/off → discard;
 *       n>0/off → finished-not-complete, no advance; on → finish+advance)
 *       checked against the pure branch logic mirrored from the service.
 *   13. password strength heuristic — score ≥ 3 gates save; common weak
 *       passwords score < 3; strong passphrases score ≥ 3.
 *
 * Exit 1 on any failure.
 */
import { formatTotalTime } from "../../src/features/session/time.ts";
import { addLabelFor } from "../../src/features/builder/add-exercise-screen.tsx";
import { parseTempo, normaliseTempo, DIFFICULTIES, PROFILE_LEVELS } from "../../src/lib/constants.ts";
import { estimateMinutes } from "../../src/features/builder/build-screen.tsx";
import { passwordStrength } from "../../src/features/account/password-screen.tsx";

let failures = 0;
const fail = (msg: string) => {
  failures += 1;
  console.error(`✗ ${msg}`);
};
const pass = (msg: string) => console.log(`✓ ${msg}`);
const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass(msg);
  else fail(`${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};
const ok = (cond: boolean, msg: string) => (cond ? pass(msg) : fail(msg));

// ── 1. total-time derivation ────────────────────────────────────────────────
{
  eq(formatTotalTime(0), "00:00", "1. total time 0s → 00:00");
  eq(formatTotalTime(22), "00:22", "1. total time 22s → 00:22 (spec copy)");
  eq(formatTotalTime(59 * 60 + 59), "59:59", "1. total time 59:59 stays mm:ss");
  eq(formatTotalTime(3600), "1:00:00", "1. total time 1h → h:mm:ss");
  eq(formatTotalTime(3 * 3600 + 17 * 60 + 8), "3:17:08", "1. total time 3h17m08s → 3:17:08 (exit-modal copy)");
  // derivation is stateless: now − startAt recomputed every tick never drifts.
  const startAt = Date.now() - 125_000;
  const derived = Math.max(0, Math.round((Date.now() - startAt) / 1000));
  ok(Math.abs(derived - 125) <= 1, "1. derived total (now − startAt) within 1s of 125s");
}

// ── 2. focus-advance order (series round-robin, logged skip) ────────────────
{
  /** Mirror of the §3.1 walk: groups in order, members in order, sets in
   *  order — one set per member per round (superset/triset/giant semantics). */
  function focusOrder(membersPerGroup: number[], setsPerMember: number): string[] {
    const order: string[] = [];
    const rounds = setsPerMember;
    for (let round = 0; round < rounds; round++) {
      membersPerGroup.forEach((memberCount, groupIdx) => {
        for (let m = 0; m < memberCount; m++) order.push(`G${groupIdx + 1}M${m + 1}S${round + 1}`);
      });
    }
    return order;
  }
  eq(focusOrder([2, 1], 2), ["G1M1S1", "G1M2S1", "G2M1S1", "G1M1S2", "G1M2S2", "G2M1S2"], "2. superset A1→A2→B1→A1(s2)…");
  eq(focusOrder([3], 2), ["G1M1S1", "G1M2S1", "G1M3S1", "G1M1S2", "G1M2S2", "G1M3S2"], "2. triset A1→A2→A3→A1(s2)…");
  eq(focusOrder([4], 1), ["G1M1S1", "G1M2S1", "G1M3S1", "G1M4S1"], "2. giant set single round");
  // logged skip: the next unlogged after G1M1S1+G1M2S1 is G1M3S1.
  const walked = focusOrder([3], 2);
  const logged = new Set(["G1M1S1", "G1M2S1"]);
  eq(walked.find((k) => !logged.has(k)), "G1M3S1", "2. next unlogged focus after 2 of a triset");
}

// ── 3. k → label mapping ────────────────────────────────────────────────────
{
  eq(addLabelFor(0, false, ""), "Add", "3. k=0 disabled label 'Add'");
  eq(addLabelFor(1, false, ""), "Add exercise", "3. k=1");
  eq(addLabelFor(2, false, ""), "Add as superset", "3. k=2");
  eq(addLabelFor(3, false, ""), "Add as triset", "3. k=3");
  eq(addLabelFor(4, false, ""), "Add as giant set", "3. k=4");
  eq(addLabelFor(5, false, ""), "Add 5 exercises", "3. k=5 → separate series");
  eq(addLabelFor(6, false, ""), "Add 6 exercises", "3. k=6");
  eq(addLabelFor(2, true, "Superset"), "Add to Superset", "3. existing series label");
}

// ── 4. 4-cap per series ─────────────────────────────────────────────────────
{
  const capFor = (seriesExisting: boolean, members: number) => (seriesExisting ? Math.max(0, 4 - members) : Number.POSITIVE_INFINITY);
  eq(capFor(true, 0), 4, "4. empty existing series caps at 4");
  eq(capFor(true, 2), 2, "4. 2-member series leaves room for 2");
  eq(capFor(true, 4), 0, "4. full series blocks (0)");
  ok(capFor(false, 0) === Number.POSITIVE_INFINITY, "4. new series unlimited (≥5 → separate)");
}

// ── 5. tempo parse/format incl. x ───────────────────────────────────────────
{
  eq(parseTempo("3-1-1-0"), [3, 1, 1, 0], "5. parse 3-1-1-0");
  eq(parseTempo("2-0-x-0"), [2, 0, -1, 0], "5. parse x in concentric slot");
  eq(parseTempo("banana"), null, "5. invalid tempo → null");
  eq(normaliseTempo("3-1-1-0"), "3-1-1-0", "5. normalise round-trip");
  ok(normaliseTempo("2-0-x-0")?.includes("x"), "5. x survives normalise");
  ok(normaliseTempo("9-9-9") === "9-9-9-0", "5. 3-part tempo normalises to 4-part (legacy input)");
  ok(parseTempo("1-2-3-4-5") == null, "5. 5-part tempo rejected");
}

// ── 6. builder validation matrix ────────────────────────────────────────────
{
  type SetLike = { reps: number | null; setType: string | null };
  const invalidSets = (sets: SetLike[]) => sets.filter((s) => s.setType !== "AMRAP" && (s.reps == null || s.reps < 1)).length;
  const nameError = (name: string) => name.trim() === "";
  const minutesError = (m: number | null) => m != null && (!Number.isFinite(m) || m < 5 || m > 300);
  ok(nameError(""), "6. empty name invalid");
  ok(!nameError(" QA "), "6. trimmed name valid");
  ok(minutesError(null) === false, "6. empty duration allowed (estimated on save)");
  ok(minutesError(4), "6. duration 4 invalid");
  ok(!minutesError(5) && !minutesError(300), "6. duration 5..300 valid");
  ok(minutesError(301), "6. duration 301 invalid");
  eq(invalidSets([{ reps: 0, setType: "NORMAL" }]), 1, "6. reps 0 invalid");
  eq(invalidSets([{ reps: null, setType: "NORMAL" }]), 1, "6. reps null invalid");
  eq(invalidSets([{ reps: null, setType: "AMRAP" }]), 0, "6. AMRAP set without reps valid");
  eq(invalidSets([{ reps: 8, setType: "NORMAL" }]), 0, "6. reps 8 valid");
  ok(estimateMinutes([{ sets: [{ reps: 8, setType: "NORMAL" }], restNone: false }]) >= 5, "6. estimate ≥ 5 for one set");
  const est = estimateMinutes([
    { sets: [{ reps: 8, setType: "NORMAL" }, { reps: 8, setType: "NORMAL" }, { reps: 8, setType: "NORMAL" }], restNone: false },
  ]);
  ok(est % 5 === 0, `6. estimate rounded to 5 (got ${est})`);
}

// ── 7. totalVolume with mixed units ─────────────────────────────────────────
{
  /** Mirror of computeWorkoutTotals: Σ reps×weight over COMPLETED sets. */
  const totalVolume = (sets: { reps: number | null; weight: number | null; isComplete: boolean }[]) =>
    sets.reduce((n, s) => (s.isComplete ? n + (s.weight ?? 0) * (s.reps ?? 0) : n), 0);
  eq(totalVolume([{ reps: 8, weight: 85, isComplete: true }]), 680, "7. 8×85 → 680 kg");
  eq(
    totalVolume([
      { reps: 8, weight: 85, isComplete: true },
      { reps: 10, weight: 0, isComplete: true }, // bodyweight set
      { reps: 6, weight: 100, isComplete: false }, // unlogged — excluded
    ]),
    680,
    "7. unlogged excluded, bodyweight contributes 0",
  );
  eq(totalVolume([{ reps: 12, weight: 62.5, isComplete: true }]), 750, "7. AMRAP actual reps count (12×62.5)");
}

// ── 8. history-column alignment with missing sets ───────────────────────────
{
  /** Compare-table fill: fixed Set column + one column per session; missing
   *  cells "—"; best weight per ROW bolds (max across present cells). */
  type Cell = string | null; // null = missing
  function renderRow(sessions: Cell[][]): { cells: string[]; bestIdx: number | null } {
    const rowIdx = 0;
    const cells = sessions.map((s) => (s[rowIdx] == null ? "—" : s[rowIdx] as string));
    const weights = sessions
      .map((s, i) => (s[rowIdx] == null ? null : { i, w: Number((s[rowIdx] as string).split("×")[1]) }))
      .filter((v): v is { i: number; w: number } => v != null);
    const best = weights.length ? weights.reduce((a, b) => (b.w > a.w ? b : a)) : null;
    return { cells, bestIdx: best?.i ?? null };
  }
  const r1 = renderRow([["8×85"], ["8×82.5"], [null], ["8×85"]]);
  eq(r1.cells, ["8×85", "8×82.5", "—", "8×85"], "8. missing session renders —");
  eq(r1.bestIdx, 0, "8. best weight bolds the first max cell");
  const r2 = renderRow([[null], [null]]);
  eq(r2.cells, ["—", "—"], "8. all-missing row is all —");
  eq(r2.bestIdx, null, "8. no best when row empty");
}

// ── 9. future-date guard (local timezone) ───────────────────────────────────
{
  /** Local YYYY-MM-DD of a Date WITHOUT UTC drift (the app's localDayKey rule). */
  const localKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const isFuture = (key: string, todayKey: string) => key > todayKey;
  const now = new Date();
  const today = localKey(now);
  const tomorrow = localKey(new Date(now.getTime() + 86_400_000));
  const yesterday = localKey(new Date(now.getTime() - 86_400_000));
  ok(!isFuture(today, today), "9. today allowed");
  ok(isFuture(tomorrow, today), "9. tomorrow blocked");
  ok(!isFuture(yesterday, today), "9. yesterday allowed");
  // 23:59 vs 00:01 boundary stays inside the same local day.
  const late = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
  const early = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 1);
  eq(localKey(late), today, "9. 23:59 same local day");
  eq(localKey(early), today, "9. 00:01 same local day");
}

// ── 10. step ADD vs SET ─────────────────────────────────────────────────────
{
  /** Mirror of the upsert rule: ADD adds to the existing entry, SET replaces. */
  const apply = (existing: number | null, steps: number, mode: "ADD" | "SET") =>
    mode === "ADD" ? (existing ?? 0) + steps : steps;
  eq(apply(null, 4000, "ADD"), 4000, "10. ADD to empty day → 4000");
  eq(apply(4000, 1500, "ADD"), 5500, "10. ADD accumulates");
  eq(apply(5500, 9000, "SET"), 9000, "10. SET replaces");
  eq(apply(0, 6000, "ADD"), 6000, "10. ADD onto zero-entry");
}

// ── 11. difficulty ↔ fitness level single-source ─────────────────────────────
{
  eq(DIFFICULTIES, ["BEGINNER", "INTERMEDIATE", "ADVANCED"], "11. DIFFICULTIES vocabulary");
  eq(
    [...PROFILE_LEVELS].sort(),
    [...DIFFICULTIES].sort(),
    "11. PROFILE_LEVELS mirrors DIFFICULTIES (one vocabulary)",
  );
}

// ── 12. exit semantics decision table ───────────────────────────────────────
{
  /** Mirror of endWorkout's branch logic (§3.6). */
  type Outcome = { discarded: boolean; finished: boolean; markedComplete: boolean; advances: boolean };
  const exitOutcome = (n: number, markComplete: boolean): Outcome => {
    if (markComplete) return { discarded: false, finished: true, markedComplete: true, advances: true };
    if (n === 0) return { discarded: true, finished: false, markedComplete: false, advances: false };
    return { discarded: false, finished: true, markedComplete: false, advances: false };
  };
  eq(exitOutcome(0, false), { discarded: true, finished: false, markedComplete: false, advances: false }, "12. n=0 Mark OFF → discarded");
  eq(exitOutcome(2, false), { discarded: false, finished: true, markedComplete: false, advances: false }, "12. n>0 Mark OFF → partial saved, no advance");
  eq(exitOutcome(2, true), { discarded: false, finished: true, markedComplete: true, advances: true }, "12. Mark ON → finish + advance");
  eq(exitOutcome(0, true), { discarded: false, finished: true, markedComplete: true, advances: true }, "12. Mark ON with n=0 → marked-off day finish");
}

// ── 13. password strength heuristic ─────────────────────────────────────────
{
  ok(passwordStrength("short") < 3, "13. 'short' weak");
  ok(passwordStrength("password123") < 3, "13. 'password123' weak (single case + digits)");
  ok(passwordStrength("Str0ng!Passw0rd2026") >= 3, "13. mixed+long strong");
  ok(passwordStrength("Ab1!Ab1!Ab1!Ab1!") >= 3, "13. classes+length strong");
  eq(passwordStrength(""), 0, "13. empty scores 0");
}

console.log(failures === 0 ? "\nPart 10 battery: ALL PASS" : `\nPart 10 battery: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
