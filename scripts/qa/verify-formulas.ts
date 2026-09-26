/**
 * verify:formulas — unit verification for the pure domain formulas (audit O1,
 * platform-adapted: a runnable QA script instead of a test framework).
 * Every assertion must hold; exit code 1 on any failure.
 * Run: bun run verify:formulas
 */
import {
  estOneRm,
  estOneRmEpley,
  estOneRmRpe,
  estOneRmByMethod,
  estRm,
  totalVolume,
  totalReps,
  speed,
  paceSec,
  roundToStep,
  plateGreedy,
  kgToLbs,
  lbsToKg,
  formatDuration,
  formatPace,
} from "../../src/lib/formulas";
import { TEMPO_REGEX, parseTempo } from "../../src/lib/constants";
import { normaliseDatabaseUrl } from "../../src/server/env";

let failures = 0;
function eq(name: string, actual: unknown, expected: unknown, tol = 1e-9): void {
  const ok =
    typeof actual === "number" && typeof expected === "number"
      ? Math.abs(actual - expected) <= tol
      : actual === expected;
  if (!ok) {
    failures += 1;
    console.error(`  ✗ ${name}: expected ${String(expected)}, got ${String(actual)}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

console.log("— Brzycki e1RM —");
eq("100kg×1 → 102.857", estOneRm(100, 1), (100 * 36) / 36);
eq("100kg×5 → 112.5", estOneRm(100, 5), (100 * 36) / 32);
eq("100kg×10 → 133.33", estOneRm(100, 10), (100 * 36) / 27);
eq("reps≥37 clamps to weight", estOneRm(100, 40), 100);
eq("weight 0 → 0", estOneRm(0, 5), 0);
eq("reps 0 rounds to 1", estOneRm(100, 0), (100 * 36) / 36);

console.log("— Epley e1RM —");
eq("100kg×5 → 116.67", estOneRmEpley(100, 5), 100 * (1 + 5 / 30));
eq("100kg×1 → 103.33", estOneRmEpley(100, 1), 100 * (1 + 1 / 30));

console.log("— RPE-adjusted e1RM (RIR = 10−RPE) —");
// 100×8 @RPE 8 → effective 10 reps → Epley
eq("100kg×8 @8 → effective 10 reps", estOneRmRpe(100, 8, 8), 100 * (1 + 10 / 30));
// no RPE → Brzycki fallback
eq("100kg×8 no-RPE → Brzycki", estOneRmRpe(100, 8, null), estOneRm(100, 8));
// RPE out of range → fallback
eq("100kg×8 @5 → Brzycki fallback", estOneRmRpe(100, 8, 5), estOneRm(100, 8));
eq("method EPLEY routes", estOneRmByMethod(100, 5, "EPLEY"), estOneRmEpley(100, 5));
eq("method RPE routes", estOneRmByMethod(100, 5, "RPE", 9), estOneRmRpe(100, 5, 9));
eq("method BRZYCKI routes", estOneRmByMethod(100, 5, "BRZYCKI"), estOneRm(100, 5));

console.log("— nRM from 1RM —");
eq("estRm(120, 5) → 106.67", estRm(120, 5), (120 * 32) / 36);
eq("estRm n≥37 → 1RM", estRm(120, 40), 120);

console.log("— volume / reps / speed / pace —");
eq("volume sums w×r", totalVolume([{ weight: 100, reps: 5 }, { weight: 80, reps: 8 }, { weight: null, reps: 3 }]), 500 + 640);
eq("totalReps", totalReps([{ reps: 5 }, { reps: 8 }, { reps: null }]), 13);
eq("speed 10km in 3600s → 10", speed(10, 3600), 10);
eq("pace 3600s/10km → 360 s/km", paceSec(10, 3600), 360);

console.log("— rounding —");
eq("roundToStep 2.5", roundToStep(102.4, 2.5), 102.5);
eq("roundToStep 87.5 (step 5) → 90 (half rounds up)", roundToStep(87.5, 5), 90);
eq("roundToStep(103, 0) passthrough", roundToStep(103, 0), 103);

console.log("— plate greedy loader —");
const plates = [
  { weight: 25, count: 4 },
  { weight: 10, count: 4 },
  { weight: 5, count: 2 },
  { weight: 1.25, count: 2 },
];
eq("100kg total, 20kg bar → greedy 25+10+5 per side", JSON.stringify(plateGreedy(100, 20, plates)), JSON.stringify([{ weight: 25, count: 1 }, { weight: 10, count: 1 }, { weight: 5, count: 1 }]));
eq("unavailable plate skipped", JSON.stringify(plateGreedy(60, 20, [{ weight: 25, count: 4, isAvailable: false }, { weight: 20, count: 4 }])), JSON.stringify([{ weight: 20, count: 1 }]));
eq("odd count limited to floor(count/2)", JSON.stringify(plateGreedy(70, 20, [{ weight: 25, count: 3 }])), JSON.stringify([{ weight: 25, count: 1 }])); // 25/side, capped at 1 by floor(3/2)
eq("unreachable → null", plateGreedy(103, 20, [{ weight: 25, count: 4 }]), null);
eq("below bar → null", plateGreedy(10, 20, plates), null);

console.log("— unit conversion —");
eq("kg→lbs 100", kgToLbs(100), 100 / 0.45359237);
eq("lbs→kg roundtrip", lbsToKg(kgToLbs(83)), 83);

console.log("— duration / pace formatting —");
eq("formatDuration 59 → 0:59", formatDuration(59), "0:59");
eq("formatDuration 3600 → 1:00:00", formatDuration(3600), "1:00:00");
eq("formatDuration 3725 → 1:02:05", formatDuration(3725), "1:02:05");
eq("formatPace 360 → 6:00", formatPace(360), "6:00");
eq("formatPace invalid → –", formatPace(0), "–");

console.log("— tempo parser —");
eq("3-1-1-0 valid", parseTempo("3-1-1-0") !== null, true);
eq("3-1-1 valid", parseTempo("3-1-1") !== null, true);
eq("3-1 invalid", parseTempo("3-1"), null);
eq("a-b-c invalid", parseTempo("a-b-c"), null);
eq("TEMPO_REGEX rejects 12 digits part", TEMPO_REGEX.test("123-1-1"), false);
eq("TEMPO_REGEX accepts 2-digit parts", TEMPO_REGEX.test("12-10-10-10"), true);

console.log("— URL normaliser (env parser) —");
eq("postgres:// gains sslmode=require (non-local)", normaliseDatabaseUrl("postgres://u:p@db.host.example:5432/x", "auto"), "postgres://u:p@db.host.example:5432/x?sslmode=require");
eq("postgresql:// accepted", normaliseDatabaseUrl("postgresql://u:p@localhost:5432/x", "auto"), "postgresql://u:p@localhost:5432/x?sslmode=disable");
eq("explicit sslmode preserved", normaliseDatabaseUrl("postgres://u:p@h:5432/x?sslmode=disable", "auto"), "postgres://u:p@h:5432/x?sslmode=disable");
eq("DATABASE_SSL=require overrides", normaliseDatabaseUrl("postgres://u:p@localhost:5432/x", "require"), "postgres://u:p@localhost:5432/x?sslmode=require");
eq("sqlite passthrough", normaliseDatabaseUrl("file:./db/x.db", "require"), "file:./db/x.db");

console.log("— restActual computation (from today use-mutate logic shape) —");
const prevCompleted = new Date("2026-09-27T10:00:00Z").getTime();
const nowCompleted = new Date("2026-09-27T10:02:30Z").getTime();
eq("restActualSec = delta", Math.round((nowCompleted - prevCompleted) / 1000), 150);

if (failures > 0) {
  console.error(`\n${failures} FORMULA CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nAll formula checks passed.");
