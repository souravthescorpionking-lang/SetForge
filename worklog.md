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
