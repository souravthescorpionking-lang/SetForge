# Task 4-e — Settings + Tools (full-stack-developer)

## Scope
Owns ONLY `src/features/settings/**` and `src/features/tools/**`.

## What was built

### Settings (`#/settings`) — entry `settings-view.tsx` → `SettingsView()`
- `settings-view.tsx` — mobile (<lg): Tabs Preferences|Data|Account; desktop: stacked Card
  sections (mount-gated via matchMedia to avoid hydration mismatch). Skeleton while
  settings hydrate. `useWakeLock(settings.keepScreenOn)` mounted here.
- `preferences-section.tsx` — theme 3-way cards (Sun/Moon/System; also calls
  `useTheme().setTheme()` for instant preview), unit system + week start Segmented,
  default weight increment Stepper (0.5–50, step .5), home sets shown Stepper (1–10),
  switches (showCategory, trackPR, markSetsComplete, autoSelectNextSet, keepScreenOn),
  est-1RM rep limit Stepper (1–15). All updates via `useApp(s=>s.updateSettings)`
  (optimistic). Numeric stepper edits are debounced 350ms and flushed on unmount.
- `data-section.tsx` — Export JSON backup (blob download
  `setforge-backup-YYYY-MM-DD.json`), Import/Restore (file input .json max 50MB →
  parse → mode dialog RadioGroup merge/replace with explanations → `importBackup` →
  toast importedWorkouts → `useInvalidate().all()`), Workouts/Body CSV exports,
  Recalculate PRs (`recordsApi.recalculate()` → "Recalculated N exercises"),
  Delete workout history AlertDialog with 3 modes (range: two DateField pickers;
  exercise: ExercisePickerDialog; all: typed DELETE confirm) → `deleteHistory` →
  toast + invalidate all. Network actions disabled while offline.
- `account-section.tsx` — profile (avatar/name/email), linked providers
  (Email & Password badge, Google OAuth note), change password dialog (min 8,
  match validation, inline errors) → toast "Password changed — other sessions
  signed out", Sign out via `useLogout()`, danger-zone delete account with typed
  DELETE confirm (logout fn captured BEFORE `accountApi.delete()`, then called).
- `settings-controls.tsx` — SettingRow / Segmented / SectionHeading primitives.
- `use-wake-lock.ts` — Screen Wake Lock hook (acquire on mount/toggle-on via timer
  callback, release on toggle-off/unmount, re-acquire on visibilitychange,
  race-safe). Exports `isWakeLockSupported()`.

### Tools (`#/tools`) — entry `tools-view.tsx` → `ToolsView()`
- Tabs: 1RM | Sets | Plates (framer-motion fade on tab content).
- `one-rm-calculator.tsx` — weight Stepper (step = settings.defaultWeightIncrement),
  reps 1–15, big animated Brzycki result (`estOneRm`), guide caption + rep-limit note,
  scrollable 1–15RM table (`estRm`) with % of 1RM and current-rep highlight.
- `set-calculator.tsx` — optional exercise via ExercisePickerDialog →
  `exercisesApi.records` (qk.exerciseRecords) → PR chips (top 3 actual non-superseded
  + e1RM rounded to 0.5) set base weight; percent chips 60–95 multi-toggle + custom
  percent Stepper+Add; round-to Select (0.25/0.5/1.25/2.5/5) → `roundToStep`;
  presets 5×5@80 / 3×8@70 / 5×3@85; per-percent result rows with per-row sets/reps
  Steppers, volume totals; Add To Workout: DateField (default today) →
  `createOrGet` → `addExercise` → `addSet` per set → toast "Added N sets to <date>"
  → `navigate('/today?date=<key>')`. Pure calculator mode when no exercise picked.
- `plate-calculator.tsx` — kg/lb tabs (default = settings.unitSystem; resets bar 20/45
  + target defaults), optional exercise (uses its barWeight), bar + target Steppers
  (target step = smallest available plate), `plateGreedy` result with front-view bar
  visualisation (plate rects sized/coloured from inventory data, both sides + collar),
  per-side breakdown text ("2 × 20kg, 1 × 5kg per side"), not-loadable state with
  nearest-loadable suggestion + "Use X" button. Inventory editor: rows with native
  colour input, weight Stepper, count Stepper, available Switch, add/remove rows
  (max 30), dirty tracking + Reset, Save → `platesApi.replace` (PUT) → invalidate
  plates; offline → `queueMutation("/api/plates","PUT",body)` + "Saved offline" toast.
- `date-field.tsx` — shared day-key date picker (Popover + Calendar, local↔UTC key
  conversion at boundary). Used by tools + settings data-section.

## Conventions followed
- All data via `src/lib/client/api.ts` clients, TanStack Query keys from `qk`,
  invalidation via `useInvalidate()`, toasts via sonner, Stepper shared component,
  hash navigation via `useApp(s=>s.navigate)`, orange primary only, no blue/indigo UI
  (plate colours are DATA), `numeric` class on numbers, `scroll-slim` on long lists,
  rounded-2xl cards, destructive red zone for danger actions, ≥44px touch targets,
  semantic HTML + aria labels.

## Verification
- `bunx eslint src/features/settings src/features/tools` → clean.
- `bunx tsc --noEmit` → zero errors in my folders (other agents' errors exist
  elsewhere, see worklog).
- API contract checks done with curl (login demo@setforge.app, plates list metric/
  imperial, bench press records e1RM 99.31, settings PATCH schema, history delete
  accepts yyyy-mm-dd day keys).
- Browser verification: BLOCKED while sibling agents' compile errors are live
  (exercise-overview/history-tab.tsx then today/workout-header-card.tsx). Re-check
  after they settle — my code compiles clean in isolation.

## Known gaps / notes for next agents
- Wake lock is mounted in SettingsView only (can't touch app-root) — lift
  `useWakeLock(settings.keepScreenOn)` into app-root if desired (hook is portable).
- Import does not refresh session settings (import doesn't touch settings server-side).
- Set calculator "Add to workout" requires network (sequential set creation needs
  workoutExerciseId) — intentionally not queued offline.
