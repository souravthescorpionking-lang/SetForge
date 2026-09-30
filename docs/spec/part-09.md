# PART 9 — PROGRAMS, VARIANTS, PHASES & ACCOUNT (verbatim build prompt)

ROLE
You are the lead engineer on SetForge. You own quality. No one reviews after you.
Work like a senior engineer shipping to production: read first, plan, implement
in small verified steps, test, audit, fix, then report. Never claim done without proof.

CONTEXT
SetForge = phone-only multi-user workout PWA. Parts 1-8 are implemented in this repo.
Stack: Next.js App Router, TypeScript strict, Prisma, Postgres (env-switchable),
Auth.js, Tailwind + shadcn, Zod, Serwist PWA, Dexie offline outbox, Vitest, Playwright.
Non-negotiable laws already in repo — find and obey them:
  - Layout: Screen → TopBar(56) → [SubBar(48)] → ScrollBody → [BottomBar(56)] → NavBar(64).
    Rows 56/48/40/32. Single-line nowrap except prose blocks. Zero overlap at 320/360/390/430.
  - One GroupCard. One SetRow. Never fork them.
  - No bottom sheets. Modals only: destructive-confirm, date/time picker.
  - Colour = 4px left bar. No cover images. No XP/badges. No nutrition. No community.
  - Every interactive element declares `tour`. Registry codegen + ESLint rule exist.
  - 3 tabs: Workout / Dashboard / More.
  - DB switching by env only. Migrations idempotent. Offline writes via outbox.

========================================================================
OPERATING PROTOCOL — follow exactly
========================================================================
P1  DISCOVER (read-only, before any edit)
    - Map repo: schema.prisma, app routes, components (GroupCard, SetRow, ActionList,
      TopBar, SubBar, BottomBar), lib (tour registry, outbox, layout harness, midnight
      refresh job), tests, seed, docs/spec if present.
    - Write `docs/spec/part-09.md` = this entire prompt verbatim.
    - Write `docs/spec/part-09-plan.md`: for each § below, list files to touch,
      existing components to reuse, risks. Keep it short. Update as you go.
P2  IMPLEMENT §1 → §14 IN ORDER. One § at a time.
    - After each §: `pnpm typecheck` (or repo equivalent), `pnpm lint`, `pnpm test`.
      All green before next §. If red, fix now. Never defer.
    - Commit per §. Message: `feat(part9): §N <title>`.
    - Reuse before create. Grep for existing helpers first.
    - No TODOs, no stubs, no "implement later", no console.log left behind.
    - Zod on every API input. Auth + owner scoping on every handler.
    - Every new route registered in tour registry. Every new button has `tour`.
P3  VERIFY (§15). Run everything. Fix everything. Re-run until green.
P4  AUDIT. Re-read this prompt top to bottom. For each line, find the code that
    satisfies it. Anything missing → implement now. Write results to
    `docs/spec/part-09-audit.md` as a checklist with file paths.
P5  REPORT (final message): sections done, migrations added, seed changes,
    test counts (unit/e2e pass/fail), harness results per width, tour lint result,
    known limitations (must be empty or justified).

RULES OF CONDUCT
- Do not stop early. If context runs long, finish current §, commit, write progress
  to part-09-plan.md, then continue. Your resume point is that file.
- Do not ask the user questions. Decide, note the decision in plan.md, proceed.
- Do not weaken a law to make a test pass. Fix the code.
- Do not touch unrelated code. No refactors outside scope.
- If a referenced "existing" thing is missing, build the minimum and note it.

========================================================================
§0  VOCAB
========================================================================

Program    = template. Has Variants.
Variant    = Program × Difficulty. Owns daysPerWeek, equipment, phases.
Phase      = ordered block of Days. overview text + minutes range.
Day        = WORKOUT | REST. Workout Day owns Series.
Series     = existing Group. Label rule: 1 none / 2 Superset / 3 Triset / 4+ Giant set.
Override   = per-user edit on a Day (order, replacements, notes).
Log        = existing Workout record. Gains source + difficulty + duration.

========================================================================
§1  SCHEMA (Prisma). Add only. Never drop. Idempotent migration.
========================================================================

enum Difficulty      { BEGINNER INTERMEDIATE ADVANCED }
enum DayKind          { WORKOUT REST }
enum SetType          { ...existing, AMRAP }
enum LogSource        { PROGRAM ON_DEMAND CUSTOM }
enum ScheduleStatus   { SCHEDULED COMPLETE MISSED }

User                    += difficulty Difficulty @default(INTERMEDIATE), currentVariantId String?,
                           cursorPhaseIdx Int?, cursorDayIdx Int?, programStartedAt DateTime?,
                           deletedAt DateTime?
Program        : id name tagline description weeks Int isPublic ownerId?  variants[]
ProgramVariant : id programId difficulty daysPerWeek Int equipment String[] phases[]
                 @@unique([programId, difficulty])
Phase          : id variantId idx name overview minutesMin minutesMax days[]
Day            : id phaseId? idx kind name minutes? muscles String[] equipment String[] series[]
SeriesExercise += tip String?, restNone Boolean @default(false)
PrescribedSet  += isAmrap Boolean @default(false)
PhaseOverride  : userId phaseId dayOrder Json                    @@unique([userId, phaseId])
DayOverride    : userId dayId seriesOrder Json replacements Json notes Json
                 @@unique([userId, dayId])
DayFavorite    : userId dayId                                    @@id([userId, dayId])
ScheduleEntry  += status ScheduleStatus, dayId String?, markedOff Boolean @default(false)
Workout(Log)   += source LogSource @default(CUSTOM), sourceLabel String?,
                   difficulty Difficulty?, dayId String?, durationSec Int?

PerformedSet   += setType SetType (if absent)
Exercise       += setup? position? target? equipment String[] videoUrl? altGroup String?
OnDemandWorkout : id name minutes intensity Difficulty durationBand String
                   equipmentLevel String categories String[] isFeatured Boolean dayId (1:1)
                   durationBand ∈ LE20|20_45|GE45 (derived on write)
                   equipmentLevel ∈ NONE|MINIMAL|GYM
                   categories ⊆ WARMUP_REHAB|SPECIALIZATION|LIMITED_EQUIPMENT|LIMITED_TIME|COACH_FAVORITE

Challenge        : id name startsOn weeks programVariantId isActive
ChallengeDismiss : userId challengeId
SupportTicket    : id userId subject body createdAt

Seed migration: existing programs → 1 variant (INTERMEDIATE), 1 phase, existing days.
Seed data: ≥3 programs × ≥2 variants each, ≥1 with 3 phases and REST days,
≥8 on-demand workouts covering every category/duration/equipment value, 1 active challenge.

========================================================================
§2  DIFFICULTY (global)
========================================================================

Programs screen SubBar: segmented control Beginner | Intermediate | Advanced.
Change → destructive-confirm modal:
  "Change difficulty" / "From {old} to {new}. Current program restarts at Phase 1 Day 1."
  Cancel · Confirm
Confirm:
  user.difficulty = new
  currentVariant → sibling variant (same programId, new difficulty).
    none → keep, toast "No {new} version. Kept {old}."
  cursor = (0,0). Future ScheduleEntry for program deleted, regenerated (§6).
Offline → outbox. Catalog + detail re-render.

========================================================================
§3  PROGRAMS CATALOG  /programs
========================================================================

TopBar back · "Programs". SubBar difficulty control.
Card (48 header + 40 meta):
  R1 name ................ "{weeks} WEEKS" pill
  R2 tagline
  R3 "{phaseCount} phases · {daysPerWeek} d/wk"   (variant at current difficulty)
  No variant at difficulty → dimmed, R3 "Not available at {difficulty}".
Current program → accent left bar + "{daysDone} Days" pill.
Tap → /programs/[id]

========================================================================
§4  PROGRAM DETAIL  /programs/[id]
========================================================================

TopBar back · name. SubBar tabs Overview | Program.
Header: name · "{daysDone} Days" pill (if current) · phase chips.
Overview:
  "Highlights": rows 40px — Days per week · Equipment "{n} items" (chevron → inline list)
    · one row per phase "Phase {n}" "{min}-{max} min"
  "About": description prose. Per phase: "Phase {n} — {name}" + overview prose.
Program:
  chip selects phase. Heading "Preview — Phase {n}" ..... [Reset Order] (only if PhaseOverride)
  Day rows 56px: handle · name · "Day {i}" · "{minutes} min" | REST → "Rest day"
  Long-press → reorder. Drop → save PhaseOverride. Reset → delete + toast.
  Tap WORKOUT row → /days/[id]
BottomBar: "Start program — Phase {n}" | current → "Continue — Day {cursor+1}".
Start: set currentVariantId, cursor=(n,0), programStartedAt=now, generate schedule (§6).
Another program current → confirm "Replace current program?".

========================================================================
§5  DAY OVERVIEW  /days/[dayId]
========================================================================

Used for program days, on-demand days, log template view.
TopBar back · name · … (Rearrange series).
Header: muscle chips (32px scroll) · "{sets} SETS · {exercises} EXERCISES" (post-override)
  · action row 4×48px: Favorite · Schedule · History · Mark off
  · "Equipment ({n})" chevron → inline list.
Body: existing GroupCard. Per exercise:
  AMRAP set → "AMRAP" text; tap → inline dictionary popover (Part 8) definition.
  Rest expand: restNone → "Rest: none" else "sec: 75, 75, …".
  💡 = tip if authored else Part 8 generated.
  … ActionList: Rearrange series · Replace exercise · Exercise info · Notes.
  📝 indicator when note exists.
BottomBar "Start workout".
Favorite → DayFavorite toggle. Schedule → date picker → ScheduleEntry SCHEDULED.
History → /logs?dayId=. Mark off → confirm → Workout(PROGRAM, durationSec 0, markedOff)
  + ScheduleEntry COMPLETE + cursor+1 + toast Undo 5s. Hidden for on-demand.
§5.1 REARRANGE  /days/[dayId]/rearrange
  TopBar Cancel · "Rearrange" · Save. Flat list, series headers "A SERIES"…
  Row 56: handle · name · tempo · "{n}X · Rest". Drag within/across series.
  Labels recompute by size rule. Empty series dropped. Save → DayOverride.seriesOrder.
§5.2 REPLACE  /days/[dayId]/replace/[seriesExerciseId]
  Header "Current" · name · muscles. SubBar search. Chips: Muscle group ▾ · Equipment ▾ (ActionList multi).
  "Suggestions" = same altGroup OR same primary muscle, max 8. "All results" below.
  Select → BottomBar Apply → DayOverride.replacements. Sets kept.
  Also from live logging … → writes to live Workout only.
§5.3 EXERCISE INFO  /exercises/[id]
  Header muscle + equipment chips. Video 16:9 if videoUrl (Part 6 media adapter).
  Collapsible 48px rows: Setup · Position · Target · Equipment. Prose exempt from nowrap.
  Single component, reused by library.
§5.4 NOTES  /days/[dayId]/notes/[seriesExerciseId]
  TopBar back · "Notes" · Save. Textarea. Save → DayOverride.notes.
  In logging: shows 1 line under exercise header, tap expands.

========================================================================
§6  SCHEDULE + CALENDAR  /calendar
========================================================================

On Start: for each Day from start phase in user order → date = start + offset.
  REST consumes a date, entry kind REST, no dot.
Missed: reconcile on app open + nightly (reuse Part 5 timezone refresh):
  SCHEDULED && date < today && no Workout(dayId) that date → MISSED. Idempotent.
Calendar: continuous vertical months, virtualized. Range: min(earliest entry, now-2) → now+3.
  Month header sticky 40. Cell 40. Dots: COMPLETE accent · SCHEDULED outline · MISSED danger.
  SubBar legend. Tap day → ActionList entries → log or day overview.

========================================================================
§7  ON DEMAND  /on-demand
========================================================================

TopBar back · "On demand" · filter icon (badge count). SubBar search.
Chips 32px: All · Warm up / Rehab · Favorites · Coach picks · Specialization ·
  Limited equipment · Limited time.  Favorites = DayFavorite. Coach picks = isFeatured.
Card: R1 name ..... intensity pill. R2 "{series} series · {min} min · {equipment label}".
Filters /on-demand/filters (full screen): Intensity multi · Target area 12 muscles multi
  (Back Biceps Forearms Triceps Shoulders Traps Core Chest Quads Calves Glutes Hamstrings)
  · Duration single (≤20 · 20-45 · ≥45) · Equipment multi (No equipment · Minimal · Gym).
  BottomBar Clear all · Apply. State in URL. Server filtering.
Card tap → /days/[dayId].

========================================================================
§8  LOGS  /logs
========================================================================

TopBar back · "Logs" · list⇄calendar toggle. SubBar search (name, sourceLabel, exercise names).
Row 56, 2 lines: L1 name ..... difficulty pill. L2 sourceLabel · "{h}h {m} min {s} sec" (drop zero units).
Calendar mode = §6 component filtered to logs. ?dayId= → chip "Filtered: {name}" ✕.
Detail /logs/[id]:
  TopBar back · name · … (Rearrange · Replace · Notes → this log only).
  Header start time · difficulty pill · muscle chips · sourceLabel.
  GroupCard performed mode. Per exercise:
    Reps row performed (AMRAP → "AMRAP→{actual}") · tempo · "Max weight logged: {v} {unit}" (N/A)
    Table 32px header Set | Type | Reps | Weight. Type short W/N/D/F/AMRAP. Rows 32.
    Rest expand → actual list, fallback planned.
    "Edit history" → existing edit screen scrolled to exercise.
sourceLabel: PROGRAM "{program} · Day {n}" · ON_DEMAND "On demand" · CUSTOM "Custom"/routine name.
Log.difficulty = user.difficulty at start. Immutable.

========================================================================
§9  MORE TAB / ACCOUNT
========================================================================

Rows: Manage notifications (existing) · Manage subscription (/account/subscription static
"Free plan", env PAYMENTS_PROVIDER=none|stripe placeholder, no billing) · Message support
(/account/support form → POST /api/support → SupportTicket, rate limit 5/day/user) ·
Social accounts (/account/social linked Auth.js providers, Link/Unlink) · Invite friends
(navigator.share, fallback copy) · Privacy policy · Terms (static md) · Sign out ·
Delete account (/account/delete type "DELETE" → soft delete, anonymize email, sign out;
purge job after 30 days).
No Achievements. No XP.

========================================================================
§10  CHALLENGE BANNER (Home)
========================================================================

Active challenge, startsOn ≥ today-7, not dismissed → card above program card:
  R1 "Challenge" · name. R2 "Starts {date} · {weeks} weeks" ..... [Join]. ✕ dismiss.
Join → start flow for variant at user difficulty, programStartedAt = startsOn.
  Cursor locked until then. Home CTA "Starts in {n} days".
§11  HOME
========================================================================

Program card: "Current program" · name ..... "{daysDone} Days" · phase chips · tagline.
CTA: "Start Day {n}" | "Rest day — Mark off" | "Starts in {n} days". "See all" → /programs.
None → "Pick a program" + "See all". Tools list unchanged.

========================================================================
§12  BUILDER
========================================================================

Program builder: variant tabs per difficulty · phase add/remove · day add WORKOUT/REST ·
day fields name, minutes, muscles (auto, editable), equipment (auto).
Per exercise: tip textarea · restNone toggle · per-set AMRAP toggle. Publish → isPublic.

========================================================================
§13  TOUR
========================================================================

Register all new routes. `tour` on every control. Steps: difficulty switch, Start program,
day action row, … menu, Rearrange, Replace, On demand filters, Logs toggle, Edit history.
Codegen registry. Lint zero errors.

========================================================================
§14  API  (Zod, auth, owner-scoped)
========================================================================

PATCH /api/user/difficulty
GET   /api/programs?difficulty=          GET /api/programs/[id]?difficulty=
POST  /api/programs/[id]/start {phaseIdx}
PUT   /api/phases/[id]/order {dayOrder}    DELETE reset
GET   /api/days/[id]  (override-merged)    PUT /api/days/[id]/override
POST|DELETE /api/days/[id]/favorite         POST /api/days/[id]/mark-off
GET   /api/on-demand?intensity=&muscles=&duration=&equipment=&category=&q=
GET   /api/logs?q=&dayId=&view=
GET   /api/exercises/[id]/suggestions
POST  /api/support
GET   /api/account/social   POST link   DELETE unlink
POST  /api/account/delete
GET   /api/challenges/active    POST /api/challenges/[id]/join
POST  /api/schedule/reconcile-missed (idempotent, cron + on-open)

========================================================================
§15  VERIFY — all must pass
========================================================================

Unit: override merge · series relabel after cross-series move · missed reconcile at
  23:59 vs 00:01 across timezone · duration formatting · maxWeight mixed units ·
  AMRAP render · difficulty swap missing variant · durationBand derivation.
E2E Playwright @360px:
  1 change difficulty → confirm → catalog re-renders → detail shows new d/wk
  2 start program phase 2 → SCHEDULED dots → mark off → COMPLETE → cursor+1
  3 rearrange A2→B → labels update → save → overview reflects
  4 replace exercise via suggestion → add note → start workout shows note
  5 on-demand ≤20 min + No equipment → only matching → favorite → in Favorites
  6 finish workout with AMRAP → log detail table + max weight + actual rest
  7 logs → calendar → tap day → opens log
  8 delete account → signed out → login fails
  9 full journey: signup → pick program → start Day 1 → log 3 sets → finish →
     log appears → dashboard updates → calendar dot COMPLETE
Overlap harness (Part 3): all new routes at 320/360/390/430 → zero overlap.
Tour lint: zero missing. Registry regenerated.
Lighthouse PWA on /: installable, offline shell loads.

BEGIN WITH P1. Do not write code before docs/spec/part-09-plan.md exists.
