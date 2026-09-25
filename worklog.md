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
