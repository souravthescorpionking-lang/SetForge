# Task 6-d — Program builder, arrange screens, group codes, tempo presets, apply-to-all

Task: Part 6 §4.7 (program builder) + §4.10 (group codes, arrange screens, set-row tempo presets + apply-to-all, labels verification) on SetForge.

## Situation on resume

This was a RESUMED session (same pattern as 6-c0): an interrupted prior run had already
written the full UI implementation of every 6-d file (builder ~825 lines, both arrange
screens, arrange-blocks(-view) helpers, set-row/card-types/exercise-card extensions,
routine-detail wiring) — but had NOT: (a) verified anything, (b) caught a fatal server
bug in `/api/programs/builder`, (c) written any worklog/agent-ctx record, and its DB
had two leftover broken "QA Two Block" routines.

Resume work: re-validated every file from scratch against the §4.7/§4.10 contracts,
found + fixed 3 real bugs (below), ran the full agent-browser QA suite, restored demo
data, wrote this record + the worklog entry.

## Files owned / final state

| File | State |
|---|---|
| `src/features/routines/program-builder-screen.tsx` | full §4.7 vertical stepper (was written by prior run; verified) |
| `src/features/routines/day-arrange-screen.tsx` | full §4.10b (verified) |
| `src/features/today/today-arrange-screen.tsx` | full §4.10b (verified) |
| `src/features/routines/arrange-blocks.ts` / `arrange-blocks-view.tsx` | shared pure model + renderer (verified) |
| `src/components/set-row/set-row.tsx` | TempoEditor presets chip row (grid-cell + MoreCell popover variants), ApplyToAllSection in ⋯ popover (verified) |
| `src/components/exercise-card/card-types.ts` | `ApplyToAllFields` + `"apply-to-all"` in CardAction union (verified) |
| `src/components/exercise-card/exercise-card.tsx` | `tempoPresets?` prop (falls back to store settings), apply-to-all handled internally → per-set update-set fan-out + toast + Undo; **MODIFIED this session: fan-out now STAGGERED (300ms)** |
| `src/features/routines/routine-detail-screen.tsx` | groupCode via computeGroupCodes in day bodies, ⋮ "Arrange exercises" (all 3 day-header menus), ⋮ "Program builder", labels editor (verified E2E) |
| `src/server/services/program-service.ts` | **FIXED this session**: PredefinedSet nested-create ids + whole buildProgram wrapped in a transaction |
| `src/server/services/workout-service.ts` | **FIXED this session**: set-mutation `$transaction`s get `{ timeout: 15s, maxWait: 5s }` (TX_OPTIONS) |

Untouched per the ownership law: router.ts, app-shell.tsx, api.ts, picker, library,
today-screen.tsx, shared components, settings-sections.tsx.

## Bugs found & fixed during resume QA

1. **`POST /api/programs/builder` 500 — "Argument `id` is missing"** (program-service.ts
   buildProgram): nested `sets.create` rows for PredefinedSet lacked `id` (no DB default
   on that column) — the `as Prisma.…` cast silenced TS but Prisma rejected it at runtime.
   The prior run's builder test failed here and left a half-built routine (no rollback).
   Fix: `id: uuid7()` per set row.
2. **buildProgram not atomic**: routine+days committed, then the exercise attach loop
   could fail → orphan half-program (exactly what the prior run's 500 left behind).
   Fix: the whole create+attach sequence now runs inside one `db.$transaction`.
3. **apply-to-all fan-out deadlocks SQLite under concurrency**: 4 simultaneous
   `PATCH /api/…/sets/[setId]` (each an interactive transaction with a full PR recompute)
   queue on the SQLite write lock → 3 of 4 expired at the 5s default (P1008/P2028) →
   "Something went wrong" toasts. Two-layer fix:
   - client (exercise-card.tsx): fan-out dispatches staggered 300ms apart (first immediate);
     Undo uses the same path.
   - server (workout-service.ts): createSet/updateSet/deleteSet transactions get
     `TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 }`.
   Re-test: all 4 PATCHes 200 in 190–542ms, rows updated, no toasts errors.

## QA evidence (agent-browser, demo@setforge.app)

- Builder E2E (390×1024): name + Intermediate + 2 phases × 2 weeks + weekly template
  (Mon Push / Tue Pull / Wed Rest / Thu Legs / Fri Push / Sat+Sun Rest via the
  Workout▾|Rest dropdown) + Barbell Bench Press added to "Push" via the inline
  searchable picker + "QA tag" label → Create → toast **"Program created · 28 days"** →
  redirect `#/programs/{id}` → phases chips "All | Phase 1 | Phase 2", day names
  "Push · W1…Push · W2" per phase, DB-verified difficulty/daysPerWeek(4, auto)/labels/
  phases JSON/3 blank sets per attached exercise. (QA program soft-deleted after.)
- day-arrange: group block A moved down past Ungrouped → Done → toast "Exercise order
  saved · Push Day · 4 exercises" → DB sortOrders persisted (group moved as a unit);
  restored original order afterwards.
- `#/today/arrange` direct URL: renders "Ungrouped (Barbell Bench Press, Cable
  Pushdown)" + "A · Pressing pair · Dumbbell Bench Press, Arnold Press" (workout group
  NAME shown — today workouts have one, routine days fall back to joined names).
- Set ⋯ popover (390px): tempo preset chips "2-0-2-0 / 3-1-1-0 / 4-0-1-1" (from
  settings.tempoPresets) above the 4-segment editor — tap fills, Save persists;
  grid-cell tempo popover at ≥468px ALSO shows the chips. Apply-to-all: chips
  Weight/Reps enabled (row has values), Rest/RPE disabled (no value) → Weight+Reps →
  Apply → toast "Applied to 4 sets" + Undo → siblings updated (85×8 everywhere) +
  DB persisted (see bug 3 for the concurrency fix that made this green).
- Group codes: routine-detail day body shows A1 chip on Dumbbell Bench Press + A2 on
  Arnold Press; ungrouped cards show none.
- Labels editor (routine-detail ⋮ → Labels): add "Strength" → chip row + DB
  `labels: ["Strength"]` → × remove → DB `[]` (programsMetaApi.update path works —
  6-c's implementation verified, nothing had to be rebuilt).
- TopBar ⋮ entries: "Arrange exercises" (day header menus ×3 variants) + "Program
  builder" both navigate correctly.
- Layout gates (h-scroll / right-edge overflow / row heights / row single-line) at
  **320, 390, 1024, 1440** on builder, day-arrange, today-arrange, routine-detail: ALL PASS
  (builder 18 rows, arrange 6 rows, detail 24 rows; 0 offenders at every width).
- `bun run lint` exit 0; `bunx tsc --noEmit` → 7 pre-existing baseline errors only
  (examples ×2, scripts/reset-demo-data ×2, skills ×2, timer-presets ×1) — zero in
  6-d files. dev.log tail clean (all 200s; the historical 500s were the pre-fix bugs).
- Screenshots: download/p6-d-{builder-390, builder-form-390, builder-1024, arrange-390,
  arrange-320, today-arrange-390, today-arrange-320, setpopover-390, groupcodes-390,
  detail-320, detail-1440}.png

## Demo-account data changes that persist (intentional, useful for later agents)

- settings.tempoPresets = ["2-0-2-0", "3-1-1-0", "4-0-1-1"] (drives preset chips).
- Today's workout has group "Pressing pair" (Dumbbell Bench Press + Arnold Press) —
  created by `scripts/qa-seed-routine-group.ts` sibling logic for workouts; the routine
  day has group "Compound pair" (same two exercises) via scripts/qa-seed-routine-group.ts.
- Set values restored to 100×5, 85×8, 85×7, 85×6 after apply-to-all tests; QA programs
  soft-deleted; routine exercise order restored to group-A-first.

## Notes for 6-e (today-screen owner)

- Wire the Today screen ⋮ menu → "Arrange exercises" → `navigate("/today/arrange")`
  (route is live; the screen reads `?date=` for non-today days, defaults to today).
- Thread `groupCode={codes.get(we.id)}` into today's ExerciseCards: derive per workout
  via `computeGroupCodes([...workout.exercises].sort(by sortOrder))` from
  `@/lib/group-codes` (same as routine-detail-screen.tsx renderDayBody does) so
  superset members show A1/A2 chips.
- `guidedPointerOrder` (round-robin over groups) exists in `@/lib/group-codes.ts` and is
  NOT yet consumed anywhere — use it for the guided-mode set pointer.
- apply-to-all fan-out is staggered 300ms per sibling — do NOT expect all PATCHes at
  once; UI updates land progressively via query invalidation.
