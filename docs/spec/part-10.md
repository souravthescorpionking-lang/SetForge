PROMPT 10 FINAL:
ROLE
You are the sole senior engineer on SetForge. There is no reviewer after you.
Your work will be judged by people opening the app cold and using it for a full
week of training. Every screen they touch must feel finished: fast, obvious,
no dead ends, no jargon, no half-states. You read before you write, you plan
before you code, you verify before you claim. You never leave a TODO.

CONTEXT
SetForge = phone-only, multi-user workout PWA. Parts 1-9 are implemented in
this repo. Part 10 is the last feature part. When it ends, the app must be
usable by a stranger the next second: sign up, pick a program, train, log,
review, repeat — with zero guidance.

Stack (do not change): Next.js App Router · TypeScript strict · Prisma ·
Postgres via env (SQLite dev fallback if repo has it) · Auth.js · Tailwind +
shadcn · Zod · Serwist PWA · Dexie outbox · Vitest · Playwright.

LAWS (already in repo — locate them, obey them, never weaken them)
L1 Layout: Screen → TopBar(56) → [SubBar(48)] → ScrollBody → [BottomBar(56)]
   → NavBar(64). Row heights 56/48/40/32. Single-line nowrap except prose.
   Zero overlap at 320/360/390/430. Harness exists (Part 3). Run it.
L2 One GroupCard. One SetRow. Never fork. Extend via variant props only.
L3 No bottom sheets. Modals only: destructive-confirm, date/time picker.
   Anything STNDRD did as a sheet → full-screen route, inline expand, or
   the existing ActionList component.
L4 Colour = 4px left bar. No cover images. No XP/badges/achievements.
   No nutrition. No community. No challenges.
L5 Every interactive element declares `tour`. Registry codegen + ESLint
   rule exist. Zero violations at end.
L6 3 tabs only: Workout / Dashboard / More.
L7 DB switching by env only. Migrations additive + idempotent.
   Offline writes via outbox. Reads degrade gracefully.
L8 Zod on every API input. Auth + owner scope on every handler.

========================================================================
OPERATING PROTOCOL — follow exactly, in order
========================================================================
P1 DISCOVER (read-only)
    - Map: schema.prisma · app/ routes · components (GroupCard, SetRow,
      ActionList, TopBar, SubBar, BottomBar, Screen) · lib (tour, outbox,
      harness, midnight job, media adapter, inline dictionary, haptics,
      notifications) · tests · seed · docs/spec/.
    - Save this prompt verbatim to docs/spec/part-10.md.
    - Write docs/spec/part-10-plan.md: per § below → files to touch, existing
      things to reuse, decisions, risks. Keep updated. It is your resume point.
P2 REMOVE (§0) before adding anything.
P3 IMPLEMENT §1 → §12 in order. One § at a time.
    - After each §: typecheck · lint · unit tests · harness on touched routes.
      Green before next §. Red → fix now.
    - Commit per §: `feat(part10): §N <title>`.
    - Reuse before create. grep first.
    - No TODO / FIXME / stub / console.log / commented-out code / any-casts.
    - Every new route: loading.tsx skeleton (rows match final layout),
      error.tsx (message + Retry), empty state (icon-free, one line + one
      action), not-found where applicable.
P4 VERIFY (§13). Everything green. Re-run until it is.
P5 AUDIT. Re-read this prompt line by line. For each requirement find the
    satisfying code path. Missing → implement now. Write
    docs/spec/part-10-audit.md as checklist with file paths.
P6 SHIP GATE (§14). All boxes ticked or you are not done.
P7 REPORT (final message): §s done · migrations · seed changes · test counts ·
    harness table per width · tour lint result · Lighthouse scores ·
    known limitations (must be empty or each one justified in one line).

RULES OF CONDUCT
- Never stop early. Long context → finish current §, commit, update plan.md,
  continue.
- Never ask the user. Decide, record decision in plan.md, proceed.
- Never bend a law to pass a test. Fix the code.
- Never touch unrelated code. No drive-by refactors.
- If a referenced "existing" thing is absent → build the minimum, note it.
- Copy STNDRD behaviour, not STNDRD UI. Our laws win on every conflict.

========================================================================
§0  REMOVE — Challenge feature
========================================================================

Delete: Challenge + ChallengeDismiss models (migration drops tables — the ONE
allowed drop, it is our own Part 9 addition), /api/challenges/*, Home banner,
"Register/Join" flows, "Starts in N days" CTA branch, related tour steps,
tests, seed rows. grep -i challenge → zero hits outside docs/spec history.

========================================================================
§1  SCHEMA (Prisma). Additive except §0.
========================================================================

User +=
  gender        Gender?                    enum Gender { MALE FEMALE OTHER UNSPECIFIED }
  birthYear     Int?
  heightCm      Decimal?                   // store metric; display per unit pref
  weighInDays   Int[]                      // 0..6, ISO weekday; empty = none
  stepGoal      Int @default(10000)
  avatarKey     String?                    // media adapter key
  // difficulty already exists (Part 9) — Fitness Level maps to it. Single source.

Workout (Log) +=
  startedAt        DateTime                 // if absent
  endedAt          DateTime?
  markedComplete   Boolean @default(false)   // exit-with-mark flag
  totalVolume      Decimal?                 // computed on finish, in kg
  totalSets        Int?

PerformedSet +=
  restPlannedSec Int?
  restActualSec  Int?                       // if absent
  loggedAt       DateTime @default(now())

WorkoutSettings (per user) : userId @id · autoAdvance Boolean @default(true)
  · countdownSounds Boolean @default(false) · showTempo Boolean @default(true)
  · videoSpeed Decimal @default(1.0)

StepEntry : id · userId · date (date-only, unique with userId) · steps Int
  · source String @default("MANUAL")

BodyPhoto += pose Pose?                     enum Pose { FRONT BACK SIDE OTHER }

TempoPreset (static, no table) — see §4.6.

Migration: idempotent. Backfill Workout.startedAt from createdAt where null.
Backfill totalVolume/totalSets for existing finished workouts in one script
(prisma/scripts/backfill-part10.ts), run in migration hook or `pnpm db:backfill`.

========================================================================
§2  HOME — inline difficulty on program card
========================================================================

Home program card Row2 gains trailing control: current difficulty as a 32px
chip with ▾. Tap → ActionList (Beginner / Intermediate / Advanced, current
checked). Choose → same confirm modal + same server action as Part 9 §2.
No duplicate logic: extract `useChangeDifficulty()` hook used by both Home
and Programs SubBar. Card re-renders. Toast on completion.

========================================================================
§3  ACTIVE LOGGING SCREEN — rebuild
========================================================================

Route: /workout/[id]/live (existing live route — evolve, do not fork).
Structure (L1):
  TopBar 56: ✕ (exit, §3.6) · centre "Total time  00:22" mono · ⚙ (§3.5)
  SubBar 48: segmented Overview | Logs | History   (§3.3)
  ScrollBody:
    FocusCard (§3.1) — sticky top of ScrollBody, collapses to 56px on scroll
    Tab body (§3.3)
  BottomBar 56: primary "Log set" (or "Start rest"/"Skip rest" during rest)
  NavBar hidden while live (already so; keep).

§3.1 FocusCard
  Rows (each nowrap):
  R1 40: "{Series label} · {A1}" left · "{n}/{N} sets" right
  R2 48: exercise name (truncate) · 📝 if note · … (existing live menu)
  R3 40: "{SetType label} · target {reps} reps" · "Max logged {v}{unit}" right
        (max from PerformedSet history for this exercise+user; "—" if none)
  R4 32: "Tempo {x/x/x/x}" or "Tempo none" · hidden when showTempo=false
  R5 56: SetRow in `focus` variant (L2: same component; variant = bigger
        inputs, no drag handle, no set index column). Inputs: Type · Reps ·
        Weight(+unit) · RPE (if enabled in user prefs). Prefill from last
        performed set of same exercise; else prescribed.
  R6 (optional) 16:9 media block ABOVE R1 when exercise has videoUrl and
        user hasn't collapsed it. Speed chip ("1.0×") in its corner →
        ActionList 0.5× / 0.75× / 1.0× / 1.25× / 1.5×. Persist to
        WorkoutSettings.videoSpeed. Media adapter from Part 6 handles src.
  Collapsed state (on scroll > 80px): single 56 row "{A1} {name} · {n}/{N}"
  + "Log set" stays in BottomBar. Tap collapsed → scroll to top.
  "Log set" → creates PerformedSet (restPlannedSec from prescription),
  marks row ✓ in Overview table, starts rest ring (Part 6) if planned rest
  > 0 and restNone=false. When rest ends and autoAdvance → focus moves to
  next unlogged set (series order aware: A1 set1 → A2 set1 → A1 set2 …).
  Countdown sounds: 3 short beeps at 3/2/1s + 1 long at 0 via Web Audio,
  only if countdownSounds=true and page visible. Haptic (Part 6) on log.

§3.2 Total time
  Derived: now - Workout.startedAt. Never accumulate intervals. Survives
  reload/offline. Ticks 1/s via single rAF-throttled hook. Format mm:ss
  under 1h, h:mm:ss after.

§3.3 Tabs
  Overview: full day as GroupCards in `live` variant. Each exercise row
    expandable → table header 32 "Set | Type | Reps | Weight | Rest",
    rows 32. Logged rows: ✓ + actual values, tap → edit inline (SetRow
    compact). Unlogged rows: planned values dimmed, tap → makes it the
    focus set (jump). Rest column = planned; actual shown in tooltip-free
    form as "60→75" once performed. Current focus row has 4px left bar.
  Logs: flat chronological list of PerformedSets this session, 40px rows:
    "{time} · {A1} {name} · {reps}×{weight}{unit} · {type}". Swipe-free;
    tap → edit inline. Empty: "Nothing logged yet."
  History: for the FOCUS exercise, last 5 sessions. Each session = header 40
    "{date} · {source label}" + 32px rows "Set n · reps×weight". Empty:
    "First time doing this exercise." Fetched lazily on tab open. Cached
    in Dexie by exerciseId for offline.

§3.4 Jump-to-exercise
  Tap any unlogged set in Overview → becomes focus. Tap an exercise header →
  focus = its first unlogged set. Focus index stored in Dexie live-session
  record so reload restores exact position.

§3.5 ⚙ Settings (full-screen route /workout/[id]/live/settings)
  Rows 56 with switches: Auto-advance after rest · Countdown sounds ·
  Show tempo · Video speed (value chip → ActionList). Persist to
  WorkoutSettings immediately (optimistic + outbox). Bottom row (danger,
  4px red bar): "Exit workout" → §3.6.

§3.6 Exit
  ✕ or "Exit workout" → destructive-confirm modal:
    Title "End this workout?"
    Body  "{n} of {N} sets logged. Total time {t}."
    Checkbox row 40: "Mark as complete" (default ON if n ≥ 1, else OFF)
    Buttons: Cancel · End
  End with Mark ON  → finish flow: endedAt, totalVolume, totalSets,
    markedComplete=true, ScheduleEntry COMPLETE, cursor advance (program),
    summary screen (existing) → Logs.
  End with Mark OFF → if n = 0: hard delete workout + Dexie record, toast
    "Workout discarded". If n > 0: keep as finished but markedComplete=false,
    no cursor advance, ScheduleEntry stays; toast "Saved as partial".
Never lose logged sets. Never say "data won't be saved" — we save.

========================================================================
§4  WORKOUT BUILDER — full rebuild to parity
========================================================================

§4.1 Your Workouts  /builder
  TopBar back · "Your workouts". SubBar search (name, muscles).
  List cards 48+40: R1 name ..... difficulty pill · R2 "{muscles up to 3, +n}
  · {minutes} min · {exercises} ex". Tap → /days/[dayId] (custom Day, Part 9
  §5). Long-press → ActionList: Edit · Duplicate · Delete(confirm).
  Empty: "No custom workouts yet." + BottomBar "Build a workout".
  Search-empty: "No workouts match "{q}"." + "Clear search".
  BottomBar always: "Build a workout" → /builder/new.

§4.2 Build screen  /builder/[id|new]
  TopBar: Cancel · "Build workout" · Save
  ScrollBody:
    Row 56: name input (placeholder "Workout name")
    Row 48: difficulty segmented Beg/Int/Adv (default = user.difficulty)
    Row 48: "Duration" ..... numeric input "45" + "min"
        (auto-estimate button "Estimate" → sets×(avg tempo+rest) rounded 5)
    Series list = GroupCards in `edit` variant. Per exercise (§4.5).
    Empty: "Add your first exercise." (one line, centred, 96px block)
  BottomBar: "+ Add exercise" (§4.3)
  Unsaved guard (§4.8). Save (§4.9).

§4.3 Add exercise  /builder/[id]/add?series=[seriesId|new]
  TopBar back · "Add exercise" · "{k} selected" chip (k>0)
  SubBar search.
  Filter row 40: chips "Muscle ▾" "Equipment ▾" (count badges when active)
    → each opens full-screen filter route (§4.4).
  Helper row 32 (only when series param = existing): "Up to 4 per series."
  List rows 56: checkbox · name · muscle chips (max 2). Selected = 4px bar.
  Max selectable: 4 when adding to a series; unlimited when new.
  Empty (filters): "No exercises match. Try changing filters." + "Clear".
  BottomBar label by k (new series):
    k=0 disabled "Add"  · k=1 "Add exercise" · k=2 "Add as superset"
    · k=3 "Add as triset" · k=4 "Add as giant set" · k≥5 "Add {k} exercises"
    (≥5 → each becomes its own series, per STNDRD rule).
  When series param = existing: label "Add to {label}" and cap = 4 - current.
  Tap "{k} selected" chip → /builder/[id]/add/selected: list of selected with
    ✕ per row, reorder handles, BottomBar "Update".
  First-time helper (once per user, localStorage + user pref): inline 96px
    prose card at top of list: "1 = single · 2 = superset · 3 = triset ·
    4 = giant set · 5+ = added separately. You can regroup later." with
    "Got it" and "Don't show again". Not a modal (L3).

§4.4 Filters
  /builder/[id]/add/filter/muscle : full list multi-select 48 rows:
    Abs/Core · Back · Biceps · Calves · Chest · Forearms · Full body · Glutes
    · Hamstrings · Hips · Lower back · Quads · Rear delts · Shoulders · Traps
    · Triceps. BottomBar Clear · Apply. Selection → URL query.
  /builder/[id]/add/filter/equipment : SubBar search "Search equipment";
    48 rows multi-select from canonical Exercise.equipment distinct values
    seeded to include: Bodyweight · Barbell · Dumbbells · Kettlebell · Bench ·
    Incline bench · Cable (4-stack) · Smith machine · Leg press · Hack squat ·
    Leg curl machine · Leg extension machine · Hip thrust machine · Chest
    supported row · Lat pulldown · Pull-up bar · Dip station · GHD ·
    Plate-loaded machine · Resistance band · Long band · Med ball · Ab wheel ·
    Wedge/plate · Trap bar · EZ bar · Landmine · Sled · Rope attachment.
    First row "All equipment" toggles all. BottomBar Clear · Apply.
  Same two filter routes are reused by Library and Replace (Part 9 §5.2).
  One implementation, three entry points.

§4.5 Exercise editor (inside GroupCard `edit` variant)
  Header 48: "{A1}" · name · … (§4.7)
  Row 40: "Tempo" ..... chip "{x-x-x-x}" or "None" → §4.6
  Row 40: "Trainer tip" ..... "Add" or first 24 chars → full-screen textarea
  Row 40: "Rest" ..... segmented "Same for all | Per set" · value "60 s"
    Same for all → single numeric; Per set → each set row shows own rest.
    "None" toggle sets restNone.
  Set table: header 32 "Set | Type | Reps | Rest"  (no weight in template —
    weight is logged, not prescribed; %1RM prescription from Part 8 stays
    available via Type=PCT if implemented) rows 40 = SetRow `template`
    variant. Reps accepts number or "AMRAP" toggle. Swipe row left → Delete
    (min 1 set enforced §4.8). Row 40 "+ Add set" duplicates last set.

§4.6 Tempo picker  /builder/[id]/tempo/[seriesExerciseId]
  TopBar back · "Tempo" · Apply. Prose row 40 "eccentric-pause-concentric-
  pause". Presets 48 rows radio: 3-0-1-0 · 3-1-1-0 · 2-0-x-0 · 3-0-1-1 ·
  3-0-x-0 · 2-0-2-0 · 4-0-x-0 · 4-0-1-0 · None. "Custom" row → 4 inline
  numeric inputs (x allowed in 3rd). Same picker reused by live … → tempo.

§4.7 Exercise … (ActionList)
  Rearrange series (Part 9 §5.1 screen, edit mode) · Add exercise to this
  series (→ §4.3 with series param; hidden if series full) · Replace
  exercise (Part 9 §5.2) · Edit sets (scrolls + focuses table) · Exercise
  info (Part 9 §5.3) · Remove exercise · Remove series.
  Remove exercise: if series has >1 → instant + toast Undo 5s. If last in
  series → same as Remove series.
  Remove series → confirm modal "Remove {label}? {n} exercises." Cancel/Remove.

§4.8 Validation (inline, no modals)
  - Name required → red 4px bar on name row + helper 32 "Name required".
  - ≥1 exercise → Save disabled with helper under list.
  - Each exercise ≥1 set → delete of last set blocked, row shakes, helper
    32 "Each exercise needs at least one set."
  - Reps required per set (number ≥1 or AMRAP) → offending SetRow gets red
    bar; Save scrolls to first error.
  - Duration 5-300.
  Leave guard: Cancel/back with dirty state → confirm modal "Discard changes?"
  Cancel/Discard. Browser back handled via history guard hook (exists? reuse;
  else create once in lib/useUnsavedGuard).

§4.9 Save
  Save → server action creates/updates Day(kind WORKOUT, source CUSTOM) with
  series/sets, derives muscles (union of exercise primary) and equipment
  (union), estimates minutes if empty. Toast "Saved to your workouts".
  Navigate → /days/[dayId]. Offline → outbox, optimistic navigation with
  temp id swap on sync.

========================================================================
§5  CALENDAR — day detail + quick jump
========================================================================

§5.1 Tap day → route /calendar/[yyyy-mm-dd] (full screen, not sheet)
  TopBar back · "{Weekday}, {Mon} {d}".
  Body rows 56 per entry:
    COMPLETE  "{program}: {day name}" · "✓ Completed · {duration}"  → log
    SCHEDULED "{name}" · "Scheduled" → day overview; swipe → Unschedule
    MISSED    "{name}" · "Missed" → ActionList: Do it today · Reschedule
              (date picker) · Dismiss
    REST      "Rest day" · "—"
  Empty: "Nothing on this day."
  BottomBar: "Schedule a workout" → picker route /schedule/pick?date=… listing
    Current program days · Your workouts · On demand (search) → creates
    ScheduleEntry for that date.
§5.2 Quick jump
  Calendar TopBar gains "Today" text button (hidden when today in view).
  Every date/time picker modal gains footer chips: Yesterday · Today ·
  Tomorrow. One picker component, one change.

========================================================================
§6  LOG DETAIL — history columns + inline edit
========================================================================

§6.1 History columns
  In /logs/[id], exercise expansion gains toggle row 32: "This session |
  Compare". Compare → table becomes horizontally scrollable: fixed 48px "Set"
  column + one 96px column per session (this + up to 3 prior, newest left).
  Column header 32 = "{d Mon}". Cells 32 = "{reps}×{weight}". Missing set =
  "—". Best weight in row = bold. Scroll container has 4px inset shadows on
  overflow sides. Nowrap preserved.
§6.2 Edit history
  "Edit history" (Part 9) → rows become editable SetRows in place. BottomBar
  swaps to Cancel · Save. Per row swipe → Delete. Save recomputes
  totalVolume/totalSets and max logged. Cancel restores.

========================================================================
§7  DASHBOARD TAB — rebuild top half
========================================================================

Order in ScrollBody:
 1 Program card (48+40+40): R1 "Current program" label · R2 name .....
   "{daysDone}/{daysTotal}" pill · R3 thin 4px progress bar (full width,
   accent) + phase chips. Tap card → /dashboard/program (§7.1).
   CTA row 48: "Start Day {n}" | "Rest day — mark off" | none.
   No program → "Pick a program" → /programs.
 2 "Today" section header 40 ..... "Calendar ›"
   Rows 56 per today ScheduleEntry (same renderer as §5.1). Empty 56:
   "Nothing scheduled today." ..... "Schedule".
 3 "Stats" header 40 ..... "See all ›" (→ /progress)
   Tile row: 2 tiles side by side, each 96px, 4px bar:
     Weight: latest "{v} {unit}" · sub "7-day avg {avg}" or "No weigh-ins"
             → /progress
     Steps:  "{today}/{goal}" · sub "{pct}%" → /steps
 4 Existing Part 5 dashboard content (streaks, charts) below. Keep.
§7.1 Program progress  /dashboard/program
  TopBar back · program name.
  Rows 48: "Day {n} of {N}" · "Phase {p} of {P}" · "Started {date}" ·
  "Sets logged {total}" · "Volume lifted {v} {unit}" (sum PerformedSet
  reps×weight for workouts with dayId in this variant) · "Workouts completed
  {c}" · "Missed {m}".
  BottomBar: "Continue — Day {n}".

========================================================================
§8  PROGRESS (weigh-in) + STEPS
========================================================================

§8.1 /progress
  TopBar back · "Progress" · "+ Log". SubBar tabs Weigh-in | Photos | History.
  Weigh-in tab: chart (existing Recharts, 7-day avg line from Part 8) + latest
    row. History tab: month headers sticky 40 ("December 2025") + rows 40
    "{d Mon} · {v} {unit} · {±delta}". Swipe → Delete. Empty: "No weigh-ins
    yet." ..... "Log".
  Photos tab: grid 3 cols by pose label; tap → Part 6 timeline.
§8.2 Log weigh-in  /progress/log?date=
  TopBar back · "Log weigh-in" · Save.
  Row 56: week strip (7 × 40 cells, Mon-Sun), swipe ← → prev/next week.
    Future dates disabled (dimmed, tap → toast "Can't log a future date").
    Chips row 32: Yesterday · Today.
  Row 56: weight numeric + unit chip.
  Section "Photos (optional)": 3 slots 96px Front · Back · Side, each "Add"
    → native file input (capture="environment" + gallery both allowed via
    two ActionList options: Take photo · Choose from library). Preview +
    ✕ replace.
  Save → BodyWeightEntry upsert by date + BodyPhoto rows with pose.
  If user.weighInDays includes today's weekday → Part 8 notification prompt
  uses this route.
§8.3 Steps  /steps
  TopBar back · "Steps". Row 96: big "{today} / {goal}" + 4px progress.
  Row 56: "Add steps" numeric (adds to today; also "Set total" mode toggle).
  Row 56: "Daily goal" ..... numeric (persist user.stepGoal).
  Section "This week": 7 rows 40 "{Mon d} · {steps}" · bar.
  Prose row 32 (muted): "Automatic sync isn't available in the browser."
  Empty: "No steps logged yet."

========================================================================
§9  PROFILE
========================================================================

/account/profile (evolve existing Manage Profile)
  Avatar row 56: circle 40 · "Change photo" → ActionList Take / Choose /
    Remove. Media adapter storage.
  Rows 56 (label ..... value ›), each → inline edit row or picker:
    Name · Email (read-only, + "Change" only if credentials provider) ·
    Password "Change" (only credentials; route /account/password: current ·
    new · confirm · zxcvbn-style min score 3) · Gender (ActionList) ·
    Birth year (numeric, age shown) · Height (numeric + unit, stored cm) ·
    Weight (latest weigh-in, read-only, "Log" link) · Fitness level
    (= user.difficulty; uses useChangeDifficulty; label explains "Changes
    your program difficulty") · Weigh-in days (7 toggles Mon-Sun) · Units
    (kg/lb, cm/in) · Timezone (auto + override).
  Footer prose 32 muted: "SetForge {version from package.json}" — REMOVED per
    decision → do NOT show version. (Item 2 dropped.)
  Delete account row stays in More (Part 9).

========================================================================
§10  TOUR
========================================================================

Register all new routes. `tour` on every control. Add steps: Home difficulty
chip · Live FocusCard · Live tabs · Live settings · Exit modal · Builder add
flow (k-label) · Tempo picker · Calendar day · Log compare · Dashboard program
card · Progress log · Steps goal · Profile fitness level. Codegen. Lint zero.

========================================================================
§11  API (route handlers or server actions; Zod; auth; owner-scoped)
========================================================================

PATCH /api/workout-settings
GET   /api/workouts/[id]/live               (state incl. focus index, sets)
POST  /api/workouts/[id]/sets               (log set)   PATCH/DELETE /sets/[setId]
POST  /api/workouts/[id]/end                {markComplete: boolean}
GET   /api/exercises/[id]/history?limit=5&before=
GET   /api/exercises/[id]/max               (max weight logged)
GET   /api/exercises?muscles=&equipment=&q=&excludeDayId=
GET   /api/equipment                        (distinct canonical list)
POST  /api/days                             (custom Day create) PUT/DELETE /days/[id]
POST  /api/days/[id]/duplicate
GET   /api/schedule?date=   POST /api/schedule {date, dayId}   DELETE /schedule/[id]
POST  /api/schedule/[id]/reschedule {date}   POST /api/schedule/[id]/dismiss
GET   /api/program/progress
GET   /api/weigh-ins?from=&to=   POST (upsert by date)   DELETE /weigh-ins/[id]
POST  /api/photos {date, pose, mediaKey}
GET   /api/steps?from=&to=   POST /api/steps {date, steps, mode: ADD|SET}
PATCH /api/user/profile   PATCH /api/user/step-goal   POST /api/user/password
All list endpoints paginated (cursor). All mutations idempotent by client id
where the outbox may retry.

========================================================================
§12  POLISH PASS — applies to EVERY screen in the app, not just new ones
========================================================================
- Skeletons: every route has loading.tsx whose rows match final heights.
- Empty states: one sentence + one action. No illustrations.
- Errors: error.tsx with "Something went wrong." + Retry + Back. Report to
  console.error only in dev; to /api/log-client-error in prod (rate-limited).
- Offline: existing banner shows on nav loss; all mutations queue; reads
  serve Dexie cache with 32px "Showing offline data" row where applicable.
- Focus & a11y: every control ≥44px hit area, visible focus ring, aria-labels
  on icon-only buttons, role=status on timers/toasts, prefers-reduced-motion
  disables rest ring animation and shakes.
- Numbers: units from user pref everywhere; kg↔lb conversion in one util;
  never mix.
- Dates: user timezone everywhere (Part 5). No UTC leaks in UI.
- Copy: sentence case, no exclamation marks, no emoji in UI text, verbs on
  buttons ("Log set", not "Submit").
- Performance: live screen interaction → paint < 100ms on mid-range phone
  (measure with Playwright trace at 4× CPU throttle). Lists > 50 rows
  virtualized.

========================================================================
§13  VERIFY — all must pass
========================================================================

Unit (Vitest):
  total-time derivation across reload · focus-advance order for
  superset/triset/giant · k→label mapping (0..6) · 4-cap per series ·
  tempo parse/format incl. x · rest mode same/per-set migration ·
  builder validation matrix · totalVolume with mixed units · history-column
  alignment with missing sets · future-date guard in local timezone ·
  step ADD vs SET · difficulty↔fitness level single-source · exit semantics
  (n=0/off, n>0/off, on).
E2E (Playwright @360, also smoke @320 and @430):
  1 Home chip → change difficulty → confirm → card updates → Programs SubBar
    matches.
  2 Start Day → FocusCard prefilled → Log set ×3 → rest ring → auto-advance
    to A2 → Overview shows ✓ rows → Logs tab lists 3 → History tab shows
    prior session (seeded).
  3 Reload mid-workout → total time continues · focus restored.
  4 ⚙ toggle Show tempo off → tempo row hidden · Countdown sounds on →
    audio context created (mock) · Exit with Mark ON → summary → log has
    totalVolume.
  5 Exit with n=0 Mark OFF → workout gone · toast.
  6 Builder: new → add 3 → label "Add as triset" → set tempo preset → rest
    per set → remove one (Undo) → Save → appears in Your workouts →
    /days shows Triset label + equipment auto.
  7 Builder validation: delete last set blocked · empty reps blocks Save +
    scrolls · back with dirty → Discard modal.
  8 Calendar day → completed entry → opens log · missed → Reschedule →
    picker "Tomorrow" chip → entry moved.
  9 Log detail → Compare → 2 columns · Edit history → change weight → Save →
    max logged updates.
  10 Dashboard → program card → progress screen numbers match DB · Today
     section shows scheduled · Stats tiles link.
  11 Progress → Log → future cell disabled → today → weight + Front photo →
     Save → History month group · Photos grid shows Front.
  12 Steps → add 4000 → set goal 8000 → tile shows 50%.
  13 Profile → Fitness level → Advanced → Home chip reads Advanced.
  14 FULL JOURNEY (fresh user): sign up → onboarding → Programs → Beginner →
     Start Phase 1 → Home Start Day 1 → log all sets of exercise 1 → jump to
     exercise 3 → log 1 → Exit Mark ON → Logs shows entry with duration →
     Calendar dot COMPLETE → Dashboard Day 2/N → Progress log weigh-in →
     More → Sign out → Sign in → state persists.
  15 OFFLINE JOURNEY: go offline mid-workout → log 2 sets → reload → sets
     present → online → outbox flushes → server has 2 sets, no dupes.
Harness (Part 3): every route incl. new at 320/360/390/430 → zero overlap,
  zero horizontal scroll (except §6.1 compare container), zero text wrap
  outside prose.
Tour lint: zero missing. Registry regenerated. Tour runs end-to-end on
  live screen without stale anchors.
Lighthouse (mobile, prod build): PWA installable · Performance ≥ 85 ·
  Accessibility ≥ 95 · Best practices ≥ 95 on / , /workout/[id]/live,
  /builder/new, /logs.

========================================================================
§14  SHIP GATE — the app is usable the next second
========================================================================
[ ] `pnpm install && pnpm setup` (one script): env check with clear errors,
    migrate, seed, build. Documented in README "Run in 3 commands".
[ ] `docker compose up` → app + Postgres → healthy at /api/health in < 60s.
[ ] Seed = demo account (email/password printed once by seed) with: 3 programs
    × 2 variants, 8 on-demand, 2 custom workouts, 6 weeks of realistic logs,
    weigh-ins, steps, photos placeholders, schedule with COMPLETE/MISSED/
    SCHEDULED mix — so every screen has data on first open.
[ ] Fresh account path also verified (all empty states seen in e2e 14).
[ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`, `pnpm harness`,
    `pnpm tour:lint` — all green in CI config (GitHub Actions file exists and
    runs them; if repo has none, add .github/workflows/ci.yml).
[ ] No console errors/warnings in browser on any route (Playwright asserts).
[ ] PWA: install prompt works; offline shell loads; icons 192/512 + maskable;
    theme-color; splash meta.
[ ] Env only: switching DATABASE_URL to another Postgres and running
    `pnpm setup` yields identical app. Verified once locally.
[ ] Security: rate limits on auth, support, client-error endpoints; no
    secrets in client bundle (grep build output for env names); CSRF via
    Auth.js; uploads validated by MIME + size ≤ 10MB; owner scope tests.
[ ] docs/spec/part-10-audit.md complete; docs/spec/CHANGELOG.md updated;
    README screenshots section regenerated from Playwright (360px, 6 shots).
[ ] Final commit `chore(part10): ship gate green`. Tag v1.0.0.

BEGIN WITH P1. Do not write code before docs/spec/part-10-plan.md exists.