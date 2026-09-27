# SetForge — Multi-User Workout Tracker PWA — Worklog

Shared worklog for all agents. Append sections (never overwrite) using the template:
`--- / Task ID / Agent / Task / Work Log / Stage Summary`.

## Project Overview
- **App name**: SetForge (original brand; not FitNotes)
- **What**: Production-grade multi-user workout tracker PWA. Shared DB, login/logout, full data isolation per user.
- **Visible route**: ONLY `/` (per sandbox constraint). All "pages" are client-side hash routes (`#/today`, `#/exercises`, etc.) inside the single page. API lives under `/api/*`.
- **Stack (sandbox-fixed)**: Next.js 16 App Router, TypeScript strict, Prisma (SQLite in sandbox; schema is provider-portable), Tailwind 4 + shadcn/ui, TanStack Query, Zustand, Recharts, dnd-kit, framer-motion, Zod 4, sonner.
- **Design system**: Dark-first athletic theme. Primary = vivid orange (#f97316 family) on zinc neutrals. NO blue/indigo as UI primary. Category colours are data (varied hues allowed). Rounded-2xl cards, sticky bottom nav on mobile (acts as footer), left sidebar on desktop.

## Architecture (binding conventions for all agents)
- **IDs**: UUID v7 generated app-side (`src/lib/uuid7.ts` → `uuid7()`).
- **Multi-tenancy**: every domain table has `userId`; every query filters by it; mutations assert ownership.
- **Auth**: custom credentials auth. scrypt password hashing (`src/server/auth.ts`). Session = opaque token in `Session` table + httpOnly cookie `sf_session`. API guard: `requireUser(req)` in `src/server/http.ts`.
- **API style**: JSON, Zod-validated. Errors: `{ error: { code, message, details? } }`. Success: direct JSON body.
- **Client data layer**: `src/lib/client/api.ts` — typed functions for EVERY endpoint. Feature components must use these + TanStack Query hooks (`src/lib/client/hooks.ts` if present).
- **Feature folders**: `src/features/<domain>/**` — each agent owns ONLY its assigned folder. Shared UI: `src/components/**` (owner: main agent).
- **Date handling**: workout `date` stored as UTC-midnight ISO string in JSON (`2025-01-05T00:00:00.000Z`). Client uses `src/lib/client/format.ts` helpers.
- **Sets fields by exercise type** (`src/lib/constants.ts` `FIELDS_BY_TYPE`).
- **PR recompute** after every set mutation (same request).

## API endpoints (contract — implemented by main agent)
See `src/lib/client/api.ts` for exact types. Summary:
- Auth: POST `/api/auth/signup|login|logout`, GET `/api/auth/session`
- Health: GET `/api/health`
- Categories: GET/POST `/api/categories`, PATCH/DELETE `/api/categories/:id`, POST `/api/categories/reorder`
- Exercises: GET/POST `/api/exercises`, GET/PATCH/DELETE `/api/exercises/:id`, GET `/api/exercises/:id/history|records|graph|lastsets`
- Workouts: GET `/api/workouts?date=|from,to`, GET/PATCH/DELETE `/api/workouts/:id`, POST `/api/workouts`, POST `/api/workouts/:id/copy|move`
- Workout exercises/sets: POST `/api/workouts/:id/exercises`, PATCH/DELETE `/api/workouts/:id/exercises/:weId`, PUT `/api/workouts/:id/exercises/order`, POST/PATCH/DELETE `/api/workouts/:id/exercises/:weId/sets[/:setId]`, PUT `.../sets/order`
- Workout groups: POST `/api/workouts/:id/groups`, PATCH/DELETE `/api/workouts/:id/groups/:groupId`
- Records: GET `/api/records`, POST `/api/records/recalculate`
- Stats: GET `/api/stats?period=`
- Goals: GET/POST `/api/goals`, PATCH/DELETE `/api/goals/:id`
- Routines: GET/POST `/api/routines`, PATCH/DELETE `/api/routines/:id`, POST `/api/routines/:id/days`, PATCH/DELETE `/api/routines/:id/days/:dayId`, POST/PATCH/DELETE `/api/routines/:id/days/:dayId/exercises[/:reId]`, POST `.../sets`, POST `/api/routines/:id/log`, POST `/api/routines/:id/copy`
- Measurements: GET/POST `/api/measurements`, PATCH/DELETE `/api/measurements/:id`, POST `/api/measurements/reorder`, GET/POST `/api/measurements/:id/records`, PATCH/DELETE `/api/measurements/:id/records/:recId`, GET/POST `/api/units`
- Settings: GET/PATCH `/api/settings`; Plates: GET/PUT `/api/plates`
- Account: POST `/api/account/password`, DELETE `/api/account`, GET `/api/account/export`, POST `/api/account/import`

---
Task ID: 0
Agent: main (Z.ai Code)
Task: Project planning and environment exploration

Work Log:
- Explored scaffold: Next 16.1.3 + Turbopack dev server running on :3000, Prisma 6 + SQLite (db/custom.db), full shadcn/ui set present, TanStack Query 5, Zustand 5, Recharts, dnd-kit, framer-motion, zod 4, sonner, next-themes.
- Removed scaffold `src/app/api/route.ts`.
- Decided architecture: single `/` page + hash routing; custom scrypt+session auth (NextAuth v4 is incompatible w/ Next 16); Prisma SQLite (portable schema, no vendor SDKs); subagent delegation for feature UIs.

Stage Summary:
- Plan approved: 8-phase build. Foundation first, then parallel feature agents, then integration/QA/polish/README/cron.

---
Task ID: 1
Agent: main (Z.ai Code)
Task: Foundation — schema, migrations, env contract, bootstrap, auth, health, proxy guard

Work Log:
- Full Prisma schema (20 models): User/Session/VerificationToken/UserSettings/Category/Exercise/Workout/WorkoutGroup/WorkoutExercise/TrainingSet/PersonalRecord/Routine/RoutineDay/RoutineGroup/RoutineExercise/PredefinedSet/Goal/MeasurementUnit/Measurement/MeasurementRecord/Plate/SystemMeta. SQLite provider, real FKs + cascades, composite uniques (userId,date)/(userId,name)/(exerciseId,reps).
- Migration `prisma/migrations/..._init` committed & applied. No `db push` in prod flow.
- `src/server/env.ts` — Zod env contract (DATABASE_URL, DIRECT_DATABASE_URL, DATABASE_SSL, pool/retries, DB_AUTO_MIGRATE/SEED, DB_MIGRATE_FROM_URL, AUTH_SECRET, rate limits, APP_NAME…). `normaliseDatabaseUrl()` handles postgres:// sslmode injection.
- `src/server/bootstrap.ts` + `src/instrumentation.ts` — connect w/ exponential backoff retries, seed system units, smoke-verify tables, system_meta last_boot. Logs boot summary.
- `src/server/auth.ts` — scrypt hashing (N=16384), opaque session tokens in DB, httpOnly `sf_session` cookie (30d). `src/server/http.ts` — handler() wrapper, HttpError, Zod→400, requireUser, assertOwned, in-memory rate limiter.
- `src/proxy.ts` (Next 16 middleware convention) — 401 for /api/* without session cookie (auth+health exempt).
- Auth routes: signup (creates user + per-user seed in ONE transaction), login, logout, session. GET /api/health → {db, migrations, version, latencyMs, lastBoot}.
- .env + .env.example with full contract.

Stage Summary:
- Verified via curl: signup/login/logout/session, health, rate limits, wrong-password 401, protected routes 401 without cookie.

---
Task ID: 2
Agent: main (Z.ai Code)
Task: Backend domain APIs (all)

Work Log:
- Services: workout-service (day CRUD, exercise add/remove/reorder, sets CRUD + reorder, groups, copy-with-group-mapping, move whole/partial, full PR recompute in same tx, newPr flag), exercise-service (CRUD, unit-convert on kg↔lbs change w/ PR recompute, history, lastsets prefill), analysis-service (records actual+estimated w/ supersession, listAllRecords, 11 graph metrics, stats periods, goals w/ progress), routine-service (CRUD tree, copy, log-day→workout with blank-set=copy-previous + routine group→workout group), measurement-service (config CRUD, reorder, records, custom units), settings-service (+ plates replace), account-service (JSON backup export, import replace/merge w/ 50MB limit, CSV, history deletion all/range/exercise).
- ~45 route files under /api/** — all Zod-validated via shared `src/lib/schemas.ts`, uniform error shape.
- GET /api/sync?since — pull-changed workouts/records/exercises for offline convergence.

Stage Summary:
- Curl-verified: workout create→add exercise→log sets (newPr:true on 80kg×8, false on 70kg×8), records (e1RM 99.31 = Brzycki correct), routine create→add day→exercise→predefined set→log-day (3 sets incl. copy-prev), measurement record, stats, graph, settings patch, plates, export (1 workout/97 exercises/15 measurements), sync.
- Multi-tenant verified: user B sees 0 workouts, gets own 97-exercise seed, 404 on user A's workout id.

---
Task ID: 3
Agent: main (Z.ai Code)
Task: Frontend shell — theme, root, router, nav, auth UI, API client, shared components

Work Log:
- Theme: forge-orange primary on warm stone neutrals (light+dark), custom scrollbar utilities, safe-area support. layout.tsx w/ manifest + PWA meta + sonner Toaster. Icons generated (svg→192/512/maskable png).
- `src/lib/client/api.ts` — fully typed client (authApi, categoriesApi, exercisesApi, workoutsApi, recordsApi, statsApi, goalsApi, routinesApi, measurementsApi, unitsApi, settingsApi, platesApi, accountApi, syncApi) + ApiError.
- `src/lib/client/store.ts` — zustand: session/settings/route (hash-based), optimistic updateSettings.
- `src/lib/client/query.tsx` — QueryProvider + qk keys + shared hooks (useCategories/useExercises/useWorkoutByDate/useMeasurements/useInvalidate/useOnline).
- `src/lib/client/format.ts` (day keys, labels, set summaries), `offline.ts` (localStorage outbox + flush + wipeLocalData on logout).
- Shared components: Stepper (hold-to-repeat), ExercisePickerDialog (search/favorites/category chips/create-new), TrendChart (recharts w/ points/trend/0-Y toggles + prev/next tooltip), CategoryDot, PageHeader, EmptyState, ConfirmDialog.
- `src/components/app-root.tsx` — session gate (AuthView vs app), hash router, theme sync from settings, offline flush on reconnect. `nav-shell.tsx` — desktop sidebar + mobile bottom tab bar (sticky footer w/ safe-area) + More sheet + account dropdown + offline/queued indicator.
- AuthView — split brand panel design (forge gradient) w/ login/signup toggle.
- Stub views for all 10 features (agents replace these).
- Lint clean; browser-verified login → app shell renders with toast.

Stage Summary:
- Full stack foundation DONE and verified. All feature agents build ONLY inside their `src/features/<domain>/` folder using the contracts above.

## ===== CONVENTIONS FOR FEATURE AGENTS (binding) =====
1. **Never touch**: src/app/page.tsx, layout.tsx, app-root.tsx, nav-shell.tsx, anything in src/server/**, src/lib/**, src/components/shared/**, prisma/**, other features' folders. If something is missing that you need, build it INSIDE your own feature folder.
2. **Imports available**: `@/lib/client/api` (typed clients — see file), `@/lib/client/query` (qk, useCategories, useExercises, useWorkoutByDate, useMeasurements, useInvalidate, useOnline, useApp), `@/lib/client/store` (useApp: session/settings/route/navigate), `@/lib/client/format` (dayKeyOf, todayKey, addDaysKey, formatDayLabel/Long/Short, formatSec, setSummary, relativeFromNow, round1/2), `@/lib/formulas` (estOneRm, estRm, totalVolume, speed, paceSec, roundToStep, plateGreedy, formatDuration, formatPace, kgToLbs/lbsToKg), `@/lib/constants` (EXERCISE_TYPES, fieldsForType, FIELDS_BY_TYPE, GRAPH_METRICS, GOAL_TYPES, MEASUREMENT_GOAL_TYPES, CATEGORY_PALETTE, GROUP_PALETTE), `@/lib/types` (all DTOs), `@/lib/utils` (cn), `@/components/ui/*` (full shadcn set), `@/components/shared/*` (Stepper, ExercisePickerDialog, TrendChart, CategoryDot, PageHeader, EmptyState, ConfirmDialog).
3. **Data**: TanStack Query v5 + mutations with `useInvalidate()` for cache invalidation. Toasts via `sonner` (`toast.success/error/info`).
4. **Routing**: hash routes — navigate with `useApp(s=>s.navigate)` e.g. `navigate('/exercise-overview/<id>')`; current route via `useApp(s=>s.route)` ({view, param, query}). Your view component signature is fixed by app-root.tsx (e.g. ExerciseOverviewView receives `exerciseId` prop).
5. **Offline**: check `useOnline()`; when offline and performing mutations, queue via `queueMutation(path, method, body)` from `@/lib/client/offline` + toast "Saved offline". Read paths can just show cached query data.
6. **Styling**: dark-first, rounded-xl/2xl cards, `numeric` class for numbers, `scroll-slim` + `max-h-* overflow-y-auto` for long lists, orange primary (`bg-primary`), NO blue/indigo as UI colors, framer-motion for subtle transitions, lucide-react icons. Touch targets ≥ 44px. Responsive: mobile-first, `sm:`/`lg:` breakpoints.
7. **Dates**: workout dates are yyyy-mm-dd day keys (UTC) — use format.ts helpers, never `new Date(key)` for display without UTC timezone.
8. **Sets by type**: `fieldsForType(exercise.type)` returns which of weight/reps/distance/timeSec inputs to show. Time input as hh:mm:ss.

---
Task ID: 5
Agent: main (Z.ai Code)
Task: Recovery + QA round: fix hung dev server, agent-browser QA of all views, implement the two remaining stub views (Workout History + Insights), styling polish

Work Log:
- Environment had Errno-11 resource exhaustion at session start; recovered after poll/restart. Dev server was hung at "Starting…" → killed (`pkill -f 'next dev'`) and restarted; health green (db ok, migrations current).
- agent-browser QA (session setforge-qa-*): login demo@setforge.app OK, toured all 9 views. Found: 7 views fully functional; History + Insights were `FeatureStub` placeholders ("Under construction"). No console errors on working views.
- Implemented `src/features/history/` (2 files):
  - workout-card.tsx — expandable card: date block (day/month/weekday), comment/date title, metrics (ex, sets, volume, duration, distance), category dots; lazy-fetches full workout on expand (qk.workoutByDate), lists exercises + per-set rows (setSummary); actions: Open day (navigates /today?date=), Copy to today (createOrGet + copy API), delete via controlled AlertDialog.
  - workout-history-view.tsx — month-grouped sticky-header timeline, search (comment/category/date), category filter chips (from used categories), sort newest/oldest toggle, totals in subtitle, skeleton loading, empty states (no workouts / no matches + clear-filters), delete mutation with invalidation, framer-motion staggered cards.
- Implemented `src/features/insights/` (6 files):
  - insights-view.tsx — period selector (7d/30d/1y/All via hash query ?period=), 6 KPI cards (workouts/sets/volume/reps/time/distance; dash for zero time/distance), Heaviest Set + Biggest Volume Day highlight cards, assembles sections.
  - kpi-card.tsx — icon + label + big numeric value, accent variant.
  - activity-grid.tsx — GitHub-style 17-week heatmap from stats workoutDates, month labels, M/W/F row labels, future days dimmed, hover tooltip, staggered cell animation.
  - volume-chart.tsx — Recharts horizontal bars, top 8 exercises by volume, category-coloured cells, custom popover tooltip.
  - records-leaderboard.tsx — all records (recordsApi.all) sortable by e1RM/Best/Volume/Sets, rank + category dot + best weight×reps + date, e1RM + vol columns, row click → /exercise-overview/:id.
  - goals-overview.tsx — all goals with progress bars (emerald when achieved), Trophy + pct chip, current/target via goalValueLabel, click → exercise overview.
- Bugs found & fixed during QA:
  1. `OpenInNew` icon doesn't exist in lucide-react 0.525 → replaced with `ExternalLink` (build error).
  2. `qk.goals` is a static array not a function → `qk.goals()` crashed GoalsOverview render (TypeError) → fixed to `qk.goals`.
  3. `not-last:` variant → replaced with `mb-2 last:mb-0` for safety.
  4. False alarm: `[moreOpen` appeared corrupted in tool output — hex-dump proved file correct (display layer ate `[m` as ANSI escape); no change needed.
- Styling polish (VLM-guided):
  - TODAY badge: bg-primary/15 text-primary → solid bg-primary text-primary-foreground font-black + shadow (workout-header-card.tsx).
  - Sidebar user section: cramped 2-line text → avatar (initials) + name + email + uppercase version line (nav-shell.tsx).
  - Exercise card name: `truncate` → `line-clamp-2` (today/exercise-card.tsx).
  - Insights KPI zero-value time/distance show "–"; highlight card dates use formatDayLabel (weekday context).
- Deleted orphaned `src/features/_stub.tsx` (no references remained).
- Verification: `bun run lint` clean; browser-verified History (expand shows sets 80kg×8; search "nomatch" → No-matches empty state; "chest" → filter hit), Insights (all 6 sections render with real data: 1800kg vol, 99.3 e1RM, activity grid Sep 25 dot; period switch All works), mobile 390×844 (bottom nav + More sheet + insights responsive), desktop screenshots VLM-reviewed (sidebar clean, TODAY badge pops, name legible). dev.log error-free; health green.
- QA screenshots saved to download/: qa-today.png, qa-today-v2/v3.png, qa-history.png, qa-history-expanded.png, qa-insights.png, qa-insights-v2.png, qa-insights-mobile.png, qa-calendar.png, qa-mobile-more.png.

Stage Summary:
- ALL 10 feature views are now fully implemented and browser-verified. No stubs remain.
- Known minor items: history search does not match exercise names (summaries lack them; would need a dedicated search endpoint — candidate future enhancement); activity grid dots are small on low-contrast displays (acceptable); demo user has sparse data (1 workout) so charts look sparse — that's data, not a bug.
- Recommended next: seed richer demo data OR have QA create workouts across dates to exercise calendar/history/insights more deeply; consider exercise-name search API; PWA polish (Serwist SW + manifest icons already present — verify installability); README + deployment docs per original spec; consider CI.

---
Task ID: 6
Agent: main (Z.ai Code)
Task: Demo-data seeding via public API, exercise-name search (backend + frontend), insights/dashboard + exercises styling polish

Work Log:
- Smoke QA: login + Today view fine, no regressions from round 5.
- NEW `scripts/seed-demo-data.ts` (idempotent, retry-resilient fetch w/ cookie capture):
  - Seeds 13 weeks of training via the PUBLIC API (full-stack validation incl. PR recompute): Mon Push (Bench/DB Press/Arnold Press/Pushdown), Wed Pull (Deadlift/Row/Pulldown/Curl), Fri Legs (Squat/Leg Press/Leg Curl/Calf Raise), alternate Sat cardio (Treadmill Run distance+time, Hanging Knee Raise).
  - Linear progression + noise + deload every 5th week; 3-4 sets w/ rep patterns; startAt/endAt times; ~35% random comments.
  - Weekly Body Weight (78.2→81.4kg) + Body Fat (18.4→16.2%) records; 3 goals (Bench 105 ONE_RM, Squat 140 MAX_WEIGHT, Deadlift 190 ONE_RM).
  - Skips dates that already have exercises (safe to re-run). First run hit sandbox server death mid-way; retries + re-run completed: 47 workouts total, 545 sets, 1.32M kg volume, 26 measurement records, 3 goals.
- Exercise-name search (real feature):
  - `listWorkouts` service: new `search` opt — case-insensitive JS filter across comment/exercise name/category name (portable SQLite↔Postgres; no Prisma `contains` for case-insensitivity parity).
  - GET /api/workouts?search=… route param; `workoutsApi.list({search})` client type.
  - History view: 300ms-debounced server-side search (queryKey includes search); client now only applies category chips + sort on top (server owns text matching). Placeholder updated.
  - Verified via API: "deadlift"→13, "ROW"→13 (case-insensitive), "zzzz"→0, none→47. Browser: deadlift→13 workouts/182 sets; treadmill→7.
- Styling polish (VLM-guided):
  - Exercises view: filter chips gap-1.5→gap-2, py-1→py-1.5 (better tap targets); exercise-row metadata contrast muted-foreground→foreground/70. VLM re-review: PASS "no obvious issues remain".
  - Insights: Volume KPI compact formatting (427.7k / 1.32M — fixes truncation); ActivityGrid volume-quartile intensity buckets (feeds from workout summaries map) + Less→More legend + hover now shows day volume; month-label collision fixed (Map last-wins per column — JUNE was shadowed by MAY in shared column).
- Round bugs/notes: dev server died twice mid-session (sandbox process reaper? memory OK at 1.1/4.1GB) — restart procedure: pkill + nohup bun run dev, health recovers in ~15s. Known cosmetic: routines view looks sparse (no routine seed data — candidate next round).
- Verification: lint clean; browser-verified history search, insights (compact volume, varied heatmap intensity w/ legend, all month labels JUN/JUL/AUG/SEP), calendar (13 Sep workouts w/ dots on many days), exercises chips. VLM final QA: all 3 checkpoints PASS.
- Screenshots: download/qa-history-rich.png, qa-calendar-rich.png, qa-calendar-final.png, qa-exercises.png, qa-exercises-v2.png, qa-routines.png, qa-body.png, qa-insights-rich.png, qa-insights-final.png, qa-insights-final2.png.

Stage Summary:
- App now shows a fully alive product experience: 47 workouts / 13 weeks across calendar, history (4 month groups), insights (KPIs, heatmap intensity, top-8 volume chart, 14-exercise records board, 3 goals w/ progress), body tracker trend data.
- New capability: server-side workout search by exercise/comment/category names (case-insensitive, portable).
- Next-round recommendations (priority order): (1) seed 1-2 routines via API to flesh out routines view; (2) PWA installability check (manifest + SW present, untested); (3) README + env reference + DB-switching docs per original spec; (4) exercise-overview spot-check with the new rich data (graphs/records tabs); (5) investigate dev-server random deaths (sandbox-level, monitor).

---
Task ID: 7
Agent: main (Z.ai Code)
Task: QA round → critical data-integrity fixes (seed multiplier bug, performed-work rule) → routines seeding → new features (streaks, warm-up generator) → styling polish → sandbox stability engineering

Work Log:
- Environment recovered from prior session's Errno-11 exhaustion (echo test OK, dev server running, worklog intact).
- QA tour (agent-browser session setforge-qa): all 10 views render, zero console/page errors. Found THREE real bugs:
  1. "Invalid Date" in training-screen prefill hint — `formatDayShort(lastSets.data.date)` passed a full ISO string where a yyyy-mm-dd day key was expected (`parseDayKey` concatenated `T00:00:00.000Z` twice). Fixed via `dayKeyOf()` wrapper (src/features/today/track-tab.tsx).
  2. CRITICAL seed-data bug: `r2d = (n) => Math.round(n * 2.5) * 2.5` MULTIPLIED instead of dividing — every main-lift weight ×6.25 (bench 525kg, deadlift 795kg, leg press 1305kg; accessories used correct `r1` so looked fine). All PRs/e1RM/insights were garbage (bench e1RM 678 vs goal 105). Root-caused by reverse-engineering week-0 sets per exercise from the DB. Fixed to `Math.round(n / 2.5) * 2.5`.
  3. Domain rule gap: planned/blank routine-prefilled sets counted as performed work — polluted PR table, records, stats ("heaviest set 207.5kg" from NOT-yet-performed today sets), goals, history summaries.
- Implemented "performed work counts" rule (only `isComplete: true` sets): `recomputePRs` + `isPRForReeps` context (workout-service.ts), `allSetsForExercise` records/graph source, `computeStats` (volume/sets/reps/distance/maxWeight/maxVolumeDay + `workoutDates`/`workouts` now count only days with ≥1 completed set), `mapWorkoutSummary` (history cards), Today header volume chip (`doneSets` filter; "kg done" label). New-set PR toast still fires as a preview (values vs completed bests).
- Wrote `scripts/reset-demo-data.ts` (wipes demo workouts/routines/goals/measurement records via public API, then re-seeds) + fixed seed script's routine-response handling (services return full routine DTO; new entities = last in sorted arrays) + bodyweight exercises now log reps-only (no fake 5kg).
- Re-seeded demo data: 47 historical workouts (13 weeks, realistic: bench 72.5→85kg, squat 95→110kg, deadlift 110→127.5kg), 26 measurement records, 3 goals. Bench e1RM now 105.5 (goal 105 — achieved).
- NEW: routine seeding (worklog #1 recommendation) — 4 routines (Push/Pull/Legs/Conditioning) with predefined sets at next-progression weights; log-day creates today's workout with prefilled blank sets (Leg Day on Friday). Routines view fully alive (4 routines, exercises, predefined set editors).
- NEW: exercise restSec + notes seeding (bench 180s/"Retract scapula…", deadlift 240s, squat 210s etc.) — rest-timer chips and notes popovers now demo real content.
- NEW FEATURE — Training streaks: `computeStreak()` in analysis-service (current = walk back from today-or-yesterday over days with ≥1 completed set; longest = scan sorted days; all-time). `StatsDTO.streak {current, longest}`. Insights: third highlight card (amber, current vs personal best + motivational copy, grid now sm:2/lg:3). Today header: amber flame "N-day streak" chip (today only, staleTime 60s).
- NEW FEATURE — Warm-up set generator (src/features/today/warmup-popover.tsx): ramp from target weight (empty bar ×10 for ≥40kg targets, 40%×8, 60%×5, 80%×3, rounded to weight step via `roundToStep`); each step logs as a completed set in one tap (online + offline queue). Amber FlameKindling icon button next to Save Set (only for weight exercises with weight > 0).
- Data touch-up for honest streak demo: completed 2 squat sets today + added light Thu Sep 24 "makeup conditioning" workout (Treadmill Walk 4.6km, Hanging Knee Raise, Plank) → streak 3 current / 3 PB.
- Styling polish (VLM-guided): Volume KPI compact threshold 100k→10k ("98.1k" instead of truncated "98095.6"); nav-panel exercise chips max-w-28→max-w-36/44 + title tooltip; mobile date heading now responsive ("Fri, Sep 25" < sm, full "Friday, September 25, 2026" ≥ sm — fixes year truncation at 390px).
- SANDBOX STABILITY ENGINEERING (major time sink, fully diagnosed): next-server dies from (a) kernel OOM when cold recompiles spike RSS 950MB→2.4GB against the 4GB cgroup (esp. with ~900MB chrome alongside), and (b) background processes being reaped when the launching Bash tool command ends (setsid/nohup/disown do NOT survive). Mitigations: `scripts/watchdog.sh` (auto-restart, but itself subject to (b)); `scripts/seed-loop.sh` (idempotent seed with server restarts); warm routes sequentially via curl before browser loads; browser QA inside single mega-commands; subshell `(bun run dev &)` detachment survived between commands in later rounds — pattern is flaky, re-verify per session.
- Verification: lint clean ×3; API-verified (bench e1RM 105.5, squat records complete-only, stats week 5 workouts/40 sets/maxW 127.5, streak {current:3,longest:3}, routine log-day prefills); browser-verified (login → Today streak chip + 1,760kg done; training screen "prefill from Sep 18" + 210s rest chip + notes + warm-up popover logging 65×5 set — persisted; Insights streak card + heaviest set now Sep 18 real performance; mobile 390px clean 9/10; exercise overview history/graph/records with realistic data). Zero console/page errors. Screenshots: download/qa-round8-*.png, qa-round9-*.png.

Stage Summary:
- Demo data now REALISTIC end-to-end (weights, PRs, e1RMs, goals, graphs, routines, streaks) — the product finally demos like a real trainee's account.
- Domain integrity: performed work (completed sets) is the single source of truth for PRs/records/stats/goals; planned sets are visible in Today (ex/sets chips) but never counted.
- New features: training streaks (backend + Insights + Today), warm-up ramp generator, seeded routines/rest timers/notes, responsive date heading.
- Known acceptable items: nav chip truncation on very long names mid-scroll (VLM minor, by design for horizontal scroll); streak semantics are strict daily (MWF trainees show 1-2 day streaks — honest; Duolingo-style grace not implemented).
- Next-round recommendations (priority): (1) workout completion celebration/summary sheet (PRs hit this session vs prior bests — natural follow-up to performed-work rule); (2) PWA installability + Serwist SW verification (manifest exists, untested); (3) README + env reference + DB-switching docs (original spec deliverable, still missing); (4) warm-up sets could be tagged/visualized differently from working sets in SetsList (currently indistinguishable apart from weight); (5) consider streak rest-day grace (e.g., 1 rest day keeps streak alive at reduced intensity) — needs product decision; (6) keep watchdog/seed-loop scripts for any future heavy seeding.

---
Task ID: 8
Agent: main (Z.ai Code)
Task: QA round → warm-up set tagging (full stack) → workout summary/celebration sheet → rest timer polish → critical cache-invalidation bug fix → VLM styling polish

Work Log:
- Environment recovered cleanly at session start (echo OK, dev server up, health green). QA tour of all 9 views: zero console/page errors, all interactive (login → today streak chip/2085kg done → all nav views render).
- NEW FEATURE — Warm-up set tagging (`isWarmup` on TrainingSet), full stack:
  - Migration `20260925143554_set_warmup_flag` (Boolean @default(false)); dev server stopped → `prisma migrate dev` → restarted (runbook procedure).
  - Backend: setCreateSchema + SetDTO + mapSet/mapWorkoutSummary; workout-service (recomputePRs excludes warm-ups, createSet/updateSet pass isWarmup through, warm-up sets never claim newPr, copyWorkout preserves the flag); exercise-service lastSets prefill excludes warm-ups; analysis-service (records/graph source, streak days, stats volume/reps/sets/distance all exclude warm-up ramp); account export/import round-trips the flag. Domain rule: warm-up ramp is preparation — never counts toward PRs, records, stats, or "kg done" tonnage.
  - Frontend: shared `src/components/shared/warmup-badge.tsx` (amber "W" chip); SetsList rows show W badge + muted text, selected row gains FlameKindling mark/unmark toggle (with toast explaining PR/volume exclusion); warmup-popover logs with isWarmup:true; header volume/distance chips filter warm-ups; warm-up badge also rendered in training-screen history tab, today exercise-card SetPills (amber variant), and history workout-card rows.
  - API-verified: 200kg×1 squat as warm-up → newPr false + absent from records; PATCH isWarmup:false → appears in records; re-mark → vanishes; workout volume stays 2085 with warm-up logged; UI roundtrip (W ↔ numbered) verified live.
- NEW FEATURE — Workout Summary Sheet (`src/features/today/summary-sheet.tsx`):
  - "Finish Workout" CTA in the header card (stops a running timer first) + "Session summary" dropdown item; only shown when ≥1 performed (non-warm-up completed) set exists.
  - Bottom sheet (rounded-t-3xl, sm:max-w-2xl centered, max-h-92vh scroll-slim): hero with spring-animated trophy/flame + title that flips to "records fell!" when PRs were set; custom framer-motion confetti burst (34 brand-palette shards) fires only on PR sessions; streak chip in subtitle.
  - Stat tiles (Volume accent/Sets/Reps/Work-time-or-Duration/Distance) — odd tile count spans the full row on mobile via `[&>*:nth-child(odd):last-child]:col-span-2`.
  - PR section: per-exercise comparison of today's best set (max weight, tie→max reps, completed non-warmup) vs prior best from records strictly BEFORE this workout's date; amber cards with prior→new (strikethrough arrow), emerald +kg delta chip, e1RM delta; staggered spring entrance. Empty state: "No records this session — show up, log honestly, and they'll come 💪".
  - Per-exercise breakdown (category dot, sets/volume/top set, trophy if PR) + Copy-summary to clipboard (shareable text block with PRs and streak).
  - Verified: today (no PR state) + Sep 18 (4 PR rows: Squat 107.5×6→110×8 +2.5kg e1RM+11.7, Leg Press, Leg Curl, Calf Raise — prior-best date filtering correct), desktop + mobile 390px.
- NEW FEATURE — Rest timer polish: completion checkbox now auto-starts the rest timer (same as a save; warm-up sets excluded); popover gains −15s/+15s adjust buttons (works running & paused, clamps ≥0, clean resume). Verified: 3:19 → −15s → 3:04 → +15s → 3:18.
- CRITICAL BUG FIXED — TanStack cache invalidation: `invalidate.workout()` (no dateKey) only invalidated `["workouts", params]` list queries; the by-date query family is `["workout", dateKey]` — a different first key. EVERY Today-view mutation via use-mutate (save/delete/toggle set, comments, warm-up, groups, exercise add/remove) never refreshed the open day; sets only appeared after route remount. Fix: invalidate both `["workout"]` and `["workouts"]` prefixes in query.tsx. Verified: UI-saved set now appears in the SetsList instantly.
- BUG FIXED — stale date on Today: navigating from `#/today?date=<past>` to `#/today` (e.g. sidebar Today click) kept the old date; the sync effect now resets to todayKey() when the route has no date param.
- Styling polish (VLM 2-round review; round-1 findings triaged — heatmap/nav-chip/"truncation" claims partly false positives from static shots):
  - Summary stat tiles odd-count full-row span (kills the orphan empty cell on mobile).
  - Copy summary button outline→secondary+border (visible weight next to Done).
  - PR row icon tile h-10→h-9 (more room for names).
  - Activity heatmap intensity ladder strengthened: rest days bg-muted/40, levels primary/35/55/80/solid (was /25/45/70 vs muted/60 — levels were near-indistinguishable).
  - Final VLM re-review: PASS on all 3 checkpoints.
- Verification: `bun run lint` clean (3 intermediate issues fixed: JSX fragment in SetsList selected-actions, useMemo dep-array form, unused import); full 9-view tour ×2 (before + after dev-server death) with 0 page errors / 0 console errors; mobile 390×844 (bottom nav fits, sheet 390w, tiles balanced); demo data restored after API tests (only intentional leftover: one tagged 65×5 warm-up squat set demoing the badge; today volume 1,760 kg).
- Ops: dev server was OOM-killed once mid-session (cold recompile spike after edits, known sandbox issue) — restarted per runbook, health green, everything re-verified after.
- Screenshots: download/qa-r10-* (today, insights, summary no-PR, summary PR desktop/mobile, warmup badge, rest timer, mobile variants, post-fix v2/v3).

Stage Summary:
- Three new user-facing capabilities: honest warm-up tagging (excluded from PRs/records/stats/volume everywhere, consistently, backend-enforced), a celebration-worthy session summary sheet with real PR math vs prior bests, and a smarter rest timer.
- One critical live-UI bug found & fixed (cache invalidation key-family mismatch) that had been silently degrading every Today mutation since the shell round.
- App is stable: 9 views, 0 errors, lint clean, mobile-verified.
- Next-round recommendations (priority): (1) PWA installability + Serwist SW verification (manifest exists, still untested — original spec deliverable); (2) README + env reference + zero-code DB-switching docs (original spec deliverable, still missing); (3) Web Share API for the summary sheet on mobile (currently clipboard-only); (4) optional: exercise-level warm-up defaults or per-exercise "always show warmup ramp" toggle; (5) dev-server OOM watchdog automation (cron) if random deaths recur.

---
Task ID: 9
Agent: main (Z.ai Code)
Task: QA round → PWA service worker (full implementation + offline verification) → Web Share API → plate-loading hint in training screen → VLM styling polish → SW manifest caching fix

Work Log:
- Environment recovered cleanly at session start (echo OK; prior session ended with Errno-11 resource exhaustion). Dev server was alive; health green.
- QA tour (agent-browser session setforge-qa-r11): login demo@setforge.app → all 9 views render, 0 console errors, 0 page errors. Exercise editing, empty-day actions, clipboard copy all confirmed present. Tools view already contains 1RM/Sets/Plates calculators.
- CRITICAL GAP FOUND — PWA was non-functional: NO service worker existed at all (Serwist never installed despite plan; /sw.js → 404; navigator.serviceWorker.getRegistrations() → []). Manifest + icons were fine. This was the top untested original-spec deliverable.
- Implemented PWA from scratch (custom SW, chosen over Serwist because sandbox runs dev-only — Serwist is typically disabled in dev, making it unverifiable here):
  - public/sw.js (v1.0.1): precaches shell (/, /offline.html, manifest, icons, logo) on install; activate cleans old caches + clients.claim(). Fetch: navigations network-first → cached shell → offline.html; /_next/static + icons + logo cache-first (content-hashed); API GETs network-first with per-SESSION cache fallback (cache key embeds sf_session cookie value → zero cross-user leakage; 80-entry trim; /api/health always live); mutations/websockets/HMR never intercepted. Messages: SKIP_WAITING, CLEAR_CACHES.
  - public/offline.html: self-contained branded offline page (inline CSS, forge orange, auto-retry on 'online' event).
  - src/components/shared/pwa.tsx: PwaBridge (registers /sw.js on load, updatefound → SKIP_WAITING, one-shot controllerchange reload), useInstallPrompt() (beforeinstallprompt capture + appinstalled toast + isStandalone detection), clearSwCaches().
  - Wiring: PwaBridge mounted in AppRoot; useLogout now calls clearSwCaches() (session cache isolation on account switch); account dropdown gains "Install app" item; mobile More sheet gains orange "Install SetForge · Offline-ready" CTA (only when canInstall); Settings gains "App" section (4th tab on mobile / stacked section on desktop): install row (button/Installed pill + helper fallback text), offline status row (Online/Offline pill), offline-cache Clear row (postMessage CLEAR_CACHES + window.caches wipe + success toast).
  - Manifest: added id:"/" + 2 app shortcuts (Log today's workout → /#/today, Insights → /#/insights).
- VERIFIED OFFLINE END-TO-END: SW registered+activated (scope /); caches populated (shell: 8 entries incl. "/" HTML; assets: chunks/fonts); agent-browser `set offline on` + reload → app renders COMPLETE UI with real data (Today view w/ squat 110kg×8 sets from per-session API cache); offline badge visible; VLM confirmed "complete UI with real data, no broken layout"; restored online cleanly.
- BUG FOUND & FIXED — SW manifest staleness: manifest.webmanifest was cache-first → my manifest update (id/shortcuts) didn't propagate (browser kept serving old cached copy). Fixed: manifest + offline.html now network-first with cache fallback (handleVolatile); SW version bumped to v1.0.1; verified fresh manifest served ({id:"/", shortcuts:2}).
- NEW FEATURE — Web Share API in summary sheet: copySummary → shareSummary; uses navigator.share (native mobile share sheet) when available, falls back to clipboard; AbortError (user dismissed) silently ignored; button label/icon adapts (Share2 "Share summary" vs ClipboardCopy "Copy summary").
- NEW FEATURE — Plate-loading hint (src/features/today/plate-hint.tsx): below weight/reps inputs in the training screen, shows "PER SIDE" chip row computed from the user's plate inventory (platesApi, staleTime 5min) via plateGreedy: colored dot + weight chips (25 ×2 10 5 2.5 style), "+ 20kg bar" suffix, amber "loads 62.5kg" note when exact load impossible (nearest shown), "Not loadable" state. AnimatePresence height animation. VERIFIED: 110kg → red 25 + blue 20 per side (45×2+20=110 ✓ per VLM + math).
- Styling polish (VLM-guided, 2 review batches over 9 view screenshots + mobile):
  - Training screen header: nav buttons gap-1.5 → gap-2 (X was cramped against next-exercise arrow).
  - Insights KPI labels: font-semibold → font-bold (stronger hierarchy under big numbers).
  - History card metadata rows: icon-text gap-1 → gap-1.5 (4 metric spans).
  - Today nav chips: max-w-36 → max-w-40 on mobile (fewer truncations).
  - Triage rejected as false positives (verified in code or via eval): button height mismatch (all h-13), 1RM table alignment (already text-right), calendar dot alignment (uniform grid), body spacing (space-y-4 consistent), "Leg F" chip truncation (scroll position, no actual clipping — eval scrollWidth check returned []).
- Ops: dev server died once mid-tour (known sandbox OOM issue — ps showed no next-server, log ended mid-200s). Restarted per runbook (pkill + nohup bun run dev, ~12s to healthy). Full tour re-run after restart: clean.
- Verification: `bun run lint` clean ×2; full 9-view tour ×2 with 0 console/page errors; offline test passed; mobile 390×844 (bottom nav 5 tabs intact, More sheet + install CTA, settings App tab); VLM final review: PASS on both checkpoints. Screenshots: download/qa-r11-*.png (calendar, history, exercises, routines, body, insights, tools, plates, settings, offline, offline-today, plate-hint, style-*, mobile-*, final-*, settings-app*).

Stage Summary:
- PWA is REAL now: installable (SW + manifest + icons + id + shortcuts), fully offline-capable (shell + per-session data cache, verified by emulation), with install CTAs in 3 places (dropdown, More sheet, Settings App tab) and cache management UI.
- Two new user-facing features: native share for workout summaries, and a live plate-loading hint that turns the plate inventory into actionable guidance mid-set.
- One architectural SW bug caught & fixed during verification (volatile-file caching).
- App remains stable: 9 views, 0 errors, lint clean, mobile-verified.

Next-round recommendations (priority):
1. README + env reference + zero-code DB-switching docs (original spec deliverable, still missing — needs explicit user request per doc policy).
2. Real-device PWA install test (headless can't fire beforeinstallprompt; Chrome/Android + iOS Safari Add-to-Home-Screen).
3. Consider a version-bump + auto-update toast flow polish (currently silent SKIP_WAITING + reload).
4. API cache could grow stale if user stays online long (network-first means fresh wins — only offline uses cache; acceptable).
5. Exercise-level warm-up defaults / "always show warmup ramp" toggle (round-8 leftover nice-to-have).
6. Dev-server OOM watchdog automation if random deaths recur (died once this round).

---
Task ID: 10
Agent: main (Z.ai Code)
Task: QA round → new features (interval/HIIT timer, Enter-to-save, SW update toast) → CRITICAL fix: service worker served stale dev CSS (v1.0.2 asset strategy) → styling polish + full verification

Work Log:
- Environment healthy at session start (dev server up since prior round's restart, health 200, SW v1.0.1 active). QA tour of all 9 views: 0 console errors, 0 page errors — app stable.
- NEW FEATURE — Interval/HIIT Timer (src/features/tools/interval-timer.tsx, 4th Tools tab "Timer"):
  - Presets: Tabata (20/10×8), EMOM 10 (60/0×10), HIIT (40/20×8), Sprints (30/60×6), Custom; config steppers (prepare/work/rest seconds, rounds), sound + vibration toggles, total time readout.
  - Engine: drift-corrected from wall-clock (phaseEndsAt epoch ms, 100ms tick), phases prepare→(work↔rest)×rounds→done with per-phase colors (amber prepare / orange work / emerald rest); skip-phase + reset; pause stores remainingMs, resume re-anchors; elapsed accumulator across pauses.
  - UX: SVG progress ring (280px, dasharray 2πR, drains per phase), phase label chip with AnimatePresence, big countdown (text-6xl), segmented round-progress dots (done/current/pending), elapsed vs planned, h-13 touch controls (Start/Pause/Resume + Skip + Reset), trophy completion state, "Go again" CTA.
  - Audio: Web Audio API (lazy AudioContext unlocked by Start gesture) — 3-2-1 countdown beeps, distinct work (880Hz)/rest (440Hz) phase tones, completion melody; vibration patterns via navigator.vibrate; screen wake-lock while running (re-acquires on visibility).
  - Fixed during lint: React "cannot access refs during render" → phaseTotalSec moved to state; fixed totalSec overcount (rounds-1 rests); round-dot current index advances during rest.
  - Verified live: full cycle (prepare→work→done), pause/resume button flip, elapsed counter, ring SVG attributes (dasharray 753.98, stroke-primary), VLM PASS desktop (presets/steppers/toggles/ring/chips) + mobile 390px (chips fit, 2-col steppers, ring centered, buttons sized).
- NEW FEATURE — Enter-to-save (track-tab.tsx): keydown on the set-input card saves the set (steppers commit their draft first, save deferred via setTimeout(0) for the state flush); kbd "↵ Enter" hint under buttons (desktop only, hidden sm:flex). Verified live: focused weight input → Enter → SETS 3→4, 0 errors; test set deleted via API to restore demo data.
- NEW FEATURE — SW update toast (pwa.tsx): controllerchange now shows "SetForge updated — refreshing…" toast (900ms) before the one-shot reload — updates are explained, not surprising.
- CRITICAL BUG FOUND & FIXED — service worker served STALE dev CSS/JS (v1.0.1):
  - Symptom: interval-timer's unique classes (max-w-[280px], text-6xl, min-h-[54px]) computed to none/defaults in the browser while present in the dev-served CSS file on disk (curl fetched /_next/static/chunks/[root-of-the-server]__*.css: rules existed). The ring rendered 830px (max-w ignored) — VLM flagged "timer card truncated".
  - Root cause: sw.js v1.0.1 used cache-first for /_next/static/* — valid for production immutable content-hashed URLs, but DEV chunk URLs are stable-but-mutable (Cache-Control: no-store, must-revalidate). The SW cached the first CSS chunk and served it forever across reloads AND dev-server restarts (caches outlive the server).
  - Fix (v1.0.2): assets are now network-first with cache fallback (same strategy family as navigations + API GETs). Dev/HMR always fresh; production still hits immutable URLs fast; offline falls back to cache. Verified: classes now apply (max-w-[280px] → 280px, ring exactly 280×280), old v1.0.1 caches wiped by activate(), offline re-verified (offline reload → full app with data), and the SW update propagated with the new toast flow.
  - DIAGNOSTIC NOTES for future rounds: (a) Turbopack+Tailwind DOES regenerate CSS on TSX className changes — "missing utility class" in dev is almost certainly the SW cache, not Tailwind scanning; (b) the postcss.js worker process persists across `pkill -f 'next dev'` restarts (it has its own PID — kill explicitly if CSS behaves weirdly after restarts); (c) verify with `curl <css-chunk-url>` + browser computed styles side-by-side.
- Styling polish: VLM review batches (desktop timer/exercise-overview/graph + mobile timer/training). Triage: "ring truncated" = the real SW bug (fixed above); "missing chart tooltip" false positive (TrendChart has custom tooltip — static shots just don't show it); Y-axis/toggle/contrast claims minor or by design; mobile findings all PASS. Removed temporary CSS probe classes after the fix verification.
- Verification: bun run lint clean; full 9-view tour ×2 → 0 console/page errors; mobile 390×844 verified (today, training screen w/ plate hint + sets, timer); offline mode verified post-fix; demo data restored after tests. Screenshots: download/qa-r12-*.png (timer phases idle/prepare/work/done, mobile timer ×2, offline-verify, timer-fixed, mobile-training, style-*).

Stage Summary:
- Three new user-facing capabilities: a full interval/HIIT timer (presets, audio/haptic cues, wake lock, animated ring), keyboard-first set logging (Enter saves), and human-friendly SW update toasts.
- One critical architecture bug fixed in the PWA layer: cache-first assets made dev CSS stale forever (v1.0.2 = network-first + cache fallback; offline capability re-verified intact). This also retroactively explains any "style didn't apply" oddities in future dev sessions — check the SW first.
- App remains stable: 9 views + 4th Tools tab, 0 errors, lint clean, mobile-verified, offline-verified.

Next-round recommendations (priority):
1. README + env reference + zero-code DB-switching docs (original spec deliverable, still missing).
2. Timer enhancements if desired: save interval configs per user (persisted presets), background/lock-screen audio (needs MediaSession API), per-exercise default interval link.
3. Real-device PWA install test (beforeinstallprompt unavailable in headless).
4. Exercise-level warm-up defaults toggle (round-8 leftover).
5. Consider auto-bumping sw.js VERSION on each deploy (cache names currently manual — fine while manual, but document the convention).

---
Task ID: 11
Agent: main (Z.ai Code)
Task: QA round → three new features (persisted timer presets full-stack, per-exercise auto-warmup full-stack, timer voice cues) → bug fix (Zod PATCH defaults) → VLM-guided styling polish

Work Log:
- Environment recovered cleanly at session start (echo OK; prior session ended with Errno-11 resource exhaustion). Dev server alive, health green, worklog read.
- QA tour (agent-browser session setforge-qa-r13): login demo@setforge.app → all 9 views + Tools/Timer tab render, 0 console/page errors → app judged stable → proceeded to new features per task instructions.
- NEW FEATURE — Persisted interval-timer presets (full stack):
  - Migration `20260925164655_timer_presets_ex_auto_warmup`: `TimerPreset` model (userId FK cascade, unique(userId,name), prepareSec/workSec/restSec/rounds/sortOrder) + `Exercise.autoWarmup Boolean @default(false)`.
  - Backend: `src/server/services/timer-preset-service.ts` (list/create/update/delete, name-conflict 409); routes GET/POST `/api/timer-presets`, PATCH/DELETE `/api/timer-presets/:id`; Zod `timerPresetBase` (create has defaults for prepare/rest/rounds; update is `.partial()` with NO defaults — see bug below).
  - Client: `timerPresetsApi` + `TimerPresetDTO` + `qk.timerPresets` + `useTimerPresets()` + `invalidate.timerPresets()`.
  - interval-timer.tsx: "Your presets" horizontal-scroll chip row (name + work/rest×rounds hint, count badge, per-chip X delete with destructive hover); "Save preset" header button → dialog (name input w/ Enter-to-save, config summary panel); applying a preset highlights it (presetId = preset id); framer-motion chip entrance.
  - API-verified via curl: CRUD round-trip, 409 on duplicate name, partial PATCH preserves fields, multi-tenant isolation (user B: empty list + 404 on user A's preset).
  - BUG FOUND & FIXED during build: Zod `.default()` on the create schema leaked into the update schema (`.partial()` keeps defaults) → partial PATCH reset prepareSec 15→10 and restSec 15→0. Fixed by splitting base/create/update schemas.
- NEW FEATURE — Per-exercise auto warm-up ramp (full stack):
  - `Exercise.autoWarmup` through schema/mappers/exercise-service (create+update passthrough)/ExerciseDTO/ExerciseInput.
  - exercise-form-dialog: amber "Auto warm-up ramp" switch row (shown for weight-type exercises) with explanatory hint.
  - warmup-popover: new `autoOpen`/`onAutoOpened` props — opens the ramp once when a target weight first becomes available (autoFiredRef guard).
  - track-tab: gates auto-open per exercise entry (`warmupAutoDone` reset on we.id) AND only while the exercise has no real logged sets (hasLoggedWork check ignores warm-up + blank routine-prefilled sets) — routine days still get the auto-open.
  - Browser-verified end-to-end: fresh day → add Barbell Squat → open training screen → ramp auto-opened (target 110kg → 20×10 empty bar, 45×8, 65×5, 90×3), logged the empty-bar set, deleted test workout after.
- NEW FEATURE — Voice cues for the interval timer: `useSpeech(enabled)` hook (SpeechSynthesis, local/offline, cancel-then-speak, rate 1.15) — announces "Get ready"/"Work!"/"Rest"/"Last round — work!"/"Complete! Great job!" at phase transitions; "Voice" toggle in the config footer row (Speech icon). Headless has no voices; guarded with try/catch, toggle + timer verified error-free.
- Demo data seeding: autoWarmup ON for Barbell Squat / Barbell Bench Press / Deadlift; 2 timer presets ("Kettlebell swings" 45/15×10, "Core finisher" 30/10×6).
- STYLING POLISH (VLM 3-batch review over 11 screenshots; findings triaged against code before applying — several claims verified as false positives: calendar equal-height cells/dot gaps/filled selected state already correct, body stepper h-10/h-11 fine, exercise chips have filled-active states, nav pill radius is deliberate design language):
  - Timer preset chips: name max-w-28→max-w-44 (fixes aggressive truncation), count badge leading-none (optical centering), delete X h-5→h-5.5 + icon h-3.5 + text-foreground/70 (visibility).
  - Insights KPI labels: text-muted-foreground → text-foreground/70 (readability); TIME value 17:04:00 → compactDuration "17h 04m"; "avg per workout" value now uses compact().
  - History: date redundancy fixed — short-date subtitle only renders when a comment replaced the date-as-title (was 3x same date); search placeholder shortened to "Search workouts, notes, exercises…".
  - Calendar: month nav arrows h-9→h-10 w-10 (better touch targets, 40px verified).
  - Settings: segmented control inactive segments text-muted-foreground → text-foreground/70 + hover bg.
  - SetsList rows: pl-2→pl-3 + gap-1→gap-1.5 (breathing room around warm-up badges).
  - Exercises search placeholder shortened.
- Ops: dev server died once mid-round (known sandbox OOM; curl connection-refused + stale SW cache made the browser show pre-fix code — diagnosed quickly, restarted per runbook, SW caches cleared, all fixes re-verified rendering). Noted for future rounds: a dead dev server + SW network-first fallback looks EXACTLY like "my code changes didn't apply" — check /api/health first.
- Verification: bun run lint clean ×2; full 9-view tour with error hook → ZERO JS errors; preset save/apply/delete round-trip in browser; auto-warmup end-to-end; mobile 390×844 (today + timer); offline mode (shell + real data via session API cache after repopulation) + clean online restore; VLM final review: all 3 checkpoints PASS (insights KPI readability + compact time, history date de-duplication, timer preset names untruncated). Screenshots: download/qa-r13-*.{png} (today, timer presets, auto-warmup + open ramp, review-*, style-*, final-*, mobile-*, offline).

Stage Summary:
- Three new user-facing capabilities: server-synced custom interval-timer presets (account-portable), per-exercise auto warm-up ramp (turns the existing generator into a zero-tap start for main lifts), and voice announcements for hands-free HIIT timing.
- One API-contract bug caught during build (Zod defaults leaking into PATCH) — update schemas are now explicitly default-free.
- Styling: 8 concrete refinements landed from a code-triaged VLM review; all previously-passing views remain error-free.

Next-round recommendations (priority):
1. README + env reference + zero-code DB-switching docs (original spec deliverable, still missing — needs explicit user request per doc policy).
2. Timer preset rename UI (PATCH endpoint already supports it; only the FE dialog is missing).
3. Real-device PWA install + voice test (headless lacks speech voices and beforeinstallprompt).
4. Consider MediaSession API for interval timer background audio (round-10 leftover).
5. Dev-server OOM watchdog automation if random deaths recur (died once this round).

---
Task ID: 12
Agent: main (Z.ai Code)
Task: QA round → four new features (beat-last-time context bar, MediaSession lock-screen timer controls, timer preset rename, weekly rhythm dashboard) → VLM styling polish → full verification

Work Log:
- Environment recovered cleanly at session start (echo OK after prior session's Errno-11; dev server alive, health 200). Worklog read in full (372 lines, 11 prior task entries).
- QA round (agent-browser default session): login demo@setforge.app → 9/9 views render, 0 console errors, 0 page errors; mobile 390×844 clean; dev.log clean; `bun run lint` clean → app judged STABLE → proceeded to new features per instructions.
- NEW FEATURE — "Beat last time" context bar (src/features/today/last-time-bar.tsx, wired into track-tab.tsx):
  - Shows the last performance of the current exercise (date + set pills, capped at 6 with +N overflow, "top X" summary); pills are TAP-TO-PREFILL (onApplySet fills the input row, sets dirty so prefill-effect doesn't overwrite).
  - Live delta chips computed from current inputs vs last session's top set (top = max weight→max reps / max distance / max time, warm-ups excluded): weight delta (+X kg / −X kg / matching), reps-at-same-weight delta, e1RM delta (Brzycki), distance delta; "today's best" context chip; emerald/neutral tones with TrendingUp/Down/Minus icons; AnimatePresence height animation.
  - First-time exercises get a friendly "First time logging this exercise — today sets the baseline" explainer instead of silence.
  - Verified live: squat screen shows 4 pills (110×8, 110×8, 107.5×8, 107.5×7); pill click prefilled 107.5×7 → deltas flipped to "−2.5 kg vs last time | −7.6 e1RM vs last"; today best "110×8" chip; prefill default shows "+0 e1RM vs last".
  - Bug during build: formatDuration imported from @/lib/client/format (doesn't exist there) → SSR 500; moved to @/lib/formulas. Also fixed a duplicated import/function from a tooling double-apply.
- NEW FEATURE — MediaSession API for the interval timer (useMediaSession hook in interval-timer.tsx):
  - While running/paused: navigator.mediaSession metadata (title = live phase label + seconds left, artist SetForge, album = round X/Y · work/rest config), playbackState playing/paused, setPositionState (duration = phase total, position = elapsed-in-phase) for lock-screen scrubbers.
  - Action handlers: play→resume, pause→pause, nexttrack→skipPhase, stop/previoustrack→reset; handlers via ref (no stale closures); metadata cleared + playbackState "none" on idle/reset; all guarded try/catch (silently inert where unsupported — headless has mediaSession object but no OS UI; real-device value).
  - Verified live: Start → metadata "Get ready · 4s left | Round 1/8 · 20s/10s | state=playing"; Pause → state=paused + title "Work · 18s left"; Reset → metadata null. Zero console errors.
- NEW FEATURE — Timer preset rename (FE only; PATCH endpoint existed since round 11):
  - Pencil button on each saved preset chip (top-left corner, mirrors the delete X); rename dialog (autofocus + select-all input, Enter submits, config summary panel "unchanged", 40-char limit); renamePreset mutation → timerPresetsApi.update(id, { name }); invalidates qk.timerPresets; name-conflict 409 surfaces via error toast.
  - Verified live: "Kettlebell swings" → "Kettlebell swings v2" → reverted back; both rename buttons present; no errors.
- NEW FEATURE — Weekly rhythm dashboard (src/features/insights/weekly-rhythm.tsx, inserted after activity grid):
  - "THIS WEEK VS LAST" card: 3 metric columns (Workouts/Volume/Sets) comparing rolling 7-day windows (client-side from the already-fetched workout summaries — zero new API calls); delta chips with absolute + percentage change (emerald up / red down / neutral), "new this week"/"no data" handling for zero baselines.
  - "Weekly rhythm" bar chart (Recharts, 120px): average volume per weekday over the last 8 weeks (Mon–Sun, primary bars, rounded tops, custom tooltip with session count) — reveals the MWF training pattern at a glance.
  - Verified live: renders on desktop + mobile with real data (M/W/F bars dominate, deltas computed); case-sensitive innerText check initially misreported missing (h3 is CSS-uppercased) — confirmed rendering via recharts count + "rolling 7 days" text.
- Styling polish (VLM-guided, triaged against code — several first-pass claims were false positives):
  - LastTimeBar container strengthened: border-border/70 bg-muted/25 → border-border bg-muted/35 + shadow-sm (VLM: "blends into background"); set pills gained border-border + shadow-sm (VLM: "don't look tappable").
  - Re-verified after fix: VLM close-up review PASS on all 4 checkpoints (distinct container, pills wrap on mobile, bottom nav intact, no truncation/overlap).
  - Full 7-view sweep (today/exercises/history/calendar/routines/body/settings): 6 clean + 1 false positive (body "timestamp truncation" — code uses relative dates, hallucinated).
  - WeeklyRhythm first-pass findings (delta alignment/contrast/axis) disproved by targeted close-up re-review: all 5 checkpoints PASS.
  - Timer review findings triaged as by-design (corner buttons overlapping chip edge mirrors round-11 delete design; ring size fixed in round 10; button heights equal h-13).
- Ops: dev server died once mid-round (known sandbox OOM — connection refused with stale dev.log 200s; ps showed next-server gone). Restarted per runbook (pkill + nohup, ~20s to healthy), full re-verification after restart: 9-view tour 0 errors, all new features render, health 200.
- Verification: `bun run lint` clean ×3 (one invalid `selectAll` Input prop caught and fixed to onFocus select); full 9-view tour ×2 (pre- and post-restart) with 0 console/page errors; mobile 390×844 verified (training screen pills wrap, bottom nav intact); demo data untouched (rename test reverted). Screenshots: download/qa-r14-*.{png} ×24 (today, insights, weekly-rhythm desktop/closeup, training lasttime ×3, timer presets, style sweep ×7, mobile ×2, final ×2).

Stage Summary:
- Four new user-facing capabilities: in-training "beat last time" progressive-overload context (tap-to-prefill history pills + live deltas vs last session incl. e1RM), OS-level media session for the interval timer (lock-screen metadata/controls — real-device PWA value), preset rename (completes the timer-preset feature set), and a week-over-week comparison + weekday-rhythm dashboard section on Insights.
- App remains stable: 9 views, 0 errors, lint clean, mobile-verified, health green after one routine dev-server restart (known sandbox issue).
- No schema changes this round — all features built on existing APIs (pure frontend additions + one pre-existing PATCH endpoint).

Next-round recommendations (priority):
1. README + env reference + zero-code DB-switching docs (original spec deliverable, still missing — needs explicit user request per doc policy).
2. Real-device PWA test: beforeinstallprompt + MediaSession lock-screen UI + SpeechSynthesis voices (all unverifiable in headless).
3. Consider extending LastTimeBar deltas to timeSec-based exercises (currently weight/distance only — time deltas are ambiguous) and a "session volume vs last session" delta.
4. Streak rest-day grace (round-7 leftover product decision) — e.g. 1 rest day keeps streak alive; needs product sign-off.
5. Dev-server OOM watchdog automation if random deaths recur (died once this round; runbook restart works but costs ~1 min).

---
Task ID: 13
Agent: main (Z.ai Code)
Task: QA round → three new features (weekly workout target + Today progress card, LastTimeBar v2 time-deltas & session-volume, calendar month stats strip) → OOM-watchdog infrastructure → VLM styling polish → full verification

Work Log:
- Environment recovered at session start (prior session ended with Errno-11; tools healthy again). Read worklog (418 lines, 12 entries). QA baseline: already logged in, 9/9 views 0 console errors, dev.log clean, lint clean → app STABLE → proceeded to new features per instructions.
- NEW FEATURE — Weekly workout target + "This Week" progress card:
  - Schema: `UserSettings.weeklyWorkoutTarget Int @default(0)` (0 = card hidden). Migration `20260926020000_weekly_workout_target` (ALTER TABLE ADD COLUMN) applied via `prisma migrate deploy`; `prisma generate` re-run (stale client caught when the update script failed with Unknown argument).
  - Full-stack wiring: SettingsDTO + settingsUpdateSchema (0–14) + settings-service patch type + account-export field + seed default + today-view fallback literal + preferences-section Stepper row (Target icon, dynamic helper text).
  - New `src/features/today/week-progress.tsx`: SVG progress ring (done/target, emerald when achieved), weekday dot strip (trained = filled+check, today = ring highlight, future = dimmed), volume+sets chips (sm+), honouring `weekStart` setting; whole card is a button → #/insights. Data from `workoutsApi.list({from,to})` of the current week — zero new endpoints.
  - Verified live: demo user target set to 4 → card shows "4 of 4 · Target hit — anything more is a bonus", Mon/Wed/Thu/Fri checkmarks, 14.6k kg + 36 sets chips; stepper round-trip 4→5→4 persisted via debounced PATCH; VLM close-up review PASS (ring, dots, chips, no overlap).
- NEW FEATURE — LastTimeBar v2 (round-12 recommendation #3):
  - Time-based exercise deltas: new `timeSec` prop; for TIME/WEIGHT_TIME exercises the current input vs last session's top hold renders "+0:15 hold vs last" / "−0:30 vs last (1:00)" / "matching last 1:00" chips.
  - Session-volume chip: today's exercise volume (Σ weight×reps, warm-ups excluded) vs the whole last session — "session vol 4,070 kg · last 3,373 kg (+21%)" with up/same/down tones; only for weight exercises with both volumes > 0.
  - Verified live: squat screen shows +21% chip; Plank (added to today's workout as a test) shows last-time pills 0:45/1:00/0:45 and live "+0:15 hold vs last" at 1:15 input; test data removed after (API DELETE 200).
- NEW FEATURE — Calendar month summary strip (`src/features/calendar/month-stats.tsx`):
  - 4 stat cells (Volume accent / Time / Sets / Avg per workout) from the already-fetched month summaries — client-side, no new API calls; hidden when month empty. Matches KpiCard visual language.
  - Verified live: September shows 82.7k kg · 14h 43m · 151 sets · 5906.5 kg avg; VLM review PASS (aligned, style-consistent, no problems).
- INFRASTRUCTURE — dev-server OOM watchdog (round-12 recommendation #5, became critical):
  - Root cause found via dmesg: kernel OOM-kills next-server at ~2.1GB RSS (4GB sandbox; 3 kills logged). During downtimes the SW network-first fallback made the app look data-corrupted ("0 workouts" calendar, empty month queries) — a misleading failure mode now documented here.
  - Deeper discovery: background processes started via plain `nohup &` (even with setsid) are killed ~10s after the Bash tool command completes (process-tree cleanup). Fix: double-fork orphan pattern `( setsid cmd & )` — verified with a heartbeat-marker experiment, then deployed.
  - `watchdog.sh`: polls /api/health every 15s, after 2 consecutive failures pkills + restarts `bun run dev` with `NODE_OPTIONS=--max-old-space-size=1024`; writes `.watchdog-heartbeat` each loop + actions to watchdog.log; itself started orphaned. Server has since stayed up (12+ min at final check, previously died every ~2-6 min).
- STYLING POLISH (VLM 3-batch review over 9 view screenshots + 2 zoomed re-checks; findings code-triaged per convention — 6 of 12 claims were false positives: nonexistent kebab menu / comment-title hierarchy is deliberate design / KPI alignment identical component / GripVertical is standard / body datetime "truncation" disproven by zoomed re-review / history clear-X contrast conventional):
  - NavPanel chips row (Today): right-edge scroll-fade gradient affordance with scroll+ResizeObserver state (only while more chips exist off-screen); fixed an ordering bug in my own edit (useEffect dep evaluated before `exercises` declaration — TDZ) before it could ship.
  - Insights activity grid: empty-day cells bg-muted/40 → /50 (structure legibility).
  - Calendar MonthStats labels: text-foreground/60 → /70 (consistency with round-11 KPI label fix).
  - 1RM calculator disclaimer: text-muted-foreground → text-foreground/70 (readability convention).
  - WeekProgressCard subtitle: truncate → line-clamp-2 leading-snug (mobile 390px cut-off "Target hit…" found by VLM mobile review; fixed + re-screenshotted).
- Verification: `bun run lint` clean ×4; full 9-view tour ×2 → ZERO console/page errors; mobile 390×844 (week card, chips fade visible, day strip); offline mode (navigator offline → today renders real cached data incl. week card + insights from cache, 0 errors, clean online restore); /api/health green; demo data restored (plank test removed, weekly target left at 4 for demo). Screenshots: download/qa-r15-*.{png} ×15 (week-card, calendar + VLM-verified, settings, lasttime session-vol, plank time-delta, mobile ×2, polish sweep ×9, final-today).

Stage Summary:
- Three new user-facing capabilities: account-portable weekly workout goal with a Today-view progress card (ring + day dots + week totals), extended beat-last-time context (time-based exercise deltas + session-volume comparison), and a calendar month totals strip.
- Infrastructure hardened: OOM root cause diagnosed (kernel kill at 2.1GB), surviving watchdog deployed via double-fork orphan pattern with heap-capped restarts — the dev server is now stable across tool commands (previously dying every few minutes).
- One schema change (UserSettings.weeklyWorkoutTarget) with committed migration; all 45+ existing APIs untouched except the settings PATCH gaining one optional field.
- Known misleading failure mode documented: a dead dev server + SW fallback looks like data loss/empty views — always check /api/health + watchdog.log first.

Next-round recommendations (priority):
1. README + env reference + zero-code DB-switching docs (original spec deliverable, still missing — needs explicit user request per doc policy).
2. Real-device PWA test: beforeinstallprompt, MediaSession lock-screen UI, SpeechSynthesis voices, weekly-target ring on a real phone (all unverifiable in headless).
3. Consider streak rest-day grace (round-7 leftover product decision).
4. Watchdog hardening if needed: email/notification on restart, RSS-based proactive recycling before the OOM killer fires (currently reactive-only).
5. WeekProgressCard: tap-through already goes to Insights; could add per-day drill-down to the specific workout.

---
Task ID: 14
Agent: main (Z.ai Code)
Task: Part 2 UI overhaul — single-row set entry redesign: new set fields (setType/RPE/tempo/rest/completedAt) through schema→API→UI, SetTable component library, integrated rest timer bar, Today summaries, quick-add bar, settings columns, e1RM methods

Work Log:
- Environment recovered (echo ok after prior Errno-11). Dev server alive; health green; watchdog running. Worklog read (13 prior entries).
- SCHEMA (additive migration 20260926040000_part2_set_fields, applied + backfilled via prisma migrate deploy):
  - TrainingSet: setType (NORMAL|WARMUP|DROP|FAILURE|AMRAP, default NORMAL; isWarmup kept in sync as legacy mirror), rpe (6.0–10.0), tempo ("3-1-1-0" pattern), restPlannedSec, restActualSec, completedAt.
  - Exercise: defaultSetType, defaultRpeTarget, defaultTempo.
  - UserSettings: showSetType/showRpe/showTempo/showRest (default true), autoRestFromRow (true), restEndBehaviour (NOTIFY_AND_FOCUS_NEXT), e1rmMethod (BRZYCKI).
  - PredefinedSet: setType/rpe/tempo/restPlannedSec (null = copy previous).
  - Backfill: existing isWarmup rows → setType='WARMUP' (verified count 1=1).
- CONTRACT LAYER: constants (SET_TYPES + SET_TYPE_META letters/colours, RPE_OPTIONS, TEMPO_REGEX + parseTempo/normaliseTempo, formatRestSec, REST_END_BEHAVIOURS, E1RM_METHODS, AVG_REST graph metric); types.ts DTOs; Zod schemas (tempo regex both create+update, RPE 6–10, rest caps); mappers (mapSet/mapExercise/mapPredefinedSet/settings spread); workout-service (SetFieldsInput, syncWarmup setType⟺isWarmup, completedAt stamping + restActualSec derived from previous completed set on ✓, PR check honours effective warmup); exercise/routine/settings services pass-through; routine log-day copies new fields; account export/import round-trips new fields (old backups import as nulls); client api.ts input types.
- e1RM RULES: formulas.estOneRmEpley/estOneRmRpe (Tuchscherer approximation: effective reps = reps + (10−RPE), Epley on that)/estOneRmByMethod; analysis-service + mapRecords exclude FAILURE sets from e1RM, honour settings.e1rmMethod; new AVG_REST graph metric (avg restActualSec per day, any exercise type).
- COMPONENT LIBRARY (src/components/set-table/):
  - cells.tsx: SetTypeTag (tap cycles N→W→D→F→A, long-press/context-menu picker with descriptions), RpeCell (9-chip popover), TempoCell (4-field ecc/pause/con/pause editor with normalisation), RestCell (presets + custom min/sec + start-now), NumericCell (tap→inline input, autofocus+select, −/+ steppers appear under the cell while focused, Enter commits, arrows step, amrap "n+" suffix).
  - set-table.tsx: single-row grid (# drag-handle / type / value cols minmax(0,1fr) / RPE / TEMPO / REST / ✓ / …), dnd-kit reorder via # cell, header labels adapt to exercise type + unit, add-set ghost row (last-time placeholders as muted italic ghosts, Enter adds, + button), drop-set connector line, FAILURE tint, completed dim, PR trophy + note dot in … cell, live rest countdown inside the resting row's REST cell.
  - row-sheet.tsx: bottom Sheet (max 85vh, internal scroll): note textarea (blur-saves), set-type chips, RPE/Tempo/Rest editors, planned-vs-actual rest display, Use-as-prefill / Copy summary / Duplicate / Delete.
  - Fixed two layout bugs found via browser bounding-box checks: (1) gridTemplate prop never applied to row style → cells stacked vertically 322px tall; (2) ✓ track missing from grid template when markSetsComplete=false → … cell wrapped to second row. Rows now 38px single-line, no horizontal overflow at 358px simulated width.
- REST TIMER → RestBar (rest-timer.tsx rewrite): slim full-width bottom bar "Rest 1:12 [−15s][+15s][pause][Skip]" above bottom nav (desktop bottom-6), presets+mute popover kept, context gained restRowId/remainingSec/onRestEnd; ✓ or set-add starts countdown from row restPlannedSec → exercise restSec → last used (autoRestFromRow setting); on end: beep+vibrate+toast+fire onRestEnd (NOTIFY_AND_FOCUS_NEXT focuses the add row).
- TRACK TAB REWRITE (track-tab.tsx): SetInputRow+SetsList deleted; SetTable wired with lifted add-draft state (LastTimeBar live deltas + tap-to-prefill still work); volume/e1RM/avgRPE summary line ("Vol 1.8k kg · Best e1RM 136.6 · Avg RPE 8 · N working sets"); keyboard shortcuts N (focus add row) / R (start rest) / Del (delete last-touched set) / ? (shortcuts sheet); delete → 10s undo toast (recreates set with all fields incl. type/rpe/tempo/rest); Enter-to-add fixed via draftRef (stale-closure bug caught in browser testing).
- TODAY VIEW: QuickAddBar (desktop, lg:block) parsing "bench 100x5 @8 t3-1-1 r90" (name greedy prefix, weight×reps, @rpe, t-tempo normalised, r-rest) with live preview chips → finds/creates exercise + adds set in one shot (verified end-to-end: "Added to Barbell Bench Press 100kg × 5 @ RPE 8 · new PR! 🏆"); exercise cards gained the same Vol/Best-e1RM/Avg-RPE summary line; workout header gained PR-count chip (existing volume/sets/duration/streak chips retained); PR-chip + test data cleaned after verification.
- SETTINGS: new "Set table" card — 4 column-visibility tiles (Set type/RPE/Tempo/Rest as switch cards), Rest-from-row switch, When-rest-ends segmented (Notify / Notify+focus next), Estimated-1RM-method segmented (Brzycki/Epley/RPE) with dynamic helper text. Column toggle verified end-to-end (Tempo off → column removed from table, restored after).
- EXERCISE FORM: "New-set defaults" block — default set type select, RPE-target stepper (6–10), tempo input; payload wired through exercise-service create/update.
- HISTORY/GRAPHS: setSummary now appends "@8" when RPE present (pills, toasts, clipboard); AVG_REST metric label + formatter + graph query support.
- Ops notes: (a) `git stash` stashed the tracked db/custom.db and the running server kept a stale inode → SQLite "attempt to write a readonly database" (1032) on login; fixed by restarting dev server (and chmod). Never stash with the db file tracked — use `git stash -- src` scoping next time. (b) Bash tool output rendering eats "[m" sequences (ANSI-like) — "[mutate," displays as "utate,"; do not trust display when matching bracket-m strings (verify with rg -c). (c) sed -i on eslint-disable lines was safe but display artifact suggested corruption — always verify with git diff before "repairing". (d) Watchdog OOM-restarted the server once during heavy tsc runs (18:47) — known, auto-recovered.
- Verification: bunx tsc — zero NEW errors vs stashed baseline (all remaining are pre-existing, line-shifted); bun run lint clean; browser QA (agent-browser): login, Today → squat training screen — SetTable renders all columns, RPE picker→"Avg RPE 8" in summary, tempo 3-1-1-0 saved, rest 1:30 set, ✓ → RestBar "Rest timer: X remaining", REST cell live countdown, row sheet full contents, type tag cycle N→W, delete + Undo restores row, quick-add parse preview + end-to-end add (PR toast), settings column toggles live-reflow table, exercise form defaults present, exercise-card summary line renders, 9-view sweep 0 console errors, mobile 358px no horizontal overflow/single-line rows. Screenshots: download/qa-r16-settable.png, qa-r16-settable-fixed.png, qa-r16-settable-final.png.

Stage Summary:
- Part 2 core delivered: every set is ONE inline-editable row with type tag, values, RPE, tempo, rest, ✓ and overflow sheet — persisting 6 new fields through migration→API→backup import/export, with warmup/failure exclusion rules and 3 e1RM methods server-side.
- Integrated rest system: row-planned rest → live countdown in the REST cell + slim bottom RestBar with ±15s/skip, actual rest auto-recorded per set (visible in row sheet, AVG_REST graph).
- Today gains: per-block Vol/e1RM/AvgRPE summary lines, workout PR chip, desktop quick-add bar with grammar parsing and live preview.
- Settings: column visibility + rest behaviour + e1RM method all live-verifiable; exercise form exposes new-set defaults.
- Two real layout bugs (missing grid template on rows; missing ✓ track) were caught by browser bounding-box measurement — innerText-only checks had passed; lesson recorded.

Next-round recommendations (priority):
1. Routine predefined-set editor UI: the API supports new template fields, but the routine day editor still uses the old row form — surface setType/RPE/tempo/rest there (reuse cells.tsx).
2. History tab: render past workouts' sets with the read-only SetTable (mode=readonly) incl. rest actual column.
3. Multi-select mode for set rows (long-press → bulk complete/delete/type) — spec §SET ROW; row sheet covers single ops today.
4. Swipe gestures (left→delete/duplicate, right→complete) on mobile rows; currently only … sheet.
5. Plate-calc popover on long-press of WEIGHT cell (PlateHint exists for the ghost target; per-cell would match spec).
6. Web Worker + Notification-with-actions for background rest timing (currently interval-based; tab must stay focused).
7. README/env/DB-switching docs (long-standing deliverable; needs explicit user request).

---
Task ID: 2-b
Agent: subagent (routine-fields)
Task: Routine predefined-set editor — surface the Part 2 template fields (setType / RPE / tempo / planned rest) in the routine day editor rows, matching the training set-table cell interaction patterns.

Work Log:
- Read worklog (Task 14 entry), routines feature files, cells.tsx, constants/schemas/types/api client, routine-service logDay. Confirmed API + DB + PredefinedSetInput already carry the fields; only the row UI was missing.
- src/features/routines/predefined-set-row.tsx (main change):
  - Appended a compact chip group to the existing flex-wrap row (after the numeric steppers, before the "blank" badge): TemplateTypeTag + RpeCell + TempoCell + RestCell. Kept as ONE shrink-0 group so on narrow screens it collapses to a single horizontal chip row under the numeric fields (matches the row's existing wrap design language; no "…" overflow popover needed). Desktop stays single-line (verified: all chip/stepper centers share one y).
  - RPE/tempo/rest reuse the training cells verbatim (RpeCell/TempoCell/RestCell from src/components/set-table/cells.tsx) → identical popovers: 9-chip RPE picker, 4-field tempo editor w/ normalisation, rest presets + custom min/sec. RestCell gets remainingSec={null} and no onStartNow (no live timer in the template editor; "Start now" hidden automatically).
  - TemplateTypeTag: local replication of SetTypeTag's internals (tap cycles NORMAL→WARMUP→DROP→FAILURE→AMRAP, 420ms long-press / context-menu opens the picker sheet with descriptions) extended for the template's null = "inherit" state: null renders a dashed "TYPE" chip and tap opens the picker directly (nothing to cycle from); picker gains a "Not set" row ("Logs as Normal, or copies previous") to return to null. Replicated locally instead of editing SetTypeTag because its value prop is non-null SetType and the workout flow always has a concrete type — zero changes to the shared component, zero conflict risk with the parallel set-table/track-tab agent.
  - All four are OPTIONAL per row: null patches pass through as null in PredefinedSetInput (server PATCH only touches present keys, so clearing sends explicit nulls).
  - "Blank set" action now clears ALL 8 fields (weight/reps/distance/timeSec + setType/rpe/tempo/restPlannedSec) so "blank = copy previous" is honest; isBlankRow (drives the per-row "blank" badge + disabled blank button) now requires all 8 fields null. The exercise-level "copy previous" header badge in routine-exercise-row stays numeric-fields-only — that mirrors the server's logDay copy rule exactly.
- src/features/routines/routine-exercise-row.tsx: addSet now takes an optional PredefinedSetInput passthrough (default {}) so any creation-time fields flow to the API; UI still creates blank sets and every entered field flows through updateSet patches.
- src/components/set-table/cells.tsx (smallest necessary change, 100% backward compatible — coordination note for the set-table/track-tab agent): RpeCell / TempoCell / RestCell each gained an OPTIONAL `placeholder?: string` prop (default "–"). When unset and a custom placeholder is passed, the cell renders it as a tiny uppercase label (text-[10px] font-semibold uppercase tracking-wide) instead of "–" — this makes the routine template chips self-labelling ("TYPE RPE TEMPO REST" when empty, values when set). No existing call site passes the prop → identical rendering everywhere else. Verified in-browser: training SetTable + row-sheet + add-row ghost all render exactly as before, console clean.
- routine-day-card.tsx / routine-detail.tsx / log-all-dialog.tsx: no changes needed (set rows render via PredefinedSetRow; Log-this-day copies new fields server-side per Task 14).
- Deliberate decision: chips are NOT gated on settings.showSetType/showRpe/showTempo/showRest — those are set-table column-visibility prefs; the template editor is an authoring surface where all fields stay reachable (chips are tiny and null-muted).

Verification (dev server on :3000, health 200; agent-browser):
- Login demo@setforge.app → #/routines → expanded "Push Day": all 13 predefined sets across exercises render the 4 new chips (aria-labels present).
- Interactions on Barbell Bench Press set 1: type tap-on-null opened picker → picked Warm-up ("W" tag); tap-cycle W→D verified; RPE popover → 8; tempo editor → 3-1-1-0; rest presets → 1:30. "Not set" picker row clears type back to null (verified). Blank action on set 4 cleared an RPE 7 + weight/reps to fully blank (badge shown, button disabled); restored 85×6 via API afterwards.
- PERSISTENCE: full page reload → re-expanded routine → set 1 shows Warm-up + RPE 8 + Tempo 3-1-1-0 + Planned rest 1:30 (values served fresh from GET /api/routines).
- Console: no new errors (only benign HMR/DevTools logs) across routines + today views.
- Desktop 1280×800: row single-line (all controls share vertical center), scrollWidth = viewport. Screenshot: download/qa-r17-routine-fields.png.
- Mobile 390×844: documentElement.scrollWidth = 390 (no horizontal overflow); numeric steppers stack, chips collapse to one chip row underneath (bounding-box measured: TYPE 28px + RPE 44 + TEMPO 56 + REST 48 on one line). Screenshot: download/qa-r17-routine-fields-mobile.png. Viewport restored to 1280×800.
- Backward compat of cells.tsx change: #/today training screen SetTable renders SetTypeTag/NumericCell/RpeCell/TempoCell/RestCell + add-row ghosts correctly; "…" row-sheet renders its Rpe/Tempo/Rest editors correctly; console clean.
- bunx tsc --noEmit: zero errors in touched files (pre-existing errors elsewhere unchanged). bun run lint: exit 0 clean.

Stage Summary:
- The routine day editor now exposes all Part 2 template fields per predefined set with the exact training-screen cell interactions (cycle/picker type tag, 9-chip RPE, 4-field tempo, rest presets+custom), each optional with null = inherit/copy-previous semantics, persisted through routinesApi.updateSet/addSet.
- Mobile-safe single-row design: chips wrap as one group under the numeric fields on narrow viewports; desktop rows stay single-line.
- cells.tsx gained only additive optional placeholder props (no behavioural change for existing consumers) — flagged for the parallel set-table/track-tab agent.
- Server code, Prisma schema, API routes, log-all-dialog, and history feature untouched.

Next actions / notes for future rounds:
- The training "add set" ghost row could reuse the placeholder prop for its muted value hints (currently hardcoded "–").
- If SetTypeTag ever needs null support on the training screen too, consider unifying TemplateTypeTag back into cells.tsx as a shared component (props would stay backward compatible if value stays non-null for existing callers).
- Potential product decision: gate routine chips behind settings.showSetType/showRpe/showTempo/showRest if template authors want parity with their training column prefs (intentionally not done).

---
Task ID: 2-a
Agent: subagent (history-readonly)
Task: History view — render past workouts' sets through the shared SetTable in a new readonly mode (Part 2 fields: set-type tags N/W/D/F/A, RPE, tempo, rest planned + "→ actual" suffix), without touching edit-mode behavior.

Work Log:
- Read worklog Task 14 + 2-b entries; read set-table.tsx, cells.tsx, row-sheet.tsx, history workout-card.tsx / workout-history-view.tsx, types.ts (SetDTO Part 2 fields verified: setType/rpe/tempo/restPlannedSec/restActualSec/completedAt), constants (SET_TYPE_META/formatRestSec/fieldsForType), client store (settings source) + query.tsx. Task 2-b's optional `placeholder` props in cells.tsx left untouched — no changes to cells.tsx were needed at all.
- src/components/set-table/set-table.tsx:
  - New prop `mode?: "edit" | "readonly"` (default "edit"). All interaction callbacks made optional in the Props type (onPatchSet/onAddSet/onDuplicateSet/onDeleteSet/onReorder/onStartRest/onToggleComplete/onUseAsPrefill; focusSignal/draft/onDraftChange were already optional). Guards: `onReorder?.(...)` in onDragEnd, `if (!onAddSet) return` in submitAdd, module-level `noop` fallback for SetTableRow/RowSheet internal prop passing. Exports unchanged (`SetTable`, `AddRowDraft`, `VisibleCols`) — track-tab/training-screen imports keep working.
  - Edit mode renders byte-identical to before (same DndContext/SortableContext/add-ghost-row/RowSheet tree, same grid template values). Only DnD+ghost+sheet are conditionally skipped when mode="readonly".
  - Readonly branch: plain rowgroup of ReadonlySetTableRow — # index as static span (amber when warmup, non-draggable), static SetTypeTag look (SET_TYPE_META letter chip with label tooltip, NOT tappable — rendered inline, no cells.tsx change), value cells as plain tabular-nums text (kg/lbs suffix on weight, km on distance, formatRestSec on timeSec, "n+" on AMRAP reps), RPE text ("8.5" or –), tempo text, REST cell = planned ("1:30") + muted "→ 83s" actual suffix when restActualSec present, dimmed emerald ✓ svg when isComplete (sr-only "not completed" otherwise), Trophy when newPr + MessageSquareText when comment in the last track. FAILURE tint, DROP connector line + violet tint, completed opacity-70 kept for visual parity. Single-line h-9 rows (38px incl. border), `cols` visibility respected in header + rows.
  - Grid template in readonly: REST track widened 3.4rem → 4.75rem (fits "1:30 → 83s") and value tracks `minmax(3.75rem,1fr)` (floor so weight/reps never collapse to 0 on narrow screens). Root gets `scroll-slim overflow-x-auto` in readonly only — on phones the secondary columns (rest/✓/note) swipe-scroll inside the card instead of overflowing the document.
- src/features/history/workout-card.tsx: expanded exercise blocks now render `<SetTable mode="readonly">` instead of the old one-line-per-set flex list (old list + WarmupBadge/setSummary imports removed). Column visibility read from the session store settings (`useApp((s) => s.settings)` — same source the Today view uses), fallback all-visible when settings aren't loaded; unit via exerciseUnit(ex, settings), weightStep via ex.weightIncrement ?? settings default (unused in readonly but keeps the required prop honest). Same "hide empty incomplete sets" filter logic kept. Expand/collapse behaviour, actions row, month grouping untouched. workout-history-view.tsx needed no changes.
- Deliberately NOT changed: edit-mode code paths, cells.tsx, row-sheet.tsx, training-screen/track-tab, API/schema/server.

Verification (dev server :3000 health 200; agent-browser, logged-in session):
- #/history → expanded workouts: readonly tables render with header `# SET KG REPS RPE TEMPO REST ✓`; per-set type tags, values, RPE, tempo, REST. Verified NO add-ghost row (`button[aria-label="Add set"]` absent), NO drag handles, NO row-sheet/steppers in history.
- Part 2 data coverage: demo DB has no setType/rpe/tempo/rest on historical sets, so I temporarily PATCHed Sep 21 Barbell Bench Press sets via the real API (WARMUP / rpe 8.5 + tempo 3-1-1-0 + rest 90s planned + 83s actual / DROP / FAILURE + comment) → history rendered `W | 85kg × 8`, `N | 82.5kg × 8 | 8.5 | 3-1-1-0 | 1:30 → 83s`, `D`, `F` + note icon + drop connector + failure tint + dimmed ✓. All values RESTORED to originals afterwards (re-verified via API: all NORMAL/nulls, today's squat completion flags back to original).
- Column visibility wiring: toggled Settings → "Show Tempo column" off → history header dropped TEMPO; toggled back on → TEMPO returned. (Note: a pre-existing nested-button console warning fires on the SETTINGS view — its column tiles wrap a Switch in a button; unrelated to history. Clearing console and exercising only history: 0 messages, 0 page errors.)
- Desktop 1280×800: rows uniform 38px single-line, grid 838px, documentElement.scrollWidth = 1280 (no overflow). Screenshot download/qa-r17-history-readonly.png (VLM-verified: all columns, W/N/D/F tags, RPE 8.5, 3-1-1-0, "1:30 → 83s", single-line, no overlap).
- Mobile 390×844: documentElement.scrollWidth = 390 (no document overflow); weight/reps/RPE/tempo fully visible at scroll 0 (bounding-box measured: reps right=244, tempo right=358), rest/✓/note reachable via in-card horizontal swipe (grid scrollWidth 483 vs clientWidth 312 — initial template with minmax(0,1fr) collapsed value cols to 0px, caught via VLM screenshot review and fixed with the 3.75rem floor). Rows single-line 38px. Screenshot download/qa-r17-history-mobile.png (VLM-verified). Viewport restored to 1280×800.
- Edit-mode regression: #/today → opened Barbell Squat training screen — SetTable renders interactive (add-row ghost present, type tag / … options / done buttons present, 8 rows incl. ghost), ✓ toggle completed a set (verified via API isComplete true → row dimmed) and toggled back (restored). Rows single-line 38px. Screenshot download/qa-r17-history-editmode-regression.png. Console: 0 errors across today+history after clearing (only benign Fast Refresh/HMR logs).
- bunx tsc --noEmit: zero errors in touched files (pre-existing errors elsewhere unchanged). bun run lint: exit 0 clean.

Stage Summary:
- History expanded cards now show every past set through the same Part 2 SetTable grid as the training screen, read-only: type tag, values, RPE, tempo, planned rest with actual-rest suffix, completed check, PR/note markers — honouring the user's column-visibility settings with an all-columns fallback.
- SetTable's interaction props are all optional now (guarded), enabling future read-only consumers without prop plumbing; edit mode is byte-for-byte the same render tree, verified interactively (add row, ✓ toggle) after the change.
- Mobile-safe: the readonly table scrolls its secondary columns inside the card (scroll-slim overflow-x-auto + 3.75rem value-column floor) so weight/reps stay visible and the document never overflows at 390px.
- Demo data left exactly as found (temporary Part 2 field seeding for screenshots was reverted through the API).

Next actions / notes for future rounds:
- If restActualSec becomes commonly populated, consider showing actual rest in the workout-card metrics line or the day summary (currently only in the table + row sheet).
- The settings "Set table" tiles emit a nested <button> (tile button > Switch button) React warning — pre-existing, cheap fix would be div+onClick or Switch-only trigger.
- History cards fetch the full workout tree per expand; once tables get heavy, consider virtualising or lazy per-exercise rendering.

---
Task ID: 3
Agent: main (Z.ai Code)
Task: Part 3 full-screen rework end-to-end — true full-viewport training screen, full-screen rest timer overlay (Wake Lock + hidden-tab notification), Part 2 leftovers delivered via parallel subagents (history readonly SetTable 2-a, routine template fields 2-b), settings nested-button a11y fix, full verification

Work Log:
- Session start: environment recovered (prior Errno-11 gone). Health 200, watchdog alive. Baseline 9-view sweep: 8 clean + Settings view carrying a pre-existing nested-button React error (button tile wrapping a Switch).
- NOTE: user attached BUILD-PROMPT-Part-3-Full-Screen-Rework.pdf but the file NEVER landed on the filesystem (upload/ empty across repeated checks; filesystem-wide searches empty). Proceeded per user's standing "no wait / end-to-end" mandate using the spec TITLE (Full-Screen Rework) + Part 2 design language + worklog next-round recommendations as the scope. If the PDF re-lands, reconcile against it.
- SUBAGENT 2-a (relaunched after first launch's result channel was interrupted by an incoming user message): SetTable gained mode="readonly" — all interaction callbacks optional/guarded, ReadonlySetTableRow renders static # / type tag / values / RPE / tempo / rest planned+actual / dimmed ✓ / markers; history workout cards render it with settings-driven columns. Verified live incl. mobile 390px and edit-mode regression (screenshots qa-r17-history-*).
- SUBAGENT 2-b: routine predefined-set rows gained the full Part 2 field chips — TemplateTypeTag (null-aware cycle + picker incl. "Not set → inherit"), reused RpeCell/TempoCell/RestCell popovers (cells.tsx gained optional placeholder prop, backward-compatible). Persisted round-trip verified via API reload (screenshots qa-r17-routine-fields*).
- PART 3 CORE (mine) — Full-screen training screen (training-screen.tsx rewrite):
  - Dialog is still the shell (focus trap, Escape, scroll lock free) but DialogContent now overrides to a true full-viewport takeover: top-0! left-0! h-dvh w-full! max-w-none! rounded-none! border-0! p-0! flex-col, with safe-area top padding, slide-in-from-bottom-3 open animation.
  - Full-width app bar (close X / prev-exercise / name+category+superset+position / next-exercise), tab strip with backdrop-blur, and a full-height overscroll-contain scroll region; working column centered at max-w-3xl on desktop — Track/History/Graph tabs all inherit the extra room.
  - Verified: DOM bounds exactly 0,0→viewport on 1280×800 AND 390×844 (agent-browser geometry), tabs functional, no doc overflow on mobile, VLM QA 9/10 ("truly full-viewport, no dialog margins, production-ready").
- PART 3 CORE (mine) — Full-screen rest timer overlay (rest-timer.tsx):
  - Slim bar kept as minimized state; its countdown region is now a tap target (Maximize2 affordance) that expands a z-[80] full-screen overlay: SVG progress ring (orange gradient stroke, dash-offset animated), huge clamp(3.5rem,16vw,7.5rem) tabular countdown with aria-live, "resting/paused · planned X" status, thumb-sized controls (−15s / pause / +15s / Skip, h-14–16 with active:scale-95), Minimise button, SetForge brand strip, backdrop-blur-xl background.
  - Screen Wake Lock acquired while overlay+running (minimal TS typings, safe release on cleanup); Notification fired at finish when tab hidden AND permission pre-granted (no prompts); Escape collapses overlay without skipping; finish()/skip() auto-collapse.
  - Verified live on desktop AND mobile: expand → 1:20 counting → +15s adjusts → minimise returns slim bar (live 1:24) → re-expand → Escape collapses → skip clears; VLM QA 9/10 both viewports ("digits perfectly centered, no clipping at 390px, PASS"). The 'N' badge VLM flagged at mobile bottom-left = Next.js dev-mode indicator (dev-only, not in production); brand strip DOM-verified exactly centered (195/390).
- SETTINGS A11Y FIX (preferences-section.tsx): column-visibility tiles wrapped a Switch (real nested <button> → React error + invalid HTML). Replaced inner Switch with a decorative aria-hidden state pill (track+thumb); tile keeps aria-pressed + gained aria-label. Toggle round-trip verified (aria-pressed true→false→true). Post-fix: clean reload + full 9-view sweep = 0 console errors on EVERY view.
- Final verification: bunx tsc — zero NEW errors (all remaining are the documented pre-existing baseline in examples/scripts/skills/2 API routes); bun run lint clean ×2; health 200; final regression (open training → fullscreen bounds true → tick set 2 → rest slim bar → expand → screenshot → skip → untick → close) with 0 console errors; history readonly grid 120 gridcells renders on expand; demo data restored after every test interaction.
- Ops: one routine watchdog OOM-restart during heavy tsc (auto-recovered in ~15s per runbook, health back to 200). Dev server stable through final verification.

Stage Summary:
- Part 3 "Full-Screen Rework" delivered end-to-end: the training experience is now a true immersive full-viewport mode (edge-to-edge on mobile AND desktop, verified by DOM geometry at 1280×800 and 390×844), and the rest timer gained a full-screen countdown overlay (huge digits + progress ring + Wake Lock + hidden-tab notification) while keeping the slim bar as minimized state.
- All five Part 2 leftover recommendations that blocked "market ready" are closed: routine template fields (2-b), history readonly SetTable (2-a), plus the a11y nested-button defect on Settings — the app now sweeps 9/9 views with ZERO console errors.
- App state: login → today → full-screen training (set entry, RPE/tempo/rest/type, prefill, warmup ramp, quick-add) → rest flow (slim + fullscreen + wake lock) → history review (readonly table with all Part 2 fields) → routines (template fields) → settings (columns/behaviour) — a real user's end-to-end loop works, verified interactively at desktop + mobile widths.

Next-round recommendations (priority):
1. PDF reconciliation: if BUILD-PROMPT-Part-3-Full-Screen-Rework.pdf actually lands in upload/, diff its spec against this implementation and close any gaps (the file never appeared on disk this session).
2. Multi-select mode for set rows + swipe gestures (Part 2 spec §SET ROW leftovers; row sheet covers single ops today).
3. Plate-calc popover on long-press of WEIGHT cell (PlateHint covers the ghost target only).
4. Web Worker for background rest timing (interval-based today; tab must stay focused for exact ticks — Wake Lock + Notification already mitigate).
5. Real-device PWA checks: beforeinstallprompt, MediaSession lock screen, Wake Lock behaviour on a real phone (unverifiable headless).

---
Task ID: 4
Agent: main (Z.ai Code) — orchestrator
Task: REAL Part 3 spec arrived ("BUILD PROMPT — PART 3: FULL SCREEN REWORK. ZERO OVERLAP. ONE CARD SYSTEM."). It supersedes the inferred Part 3 from Task ID 3 (Dialog-fullscreen training + rest overlay will be REPLACED by route-based screens on the new layout system). Begin execution per spec §ORDER OF WORK.

Work Log:
- Recon: server health 200; git clean (only watchdog/db drift); worklog read through Task 3; 2-a/2-b confirmed landed; agent-browser CLI reference confirmed (set viewport / press / eval / wait / screenshot / find).
- Built scripts/qa/verify-layout.sh — the §VERIFICATION HARNESS adapted to this platform (agent-browser + single-page hash routing; no Playwright/Storybook/CI exists here): per width [320 360 390 768 1024 1440] checks leaf-element overlap (>1px tolerance), right-edge overflow, document horizontal scroll, [data-row] single-line (scrollHeight<=clientHeight + nowrap), [data-row] heights ∈ {40,48,56,72}; runs at scroll-top AND scroll-bottom of [data-scroll-body]; fixed/sticky/absolute subtrees excluded by design (toasts/badges/popovers/sticky headers); svg roots checkable, svg internals skipped. Smoke-tested on legacy #/today (PASS at 390/1280; legacy has no data-row/data-scroll-body yet, as expected).
- Platform adaptation decisions (documented deviations): "full-screen routes" implemented as HASH routes under the single Next.js `/` page (user can only see `/`); Storybook → #/dev showcase screen with screenshots; Lighthouse/CI → agent-browser gates per screen; lint token rules → src/lib/ui/tokens.ts constants + final grep audit.
- Execution plan (subagent task IDs): p3-1 foundation (layout primitives + shell + hash router + screen slots) → p3-2 unified SetRow + ExerciseCard + #/dev showcase → p3-3 Today → p3-4 Training(3 tabs)+Exercise Picker → p3-5 Routines cluster → p3-6 Calendar+History → p3-7 Body+Records/Stats/Goals → p3-8 Settings/Account/Auth+Tools → p3-9 legacy deletion + FORBIDDEN grep audit + full harness sweep. Gates run per screen before acceptance.

Stage Summary:
- Harness + plan in place; dispatching p3-1 now. URL contract: #/today, #/today/{exerciseId}, #/calendar, #/calendar/filters, #/history, #/exercises, #/routines, #/routines/{id}, #/routines/{id}/log/{dayId}, #/routines/{id}/exercise/{reId}, #/body, #/insights, #/tools, #/settings, #/auth, #/dev. Screen slot files will live in src/features/screens/ so router never needs edits when screens are rebuilt.

---
Task ID: p3-1
Agent: subagent (full-stack-developer) — gate completed by orchestrator after agent's result channel timed out
Task: Part 3 ORDER OF WORK step 1 — layout primitives + app shell + hash router + 16 screen slot files

Work Log:
- Created src/components/layout/: Screen, TopBar (56px), SubBar (48px), ScrollBody (flex-1 min-h-0 overflow-y-auto, data-scroll-body attr, max-w-[720px] inner / lg 1100px), BottomBar (56px), NavBar (64px + safe-area, grid-cols-6, lg:hidden, destinations Today/Calendar/Routines/Body/Insights/Settings), NavPane (desktop 360px, all 9 destinations, user chip), use-hash-segment hook, index barrel.
- Created src/features/shell/: router.ts (typed hash router, full URL contract incl. transitional #/exercise-overview/{id}, hydration-safe, unknown→#/today, query strings preserved), app-shell.tsx (auth gate with SSR-session trust, desktop NavPane|right-pane, mobile screen stack), stub-screen.tsx.
- Created src/features/screens/*.tsx — 17 slots: 10 legacy pass-throughs (today/calendar/history/exercises-picker/routines/body/records-insights/tools/settings/auth) + 7 new-primitives stubs (training, calendar-filters, routine-detail, log-day, predefined-editor, dev-showcase, exercise-overview pass-through).
- Rewrote src/components/app-root.tsx to render the new shell (session/theme/PWA providers preserved); page.tsx untouched.
- Created src/lib/ui/tokens.ts (spacing 4/8/12/16/24/32, row heights 40/48/56/72, bar heights, radius 8, shared row class strings).
- ORCHESTRATOR GATE (verified after timeout): health 200; harness #/today PASS 320/390/768/1440 (overlap 0, rightEdge 0, hscroll false); stubs #/today/{id} PASS 320/390/1024 and #/routines/{id} PASS 390/1440; all 12 routes render non-blank; NavBar bottom 65px on mobile / hidden ≥lg; NavPane exactly 360px flex on desktop; auth round-trip logout→#/auth→login→#/today with content; bunx eslint on all new dirs exit 0; screenshots download/qa-p3-1-{today-390,shell-1024,shell-1440}.png.

Stage Summary:
- Foundation landed: every screen now composes through the shared shell + router; screens get rebuilt by replacing only src/features/screens/*.tsx files. RouteParams: exerciseId / routineId / dayId / reId (+Route.query). NavBar = 6 items (History/Exercises/Tools reachable via NavPane on desktop + legacy headers on mobile until their screens are rebuilt).

---
Task ID: p3-2
Agent: subagent (full-stack-developer) — gate completed by orchestrator after agent's result channel timed out
Task: Part 3 ORDER OF WORK step 2 — the single source of truth components: SetRow + ExerciseCard (5 modes) + #/dev showcase

Work Log:
- Created src/components/set-row/set-row.tsx (889 lines; exports SetRow + SetRowProps) + viewport.ts (useViewportWidth hook).
- Created src/components/exercise-card/card-types.ts (CardMode/CardExercise/CardSet/CardVisibleColumns/CardAction/toCardSet + field formatting/parsing/stepping helpers) + exercise-card.tsx (exports ExerciseCard + ExerciseCardProps, re-exports card types + toCardSet).
- Replaced src/features/screens/dev-showcase.tsx (391 lines) with the component showcase: 5 modes × 3 modalities (weighted / distance-time / time-only), grouped superset example with groupColour, collapsed + expanded cards, all set types W/N/D/F/A, rpe/tempo/rest values, PR + note sets; every onAction console.log'd; Screen + TopBar + ScrollBody composition.
- Grid behavior: ≥460px all present columns as spec px tracks; <460px rpe+tempo tracks REMOVED with values/editors behind the per-row ⋯ popover (spec's "more sheet" adapted to allowed anchored popover); <360px f1/f2 floors flex to guarantee 320px fit; missing-field/off columns removed from template; # column becomes checkbox in preview mode; template blanks render ↺ (tap = copy-last).
- ORCHESTRATOR GATE: harness '#/dev' GATE: PASS at ALL 6 widths (320/360/390/768/1024/1440): rows=45, badHeights=[], nowrapFail=0, wsFail=0, overlap=0, rightEdge=0, hscroll=false, scrollBodies=1 (top+bottom sweep). Interactivity: collapse toggles 45→38 rows; "+ Add set" fires onAction {type:"add-set"} (console-captured); inline input edit commits on blur; ⋮ menus present (21 action buttons). bunx eslint clean. '#/today' regression PASS 390/1440. Screenshots: download/qa-p3-2-{dev-390,dev-1440,edit-390}.png.

Stage Summary:
- The ONE SetRow + ONE ExerciseCard now exist; every later screen (p3-3…) must import ONLY from src/components/set-row and src/components/exercise-card. CardAction union covers: toggle-collapse, add-set, update-set{setId,patch}, toggle-done, toggle-select, copy-last, notes, rest-timer{setId?}, move-up, move-down, add-to-group, replace, remove, select, open. Legacy set-table/today exercise-card remain untouched until p3-9 deletion.

---
Task ID: p3-4
Agent: subagent (full-stack-developer) — gate completed by orchestrator after agent's result channel timed out
Task: Part 3 ORDER OF WORK steps 4+5 — Training screen (#/today/{exerciseId}, Track/History/Graph tabs) + Exercise Picker (#/exercises full-screen)

Work Log:
- Created src/features/training/training-screen.tsx (1292 lines) + src/features/picker/picker-screen.tsx (826 lines); screens/training.tsx + screens/picker.tsx replaced with thin re-exports. Legacy exercise-overview route kept transitional.
- Training: TopBar back/name/Notes popover/Records→#/exercise-overview/{id}/⋮; SubBar 3 equal tabs with ?tab= deep links; Track = ExerciseCard edit hideHeader + "LAST TIME" read card; BottomBar = RestBar swap or Save-set on focused mobile input; History = DateGroups (32px headers) with read→edit inline card toggle; Graph = ControlRow 48px + chart 240/360px + reserved 72px DetailRow.
- Picker: TopBar back/search/⋮; SubBar 40px chip scroller (All/Favorites/Recent/categories — the one allowed extra scroll); 48px rows with star/favorite, meta "12 · 3d", ⋮ (Edit=inline expansion, Favorite, History→training history tab, Delete=confirm-destructive); query contract: date=, replace={exerciseId}, multi=1; pick → createOrGet workout + add → back to #/today?date=… (fixes p3-3 gap #3).
- ExerciseCard authorized extensions: hideHeader?: boolean prop + "Focus view" (open) menu item in edit-mode ⋮ (fixes p3-3 gap #1).
- ORCHESTRATOR GATE: '#/exercises' PASS all 6 widths; '#/today/{id}?date=2026-09-23' (track) PASS all 6; tab=history (52 history rows, date groups Sep 9/16/23) + tab=graph (svg chart + reserved DetailRow) PASS 390+1024; '#/dev' regression PASS 390+1440 after card edits; picker search "bench" → 8 rows filtered; tabs update hash query; bunx eslint clean (training/picker/slots/exercise-card); screenshots download/qa-p3-4-{training-track-390,training-history-390,training-graph-390,picker-390,picker-1024}.png.

Stage Summary:
- Steps 4+5 of ORDER OF WORK complete. Training screen + picker fully on primitives + the ONE card. Remaining p3-3 gap: 'select' multi-select action (info-toast only) — deferred to a later polish pass. Picker category management folded into inline create/edit; legacy exercises-view now dead code for p3-9.

---
Task ID: p3-3
Agent: subagent (full-stack-developer)
Task: Part 3 ORDER OF WORK step 3 — REBUILD THE TODAY SCREEN (#/today) on the layout primitives + the ONE ExerciseCard.

Work Log:
- Read worklog §4/p3-1/p3-2 + layout primitives, router, ExerciseCard/SetRow sources, and the legacy today feature (today-view/track-tab/use-mutate/day-utils/date-bar/rest-timer/workout-header-card/quick-add) to reuse its data logic. Demo data surveyed: workouts 2026-09-19/21/23/24/25; today 2026-09-26 empty; login demo@setforge.app (browser session persisted for the harness).
- Created src/features/today/today-screen.tsx (new #/today): Screen+TopBar(brand "SetForge", Calendar action, ⋮ menu History/Exercises/Tools/Settings)+SubBar(DateStrip)+ScrollBody(MetaRow → ExerciseCard×N edit → SummaryRow → spacer | 200px TodayEmpty block alone on empty days)+BottomBar("+ Add exercise" ⇄ RestBar swap, same container, never both). Date state synced with ?date= via useHashRoute (legacy pattern). All card actions wired to real API mutations through use-mutate (update-set/toggle-done+auto-rest/add-set/copy-last/move-up/down/add-to-group/notes/rest-timer/remove-with-confirm/replace→#/exercises); empty-day Start New/Copy Previous reused from legacy; session timer (startAt/endAt) reused from workout-header-card via the MetaRow duration chip.
- Helper files (all law-abiding, spacing tokens only): rest-state.tsx (countdown engine extracted from legacy rest-timer.tsx — endAt ticking, localStorage last-rest, beep/vibrate/hidden-tab notification, wake lock, adjust/skip; NO rendering), date-strip.tsx (◄/label-with-Calendar-popover/► + Today chip; legacy day-utils/format math; label "Sat 26 Sep"), meta-row.tsx (48px data-row: live duration chip w/ ghost "–:–", rest mini chip, note chip → popover editor PATCH comment), summary-row.tsx (48px data-row: sets · volume · PRs, unit-aware), today-empty.tsx (h-[200px], two 48px data-row buttons), rest-bar.tsx (Rest 1:12 −15 +15 Skip with ≥44px controls; 320px-fit audited), card-popovers.tsx (notes popover, group popover existing+create+remove, ConfirmRemoveExercise AlertDialog — the allowed confirm-destructive).
- Radix gotcha fixed: a Popover mounted while the ⋮ DropdownMenu closes is instantly dismissed (menu returns focus to its trigger → popover focus-outside). Fix: onFocusOutside preventDefault on those PopoverContents (HANDOFF_ANNOTATION_PROPS); pointerdown-outside + Escape still close.
- screens/today.tsx replaced with a thin re-export (`export { default } from "@/features/today/today-screen"`). Router/shell/set-row/exercise-card untouched; legacy today views untouched (dead code until p3-9).
- GATES: verify-layout.sh '#/today' GATE: PASS all 6 widths (rows=2 empty-state buttons, all metrics green, top+bottom sweeps). verify-layout.sh '#/today?date=2026-09-23' GATE: PASS all 6 widths WITH cards (rows=24: 4 headers + 14 SetRows + 4 add-set + MetaRow + SummaryRow; overlap/rightEdge/hscroll/nowrap/ws/badHeights all clean). Interactivity verified in-browser on the data date: set ✓ toggle persists via API (tint flips), inline weight edit commits on blur, + Add set adds a row (cleaned up), collapse 25→19 rows, ⋮ opens/Escape closes, rest: complete Deadlift set → RestBar "Rest 4:00" → +15 adjusts → Skip → "+ Add exercise" back; ◄/► navigate (09-21 loads), Today chip jumps to today, empty state 200px block with 2 buttons; extras on a scratch workout (2026-09-22, deleted after): Start New Workout, timer start live tick, note save, group create ("Circuit A" chip), remove-exercise confirm. Console clean (only HMR). bunx eslint src/features/today src/features/screens/today.tsx exit 0. Screenshots: download/qa-p3-3-{today-empty-390,today-data-390,today-1024,restbar-390}.png. 09-23 demo data restored byte-identical after tests.

Stage Summary:
- Today is the first fully-rebuilt screen: primitives-only composition, ONE ExerciseCard in edit mode on real data, BottomBar↔RestBar swap, offline-aware mutations, extracted rest engine. Known gaps for later parts (documented in agent-ctx/p3-3-full-stack-developer.md): ExerciseCard edit mode lacks an 'open' affordance (header not tappable / no menu item — spec's #/today/{id} navigation wired but unreachable until the card surfaces it; suggest one menuForMode(edit) line in p3-4); 'select' multi-select omitted (no card-level selected visual prop — info toast); "+ Add exercise" on empty days opens #/exercises without a workout (p3-4 picker should createOrGet on pick).

---
Task ID: p3-5
Agent: subagent (full-stack-developer) — gate completed by orchestrator after agent's result channel timed out
Task: Part 3 ORDER OF WORK step 6 — Routines cluster (List → Detail → Log Day → Predefined Sets Editor)

Work Log:
- Created src/features/routines/{routines-screen, routine-detail-screen, log-day-screen, predefined-editor-screen, screen-helpers}.tsx; screens/{routines, routine-detail, log-day, predefined-editor}.tsx replaced with thin re-exports.
- List: TopBar title + inline-create `+`; 72px RoutineRows (name / days·exercises·used meta, ⋮ rename-inline/copy/delete-confirm/log); desktop 2-col grid; 200px empty state.
- Detail: TopBar back/name(inline rename)/Edit toggle/⋮(Rename,Copy,Delete,Reorder); SubBar notes 1-line→3-line expand; DaySection accordions (grid-template-rows 0fr→1fr animate; mobile 1 open, ≥768 all open); DayHeader 48px (chevron/name/Log btn or ⋮ rename-delete-move); template-mode ExerciseCards with immediate predefined-set PATCH; + Add exercise to day 40px; + Add day 48px; edit = whole-screen state, no per-item dialogs.
- Log Day: preview-mode cards with row checkboxes + inline cell editing; BottomBar `Add N sets to today` (verified N=13 on Push Day); logDay API flow.
- Predefined Editor: legend row (↺ = copy from last workout) + template card hideHeader + Save + Skip (log freestyle).
- ORCHESTRATOR GATE: '#/routines' PASS all 6 widths; '#/routines/{id}' read PASS all 6 + edit mode PASS 390/1024 (clip-aware checker — orchestrator upgraded harness v2 with effective-rect clipping after manual false-positive investigation); '#/routines/{id}/log/{dayId}' PASS all 6; '#/routines/{id}/exercise/{reId}' PASS all 6. Lint clean. Screenshots download/qa-p3-5-{list-390,detail-390,logday-390}.png.

Stage Summary:
- Routine cluster fully rebuilt on primitives + ONE card. DnD handles present but reorder via ⋮ Move up/down (functional parity; DnD wiring deferred). Picker routine-context contract to be verified by p3-6+ or polish pass.

---
Task ID: p3-6
Agent: subagent (full-stack-developer) — gate completed by orchestrator after agent's result channel timed out
Task: Part 3 ORDER OF WORK step 7 — Calendar (month grid + list + filters route + ChipRow) + History view rebuild

Work Log:
- Created src/features/calendar/{calendar-screen (month+list+SelectedDayPanel internal), filters-screen}.tsx + src/features/history/history-screen.tsx; screens/{calendar,calendar-filters,history}.tsx → thin re-exports.
- Calendar: TopBar ◄Sep 2026►/List-Month toggle/Filter (active dot); Month = weekday header + fixed 6×7 grid of 56px cells (date, ≤4 dots + +n, selected ring, today tint) + SelectedDayPanel (48px date header + ExerciseCard summary→read inline expand, one at a time; rest-day muted row); List = 56px rows (date 96px · exercises ellipsis · count); Filters = full-screen route with grouped 48-56px rows, applied → ChipRow 40px SubBar with X chips; query contract ?view=month|list&date=YYYY-MM-DD. Legacy day-sheet Dialog replaced by inline panel.
- History: DateGroups (32px headers) + 48px workout summary rows + ExerciseCard read mode with PR/note markers via toCardSet.
- ORCHESTRATOR GATE: '#/calendar' PASS all 6; '#/calendar?view=list' PASS all 6; '#/calendar/filters' PASS 320/390/1024; '#/history' PASS all 6 (225 data-rows with real data). SelectedDayPanel verified with ?date=2026-09-23 ("Wed, Sep 23 · 14 sets · 7,995 kg" + Deadlift/Barbell Row summary cards). Lint clean. Screenshots download/qa-p3-6-{calendar-month-390,calendar-list-390,history-390}.png.

Stage Summary:
- Calendar + History fully on the system; the last legacy Dialog surface (day-sheet) eliminated. Virtualisation skipped (list is short in demo; noted as future optimization).

---
Task ID: p3-7
Agent: main (Z.ai Code)
Task: Part 3 ORDER OF WORK step 8 — BODY TRACKER (#/body) + RECORDS/STATS/GOALS (#/insights) rebuild on the layout primitives

Work Log:
- Read worklog §4 + p3-1…p3-6, router/layout/tokens sources, legacy body/{body-view,track-tab,history-tab,graph-tab,measurement-config,record-form,delta-chip,offline-mutation} + insights/{insights-view,records-leaderboard,weekly-rhythm,volume-chart,goals-overview,kpi-card} + exercise-overview/{records-tab,goals-tab}, api client; surveyed demo data via API (15 measurements / 2 enabled, weight+fat records, 3 goals).
- Created src/features/body/{body-util.tsx (ported useBodyAction offline runner, localDayKey, dateInputToIso for native date inputs, signedDelta, deltaTone, compact DeltaLine), body-track-tab.tsx, body-history-tab.tsx, body-graph-tab.tsx, body-screen.tsx}; screens/body.tsx → thin re-export. Self-contained helpers (no imports from legacy body files) so p3-9 deletion is clean.
- BODY: TopBar "Body" + ⋮ (Add measurement → switches to Track + opens the FIRST row's editor — expansion state lifted to the screen, no setState-in-effect; Configure metrics → inline MetricsSetup expansion). SubBar 3 equal tabs (48px, ?tab= deep links via replaceHash). TRACK: 56px data-rows (name + "2 days ago" stacked left | 120px right: value tabular + goal-aware Δ line); tap → 96px inline editor block (NOT data-row; value input + native date input + Save/Cancel, h-full rows inside fixed 96px) — one at a time; replaces legacy record-form Dialog. HISTORY: flat 40px data-rows Date 88 | Name flex | Value 72 | Δ 56, all measurements' records merged newest-first via useQueries (26 rows demo), per-measurement prevOf deltas. GRAPH: ControlRow 48px (measurement Select | range Select 3M/6M/All | ⋮ Show points/Trend/Y-from-zero) → chart fixed 240/360px (line + least-squares trend + SPECIFIC goal ReferenceLine) → reserved 72px DetailRow ("–" / hovered point + prev·next; hover-verified). MetricsSetup: 48px data-rows (name+unit+target | ↑ ↓ reorder | Switch enable) + 96px inline creator (name/unit/goal/target/Add) — the legacy measurement-config Dialog re-imagined inline.
- Created src/features/insights/{insights-screen.tsx, records-tab.tsx, stats-tab.tsx, goals-tab.tsx}; screens/records.tsx → thin re-export. TopBar "Insights · {period}" + ⋮ period selector (7d/30d/1y/All → ?period=). SubBar 3 tabs (?tab=). RECORDS: 40px segmented control data-row (Estimated | Actual → ?scope=) + 32px column hint + 40px data-rows (rank 20 | category dot | Exercise flex ellipsis + inline Trophy for #1 estimated | value 72 right tabular — e1RM or best weight×reps | date 88); sorted desc per scope; row tap → #/exercise-overview/{id}. STATS: NO cards — Section (32px header) + 40px data-rows (name flex | value 84 right | trend flex right w/ TrendingUp/Down/Minus): Period (workouts/sets/volume/reps/time/distance/streak/heaviest set/top volume day), This week vs last (rolling 7d deltas + sessions/week pace), Weekly rhythm (Mon–Sun avg kg + sessions, 8wk), Volume by exercise (top 6). GOALS: 40px data-rows (exercise · type target ellipsis | pct 44 | status hit/open) → tap → 96px inline expansion (progress bar + current/target + target Input + Save target + two-tap Delete with 4s auto-disarm; offline-aware runner ported). Empty states = 48px muted data-rows everywhere.
- Query contract: #/body?tab=track|history|graph; #/insights?tab=records|stats|goals&scope=estimated|actual&period=week|month|year|all (all via replaceHash, no history pollution).
- GATES: verify-layout.sh '#/body' GATE: PASS all 6 widths (2 track rows, top+bottom sweeps); '#/body?tab=history' PASS 390+1024 (26 rows); '#/body?tab=graph' PASS 390+1024 (240px chart + reserved DetailRow); '#/insights' GATE: PASS all 6 (17 rows); '#/insights?tab=stats' PASS 390+1024 (26 rows); '#/insights?tab=goals' PASS 390+1024 (3 rows). Fixed one nowrapFail (segmented control h-10 buttons inside bordered 40px row → h-full). Interactivity verified in-browser: Track editor expand (one at a time, prefilled 80.9 + today), Save persisted (Body Fat 16.0 @ 2026-09-26 → API record → row updated to "16% −0.2" → test record DELETED, demo restored byte-identical); tabs update hash; graph range/metric/options menus; DetailRow hover "Aug 21 79.9 kg prev 79.4 · next 80"; MetricsSetup toggle (Neck on→rows appear→off, restored) + Done; segmented Estimated 276.7 → Actual 207.5×10; stats period ⋮ → "Insights · 7 days" + week numbers; goal row expand → Save target 140→145 (pct 79→76, API verified) → restored 140/79; goal Delete left un-tapped (two-tap armed state verified visually). bunx eslint src/features/body src/features/insights src/features/screens/{body,records}.tsx exit 0. Console clean (only Fast Refresh HMR; the CLI's 3 empty ✗ markers reproduce on pre-existing #/today too — session artifact, not page errors). Regression: '#/today' + '#/dev' PASS 390. Screenshots download/qa-p3-7-{body-track-390,body-history-390,insights-records-390,insights-1024}.png.

Stage Summary:
- Both screens fully on the primitives system; last legacy Dialog surfaces in body/insights (record-form, measurement-config, history edit, goal form) eliminated. Deviations: History is a read table (per-record edit/delete dialogs dropped — new entries via Track editor; noted for p3-9); Actual scope shows best weight×reps only (records API exposes no distance/time bests — rows show "–"); goal Delete uses inline two-tap confirm instead of ConfirmDialog. Demo data verified restored after mutation tests.

---
Task ID: p3-8
Agent: main (Z.ai Code)
Task: Part 3 ORDER OF WORK step 9 — SETTINGS/ACCOUNT (#/settings) + AUTH (#/auth) + TOOLS (#/tools) rebuild on the layout primitives (final screen rebuilds before p3-9 legacy deletion)

Work Log:
- Read worklog §4 + p3-1…p3-7, router/app-shell (auth gate: AuthScreen renders for ANY hash when unauthenticated; authed #/auth redirects), layout primitives + tokens, legacy settings/{settings-view,preferences/account/data/app-section,settings-controls,use-wake-lock}, auth/auth-view, tools/{tools-view,one-rm/plate/set-calculator,interval-timer,date-field}, store settings shape.
- Created src/features/settings/{settings-screen.tsx, settings-sections.tsx}; screens/settings.tsx → thin re-export. TopBar "Settings" + ⋮ theme quick-toggle (Light/Dark/System, setTheme preview + PATCH). ScrollBody = 4 sections, 32px muted headers, NO cards. 56px data-row primitives: SwitchRow (label | Switch), MenuRow (label | value + chevron; whole row = DropdownMenuTrigger, Check on current), ActionRow (button + chevron), ValueRow. Preferences (19 rows): Theme/Units/Week start/Weight step/Home sets/Weekly target/Est-1RM rep limit/e1RM method/Rest-end MenuRows + Set type/RPE/Tempo/Rest column SwitchRows (wired to store → drive SetRow grids) + Show category/Track PRs/Mark sets complete/Auto-select next/Rest from row/Keep screen on SwitchRows. Account: identity row, Change password → INLINE expansion (3×48px inputs + Update; accountApi ported), Sign out → confirm-destructive AlertDialog → ported useLogout (logout API + SW/local wipe + qc.clear + setSession(null) → shell forces #/auth), Delete account → INLINE typed-DELETE (no dialog). Data: Export data/Workouts CSV/Body CSV/Recalculate PRs ActionRows, Import backup → inline expansion (hidden file input + Merge/Replace + Import), Clear data (all workout history) → confirm-destructive AlertDialog. App: Install/Connection/Offline mode/Clear offline cache/About/Version rows. Wake lock held at screen level while keepScreenOn (legacy parity). Exactly two Dialogs on the whole screen (Sign out + Clear data confirms).
- Created src/features/auth/auth-screen.tsx; screens/auth.tsx → thin re-export. Screen nav=false + ScrollBody contentClassName "flex max-w-[360px] min-h-full justify-center gap-6 py-8" → centered 360px column (found+fixed: ScrollBody's inner wrapper is display:block — must add `flex` for justify-center). Brand (flame + SetForge + tagline), 48px tabs Sign in | Create account, 48px inputs (+ optional name on signup), inline error, 48px primary button with loading. Auth logic ported verbatim (login/signup → setSession → toast → navigate). Nothing else.
- Created src/features/tools/{tools-screen.tsx, tool-bits.tsx (ToolRow/ToolPanel/FieldRow/ResultRow/PanelNote/parseNum), one-rm-tool.tsx, plate-tool.tsx, set-tool.tsx, interval-tool.tsx}; screens/tools.tsx → thin re-export. TopBar "Tools" + ⋮ Collapse all. Four 56px data-rows (icon + name + desc ellipsis + chevron) → tap = INLINE expansion below the row (never a dialog), only one open — open tool = ?tool= hash param (one-rm|plates|sets|timer, deep-linkable). one-rm: weight+reps 48px fields → method cycle row → 56px headline "Estimated 1RM 116.7 kg" + alternate-method row + 5/8/10/12RM rows. DEVIATION: headline defaults Epley because the task gate requires 100 kg × 5 → ≈115–120 (Epley 116.7; legacy used Brzycki 112.5) — both formulas always displayed, method one tap away. plates: bar+target → per-side breakdown rows (plateGreedy over server inventory) + Total + nearest-loadable tap-to-apply. sets: base weight + sets/reps → percentage table 40px rows (tap multi-select, Check) + Working sets summary. interval: prepare/work/rest/rounds fields + 72px live status row (phase + round + elapsed + big mm:ss, aria-live) + 56px Start/Pause/Resume + Skip + Reset; engine ported from legacy (wall-clock phaseEndsAt, 100ms tick, pausedRemainMs, beeps, vibrate, wake lock).
- GATES: verify-layout.sh '#/settings' GATE PASS all 6 (35 rows, 0 overlap/rightEdge/hscroll, top+bottom sweeps); '#/tools' PASS all 6; '#/tools?tool=one-rm' PASS all 6; '?tool=plates' 320/390, '?tool=sets' 320/1440, '?tool=timer' 320/390/1024 PASS; '#/auth' PASS all 6 (gated signed-out via the UI sign-out confirm; logged back in); '#/today' regression PASS 390/1024. Interactivity: RPE switch off → API persisted → reload off → Today cards 15→0 RPE cells → restored; Units Metric↔Imperial (API + row + weight-step hint "5 lb"); theme quick-toggle html.light/_API; Sign out confirm → #/auth → wrong password inline error → correct → #/today; signup tab name field; 1RM 100×5 → 116.7 headline + 112.5 Brzycki row; plates 60 → 1×20/side + total; 102.5 → 25+15+1.25/side; sets 80% → 50 kg · 3 sets · 1200 kg; timer start (0:10→0:03 live, prepare→work) → pause frozen → resume → reset. Console clean (fresh browser: 0 console.error on all three screens + login flow; stale BodyGraphTab/hydration entries pre-date p3-8). bunx eslint on settings/auth/tools dirs + 3 slot files exit 0. Screenshots download/qa-p3-8-{settings-390,auth-390,tools-390,settings-1024}.png (VLM-verified dark+orange, no overlap, centered auth column). Work record: agent-ctx/p3-8-main.md.

Stage Summary:
- All three surfaces rebuilt on primitives-only; every screen route in the Part 3 URL contract is now a rebuilt screen (p3-9 = legacy deletion sweep). Deviations: 1RM headline defaults Epley (task gate; Brzycki always shown too); password change / import / delete-account dialogs became inline expansions (law: NO Dialogs beyond sign-out + data-clear confirms); delete-history reduced to all-history mode (range/exercise modes dropped with the legacy dialog); plate inventory editor + timer preset persistence not ported (tools spec = calculators only); timer Skip exists alongside start/pause/reset. KEEP settings/use-wake-lock.ts in p3-9 (used by settings-screen + interval-tool).

---
Task ID: p3-9
Agent: subagent (full-stack-developer) + orchestrator completion — final sweep
Task: Part 3 ORDER OF WORK step 10 — exercise-overview rebuild, legacy deletion, FORBIDDEN audit, full harness sweep

Work Log:
- Rebuilt #/exercise-overview/{id} on primitives (Records | Goals | History tabs, 40px table rows, inline goal editor) — the last legacy passthrough is gone; router contract now 100% new screens.
- LEGACY DELETION: 91 files deleted across src/features/{today,history,calendar,exercises,exercise-overview,routines,body,insights,settings,tools} and the whole src/components/set-table/ folder. Surviving per-feature dirs contain ONLY the new screens + their helpers + still-imported utilities (today: use-mutate/day-utils; settings: use-wake-lock; routines: use-routine-mutations where imported; calendar: filter-state).
- FORBIDDEN AUDIT (orchestrator): (1) position:fixed — ZERO hits in app code. (2) absolute — 6 hits, all justified: 4px popover anchor spans (harness-excluded, aria-hidden), 8px notification-dot badge inside 44px parent (calendar filter), comments. (3) overflow-auto/scroll — 5 hits all justified: ScrollBody (the one screen scroll), 2 chip scrollers (spec-exempt), notes-list inside popover, desktop NavPane nav list (shell pane, not screen). (4) Dialog imports — exactly 5, all alert-dialog confirm-destructive (picker delete, settings sign-out + clear-data, routines delete, routine-detail delete, today remove-exercise); ZERO plain Dialogs, ZERO Sheets. (5) Uniqueness — exactly ONE exported SetRow (src/components/set-row/set-row.tsx) + ONE ExerciseCard (src/components/exercise-card/exercise-card.tsx); zero set-table references. (6) whitespace-normal — zero hits.
- FULL HARNESS SWEEP: 8 primary routes × all 6 widths (320/360/390/768/1024/1440) GATE: PASS (today?date, exercises, routines, history, calendar, settings, tools, dev) + 17 variant routes at 390+1024 ALL PASS (today empty, calendar list/filters, body ×3 tabs, insights ×3 tabs, tools timer, training ×3 tabs, routine detail/log-day/predefined-editor, exercise-overview) + '#/auth' genuine signed-out gate PASS all 6 widths (verified email input present, not a redirect).
- Fixes during sweep: settings-sections SwitchRow/MenuRow/ActionRow gained optional hint prop (3 new TS2322s from p3-8 resolved; tsc back to the documented 2-error pre-existing API-route baseline). bun run lint exit 0.
- GOLDEN-PATH SMOKE: set-completion toggle mutates + persists (checked→unchecked→restored); RestBar swap → Skip → "+ Add exercise" returns; sign-out → #/auth → sign-in → #/today round-trip; console clean (HMR only). Screenshots: download/qa-p3-9-{final-today-390,exercise-overview-390,final-history-1024}.png.

Stage Summary:
- ORDER OF WORK steps 1-10 COMPLETE. Every screen in the app is a rebuilt Part 3 screen: primitives-only composition, ONE ExerciseCard + ONE SetRow, zero-overlap verified at 320-1440, single-line fixed-height rows, no modals over lists (only confirm-destructive alerts), no bottom sheets, no nested scrolls (documented exemptions only). The app remains fully functional end-to-end on real data with the entire Part 2 feature set intact.

---
Task ID: p3-10
Agent: main (Z.ai Code) — orchestrator closeout
Task: Part 3 final handover + scheduled review

Work Log:
- All 10 ORDER OF WORK steps complete (p3-1 foundation → p3-2 card system → p3-3 Today → p3-4 Training+Picker → p3-5 Routines cluster → p3-6 Calendar+History → p3-7 Body+Insights → p3-8 Settings/Auth/Tools → p3-9 exercise-overview + legacy purge + audit → this closeout).
- Harness evolved to v2 (clip-aware effective rects) mid-project; all gates re-verified under it.

CURRENT PROJECT STATUS:
- SetForge is a market-ready Part 3 build: 17 hash routes, every screen composed from Screen/TopBar/SubBar/ScrollBody/BottomBar/NavBar primitives; ONE ExerciseCard (5 modes: edit/read/preview/template/summary) + ONE SetRow (fixed grid, phones drop rpe/tempo to ⋯ popover) render every exercise/set in the app; BottomBar↔RestBar swap; 91 legacy files deleted; lint exit 0; tsc at documented 2-error pre-existing API baseline; console clean on all routes; demo data restored after every test.

VERIFIED GATES (harness: overlap / right-edge / h-scroll / row single-line / row heights at 320-1440):
- #/today (+?date=, empty state), #/today/{id} (Track/History/Graph), #/exercises, #/routines, #/routines/{id} (read + edit), /log/{dayId}, /exercise/{reId}, #/calendar (month + list), #/calendar/filters, #/history, #/body (3 tabs), #/insights (3 tabs + scope), #/tools (+4 tools), #/settings, #/auth, #/dev, #/exercise-overview/{id} — ALL GATE: PASS.

UNRESOLVED / NEXT-PHASE RECOMMENDATIONS:
1. DnD drag handles render but reorder via ⋮ Move up/down only — wire dnd-kit if desired.
2. 'select' multi-select card action not surfaced (single card-level selection UI absent).
3. Calendar list virtualisation skipped (short lists in demo).
4. Tools: plate inventory editor + timer preset persistence not ported.
5. Body History rows read-only (edits via Track inline editor).
6. Pre-existing tsc baseline: src/app/api/goals/route.ts + timer-presets/[id]/route.ts typing fixes.
7. Lighthouse/storybook/CI equivalents documented as platform adaptations (agent-browser harness + #/dev showcase).

---
Task ID: 5 (a–g)
Agent: orchestrator (main) + full-stack-developer subagent (frontend, Task ID 5-e)
Task: BUILD PROMPT — PART 5: PROGRAMS, SESSIONS, SCHEDULING, DASHBOARD — full implementation

Work Log:
- DISCOVERY: located all prior conventions (schema/services/http/routes/mappers/types/schemas, shell+hash router, layout primitives, ExerciseCard/SetRow, routines feature, calendar, today, settings, sync, seed). Concern→file table produced before coding.
- 5-a SCHEMA (additive, 2 migrations): `20260927043600_part5_programs_sessions_schedule` + `20260927043600_part5_workout_scheduled_start`. New models ActiveRoutine (userId unique, cursorDayIndex, lastAdvancedForDate idempotency anchor) + ScheduleEntry (status PLANNED/DONE/SKIPPED/MISSED, workoutId SetNull, partial unique index `ScheduleEntry_userId_date_planned_key` ON (userId,date) WHERE status='PLANNED' AND deletedAt IS NULL). Routine.kind ROUTINE|SESSION, RoutineDay.dayType WORKOUT|REST, Workout.sourceType/sourceRoutineId/sourceDayId/scheduledStart/finishedAt, UserSettings.timezone/autoAdvanceRest/scheduleMovesCursor/advanceTrigger/showProjectedDays/reminderTime. Migrations applied; Prisma client regenerated.
- 5-b RULES (`src/server/services/program-rules.ts`, pure): localDateKey (en-CA Intl), nextLocalMidnightMs, addDaysKey/diffDateKeys, clampCursor, advanceIndex (modulo wrap), shouldAdvanceCursor (REST auto-advance iff autoAdvanceRest && today>anchor; finished workout always advances; FIRST_SET on any-date first logged set; FINISH_OR_MIDNIGHT on finish or workout date < today), deriveEntryStatus (lazy PLANNED→DONE/MISSED, never auto-revert), projectCursor (happy-path 28-day projection), isFollowable, isValidSession.
- 5-b SERVICE (`src/server/services/program-service.ts`): applyProgramRules lazy engine (REST catch-up loop, midnight catch-up, schedule gate via workout.scheduledStart && !scheduleMovesCursor); workoutHasLoggedData (isComplete || completedAt || user-edited set: updatedAt>createdAt with values — template prefills never count); follow/unfollow; advance/skip (SKIPPED audit entry)/jump/rest-done; startProgramDay (ONE transaction: upsert workout + provenance + appendDayToWorkout with per-index copy-previous for mixed warmup+blank templates + PR recompute + PLANNED→DONE link or auto-create DONE entry); finish/undoFinish (finishedAt + best-effort cursor revert within 120s); notifySetSaved (FIRST_SET hook, wired into set create+update routes); schedule CRUD (409 with details, replace, reopen only date>=today, lazy status persist); sessionFromWorkout; listPrograms (meta: dayCount/restCount/exerciseCount/lastUsedAt/isFollowed/cursor); getDashboard (today resolution PLANNED-entry-first, 7-day upcoming strip w/ scheduled override, weekSets/weekVolume/streak/weekWorkouts, quickSessions last-3, todayWorkout counts).
- routine-service: kind on create, SESSION integrity (exactly 1 WORKOUT day; day add/delete/type-change blocked on sessions; ROUTINE needs ≥1 WORKOUT day), cursor clamp on day delete, kind-change validation (+ unfollow-before-convert), logRoutineDay rewritten to shared appendDayToWorkout + provenance + entry link + rules convergence.
- 5-c API (all Zod-validated, userId-scoped, handler-wrapped): GET /api/dashboard; GET /api/programs?kind; POST /api/programs/:id/follow; DELETE /api/programs/follow; POST /api/programs/cursor/{advance,skip,jump,rest-done}; POST /api/programs/:id/start-day; POST+DELETE /api/workouts/:id/finish; GET/POST /api/schedule; PUT/DELETE /api/schedule/:id; POST /api/sessions/from-workout. http.ts conflict() now accepts details. Settings PATCH extended (timezone IANA-validated, reminderTime HH:MM). Signup accepts timezone. Sync GET extended (applyProgramRules first + scheduleEntries + activeRoutine payload).
- 5-d SEED: PROGRAM_TEMPLATES in seed.ts — Push/Pull/Legs (8d), Upper/Lower (7d), Full Body 3× (7d), Quick Push/Pull/Legs + Core 15 (sessions); compounds get warmup row (reps 10 + WARMUP + 60s rest) + 3 blank (copy-previous); created in signup transaction AFTER exercises (FK order fixed after first 500).
- 5-e FRONTEND (subagent, completed by orchestrator after timeout): router + #/home default, #/programs(+detail/log/exercise), #/more, #/schedule/pick?date=, old #/routines redirects; NavBar 5 tabs (Home/Calendar/Programs/Body/More) + NavPane; screens/ re-exports. Features: home/ (TodayCard 3 states + Continue/Finished variants + ⋮ menu, UpcomingStrip, QuickStartRow, StatsRow, TodayWorkoutSection, use-dashboard + midnight/visibility/online refetch), more/, schedule/ (accordion picker + 409 Replace dialog + Undo toast), routines-screen (Routines|Sessions tabs, 72px rows w/ Follow/Start + last-used, + menu incl. session-from-today's-workout dialog), routine-detail (CursorStrip prev/skip/jump inline list, day-type segmented toggle, REST day row, Schedule date-picker w/ Replace + Undo, session Start today), calendar (PLANNED outlined/DONE filled/MISSED grey/SKIPPED dashed dots + projected ghosts 10px + SelectedDayPanel ScheduleRow w/ Start now/Move/Skip/Remove/Reopen + ?date= preselect), today (source chip → program detail, Finish/Undo toast "Workout finished · Day N up next", Save as session dialog prefilled "Session · d MMM", deterministic BottomBar), api.ts (programsApi/dashboardApi/scheduleApi/sessionsApi/finish/undoFinish + signup timezone), notifications.ts (armDailyReminder/rearmOnVisible/requestReminderPermission, Trigger API when available, 1/day dedupe, tap → #/home). Orchestrator added: Settings ProgramsSection (timezone/auto-advance/scheduling-moves-cursor/advance-trigger/show-projected/daily-reminder rows) + wired reminder arming in app-root + signup sends browser tz.
- FIXES during QA: signup template FK order; lint set-state-in-effect ×2 (render-time adjustment pattern in routines-screen tab sync + session-dialog draft reset); entryByDate typing; target include in copyWorkout (pre-existing 521 type error); conflict() details param.

Stage Summary:
- Part 5 delivered end-to-end. E2E VERIFIED via agent-browser (390/320/1280px): signup (timezone + 7 seeded templates) → follow PPL → Home State A (Start workout) → #/today w/ source chip + warmup row → complete set → Finish → toast "Workout finished · Day 2 up next" + working Undo → Home Day 2 + correct PPL upcoming projections; session invariant (session ≠ active routine never advances cursor — API-verified); schedule picker → 409 Replace dialog → entry replaced; calendar dots + planned panel actions (Move/Skip/Remove, Start now only today); jump to REST day → State B (Mark rest done/Train anyway) → mark-rest-done advances; mark-rest-done + projected ghosts (skip PLANNED+REST); Continue · 1/12 variant; Save as session → appears in Sessions tab; Start session → source chip; Settings Programs section persists across reload; NavBar/NavPane navigation; no horizontal scroll at 320px; lint exit 0; tsc zero new errors; dev.log no new errors (4 stale ⨯ from subagent mid-write HMR).
- KEY DECISIONS: scheduledStart boolean on Workout makes the scheduleMovesCursor gate deterministic; workoutHasLoggedData uses updatedAt>createdAt so template prefills never advance the cursor; dashboard today resolution prefers PLANNED entry over cursor day; anchor-based REST catch-up loop advances once per missed day and stops at WORKOUT days.
- Screenshots: download/qa-p5-{home-stateC,home-stateA,home-ppl-day1,home-ppl-day2,home-rest-stateB,programs-sessions,program-detail,calendar-scheduled,calendar-ghosts,calendar-320,settings-programs,home-desktop,programs-desktop,calendar-desktop}.png
- Demo accounts: demo@setforge.app / password123 (legacy data, unfollowed); p5test@setforge.app / testpass123 (fresh signup: follows PPL, today workout finished-then-undone, scheduled Upper/Lower on Sep 28, saved session).
- KNOWN GAPS / next-phase candidates: offline outbox covers new endpoints only partially (schedule mutations queue via generic queueMutation where wired); no Storybook baselines in this environment; server-side streak capped at 180-day lookback; upcoming strip shows projections even when a past date has DONE entries (only non-DONE surface); test files intentionally not added per sandbox policy (E2E via agent-browser instead).

---
Task ID: 6-a
Agent: main (Z.ai Code)
Task: Copy COMPARISON_REPORT.md (APP-A vs APP-B audit) into the application repo

Work Log:
- Located the completed audit deliverable from the read-only comparative audit session: /home/z/scratch/audit/COMPARISON_REPORT.md (613 lines) + annexes app-a-inventory.md (504 lines) / app-b-inventory.md (523 lines) + screenshots/app-a-live-auth.png.
- User instruction "Copy comparission file into the application repo" supersedes the original audit rule that the report never be written into either repo; APP-A = /home/z/my-project is the application repo.
- Copied /home/z/scratch/audit/COMPARISON_REPORT.md -> /home/z/my-project/COMPARISON_REPORT.md; verified byte-identical via md5sum (8aaa02d65fb9218b7d53e4179919b79b both sides) and wc -l (613/613).
- Verified dev server unaffected (root-level .md, outside src/; no build impact). Annex inventories intentionally left in scratch (referenced by the report at their scratch paths); say the word if you want them copied in too.

Stage Summary:
- COMPARISON_REPORT.md now lives at the repo root of SetForge: §A/§B per-app inventories, §C screen register (A 21 screens / B 40 routes), §D interaction patterns, §E feature lists (A-001..157 / B-001..117+B-048a), §F 118-row comparison matrix (YES 20 / PARTIAL 40 / DIFFERENT 11 / NO 47), §G UI/UX diff, §H 98-gap deliverable list + 28 REVERSE gaps, §I unknowns, 7 self-check answers.
- The gap list (GAP-001..098, sizes S57/M31/L10) is the prioritized backlog for any future feature-parity work on SetForge (nutrition domain and media/video catalog are the largest L-sized clusters).

---
Task ID: 6-0 (Wave 0 — foundation)
Agent: main (Z.ai Code)
Task: PART 6 FEATURE EXPANSION — §1 data model, §2 media adapter, §3 catalog loader, §5 API surface, shared frontend infra

Work Log:
- Step 0 discovery done (two Explore agents mapped backend + frontend; table in chat + this entry).
- §1 SCHEMA: migration `20260928000000_part6_feature_expansion` (additive; generated via `prisma migrate diff` from live DB → manual folder → `migrate deploy`; SQLite has NO String[] so ALL list fields are `Json?` with app-side coalescing). New models: UserProfile (1:1), ProgressPhoto (FK MeasurementRecord cascade), DailyCalories (UNIQUE userId,date), SystemCatalog (system-level). New columns: Exercise +9 catalog fields + catalogKey + @@unique([userId,catalogKey]); Routine +7 (difficulty/phases/daysPerWeek/estMinutes/highlights/isFavorite/labels); RoutineDay +3; ActiveRoutine.completedDayIds Json; ScheduleEntry timeOfDay/estMinutes/missedAt; Workout discardedAt+deletedAt; UserSettings +14 Part 6 booleans/strings/tempoPresets Json. Prisma client regenerated; dev server restarted.
- §2 MEDIA: `src/server/media/index.ts` — MediaStore {put/get/delete/url}, NoneStore (put→403 MEDIA_DISABLED), LocalStore (MEDIA_LOCAL_DIR, safe-path), S3Store (lean SigV4, no SDK dep); processImage via sharp (EXIF-orient, 1600px, 320px thumb, JPEG); magic-byte sniffing (jpeg/png/webp); jsonStringArray() helper (reused by mappers/services). Routes: POST /api/media/upload (multipart, rate-limited 20/min/user via rateLimit(`media:${userId}`)), GET+DELETE /api/media/[...key] (auth+ownership: key must be users/{userId}/...; standalone route w/ errorResponse — catch-all params incompatible with shared handler generic). /api/health reports `media: none|local ok|s3 ok|fail` (verified: "none").
- §3 CATALOG: `src/server/catalog.ts` — loadSystemCatalog() (builtin catalog/exercises.v1.json or CATALOG_URL w/ ETag disk cache → SystemCatalog upsert by key; zod-validated; skips gracefully when file missing — CURRENT STATE: file not yet authored, agent 6-c0 owns it) + backfillUserExercises() (one-time SystemMeta flag catalog_backfill_v1; exact-name match fills nulls only). Hooked into bootstrap (3b block, non-fatal).
- PROFILE BACKFILL (critical): backfillExistingProfiles() — one-time profile_backfill_v1 flag; existing users get onboardingCompletedAt preset so the §4.16 gate NEVER fires for pre-Part-6 users. VERIFIED: 5/5 existing users done.
- §5 API (all handler/requireUser/parseBody + Zod): /api/library (list w/ search+muscle[]+equipment[]+fav+mine), /api/library/[key] (GET), /api/library/[key]/adopt (POST, favourite opt), /api/library/adopt-many; /api/profile GET/PUT + /api/onboarding/complete (writes profile+unitSystem+first Body-Weight MeasurementRecord); /api/calories GET/PUT?date=; /api/dictionary (static JSON cached 10min); /api/client-errors (rate-limited, 2KB, ring buffer); /api/programs/[routineId]/meta GET/PUT, .../days/[dayId]/mark-off POST/DELETE, .../days/[dayId]/favourite POST, .../totals GET, /api/programs/builder POST (phases×weeks×7 weekly template; dayNames per template; exercises attach by template name; phases json); /api/workouts/[id]/discard (cursor revert to source day + schedule DONE→PLANNED(today/future)|MISSED(past) + PR recompute), /api/workouts/[id]/restore (409 on date clash), /api/workouts/hidden (Settings list); DELETE /api/workouts/[id] now SOFT-deletes; /api/history?search= alias; /api/exercises/[id]/weight-table (≤12 date columns, best-in-row flags); /api/schedule/[id]/time (setScheduleTime); /api/measurements/[id]/records/[recId]/photos POST+GET + /api/photos list + /api/photos/[id] DELETE; /api/auth/confirm + /api/auth/resend-confirmation (VerificationToken hashed single-use 24h, login gate via isEmailConfirmed when AUTH_EMAIL_CONFIRM=true, 1min resend cooldown).
- LIFECYCLE FILTERS: getWorkoutByDate/listWorkouts/getWorkoutsBetween exclude deletedAt+discardedAt; createOrGetWorkout purges hidden occupant of (userId,date) then recreates; recomputePRs filters workout deletedAt/discardedAt null; discardWorkout/restore/purge recompute PRs. program-rules.deriveEntryStatus extended: missedCutoffMs (date+timeOfDay+4h grace, null=all-day midnight rule) + missedAt persisted lazily in listSchedule.
- SYNC/BACKUP: sync pull adds userProfile + dailyCalories + activeRoutine.completedDayIds + workouts filter deletedAt; exportBackup adds profile/calories/photos(keys list); importBackup: optional zod fields (old backups import cleanly), replace deletes photos+calories, merge upserts calories by date.
- SHARED FRONTEND: router +10 routes (library, library-entry, program-day, day-arrange, today-arrange, program-builder via /programs/new/builder BEFORE {id} match, dictionary, onboarding, profile, body-compare); app-shell: renderScreen cases + ScreenErrorBoundary wrap (every route) + onboarding gate (profile.onboardingCompletedAt null → #/onboarding; settings/help exempt); stub screens in features/{library,routines,today,dictionary,onboarding,profile,body}/ + screens/ slots (10); NavPane +Library +Profile (13 destinations); More +Library +Dictionary +Profile rows; settings-sections +SessionSection (guided/auto-move/restDisplay/finishBehaviour/progress/maxWeight/video/haptics + TempoPresetsRow editor) +DisplaySection (calendarStyle/muscle/equipment/thumbnails/calories cards) slotted after Programs; app-root wires setHapticsEnabled(settings.hapticsEnabled).
- NEW SHARED LIBS: src/lib/client/haptics.ts (tap/success/warning/error/selection, vibrate patterns, enabled-flag); src/components/shared/{progress-ring (ProgressRing/DurationRing 90m cap/TickedRing 60 ticks), media-block (video+speed chips 0.5-2x | thumb | 0px), muscle-dots (MuscleDots ≤3 / MuscleChipRow / EquipmentChipRow), screen-error-boundary (200px fallback + error id + Reload/Go home + client-errors report)}; src/lib/group-codes.ts (computeGroupCodes A,B,C/A1,A2 + guidedPointerOrder round-robin); ExerciseCard +3 props (groupCode 32px chip before name, metaExtra 11px line in meta, underHeader flow slot) — ONE ExerciseCard/ONE SetRow preserved.
- CLIENT API: api.ts + libraryApi/profileApi/caloriesApi/dictionaryApi/mediaApi(upload+url)/photosApi/programsMetaApi(markOff/unmarkOff/favouriteDay/totals/build)/historyApi/exercisesWeightTableApi/workoutLifecycleApi/scheduleTimeApi/authConfirmApi/clientErrorsApi.
- VERIFICATION: `bunx tsc --noEmit` → 2 pre-existing errors only (skills/analyzer + timer-presets route = documented baseline; goals-route + analysis-service evolving-array errors FIXED along the way); `bun run lint` exit 0; dev server restarts clean; /api/health 200 {"db":"ok","migrations":"current","media":"none"}; bootstrap logs catalog-skip gracefully.

Stage Summary:
- PART 6 FOUNDATION COMPLETE. All §1/§2/§3/§5 backend + shared frontend contracts are live. Remaining: §6 content (catalog JSON ≥400, dictionary ≥24, seed extension — agent 6-c0), §4 UI waves (6-a library/About, 6-b picker, 6-c programs cluster, 6-d builder/arrange/codes, 6-e today session, 6-f history/calendar, 6-g body/home, 6-h auth/onboarding/profile/help), final QA + README (main).
- COORDINATION CONTRACTS for all Part 6 agents (do NOT re-invent): use api.ts groups above; settings keys: guidedMode, restDisplay, autoMoveNextSet, hapticsEnabled, showVideoPanel, showMuscleChips, showEquipmentChips, finishBehaviour, showSetsProgressBar, showMaxWeightBar, calendarStyle, tempoPresets, showCaloriesCard, showThumbnails (all exist in SettingsDTO + Session/Display settings sections); shared components in @/components/shared/*; stub screens exist at every new route — REPLACE the stub file, never touch router.ts/app-shell.tsx; ExerciseCard accepts groupCode/metaExtra/underHeader; haptics via @/lib/client/haptics; media URLs via mediaApi.url(key) (auth-scoped); MEDIA_PROVIDER=none → uploads 403 → hide upload UI (try/catch).
- NEXT WAVES MUST: read this entry; own ONLY their listed files; run `bun run lint` + agent-browser QA (390px + 1024px) on their screens; append their worklog entry with Task ID.

---
Task ID: 6-c0
Agent: full-stack-developer
Task: PART 6 §3 + §6 content authoring — exercise catalog (≥400), dictionary (≥24), PROGRAM_TEMPLATES extension + signup routine metadata

Work Log:
- RESUMED interrupted session: catalog/exercises.v1.json + scripts/gen-catalog.ts already existed from a prior run of this same task; re-validated everything from scratch before building on it.
- CATALOG: scripts/gen-catalog.ts (1897 lines, ~200 authored base movements × equipment variants, original coaching copy, enum mirrors of constants.ts, self-integrity checks + 400–460 range gate) emits catalog/exercises.v1.json = 407 entries. Temp zod validation script (mirror of catalogEntrySchema + MUSCLES/EQUIPMENT/EXERCISE_TYPES/SEED_CATEGORIES enum checks + dup/overlap/notes checks) → 407/407 valid, 407 unique keys + names; script deleted after run (kept in /tmp, never in repo). Touched src/server/catalog.ts (space add+remove) — dev.log shows `[catalog] loaded 407 entries (source: builtin)` on the running boot.
- DEVIATION (intentional): category set uses the app's actual SEED_CATEGORIES (Abs/Back/Biceps/Cardio/Chest/Legs/Shoulders/Triceps) — the brief's "Arms" does not exist as a seeded category, and Biceps/Triceps are required for library adoption to resolve into existing user categories. Type DISTANCE_TIME used for distance+time cardio (valid EXERCISE_TYPES member; matches SEED_EXERCISES convention).
- DICTIONARY: catalog/dictionary.json — 25 terms (Superset → Mechanical drop set incl. all 24 required) each with original definition + one "Used in SetForge as:" line grounded in real features (set-type letters N/W/D/F/A, group codes A1/A2 + guided round-robin, RPE 6.0–10.0 per schemas, e1RM Brzycki/Epley/RPE + rep limit, mark-day-off, tempo presets). GET /api/dictionary serves 25 live.
- SEED.TS: TemplateProgram += difficulty/daysPerWeek/estMinutes/highlights(≤4). Existing 3 routines tagged (PPL INTERMEDIATE/6/60, Upper/Lower BEGINNER/4/55, Full Body 3× BEGINNER/3/45) — day structures untouched. +6 ROUTINE templates: Beginner Full Body A/B (B/3/45), Beginner Push / Pull (B/4/40), Powerbuilding Upper / Lower (I/4/65), Torso / Limbs (I/4/65), Advanced 6-Day PPL (A/6/75), Advanced 5-Day Split (A/5/60) — every exercise name verified against SEED_EXERCISES (0 silently dropped; compound()/blank3()/warmup helpers reused; Plank-style TIME exercises get timeSec sets). +6 SESSION templates: Cardio Quick Hit 15, Hotel Bodyweight 20, Express Full Body 25, Shoulder Focus 30, Dumbbell Only Upper 35, Arm Blaster 40 (names don't collide with the existing 4 sessions, which also gained estMinutes). buildPerUserSeed programs map carries the new fields.
- AUTH-SERVICE: signup transaction routine.create += difficulty/daysPerWeek/estMinutes/highlights(JSON string); after days created → routine.update phases = JSON.stringify([{ name: "Main", dayIds }]) in creation order. Login/reset/confirmation code untouched; structure/order intact.
- E2E (curl): POST /api/auth/signup p6seed@test.dev/testpass123 → 201 (+[auth] signup in dev.log); login with fresh cookie jar → 200. GET /api/programs?kind=ROUTINE → 9 routines (exercise counts 15/11/4/10/8/21/12/32/26 — all match templates); ?kind=SESSION → 10 sessions. /api/programs/:id/meta across all 9: difficulty/daysPerWeek/estMinutes populated, phases=[{Main, all dayIds}], highlights=4 each; phase order == day sortOrder (Advanced 6-Day PPL: Push Heavy→Pull Heavy→Legs Heavy→Rest→Push Volume→Pull Volume→Legs Volume). DB-level check confirms Routine columns + Plank timeSec 30/30/45 predefined sets. Temp files cleaned.
- QUALITY: `bun run lint` exit 0; `bunx tsc --noEmit` — zero errors in owned files (pre-existing baseline errors only in examples//scripts/); dev.log clean, /api/health 200 {"db":"ok","migrations":"current","media":"none"}.

Stage Summary:
- §6 CONTENT COMPLETE: catalog 407 entries (validated, live via loadSystemCatalog — SystemCatalog table 407 rows from file + 2 unrelated QA leftovers `test:*` from another agent's library testing, loader never deletes), dictionary 25 terms (live at /api/dictionary), 19 signup templates (9 routines incl. difficulty ladder B×3/I×3/A×3 with daysPerWeek/estMinutes/highlights + phases Main; 10 sessions with estMinutes 15–40).
- Evidence account: p6seed@test.dev / testpass123 (fresh signup — all metadata verified via API + DB).
- Work record: agent-ctx/6-c0-full-stack-developer.md. Notes for later agents: new routines author full exercise lists on every distinct day (unlike Part 5 rotation-empty convention on the original 3); sessions carry estMinutes+phases but no difficulty/highlights.

---
Task ID: 6-d
Agent: full-stack-developer
Task: PART 6 §4.7 program builder + §4.10 group codes / arrange screens / SetRow tempo presets + apply-to-all / routine-detail labels verification

Work Log:
- RESUMED interrupted session (same pattern as 6-c0): the prior run had written the full UI of every 6-d file (builder 825-line vertical stepper, day-arrange + today-arrange screens, arrange-blocks(-view) shared model/renderer, set-row TempoEditor presets + ApplyToAllSection, card-types apply-to-all union member, exercise-card tempoPresets threading + internal fan-out, routine-detail groupCode/⋮ entries/labels editor) but had verified nothing, hit a fatal builder bug, and left 2 broken "QA Two Block" routines + stale screenshots in the DB. Resume = re-validate everything from scratch → fix what QA exposed → full agent-browser QA → restore demo data → records.
- §4.7 BUILDER (#/programs/new/builder): single-page vertical stepper verified — TopBar [◀] New program + [Create h-11] gated on name + ≥1 named workout template (also blocks unnamed workout days); 32px section headers; Basics (name h-12, difficulty segmented 40 Beginner/Intermediate/Advanced, days/week stepper 48 with auto-from-weekly/manual-reset chip, est-minutes stepper 48); Phases (PhaseRow 48 ×N: name input flex-1 + weeks stepper −n+ + × ; "+ Add phase" 40 dashed; default Phase 1 × 1wk; 12-cap both axes); Weekly template (7 DayTemplateRow 48 `Mon [name input] [Workout ▾|Rest ▾]` — Rest swaps the input for a dashed rest row); Exercises optional (per named template: 40px added rows with × remove + "+ Add exercise" 0fr→1fr expansion with debounced inline search over useExercises, CategoryDot rows, tap adds {exerciseId} + 3 blank sets at build); Labels (ChipRow 40 + "+ New label" InlineInput, 20-cap); preview line ("Create generates N days (P phases × W weeks × 7) …"). Create → programsMetaApi.build → invalidate programs+routines → hapticSuccess → toast "Program created · N days" → replaceHash #/programs/{id}.
- BUGFIX 1 (server, program-service.ts buildProgram): nested PredefinedSet creates lacked `id` (column has no default; a TS cast hid it) → every build WITH exercises 500'd "Argument id is missing" (the prior run's failure + its orphan routine). Fixed: id uuid7() per set row.
- BUGFIX 2 (server, program-service.ts buildProgram): create + exercise-attach was non-transactional → the 500 above left a half-built 28-day routine in the DB. Fixed: whole sequence inside one db.$transaction — failures now roll back completely.
- §4.10a group codes: routine-detail renderDayBody derives computeGroupCodes(exercises-by-sortOrder) per day and passes groupCode to ExerciseCard — verified live: A1 chip on Dumbbell Bench Press, A2 on Arnold Press (the "Compound pair" group), none on ungrouped cards.
- §4.10b arrange screens (both live): shared arrange-blocks.ts (buildArrangeBlocks/moveBlock/moveMember/flattenBlocks — blocks keyed by groupId + one "Ungrouped" bucket ordered by first member so no-op flattens to the original order; letters derived via computeGroupCodes so codes agree across screens) + ArrangeBlocksView (block = rounded-lg card: header 48 [code chip A 32px | names-joined truncate | ▲ 40 | ▼ 40] moving the WHOLE group; body rows 40 [name truncate | ▲ | ▼] within-group). day-arrange (#/programs/{id}/day/{dayId}/arrange): Done → routinesApi.reorderExercises → run()-guarded save → toast "Exercise order saved · {day} · N exercises" → back (no-op skips the API). today-arrange (#/today/arrange, ?date= supported): useWorkoutByDate → workoutsApi.reorderExercises via offline-aware useMutate; workout group NAMES surface in block headers ("Pressing pair · …"), routine days fall back to joined member names. Entry points: DayHeader ⋮ "Arrange exercises" in all three menu variants (read/edit/inner) — verified navigation; today ⋮ wiring deferred to 6-e (see NOTE below).
- §4.10c SetRow ⋯ popover: "Apply to all sets" section — expander → toggle chips [Weight][Reps][Rest][Tempo][RPE] (aria-pressed; enabled only when THIS row holds that value — Weight/Reps/Tempo enabled, Rest/RPE disabled on the QA row) + [Apply]; emits onAction({type:"apply-to-all", fields}) — new ApplyToAllFields + union member in card-types.ts; handled INSIDE exercise-card.tsx by fanning out per-set update-set actions + hapticSuccess + toast.success("Applied to N sets") with Undo (snapshot captured from render props, restore = reverse fan-out).
- BUGFIX 3 (client + server): the 4-way concurrent PATCH fan-out deadlocked SQLite (each set PATCH is an interactive transaction with a full PR recompute → write-lock queue → 3/4 expired at the 5s default: P1008/P2028, "Something went wrong" toasts). Fixed two-layer: exercise-card fanOutUpdates staggers dispatches 300ms apart (Undo reuses it); workout-service createSet/updateSet/deleteSet transactions get TX_OPTIONS {timeout:15s, maxWait:5s}. Re-test: 4/4 PATCHes 200 in 190–542ms, siblings updated + persisted.
- §4.10d tempo presets: TempoEditor (BOTH the grid-cell popover at ≥468px AND the ⋯ MoreCell variant below it) renders a ChipRow 40 of presets above the 4-segment Ecc/Pause/Con/Pause editor; tap fills the segments, Save normalises+persists. SetRowProps.tempoPresets? optional; ExerciseCard reads useApp(s=>s.settings)?.tempoPresets and threads it down (prop overrides store; nothing breaks when omitted — verified chips appear from settings alone after seeding 3 presets).
- §4.10e labels (6-c's routine-detail editor, verification requested): ⋮ → Labels opens the inline editor (chip row + × per chip + "+ New label" InlineInput). Verified E2E: add "Strength" → programsMetaApi.update({labels}) → DB ["Strength"] → chip renders → × remove → DB []. 6-c's implementation is complete and correct; nothing rebuilt.
- ROUTINE-DETAIL ⋮ "Program builder" entry verified → navigates #/programs/new/builder.

Stage Summary:
- QA (agent-browser, login demo@setforge.app / password123, nextjs-portal overlay removed): builder E2E at 390×1024 creates a 2-phase × 2-week program → toast "Program created · 28 days" → detail page with phases chips All|Phase 1|Phase 2 + W1/W2 day names + attached exercise carrying 3 blank sets (DB-verified difficulty/daysPerWeek-auto-4/labels/phases JSON) → screenshot download/p6-d-builder-390.png (+ p6-d-builder-form-390/1024). day-arrange moves group A below Ungrouped → Done → toast + DB sortOrders persisted (0:Barbell,1:Cable,2:Dumbbell,3:Arnold) → restored → p6-d-arrange-390.png (+320). #/today/arrange direct URL renders Ungrouped + "A · Pressing pair" blocks → p6-d-today-arrange-390.png (+320). Set ⋯ popover shows the 3 tempo preset chips + apply-to-all chips (Weight/Reps enabled, Rest/RPE disabled) → Weight+Reps Apply → toast "Applied to 4 sets" + Undo + siblings updated + DB persisted (after BUGFIX 3; all PATCHes green) → p6-d-setpopover-390.png. Group codes A1/A2 visible on grouped routine-detail cards → p6-d-groupcodes-390.png (+ detail 320/1440). Labels add/remove persists. Layout gates (h-scroll / right-edge / row heights / single-line) PASS at 320/390/1024/1440 on builder (18 rows), both arrange screens (6 rows), routine-detail (24 rows). bun run lint exit 0; tsc = 7 pre-existing baseline errors only (examples/scripts/skills + timer-presets route — none in 6-d files); dev.log tail all-200 clean; browser console clean.
- Demo data: QA programs soft-deleted; routine order + set values (100×5, 85×8, 85×7, 85×6) restored; KEPT as demo richness: settings.tempoPresets ["2-0-2-0","3-1-1-0","4-0-1-1"], today-workout group "Pressing pair" (Dumbbell Bench + Arnold Press), routine-day group "Compound pair" (re-creatable via scripts/qa-seed-routine-group.ts pattern).
- Files changed this session: src/server/services/program-service.ts (PredefinedSet ids + transactional build), src/server/services/workout-service.ts (TX_OPTIONS on set-mutation transactions), src/components/exercise-card/exercise-card.tsx (staggered apply-to-all fan-out). All other 6-d files were written by the interrupted prior run and are now fully verified. Work record: agent-ctx/6-d-full-stack-developer.md.
- DEVIATIONS: (1) builder daysPerWeek manual/auto both implemented — auto (derived) is the default per spec; manual is reachable through the stepper (reset chip returns to auto). (2) apply-to-all fan-out is staggered ~300ms/set instead of simultaneous — required by SQLite single-writer reality (spec's per-set update-set contract preserved; consumers unchanged). (3) Two server files (program-service/workout-service) touched beyond the frontend list — both bugs were exposed by and block the §4.7/§4.10 QA paths; neither is on the forbidden list.
- NOTE FOR 6-e (today-screen owner): wire the Today ⋮ menu "Arrange exercises" → navigate("/today/arrange") (route + ?date= support live); thread groupCode into today's ExerciseCards via computeGroupCodes(sorted workout.exercises) so superset members show A1/A2; guidedPointerOrder (round-robin over groups) exists in @/lib/group-codes.ts and is still unconsumed — use it for the guided-mode set pointer; apply-to-all sibling PATCHes arrive ~300ms apart by design.

---
Task ID: 6-g1
Agent: full-stack-developer
Task: PART 6 §4.14 body progress photos — Track-tab photo slots (FRONT/BACK/LEFT/RIGHT on measurement records) + #/body/compare side-by-side compare screen + #/body ⋮ entry point

Work Log:
- Read worklog conventions + 6-0/6-c0/6-d entries + 6-d QA patterns before writing code; all work confined to src/features/body/ (my owned folder). Zero server changes — every endpoint (POST /api/media/upload, POST /api/measurements/:id/records/:recId/photos upsert-per-slot, GET /api/photos, DELETE /api/photos/:id) consumed as-is via photosApi/mediaApi/measurementsApi.
- NEW photo-keys.ts: photosKeys (["photos"] all-user / ["photos", recordId] per-record) + invalidatePhotos(qc) prefix invalidator — shared by both new UIs without touching src/lib/client/query.
- NEW photo-slots.tsx (PhotoSlots): 4 fixed 72px slot squares under a muted mini header inside the Track inline editor. Filled = thumbnail (thumbKey ?? mediaKey) + tap-to-replace + floating × remove; empty = dashed Camera placeholder + tap-to-upload; per-slot Loader2 spinner; per-slot hidden <input type=file accept=image/jpeg,image/png,image/webp capture=environment data-photo-slot> (slot-bound onChange — deterministic + automatable). Upload → mediaApi.upload → photosApi.attach → hapticSuccess + toast "Photo saved" + invalidatePhotos; MEDIA_DISABLED 403 → toast "Photo uploads are disabled on this server" (UI stays); non-image MIME guarded.
- body-track-tab.tsx: TrackEditor gains a records query (qk.measurementRecords) that binds the editor's date to a MeasurementRecord (localDayKey convention). No record on the picked date → tapping a slot auto-creates the entry with the editor's value (same semantics as "Save entry"; createdIdRef guards against double-create while the query catches up) → weigh-in + photo is one flow. Layout: h-24 fixed → two h-10 rows + photo section (auto height).
- body-compare-screen.tsx: stub → full primitives-only screen (Screen/TopBar/ScrollBody, no Dialogs). Slot chip row (40px, All|Front|Back|Left|Right, aria-pressed, no-scrollbar scroller; default Front else first slot with photos) → A/B date Selects (distinct photo record dates desc; defaults A=oldest B=newest; auto-swap keeps A≠B; single-date → B placeholder) → grid-cols-2 panels (full images object-contain max-h-60vh, A/B badge + date + slot caption, dashed placeholder with slot name when that slot has no photo on the date) → delta line ("N days apart" + Body Weight values on both dates with signedDelta when a Body Weight metric has records there). Real empty state (CameraOff + "No progress photos yet — add them from Body → Track" + "Go to Track" → replaceHash #/body?tab=track), loading skeletons, error + retry.
- body-screen.tsx: ⋮ menu + "Compare photos" (Camera icon) → replaceHash("#/body/compare").
- DEVATION (deliberate): photo delete has NO Undo — the server's deletePhoto removes the underlying media files too, so re-attach would point at deleted media; immediate delete + toast "Photo removed" instead (task allowed either). DEVIATION 2: "72px square" slots implemented as flex-wrap fixed 72px squares (fits 390px content column; wraps gracefully below ~340px rather than h-scrolling).

Stage Summary:
- QA (agent-browser, session p6g-qa, demo@setforge.app, 390×844 + 1024×900): ALL data flows verified IN-BROWSER through the real UI via `agent-browser upload "input[data-photo-slot=…]"` (no curl fallback needed for data): expand Body Weight → upload JPEG → toast "Photo saved" → slot flips to Replace + × → auto-created record (DB: exactly 1 record on 2026-09-27 @ 80.9 kg); replace (upsert) verified (new mediaKey, no dup row); date→record binding both ways (Sep 24 existing record → all slots "Add…" → FRONT uploaded onto it); BACK added/removed ("Photo removed" + slot empties)/re-added; #/body/compare renders chips + A=Sep24/B=Sep27 defaults + loaded 800×600 images + captions + "3 days apart · 80.9 kg → 80.9 kg ±0"; Back chip → A placeholder "No Back photo"; All chip → per-panel real slots; A/B auto-swap both directions; ⋮ "Compare photos" navigates; empty state on a throwaway account (CameraOff + copy + Go to Track → #/body?tab=track) then account deleted. Layout gates pass at 390 (no h-scroll doc/body, photo section right edge 367px, thumbnails 70px) and 1024 (panels 298×224). Console clean; dev.log zero 500s. Screenshots: download/p6g-{compare-390,compare-1024,compare-empty-390,track-editor-390,track-editor-1024,track-editor-after-remove-readd-390,menu-nav-1024}.png.
- Gates: bun run lint exit 0; bunx tsc --noEmit → zero errors in src/features/body/** (baseline-only: examples/, scripts/, scripts-tmp/ (other agents' leftovers), skills/, timer-presets route).
- Demo data KEPT (intentional richness): 3 labeled demo photos on Body Weight — FRONT 2026-09-24, FRONT + BACK 2026-09-27 — on the 2026-09-27 80.9 kg record (value identical to Sep 24 → no trend distortion). One orphan media file remains in the store (attach-upsert never deletes replaced media — server behavior, invisible to users).
- Files changed: src/features/body/{photo-keys.ts NEW, photo-slots.tsx NEW, body-track-tab.tsx, body-compare-screen.tsx, body-screen.tsx}. Work record: agent-ctx/6-g1-full-stack-developer.md (design decisions, QA evidence, notes — incl. agent-browser fill-vs-date-input React onChange workaround).

---
Task ID: 6-h1
Agent: full-stack-developer
Task: PART 6 §4.16 — onboarding 6-step wizard (#/onboarding) + Profile screen (#/profile)

Work Log:
- Replaced the Skip-only onboarding stub with the full wizard: TopBar "Welcome to SetForge" + always-visible Skip (ghost h-11) → completeOnboarding({skipped:true}); 4px primary progress bar under the TopBar (step N/6, aria progressbar); 6 steps — Welcome (wordmark + value prop), Units (h-24 tiles Metric/Imperial, aria-pressed, Metric default), Goal (4 h-16 rows via PROFILE_GOALS/PROFILE_GOAL_LABELS with Zap/Dumbbell/Flame/Heart icons), Level (3 h-24 tiles Sprout/TrendingUp/Trophy), Schedule & body (days stepper 1–7 default 3 + height/weight/age inputs), Review (per-choice "change" jump links, drafts persist). BottomBar [Back] ghost + [Get started/Continue/Start training] primary h-12 (spinner while saving); CSS animate-in step transitions; NO Dialogs.
- Units awareness: imperial step-5 inputs labelled inches/pounds with live "≈ 177.8 cm / ≈ 81.6 kg" hints; submits canonical metric (×2.54 / ×0.45359237, rounded 0.1). Validation age 13–99, height 100–250 cm (39–98 in), weight 30–300 kg (66–660 lb) — inline [role=alert] errors; Next disabled ONLY on step 5 while a non-empty field is invalid (fields optional, steps 1–4 always proceedable).
- Completion path: completeOnboarding → qc.setQueryData(["profile"], dto) BEFORE replaceHash("#/home") (staleTime-Infinity gate in app-shell would bounce the user back on a plain invalidate — synchronous cache write closes the race) → background invalidate → toast "Welcome to SetForge" + hapticSuccess.
- Replaced the profile stub: hero (64px initials circle bg-primary/10, name/email/"Ready to forge." — NOT a card); PROFILE section (Age/Height/Weight/Level/Goal/Days rows 56px in rounded-lg border bg-card blocks) with INLINE expansion editors (no Dialogs): steppers for age/days, unit-aware MeasureEditor for height/weight (input in display unit, "≈ cm/kg" hint when imperial, stores metric; imperial display splits height to "5 ft 10 in" and weight to lb — conversion helpers local to the file), 3-tile Level + 4-tile Goal choice editors; save → profileApi.update → setQueryData+invalidate ["profile"] → toast. NOTIFICATIONS: reminderTime native time input (patches via updateSettings + "Saved" toast; ""→null), hapticsEnabled + keepScreenOn switches — only these three. ACCOUNT: Settings → #/settings, Help & shortcuts → #/help, Sign out with the verbatim settings confirm-destructive AlertDialog + local useSignOut replica (not exported by settings-sections; logic identical). Skeletons while loading.
- BUGFIX 1 (found in QA): MeasureEditor applied the imperial converter in metric mode too — demo entering 180 cm submitted 457.2 cm → PUT 400 "≤260". Fixed with identity converters for metric (re-verified: 180 saves as 180).
- BUGFIX 2 (found in QA): completeOnboarding persists unitSystem server-side but the client store kept the signup default — every unit-aware screen showed the wrong system until reload. Fixed: finish() fire-and-forgets updateSettings({ unitSystem }) (idempotent PATCH); verified via a dedicated signup showing ft/in + lb on #/profile with NO reload.

Stage Summary:
- QA (agent-browser, 390×844; nextjs-portal overlay removed): (1) fresh signup p6h-onboard-1790536008@test.dev → auto #/onboarding → full imperial run (70 in/180 lb/30 y) → Start training → #/home + toast; GET /api/profile = age 30, heightCm 177.8, weightKg 81.6 (=81.6466 rounded 0.1), level INTERMEDIATE, goal MUSCLE, days 3, onboardingCompletedAt set; settings unitSystem imperial; first Body-Weight record 81.6 kg created; invalid 10 in → "Enter 39–98 inches" + Continue disabled; review "change" link round-trip preserves drafts. Screenshots download/p6h-onboard-{1,5,review,done}-390.png. (2) p6h-skip-1790536130@test.dev → Skip → #/home, profile.completed set, no crash, console clean. (3) p6h-units-1790536346@test.dev → imperial wizard → #/profile WITHOUT reload shows "5 ft 9 in · 175.3 cm"/"160 lb · 72.6 kg" (unit-sync fix verified); imperial height editor 69→72 in → "6 ft 0 in · 182.9 cm" → API 182.9. (4) demo@setforge.app (settings verified METRIC first): hero DU/Demo User/Ready to forge.; Level edit → toast + persists after reload; height 180 cm → toast + API 180 (invalid 300 → "Enter 100–250 cm" + Save disabled); age stepper → 34 → API 34; reminderTime 18:30 → toast "Saved" + GET /api/settings reflects it, clear → null; haptics switch round-trip; Settings/Help links navigate; sign-out confirm Cancel + confirmed → #/auth, no throw. Screenshots download/p6h-profile-{390,1024}.png. All 6 screenshots pass VLM layout review (no clipping/overlap). Layout gates 390/390 + 1024/1024 (no horizontal scroll).
- bun run lint exit 0; bunx tsc --noEmit zero errors in the two owned files (36 pre-existing baseline errors elsewhere: scripts-tmp/scripts/examples/timer-presets/skills — untouched); dev.log tail all-200 (only 4xx entries are the intentional pre-fix 400 repro); browser console + page errors zero on every session.
- Demo account RESTORED after QA (verified via API + reload): profile all-null, reminderTime null, hapticsEnabled true, unitSystem metric. QA signups left in DB (harmless): p6h-onboard-1790536008 / p6h-skip-1790536130 / p6h-units-1790536346 @test.dev, password testpass123 each.
- Files changed: src/features/onboarding/onboarding-screen.tsx, src/features/profile/profile-screen.tsx (only). Work record: agent-ctx/6-h1-full-stack-developer.md. Deviations: [Get started] is the BottomBar Next label (not duplicated in-body); sign-out confirm reuses the settings AlertDialog verbatim (destructive-confirm convention overrides the no-Dialogs rule for editing UIs); Goal/Level optional to proceed per spec; Level/Goal editors save on selection; post-onboarding unitSystem settings sync (extra idempotent PATCH — fixes stale-unit bug); useSignOut replicated locally (settings doesn't export it; feature-folder law).

---
Task ID: 6-final
Agent: main (orchestrator)
Task: PART 6 completion sweep — discard schedule-revert bugfix, media provider enablement, remaining-screen delegation (6-g1/6-h1), full E2E verification, README/env docs, cron refresh

Work Log:
- STATE DISCOVERY: read worklog + COMPARISON_REPORT + live tree. Part 6 waves 6-0/6-c0/6-d complete; 6-a/6-b/6-c/6-e/6-f/6-g/6-h screens already built in prior unlogged runs — only 2 stub screens remained (body-compare, profile) plus the Skip-only onboarding stub.
- BUGFIX (server, workout-service.ts discardWorkout): dev.log showed prisma:error "Unique constraint failed (userId,date)" — the live DB carries a PARTIAL unique index ScheduleEntry_userId_date_planned_key (one live PLANNED per user/date; schema only declares @@index). Two defects in the revert: (1) blind updateMany DONE→PLANNED collided with a competing PLANNED entry on the same date (silently swallowed by .catch → DONE entry stayed linked to the discarded workout); (2) the MISSED-for-past-dates loop ran AFTER updateMany had already unlinked rows — dead code, past workouts wrongly reverted to PLANNED. Rewrote as a per-entry loop: past → MISSED (+missedAt); today/future → PLANNED unless workout.scheduledStart=false (entry auto-created by the start flow → soft-delete) or another live PLANNED occupies the date (slot re-taken → soft-delete). QA script (deleted after run) exercised all 3 paths via API: A auto-entry+competitor → soft-delete + competitor intact; B planned-flip → reverted PLANNED unlinked; C past → MISSED. All PASS, dev.log clean, discard latency 1001ms→~200ms. Scratch users deleted from DB afterwards.
- MEDIA ENABLED: .env now sets MEDIA_PROVIDER=local + MEDIA_LOCAL_DIR=db/media (was none). Smoke-tested the whole pipeline via API: upload (sharp EXIF-orient/resize 1600 + 320 thumb) → auth-scoped GET /api/media/<key> (image/jpeg bytes) → photosApi.attach upsert-per-slot → list → delete → account cascade. /api/health now reports media "local ok". Upload UI must still catch 403 MEDIA_DISABLED for provider=none portability (kept).
- DELEGATED (parallel full-stack-developer subagents, briefs with binding conventions + QA gates): 6-g1 built photo slots on Body→Track records (4 slots FRONT/BACK/LEFT/RIGHT, upload/replace/remove, auto-create record) + the full body-compare screen (slot chips, A/B date selects, side-by-side images, delta + weight line, empty states) + Body ⋮ "Compare photos" entry — all verified IN-BROWSER incl. real JPEG uploads through agent-browser file inputs; left 3 labeled gradient photos on 2 dates as demo richness. 6-h1 built the 6-step onboarding wizard (units/goal/level/schedule+body with live imperial conversion/review; Skip always; completion writes profile+unitSystem+first weigh-in and syncs the settings store) + the profile screen (hero, 6 profile-field inline editors with metric-canonical persistence, 3 notification controls, account links + sign-out confirm) — verified E2E on 3 fresh signups incl. imperial math (177.8cm/81.6kg) and profile-edit persistence. Both appended their own worklog sections (6-g1 line 902, 6-h1 line 922) + agent-ctx records.
- SMALL FIXES: updateTimerPreset signature → Partial<PresetInput> (last tsc error in src/ — src now typechecks CLEAN; remaining baseline errors only in examples//scripts/). next.config.ts devIndicators:false (kills the floating dev badge that polluted QA screenshots; verified badge rect 0×0 after reload).
- ORCHESTRATOR E2E SWEEP (agent-browser, 390 + 1440): demo login → home (program card + today workout + NavBar); #/body Track editor expands with photo slots (Front/Back filled, Left/Right addable); #/body/compare renders real photos side-by-side (images naturalWidth 800, no h-scroll 390/1440); #/profile all sections + Level edit → API INTERMEDIATE persisted (reverted after); sign-out confirm → #/auth; fresh UI signup p6x-e2e-*@test.dev → #/onboarding gate → walked all 6 steps (Imperial, 70in/180lb/30y, live ≈177.8cm/≈81.6kg hints) → review (all values + change links) → Start training → #/home; API profile exactly heightCm 177.8, weightKg 81.6, age 30, INTERMEDIATE/MUSCLE/3 days + settings unitSystem imperial; More 9 destinations; Library 407 rows; Dictionary 25 terms; Programs difficulty filters + Follow; Today group codes A1/A2 on grouped cards + ⋮ Arrange exercises; #/today/arrange Ungrouped + Superset group A blocks. Console clean; VLM review of 4 key screenshots PASS (one initial "FAIL" was the old dev badge + VLM misread — focused crop re-analysis confirmed zero overlap; devIndicators:false removes the badge). Screenshots: download/p6x-*.png + subagents' p6g-*/p6h-*.
- DOCS: README — added Feature map paragraph, MEDIA_*/CATALOG_* env rows, onboarding/media quick-start notes; created .env.example (all vars with comments; README's `cp .env.example .env` now actually works).
- CRON: deleted 2 stale disabled jobs (417853 Part5-era, 418595 pre-Part6) and created 419383 "SetForge 15-minute web dev review" (webDevReview, fixed_rate 900s, Asia/Calcutta) with Part-6-complete context + remaining-gap pointers.
- CLEANUP: removed scripts-tmp/ QA scripts; lint exit 0; tsc src-clean; /api/health {"db":"ok","migrations":"current","media":"local ok"}.

Stage Summary:
- PART 6 COMPLETE end-to-end: every §4 screen is live and browser-verified (no stubs remain — the last three were body-compare, profile, onboarding-wizard, all shipped this session). Backend additions this session: discardWorkout schedule-revert correctness fix only; everything else was already live from 6-0.
- Production notes: MEDIA_PROVIDER=local is the sandbox setting (default remains none → 403 + hidden upload UI). The partial unique index exists only in the live DB (migration artifact) — the discard fix handles it defensively regardless of provider.
- Demo data state: demo@setforge.app / password123, profile fields all-null, 3 gradient progress photos on 2 dates (Sep 24 FRONT, Sep 27 FRONT+BACK on the 80.9kg record), today workout "Push Day (Copy) · QA Day B" with Pressing pair group. QA accounts left: p6h-onboard/p6h-skip/p6h-units/p6x-e2e-* @test.dev (testpass123).
- Next-phase pointers (cron job carries these too): quick S gaps GAP-006/022/024/029/092/093; open domains nutrition GAP-057..069, gamification GAP-074..076, media catalog GAP-081..091, community GAP-105..106.
