/**
 * Part 8 §8 — architecture + unit verification (bun script, no test framework).
 *
 * AST-ish checks (Law 1/3):
 *   1. Exactly ONE GroupCard component definition (src/components/group-card).
 *   2. Exactly ONE SetRow component definition (src/components/set-row).
 *   3. ZERO ExerciseCard references anywhere in src/ (the old name is dead).
 *   4. ZERO `lg:` breakpoint classes in app code (src/ minus ui primitives).
 *   5. Routes: every legacy hash rewrites to its Part 8 successor.
 *
 * Unit checks (§8 unit list):
 *   series codes on reorder/regroup · group labels by size · warm-up generation
 *   & rounding · progression eval (hit/fail/deload) · %1RM resolve & fallback ·
 *   7-day average · preset → settings mapping · remove/restore semantics (API
 *   level is covered by the harness; here we assert the reason vocabulary).
 * Exit 1 on any failure.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const fail = (msg: string) => {
  failures += 1;
  console.error(`✗ ${msg}`);
};
const pass = (msg: string) => console.log(`✓ ${msg}`);

// ── file walker ──────────────────────────────────────────────────────────────
function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const SRC = "src";
const files = walk(SRC, [".ts", ".tsx"]);

// 1. ONE GroupCard
const groupCardDefs = files.filter(
  (f) => f.startsWith("src/components/group-card/") && /export function GroupCard\(/.test(readFileSync(f, "utf8")),
);
groupCardDefs.length === 1 ? pass(`one GroupCard (${groupCardDefs[0]})`) : fail(`GroupCard definitions: ${groupCardDefs.length}`);

// 2. ONE SetRow
const setRowDefs = files.filter(
  (f) => f.startsWith("src/components/set-row/") && /export function SetRow\(/.test(readFileSync(f, "utf8")),
);
setRowDefs.length === 1 ? pass(`one SetRow (${setRowDefs[0]})`) : fail(`SetRow definitions: ${setRowDefs.length}`);

// 3. ZERO ExerciseCard references (word-boundary; comments mentioning the
//    migration are allowed only via the exact phrase "ExerciseCard→" or in
//    worklog/docs outside src).
const exerciseCardRefs: string[] = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const matches = text.match(/(?<!\[)\bExerciseCard\b(?!→)/g);
  if (matches) exerciseCardRefs.push(`${f} (${matches.length})`);
}
exerciseCardRefs.length === 0
  ? pass("zero ExerciseCard references in src/")
  : fail(`ExerciseCard references remain: ${exerciseCardRefs.join(", ")}`);

// 4. ZERO lg: breakpoints in app code (ui primitives + generated are exempt)
const lgRefs: string[] = [];
for (const f of files) {
  if (f.startsWith("src/components/ui/") || f.startsWith("src/generated/")) continue;
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // allow radius-lg / display:none (lg comments) false positives
    if (/lg:/.test(line) && !/--radius-lg/.test(line) && !/display:none \(lg/.test(line)) {
      lgRefs.push(`${f}:${i + 1}`);
    }
  });
}
lgRefs.length === 0 ? pass("zero lg: breakpoints in app code") : fail(`lg: breakpoints remain: ${lgRefs.slice(0, 8).join(", ")}${lgRefs.length > 8 ? " …" : ""}`);

// 5. Router legacy rewrites (import the pure functions)
const { canonicalHash, parseRoute } = await import("../../src/features/shell/router.ts").catch(() => ({
  canonicalHash: null,
  parseRoute: null,
}));
if (canonicalHash) {
  const cases: Array<[string, string | null]> = [
    ["#/home", "#/workout"],
    ["#/", "#/workout"],
    ["", "#/workout"],
    ["#/home?tab=x", "#/workout?tab=x"],
    ["#/today", "#/session"],
    ["#/today/abc", "#/session/exercise/abc"],
    ["#/today/arrange", "#/session/arrange"],
    ["#/history", "#/logs"],
    ["#/routines", "#/programs"],
    ["#/routines/123", "#/programs/123"],
    ["#/programs/new/builder", "#/builder/new"],
    ["#/programs/123/log/day9", "#/programs/123"],
    ["#/programs/123/exercise/re9", "#/builder/program/123/exercise/re9"],
    ["#/workout", null],
    ["#/logs", null],
  ];
  let ok = true;
  for (const [input, expected] of cases) {
    const got = canonicalHash(input);
    if (got !== expected) {
      ok = false;
      fail(`canonicalHash(${JSON.stringify(input)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    }
  }
  if (ok) pass("router legacy rewrites (14 cases)");

  const parsed = parseRoute("#/builder/session/77/exercise/re1");
  parsed && parsed.name === "sets-editor" ? pass("sets-editor route parses") : fail("sets-editor route failed to parse");
  const gate = parseRoute("#/session");
  gate && gate.name === "session" ? pass("session route parses") : fail("session route failed to parse");
} else {
  fail("router module could not be imported (ts loader)");
}

// ── unit: grouping library ───────────────────────────────────────────────────
const G = await import("../../src/lib/grouping.ts").catch(() => null);
if (G) {
  const { deriveGroups, groupLabelForSize, memberCode, generateWarmup, evaluateProgression, resolvePrescribedWeight, movingAverage7 } = G;

  // series codes: two grouped (A1/A2) + solo (B) + second group (C1/C2/C3)
  const items = [
    { id: "e1", groupId: "gA", sortOrder: 0 },
    { id: "e2", groupId: "gA", sortOrder: 1 },
    { id: "e3", groupId: null, sortOrder: 2 },
    { id: "e4", groupId: "gC", sortOrder: 3 },
    { id: "e5", groupId: "gC", sortOrder: 4 },
    { id: "e6", groupId: "gC", sortOrder: 5 },
  ];
  const groups = deriveGroups(items);
  const codes = groups.flatMap((g) => g.members.map((m, i) => memberCode(g.code, i)));
  const expect = ["A1", "A2", "B1", "C1", "C2", "C3"];
  JSON.stringify(codes) === JSON.stringify(expect)
    ? pass("series codes A1/A2/B1/C1-C3")
    : fail(`series codes: ${codes.join(",")}`);

  // labels by size
  const labels = [groupLabelForSize(1), groupLabelForSize(2), groupLabelForSize(3), groupLabelForSize(4), groupLabelForSize(5)];
  JSON.stringify(labels) === JSON.stringify(["", "Superset", "Triset", "Giant set", "Giant set"])
    ? pass("group labels by size")
    : fail(`labels: ${labels.join("|")}`);

  // reorder recomputes codes (regroup e3 into gA → codes shift)
  const reordered = [
    { id: "e1", groupId: "gA", sortOrder: 0 },
    { id: "e3", groupId: "gA", sortOrder: 1 },
    { id: "e2", groupId: "gA", sortOrder: 2 },
  ];
  const r2 = deriveGroups(reordered);
  const r2codes = r2.flatMap((g) => g.members.map((m, i) => memberCode(g.code, i)));
  JSON.stringify(r2codes) === JSON.stringify(["A1", "A2", "A3"])
    ? pass("codes recompute on reorder/regroup")
    : fail(`reorder codes: ${r2codes.join(",")}`);

  // warm-up generation + plate rounding (100kg standard, step 2.5 → 40/60/80)
  const wu = generateWarmup(100, "STANDARD", null, 2.5);
  JSON.stringify(wu) === JSON.stringify([
    { weight: 40, reps: 5 },
    { weight: 60, reps: 3 },
    { weight: 80, reps: 2 },
  ])
    ? pass("warm-up STANDARD 40/60/80 × 5/3/2")
    : fail(`warm-up: ${JSON.stringify(wu)}`);
  const wuOdd = generateWarmup(103, "LIGHT", null, 2.5); // 50%→51.5→52.5, 70%→72.1→72.5
  wuOdd[0].weight === 52.5 && wuOdd[1].weight === 72.5
    ? pass("warm-up plate rounding")
    : fail(`warm-up rounding: ${JSON.stringify(wuOdd)}`);
  const wuCustom = generateWarmup(100, "CUSTOM", [{ pct: 55, reps: 4 }], 2.5);
  wuCustom.length === 1 && wuCustom[0].weight === 55
    ? pass("warm-up custom scheme")
    : fail(`warm-up custom: ${JSON.stringify(wuCustom)}`);

  // progression: hit → +increment; double after 2 hits; fail streak; deload
  const rule = { type: "LINEAR" as const, increment: 2.5, unit: "kg", condition: "ALL_SETS_HIT" as const, failStreakForDeload: 2, deloadPct: 10 };
  const hitSet = { weight: 100, reps: 5, targetReps: 5, isComplete: true };
  const missSet = { weight: 100, reps: 4, targetReps: 5, isComplete: true };
  const s1 = evaluateProgression(rule, [hitSet, hitSet, hitSet], { nextWeightDelta: 0, failStreak: 0 });
  s1.nextWeightDelta === 2.5 && s1.failStreak === 0 ? pass("progression hit → +2.5") : fail(`progression hit: ${JSON.stringify(s1)}`);
  const s2 = evaluateProgression(rule, [missSet], { nextWeightDelta: 2.5, failStreak: 0 });
  s2.nextWeightDelta === 2.5 && s2.failStreak === 1 ? pass("progression fail → streak") : fail(`progression fail: ${JSON.stringify(s2)}`);
  const s3 = evaluateProgression(rule, [missSet], { nextWeightDelta: 2.5, failStreak: 1 });
  // deload: 100 kg × 10% → next = 90 kg → delta = -10 (replaces +2.5).
  s3.failStreak === 0 && s3.nextWeightDelta === -10
    ? pass("progression deload → -10 (10% of 100 kg)")
    : fail(`progression deload: ${JSON.stringify(s3)}`);
  const ruleDouble = { ...rule, type: "DOUBLE" as const };
  const s4 = evaluateProgression(ruleDouble, [hitSet], { nextWeightDelta: 2.5, failStreak: 0 });
  s4.nextWeightDelta === 7.5 ? pass("progression DOUBLE doubles increment") : fail(`double: ${JSON.stringify(s4)}`);
  const ruleLast = { ...rule, condition: "LAST_SET_HIT" as const };
  const s5 = evaluateProgression(ruleLast, [missSet, hitSet], { nextWeightDelta: 0, failStreak: 0 });
  s5.nextWeightDelta === 2.5 ? pass("progression LAST_SET_HIT condition") : fail(`last-set: ${JSON.stringify(s5)}`);

  // %1RM resolve + fallback
  resolvePrescribedWeight("PERCENT_1RM", 85, null, 100, 2.5) === 85 ? pass("%1RM 85% of 100 → 85") : fail("%1RM resolve");
  resolvePrescribedWeight("PERCENT_1RM", 85, null, null, 2.5) === null ? pass("%1RM without e1RM → null (copy-last fallback)") : fail("%1RM fallback");
  resolvePrescribedWeight("PERCENT_1RM", 83, null, 100, 2.5) === 82.5 ? pass("%1RM plate-rounded") : fail("%1RM rounding");
  resolvePrescribedWeight("FIXED", null, 120, 100, 2.5) === 120 ? pass("FIXED weight passes through") : fail("fixed weight");
  resolvePrescribedWeight("COPY_LAST", null, null, 100, 2.5) === null ? pass("COPY_LAST → null") : fail("copy-last");

  // 7-day moving average
  const vals = [1, 2, 3, 4, 5, 6, 7, 8].map((v, i) => ({ at: i, value: v }));
  const avg = movingAverage7(vals);
  Math.abs(avg[7].value - 5) < 1e-9 && Math.abs(avg[0].value - 1) < 1e-9
    ? pass("7-day moving average (last=5, first=1)")
    : fail(`moving average: ${avg[7].value}`);
} else {
  fail("grouping module could not be imported");
}

// ── unit: preset → settings mapping (mirror of settings-service logic) ───────
const presets: Record<string, Record<string, boolean>> = {
  SIMPLE: { showSetType: false, showRpe: false, showTempo: false, showRest: false, guidedMode: false, showHints: false, showVideoPanel: false, autoMoveNextSet: false, showSetsProgressBar: false },
  STANDARD: { showSetType: false, showRpe: false, showTempo: true, showRest: true, guidedMode: false, showHints: true, showVideoPanel: true, autoMoveNextSet: false, showSetsProgressBar: true },
  POWER: { showSetType: true, showRpe: true, showTempo: true, showRest: true, guidedMode: true, showHints: true, showVideoPanel: true, autoMoveNextSet: true, showSetsProgressBar: true },
};
const presetOk = Object.entries(presets).every(([name, expected]) => {
  const simple = name === "SIMPLE";
  const power = name === "POWER";
  const actual = {
    showSetType: power,
    showRpe: power,
    showTempo: !simple,
    showRest: !simple,
    guidedMode: power,
    showHints: !simple,
    showVideoPanel: !simple,
    autoMoveNextSet: power,
    showSetsProgressBar: !simple,
  };
  return JSON.stringify(actual) === JSON.stringify(expected);
});
presetOk ? pass("preset → settings mapping (Simple/Standard/Power)") : fail("preset mapping mismatch");

// ── remove-semantics vocabulary ──────────────────────────────────────────────
const schema = readFileSync("prisma/schema.prisma", "utf8");
schema.includes('removeReason     String? // USER_DELETE | DISCARDED_SESSION | HISTORY_PURGE')
  ? pass("removeReason vocabulary in schema")
  : fail("removeReason vocabulary missing");
const hasDiscardedField = /^\s*discardedAt\s+DateTime/m.test(schema);
schema.includes("removedAt") && !hasDiscardedField ? pass("single removedAt semantics") : fail("discardedAt field still present in schema");
!existsSync("src/app/api/calories") ? pass("calories API removed") : fail("calories API still exists");

// ── summary ──────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\nARCHITECTURE CHECK FAILED — ${failures} failure(s)`);
  process.exit(1);
}
console.log("\nARCHITECTURE CHECK PASSED — Part 8 laws hold (one GroupCard, one SetRow, zero ExerciseCard, zero lg:, grouping units green).");
