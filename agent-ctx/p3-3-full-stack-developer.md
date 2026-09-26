# Task p3-3 — Today screen rebuild (full-stack-developer)

## Scope
Owned ONLY the Today rebuild: new files under `src/features/today/` (today-screen + helpers)
and the thin slot `src/features/screens/today.tsx`. Did NOT touch the router/shell, the ONE
ExerciseCard/SetRow (`src/components/exercise-card`, `src/components/set-row`), or any other
feature. Legacy today views (today-view.tsx etc.) left untouched as dead code for p3-9.

## What was built

### `src/features/today/today-screen.tsx` (558 lines) — the new #/today
- `<Screen topBar subBar bottomBar>` + `<ScrollBody>`; NavBar renders by default.
- TopBar (56): title "SetForge" (font-semibold via the primitive); actions = Calendar
  icon-button → #/calendar + ⋮ DropdownMenu (History/Exercises/Tools/Settings). All h-11
  (44px) targets.
- SubBar (48): DateStrip (see below). Date state synced with the `?date=` query param via
  `useHashRoute()` (same pattern as legacy today-view: #/today without param = today).
- ScrollBody: MetaRow → ExerciseCard×N (`edit`, REAL data: `useWorkoutByDate` + settings
  columns, group colour/name from workout.groups) → SummaryRow → h-4 spacer. Loading →
  3-block skeleton; no workout → the single 200px TodayEmpty block, nothing else.
- BottomBar (same container, content swap — never both/stacked): `+ Add exercise` →
  #/exercises, OR RestBar `Rest 1:12 −15 +15 Skip` while a rest countdown runs.
- Card actions wired to real mutations (legacy track-tab logic + use-mutate offline outbox):
  update-set (CardSet patch → SetInput mapper `cardPatchToSetInput`: weightKg→weight,
  distanceM→distance, note→comment, done→isComplete, …), toggle-done (auto-rest start,
  warm-ups excluded, settings.autoRestFromRow), add-set (exercise defaults:
  defaultSetType/rpeTarget/tempo + restSec), copy-last (prev filled set → patch), move-up/
  move-down (swap + reorderExercises), remove (ConfirmRemoveExercise AlertDialog — allowed
  confirm-destructive), replace → #/exercises, add-to-group → ExerciseGroupPopover,
  notes → ExerciseNotesPopover, rest-timer → rest.start(ex.restSec), open → #/today/{weId}
  (handler present; see Deviations), select → info toast (omitted, see Deviations).
- Empty-day actions reused from legacy: Start New Workout (createOrGet) + Copy Previous
  (createOrGet + copy, 404 toast) + hasPrevious gating query.
- Session timer: legacy workout-header-card toggleTimer (startAt/endAt PATCH) exposed via
  the MetaRow duration chip (tap = start/stop/restart).

### Helpers (all obey the laws: fixed row heights + data-row where rows, spacing tokens)
- `rest-state.tsx` (221) — useRestState(): countdown engine EXTRACTED from legacy
  rest-timer.tsx (endAt ticking, localStorage last-duration, beep/vibrate/hidden-tab
  Notification, screen Wake Lock, adjust(±15), skip, finish toast). No rendering.
- `date-strip.tsx` (113) — ◄ 44px | "Sat 26 Sep" label (tabular, flex-1, opens shadcn
  Calendar popover — allowed date picker; day math via legacy day-utils/format helpers) |
  ► 44px | Today chip (subtle non-clickable on today; primary tinted + jump on other days).
- `meta-row.tsx` (167) — 48px data-row (rowTall token): duration chip (live 1 Hz ticker,
  ghost "–:–", icon Play/Square/Timer), rest chip (live mini countdown while resting),
  note chip (flex-1 truncate, ghost "Add note", anchored popover with Textarea → PATCH
  workouts.update comment).
- `summary-row.tsx` (46) — 48px data-row: `14 sets · 7,960 kg · 2 PRs` (sets = all;
  volume = totalVolume(done non-warmup sets); PRs = newPr count; unit label via
  defaultUnitFor(settings)).
- `today-empty.tsx` (61) — h-[200px] block: headline + two h-12 data-row buttons
  (Start New Workout / Copy Previous Workout, hasPrevious-gated).
- `rest-bar.tsx` (84) — AddExerciseBar (full-width h-11) + RestBar (icon + "Rest" word
  ≥400px + big tabular countdown, three ≥44px controls: −15/+15 outline icons, Skip
  primary). Widths audited for 320px fit.
- `card-popovers.tsx` (257) — ExerciseNotesPopover (read-only library notes),
  ExerciseGroupPopover (existing groups + create-new + remove-from-group →
  updateExercise/createGroup), ConfirmRemoveExercise (controlled AlertDialog). Anchor
  trick: 4px absolute invisible span at card bottom-left inside each card's relative
  wrapper (absolute subtrees are harness-excluded; content portals to fixed).

### `src/features/screens/today.tsx` — thin re-export slot
`export { default } from "@/features/today/today-screen";`

## Key decisions / gotchas for later agents
- **Popover-after-menu handoff**: a Popover mounted while the ⋮ DropdownMenu closes gets
  instantly dismissed (menu returns focus to its trigger → popover's focus-outside fires).
  Fixed with `onFocusOutside={(e) => e.preventDefault()}` on the PopoverContent
  (HANDOFF_ANNOTATION_PROPS in card-popovers.tsx). Pointerdown-outside + Escape still close.
- restRemainingSec != null (running OR paused-with-remaining) drives BOTH the BottomBar
  swap and the MetaRow rest chip. skip()/finish() null it → BottomBar returns to Add.
- Date label formatted "Sat 26 Sep" (comma-free, locale parts) to match the spec shape.
- Demo data: workouts on 2026-09-19/21/23/24/25; 2026-09-26 (today) empty. Data-date gate
  run with `'#/today?date=2026-09-23'` (the harness URL builder preserves query strings).
- The verification browser session stays logged in (cookie) — harness `agent-browser open`
  reloads keep auth.

## Gate results (orchestrator checklist)
- `bash scripts/qa/verify-layout.sh '#/today'` → **GATE: PASS** at all 6 widths
  (320/360/390/768/1024/1440), top+bottom sweeps: rows=2 (empty-state buttons, 48px),
  overlap 0, rightEdge 0, hscroll false, nowrapFail 0, wsFail 0, badHeights [], scrollBodies 1.
- `bash scripts/qa/verify-layout.sh '#/today?date=2026-09-23'` → **GATE: PASS** at all 6
  widths WITH cards visible: rows=24 (4 card headers + 14 SetRows + 4 add-set rows + MetaRow
  + SummaryRow), all metrics green at top and scroll-bottom.
- Interactivity (agent-browser, data date): set ✓ toggle (tint + API isComplete verified
  via curl both directions), inline weight edit commits on blur (125→130→125 restored),
  + Add set (row 5 added, blank + restPlannedSec 240, deleted after), collapse 25→19 rows,
  ⋮ opens / Escape closes, rest: complete Deadlift set → BottomBar "Rest 4:00" → +15
  (3:44→3:59) → Skip → "Add exercise" back; date strip ◄ (09-21 loads) / ► / Today chip →
  #/today empty; empty state = 200px block + 2 buttons; Start New Workout + timer start
  (live 0:02 chip, startAt persisted) + workout note popover save; group create ("Circuit A"
  chip appears on card) + remove-exercise confirm — all on scratch workout 2026-09-22,
  deleted afterwards; 09-23 data restored byte-identical.
- Console after fresh reload: only `[HMR] connected` (no new errors). ESLint
  `bunx eslint src/features/today src/features/screens/today.tsx` exit 0.
- Screenshots: download/qa-p3-3-{today-empty-390, today-data-390, today-1024, restbar-390}.png.

## Deviations / notes for orchestrator
1. **Edit-mode 'open' affordance missing from the ONE ExerciseCard** (not edited per task
   law): in `edit` mode the card header is not tappable and the ⋮ menu has no "Open" item,
   so the spec's "header tap → #/today/{exerciseId}" cannot fire. The `open` case IS wired
   in TodayScreen (navigates to #/today/{we.id}) and will light up as soon as the card
   surfaces it (one menuForMode(edit) line — pure presentational passthrough of an existing
   CardAction member). Recommend adding it in p3-4 when Training lands.
2. **`select` (multi-select) omitted** — the card has no selected-state visual prop and
   bulk-action chrome would exceed p3-3 scope; action answers with an info toast. Revisit
   with a dedicated selection toolbar in a later part.
3. BottomBar "+ Add exercise" navigates to #/exercises per spec — on empty days the picker
   opens with no workout to add to (p3-4 picker should handle createOrGet on pick).
4. Legacy `rest-timer.tsx` full-screen overlay + fixed slim bar are NOT reused (would
   violate the bars law); the engine was extracted to rest-state.tsx instead. The legacy
   file stays (dead code, p3-9) — track-tab/training-screen still import it, untouched.
5. Screenshot `today-empty-390` taken on real today (2026-09-26, no workout) — today was
   never seeded; the data-date gate used the ?date= query instead.
