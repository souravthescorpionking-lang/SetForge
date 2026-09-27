# COMPARISON_REPORT.md — Full Comparative Audit: APP-A vs APP-B

- **Role**: product archaeologist + UX auditor (planning only — no fixes, no implementation)
- **APP-A** (new, target): **SetForge** — multi-user workout tracker PWA — `/home/z/my-project` — Next.js 16 + Prisma/SQLite
- **APP-B** (existing, source of desired features): **STNDRD Fitness** (parity clone of the original Flutter app `uni.cbum` v4.1.40) — cloned read-only to `/home/z/scratch/Fitness-Tracker-2` from https://github.com/souravthescorpionking-lang/Fitness-Tracker-2 — Expo 54 / React Native 0.81 / expo-router v6 (web via RN-Web) + Express 5 / Drizzle / Supabase Postgres / Cloudflare R2
- **Audit date**: 2026-09-27. **Discipline**: 100% read-only on both repos (proof in §Self-check).
- **Annexes** (scratch, outside both repos): `/home/z/scratch/audit/app-a-inventory.md` (504 lines, every claim with file:line), `/home/z/scratch/audit/app-b-inventory.md` (523 lines), `/home/z/scratch/audit/screenshots/app-a-live-auth.png`.

## How each app was run (or not)

| App | Run? | Method / reason |
|---|---|---|
| APP-A | **RUN, live-verified** | Dev server `next dev -p 3000` (log: "Next.js 16.1.3 Turbopack … Ready"), `GET /api/health` → `{"db":"ok","migrations":"current","latencyMs":2}`; agent-browser opened `/`, rendered SetForge auth screen (title, tagline, Sign in / Create account tabs, email+password form) — screenshot `scratch/audit/screenshots/app-a-live-auth.png` |
| APP-B | **NOT RUN — static audit** | (1) `pnpm` not installed in sandbox (preinstall script hard-fails non-pnpm); (2) api-server requires external `DATABASE_URL` (Supabase Postgres) and mobile requires `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` + `EXPO_PUBLIC_DOMAIN` + R2 bucket credentials (`artifacts/mobile/lib/supabase.ts`, `lib/db/src/index.ts`) — no such services exist in this sandbox, so even with deps installed in the throwaway clone it cannot boot. Evidence base instead: full source read + 26 in-repo RE docs + 670 reference screenshots of the original app (`attached_assets/`). |

---

# §A — APP-A Inventory (SetForge)

## A0 Meta
- **Name/brand**: SetForge — "Forge every set. Track every rep." (`src/features/auth/auth-screen.tsx:130`); Flame logo. Version 1.0.0 (`settings-sections.tsx:58`).
- **Stack**: Next.js 16.1.1 App Router, React 19, TS strict, Prisma 6 + SQLite (`prisma/schema.prisma:11`), Tailwind 4 + shadcn/ui, TanStack Query 5, Zustand, Zod 4, sonner, Recharts, hash-wasm (Argon2id), nodemailer, next-themes. *Declared but never imported*: framer-motion, @dnd-kit, next-intl, date-fns (verified by grep).
- **Runs**: `next dev -p 3000`; single visible route `/`; all "pages" are client-side hash routes.
- **Git HEAD**: `c4f29ea` (subjects are opaque UUIDs). Working tree: only `db/custom.db` + QA pngs modified (pre-existing runtime artifacts, untouched by this audit).

## A1 Navigation & Screens — 21 screens (20 authed + auth)
Router: `src/features/shell/router.ts` (hash routes, legacy `#/routines*`→`#/programs*` rewrite, unknown→`#/home`). Layout system: `Screen` = TopBar(56) → [SubBar(48)] → ScrollBody → [BottomBar(56)] → NavBar(64) (`components/layout/screen.tsx:30-39`). Mobile: bottom NavBar 5 tabs (Home·Calendar·Programs·Body·More); desktop ≥lg: left NavPane 360px, 11 destinations.

| # | Route | File | Purpose |
|---|---|---|---|
| 1 | `#/home` | home/home-screen.tsx | Dashboard: TodayCard (3 states), upcoming strip, quick sessions, weekly stats, today's workout |
| 2 | `#/today` | today/today-screen.tsx | Day workout log (ExerciseCards, SetRows) |
| 3 | `#/today/{id}` | training/training-screen.tsx | Per-exercise focus: Track/History/Graph |
| 4 | `#/calendar` | calendar/calendar-screen.tsx | Month grid + SelectedDayPanel / list view |
| 5 | `#/calendar/filters` | calendar/filters-screen.tsx | Category/exercise/threshold filters |
| 6 | `#/history` | history/history-screen.tsx | Month-grouped workout timeline |
| 7 | `#/exercises` | picker/picker-screen.tsx | Exercise library picker (pick/replace/multi/routine-day/browse) |
| 8 | `#/programs` | routines/routines-screen.tsx | Programs: Routines \| Sessions tabs |
| 9 | `#/programs/{id}` | routines/routine-detail-screen.tsx | Day accordion, edit mode, cursor strip, scheduling |
| 10 | `#/programs/{id}/log/{dayId}` | routines/log-day-screen.tsx | Log a routine day to today (preview) |
| 11 | `#/programs/{id}/exercise/{reId}` | routines/predefined-editor-screen.tsx | Predefined-set template editor |
| 12 | `#/schedule/pick?date=` | schedule/schedule-pick-screen.tsx | Schedule routine day/session for a date |
| 13 | `#/more` | more/more-screen.tsx | Secondary destinations hub (6 rows) |
| 14 | `#/body` | body/body-screen.tsx | Body measurements: Track/History/Graph |
| 15 | `#/insights` | insights/insights-screen.tsx | Records / Stats / Goals |
| 16 | `#/tools` | tools/tools-screen.tsx | 1RM / Plate / Set calculators + Interval timer |
| 17 | `#/settings` | settings/settings-screen.tsx | All settings (42 rows) |
| 18 | `#/help` | help/help-screen.tsx | Feature tour, shortcuts, offline, data docs |
| 19 | `#/auth` | auth/auth-screen.tsx | Login / signup / password reset (nav=false) |
| 20 | `#/dev` | screens/dev-showcase.tsx | Static component showcase |
| 21 | `#/exercise-overview/{id}` | exercise-overview/exercise-overview-screen.tsx | Exercise records / goals / history |

## A2 API — 73 route files, 104 endpoint methods
Domains: auth (6: login/signup/session/logout/reset/reset-confirm), workouts (13: CRUD, finish+DELETE-undo, copy, move, groups, exercises+order, sets+order), routines (17 incl. copy/log/days/exercises/sets), programs (7: list, follow ×2, start-day, cursor advance/jump/skip/rest-done), sessions/from-workout, schedule (2), dashboard, stats, records (2 + recalculate), exercises (5: CRUD, history, graph, lastsets, records), categories (3), measurements (4 + reorder), goals, units, plates, timer-presets (2), account (5 + import/export/history), sync, health. All Zod-validated, userId-scoped, errors `{error:{code,message}}`.

## A3 Data Model — 26 Prisma models, 9 migrations
User, Session, VerificationToken, PasswordResetToken, UserSettings (25+ fields incl. timezone/program rules/reminder), Category, Exercise (10 modalities, defaults, favourite), Workout (sourceType provenance, scheduledStart, finishedAt), WorkoutGroup (superset name+colour), WorkoutExercise, TrainingSet (setType N/W/D/F/A, rpe, tempo, restPlanned/Actual, comment), PersonalRecord, Goal, Measurement + records, TimerPreset, Routine (ROUTINE|SESSION), RoutineDay (WORKOUT|REST), RoutineExercise, RoutineSet, ActiveRoutine (cursor), ScheduleEntry (status PLANNED|DONE|SKIPPED|MISSED, partial unique 1-planned-per-date), Backup.

## A4 Features → §E1 (A-001…A-157; full list with file:line in annex)

## A5 Design Tokens (measured)
| Token | APP-A value |
|---|---|
| Primary | `oklch(0.646 0.214 39.6)` light / `oklch(0.704 0.208 40.3)` dark (orange; manifest `#f97316`) |
| Background | `oklch(0.984 0.003 70)` ≈#fafaf9 / `oklch(0.144 0.004 55)` ≈#141210 |
| Card | white / `oklch(0.198 0.005 55)` |
| Radius | 8px (tokens RADIUS=8; runtime `--radius: 0.75rem`) |
| Row heights | 40/48/56/72px; bars: TopBar 56 · SubBar 48 · BottomBar 56 · NavBar 64; SetRow tracks 24·32·72·56·52·64·56·40·32px |
| Category colours | Abs #f59e0b, Back #10b981, Biceps #84cc16, Cardio #ef4444, Chest #f97316, Legs #a855f7, Shoulders #14b8a6, Triceps #ec4899 |
| Fonts | Geist Sans/Mono; tabular-nums; charts orange/emerald/purple/red/amber |
| Theming | Light/Dark/System (next-themes) |

## A6–A15 highlights
- **Micro-interactions**: 420ms long-press set-type picker; 0fr→1fr day accordion; sonner toasts with Undo (finish 10s/120s, schedule); optimistic favourites + settings patches w/ rollback; reduced-motion clamp. NO haptics layer (only vibrate on rest end + interval timer), NO framer-motion usage (declared, unwired), NO drag-drop (glyphs render, unwired).
- **State quality**: skeletons (ui/skeleton), 200px empty-day state, 3-state TodayCard, offline.html shell, OFFLINE 503 JSON when uncached, outbox toasts "Saved offline".
- **Notifications**: daily reminder via Notification Trigger API (1/day dedupe, catch-up fire, tap→#/home); rest-complete OS notification when tab hidden; install/update toasts. No push.
- **i18n/copy**: English only, quiet/functional tone; no i18n framework.
- **Tests**: `scripts/qa/` (verify-layout.sh, verify-ownership.ts, verify-formulas.ts) + 80+ QA screenshots in `download/`; no unit-test framework.
- **TODOs in src/**: 0. **Security**: Argon2id + scrypt-legacy rehash, opaque 30d sessions httpOnly cookie, Zod everywhere, ownership asserts, SW cache keyed per session.
- **PWA**: manifest (standalone, 2 shortcuts), SW network-first + per-session API cache ≤80, offline shell fallback, outbox replay + delta sync `GET /api/sync?since=`.
- **Known quirks**: timer-preset CRUD API+model with no UI consumer; multi-select actions show "arrives with the next build" toasts; `typescript.ignoreBuildErrors: true`.

---

# §B — APP-B Inventory (STNDRD Fitness)

## B0 Meta
- **Name**: "STNDRD" (app.json:3; profile footer "STNDRD v1.0.0"); parity clone of the original Flutter app `uni.cbum` v4.1.40 (docs reverse-engineer it from 670 screenshots).
- **Stack**: pnpm monorepo. Mobile: Expo 54, RN 0.81, expo-router v6, react-native-web, Reanimated 4 (installed, unused), expo-haptics/blur/glass-effect/image/image-picker, Inter fonts. API: Express 5 + Drizzle + Supabase Postgres (RLS on 6 tables), Cloudflare R2 via @aws-sdk/client-s3, Orval-generated React-Query client from OpenAPI. Deploys: Replit (3 workflows) + Railway (Dockerfile, node:20-alpine:3000).
- **Git**: 50 commits, HEAD `13c2320` "final commit", clean tree.
- **Docs**: 26 md files (APP_DOCUMENTATION.md 42KB + 24 docs/stndrd-*.md RE reports + DOCUMENTATION.md) — see annex for per-doc purposes.

## B1 Navigation & Screens — 40 routes (39 user-facing + not-found), 4 tabs
Tabs (Workout / Nutrition / Dashboard / Community) with two runtime tab bars: native Liquid-Glass (iOS 18+, SF Symbols) vs classic BlurView (web: opaque 84px).

| # | Route | File | Purpose |
|---|---|---|---|
| 1 | `/` (tab) | (tabs)/index.tsx | Workout home: avatar header, badge banner, Current Program hero (32-tick ring, phase pills, Start Day N / Day-N-Completed chip), Training Tools 2×2, empty trophy card |
| 2 | `/nutrition` (tab) | (tabs)/nutrition.tsx | WeekStrip, MacroSummary, hourly EntryTimeline, search/scan bar + 6 sheets |
| 3 | `/dashboardtab` (tab) | (tabs)/dashboardtab.tsx | Greeting + XP, program hero + WeekStepper, Workouts rows + kebab menu, Weight/Calories cards |
| 4 | `/community` (tab) | (tabs)/community.tsx | Mock feed + mock leaderboard (docs: out of scope) |
| 5–8 | `/auth/*` | sign-in / sign-up / forgot-password / reset-password | Supabase email/password + deep-link recovery |
| 9 | `/onboarding` | onboarding/index.tsx | 8-step questionnaire, unit toggle, progress bar |
| 10–13 | `/profile/*` | index / edit / change-password / notifications | Grouped profile cards, accordion auto-save, 3 notification switches |
| 14 | `/progress` | progress.tsx | Weigh-in history, month chips, 4 photo slots, trend circles |
| 15–21 | `/programs/*` | index / [id] / user-detail / day-detail / workout-session / program-progress / badge-ceremony | Browse (difficulty/phase), detail (ring, highlights, equipment carousel, preview), day detail (muscle chips, series colors, Favorite/Schedule/History/Mark Off), 2047-line session player, progress totals, ceremony |
| 22–24 | `/on-demand/*` | index / [id] / dictionary | Catalog (search, category chips, FiltersSheet), session detail, 11-entry glossary |
| 25 | `/exercise-library` | exercise-library.tsx | 526-exercise R2 catalog, video detail (Setup/Target tiles, speed badge) |
| 26–33 | `/workout-builder/*` | index / build / edit / workout-detail / add-exercise / rearrange-series / program-builder / program-edit | Your Workouts hub, build w/ covers + tempo sheet, multi-select auto-grouping, group reorder, 1033-line program builder (phases × difficulties) |
| 34–35 | `/workout-logs/*` | index / [id] | List+calendar toggle, search, trash; log detail w/ weight-history table (PATCH edit) |
| 36–38 | `/workout-calendar`, `/workout-day`, `/workouts-list` | | Scrolling calendar (green done/purple missed/count badges), day view w/ Workout Menu kebab, dashboard "view all" |
| 39 | `/active-workout` | active-workout.tsx | Standalone player (RestRing, SetDots, tips) — docs mark dead for program flow |
| 40 | `/+not-found` | +not-found.tsx | Catch-all |

## B2 API — 26 endpoints (25 authed + /healthz)
workoutLogs (4), scheduledWorkouts (3), nutritionLogs (2), exercises (2: catalog + admin rebuild), foods (11: search, barcode, catalog CRUD, entries CRUD, favorites, recents), workoutCovers (2: list + hardened upload), account (1: wipe). OpenAPI spec has 9 ops (client has a 10th hook — drift).

## B3 Data Model — 12 tables + auth.users
Drizzle: workout_logs, scheduled_workouts, nutrition_logs, food_catalog, food_entries, favorite_foods. Supabase (RLS): profiles, user_programs, user_on_demand, saved_workouts, active_programs, custom_labels.

## B4 Features → §E1 (B-001…B-117 + B-048a; full list with file:line in annex)

## B5 Design Tokens (measured, dark-only — light set defined but unused)
| Token | APP-B value |
|---|---|
| background | `#000000` (root DARK_BG) |
| foreground | `#FFFFFF` |
| card | `#1A1A1A` · secondary/border `#2C2C2C` · muted `#1E1E1E` · mutedForeground `#8E8E93` |
| primary/tint/accent | `#007AFF` (original sampled `#006CFA`) |
| success `#3AD77C` · warning `#F5D90A` · destructive `#ef4444` · session blue `#3B82F6` · CTA variant `#2563EB` |
| radius | 12 (cards) / 20–28 pills / 24 sheet top |
| Difficulty palette | beginner `#3AD77C` · intermediate `#F5D90A`/`#EAB308` · advanced `#A855F7` |
| Ceremony | gold `#E8C268` medal, `#C8F000` XP text |
| Fonts | Inter 400/500/600/700 (+800 ceremony) · splash `#0D0D0D` |

## B6–B15 highlights
- **Micro-interactions**: 6-event haptics layer (selection/light/medium/success/warning/error; web-guarded); SuccessToast top strip; ConfirmModal (busy+destructive); badge-ceremony Animated marquee; Liquid-Glass tabs; activeOpacity press feedback; no custom Reanimated springs (deliberate).
- **State quality**: ErrorBoundary + ErrorFallback (full-screen + reloadAppAsync); empty cards ("No custom workouts yet.", "No Program Selected"); +not-found; AsyncStorage caches (catalog 24h, onDemandFavorites, weigh-ins, earnedBadges, scheduledExtras).
- **Notifications**: 3 profile switches persisted — settings UI only, no push implementation.
- **i18n/copy**: English, motivational tone ("Choose your path. Build your discipline.", "CONGRATULATIONS!", "What's your win today?"); CBUM references.
- **Tests**: 0 automated; emulator E2E simulation reports in docs.
- **Content catalog**: 12 preset programs (+2 real-seeded = 13 browsable; 11 stand-in splits), 32 static + 45 RE'd On-Demand sessions, 526-exercise R2 video catalog, 75 seeded foods + OpenFoodFacts, 11 dictionary entries, 6 badge milestones (125 XP each).
- **Clone's own acknowledged gaps** (docs): camera barcode scan stubbed; recipes stubbed; amber program-title box + "X WEEKS" badges not cloned; XP formula unknown; auth/onboarding/community never RE'd; push = UI only; 11/13 programs stand-ins.

---

# §C — Screen-by-Screen Register (both apps)

## §C.1 APP-A screen skeletons (px, measured from layout code)
Canonical frame (360×780 mobile): `TopBar 56 → [SubBar 48] → ScrollBody (only scroller, max-w 720 / 1100 ≥lg) → [BottomBar 56] → NavBar 64 + safe-area`.

| Screen | Frame regions (top→bottom) |
|---|---|
| #/home | TopBar56 (title + ⋮ theme) · ScrollBody: TodayCard 168/120/workout-day states · UpcomingStrip 7×chips · QuickSessions ≤3 · StatsRow · Today's workout (max-h-96 scroll) |
| #/today | TopBar56 · SubBar48 DateStrip (◄ label ►, dot 2px) · ScrollBody: ExerciseCards (72px headers, 40px SetRows) · BottomBar56: Add / Finish / RestBar swap (countdown, −15/+15, Skip) |
| #/today/{id} | TopBar56 · SubBar48 Track/History/Graph · ScrollBody (graph 240px mobile/360 ≥lg, DetailRow 72px) · BottomBar56 mobile Save-set |
| #/calendar | TopBar56 (month ◄ ►, view toggle, filters w/ dot badge) · [SubBar48 filter chips] · ScrollBody: 6×7×56px grid, dots ≤3 + ghosts 10px · SelectedDayPanel |
| #/history | TopBar56 (⋮ Filters/Export) · ScrollBody: month separators + 48px WorkoutBlocks → expand SetRows 40px |
| #/exercises | TopBar56 search · SubBar48 chip scroller · ScrollBody grouped sections (sticky 32px headers) · BottomBar56 Add N |
| #/programs | TopBar56 (+ New menu) · SubBar48 Routines/Sessions · ScrollBody 72px rows (2-col ≥lg) |
| #/programs/{id} | TopBar56 (rename/Edit/⋮) · SubBar48 cursor strip `Day i/n` · ScrollBody day accordion (0fr→1fr) |
| #/settings | TopBar56 · ScrollBody: 42 setting rows (40/48px) + inline expansions 96px |
| #/auth | ScrollBody only (nav=false): brand 200px, segmented tabs, form, reset panel |
| Others | #/more (6 rows) · #/body/#/insights/#/tools (SubBar tabs / inline tools) · #/help (4 sections) · #/dev showcase · #/schedule/pick · log-day · predefined-editor · exercise-overview (SubBar tabs) |

**Dialogs/sheets/toasts/empty/error states (A)**: AlertDialog destructive confirms (delete exercise/day/routine/account, unfollow, replace schedule); DatePickerDialog (past disabled); popovers (set-type picker 420ms, RPE chips, tempo, rest presets, superset groups, workout note ⌘Enter); sonner toasts w/ Undo; skeletons; 200px empty-day; 3-state TodayCard; offline.html; "Saved offline" toasts; O/A Kbd shortcuts `? N /`.

## §C.2 APP-B screen skeletons (from code + RE docs; RN layouts, no fixed px grid)
Typical frame: SafeArea header (~60px: avatar + title + icons) · ScrollView content (16px gutter, 12px card padding, radius 12) · fixed bottom bars/CTAs · tab bar (native LiquidGlass / web opaque 84px).

| Screen | Key regions |
|---|---|
| Workout home | Header (avatar, "Workout" + date, calendar icon) · badge banner · hero card (full-bleed image + 55% overlay, 72px 32-tick CircularProgress, phase pills, Start Day N blue pill / Day-N-Completed chip) · Training Tools 2×2 · empty trophy card |
| Nutrition | Header (avatar, date, gear, calendar) · WeekStrip (day# top/weekday below) · MacroSummary 4 columns w/ tracks · EntryTimeline (dashed spine, per-hour +) · fixed search bar + scan glyph |
| Dashboard | Header (avatar, greeting, XP pill, trophy) · program hero + WeekStepper (7 day dots) · Workouts rows w/ kebab + count badge · Weight/Calories cards |
| workout-session (2047 lines) | Elapsed timer + End Workout · N/35 Sets + 3px progress bar · Overview/Video toggle · set table (#/Type/Reps/Weight/Log It) · rest row + full-screen RestRing (60 ticks) · Settings sheet · exit dialog (Mark as complete) · trophy screen |
| programs/user-detail | Hero + difficulty pill + 88px ring · phase chips scroll · Overview/Program tabs · Highlights · equipment carousel · Preview day rows w/ scheduled badges |
| day-detail | Hero + duration ring + muscle chips · color-coded series list (orange superset/purple triset) · action row Favorite/Schedule/History/Mark Off |
| exercise-library | Search + muscle/equipment chips · card grid w/ thumbnails · full-screen detail (video, speed badge, Setup/Target tiles, instructions) |
| nutrition sheets | FoodSearch (toolbar modes, Recent History, multi-add cart) · ScanSheet (typed barcode) · CreateFood · MacroSettings (presets + dual-thumb slider) · CalendarSheet · FoodDetail |

**Dialogs/sheets/toasts/empty/error states (B)**: RN Modal slide sheets w/ drag handles; ConfirmModal (busy/destructive/haptics); SuccessToast top strip; ErrorBoundary full-screen + reload; RemoveDialog; trophy/empty cards; +not-found; quick-tip coach toast.

---

# §D — Interaction Pattern Register (every distinct element class)

| Element | APP-A trigger → result (evidence) | APP-B trigger → result (evidence) |
|---|---|---|
| Set logging | 40px SetRow grid cells; Enter/↓/↑ nav; Enter on last row adds set (set-row.tsx:519-565) | Set table row; tap circle → green ✓ logs (workout-session.tsx:1130-1166); guided pointer |
| Set types | Tap cycles N→W→D→F→A; hold 420ms/right-click picker; 5 types (set-row.tsx:310-449) | "Type" column in set table (docs §6.11); values not located in code → §I |
| RPE / tempo / rest | Popover chips 1-10 half-steps / 4-segment inputs / preset grid 30-180s + custom (set-row.tsx:78-290) | Tempo sheet presets + custom 4-box (build.tsx:161-238); per-set rest in builder; session tempo display |
| Complete ✓ | Tick auto-starts rest (warm-ups excluded; honours setting) (today-screen.tsx:269-291) | "Log It" circle tap → ✓ + haptic light |
| Rest | BottomBar RestBar: countdown aria-live, −15/+15, Skip; beep 880Hz, vibrate, OS notif when hidden, wake lock (rest-state.tsx) | Inline rest row + full-screen RestRing 60 ticks, Skip/+15s, auto-move pointer, countdown sounds toggle |
| Supersets | Popover group picker (colour dot + checkmark); colour bar + chip on card (card-popovers.tsx:89-217) | Auto A1/A2 codes on multi-select; colour-coded groups; round-robin set pointer ⏮/⏭ |
| Reorder | ⋮ Move up/down swaps + PUT order (today-screen.tsx:316-334) | Rearrange-series screen w/ Up/Down per group |
| Finish | Finish → finishedAt + cursor advance + toast w/ Undo 10s/120s (today-screen.tsx:347-394) | End Workout dialog w/ Mark-as-complete checkbox → save log → badge award → trophy screen |
| Navigation | Hash routes + deep links (`?date= ?tab= ?view= ?scope= ?period= ?replace=`…); NavBar 5 tabs / NavPane 11 | expo-router stack + 4 tabs; imperative auth/onboarding gates |
| Search | 250ms debounced server search (picker) | Local catalog search + filter chips (library, on-demand, foods, logs) |
| Delete flows | Confirm-destructive AlertDialogs everywhere; two-tap goal delete w/ 4s disarm | ConfirmModal + haptic warning; trash on log cards |
| Undo | Toast Undo for finish + schedule (server windows) | None |
| Offline mutation | Outbox queue + replay + toasts (offline.ts) | None (online only; AsyncStorage caches reads) |
| Favourites | Optimistic star flip w/ rollback (use-favourite.ts) | Heart on sessions (AsyncStorage); star foods; day Favorite action |
| Long-press | Set-type picker 420ms | Not used |
| Keyboard | `?` `N` `/` shortcuts; full grid kbd nav | Not applicable (native/mobile) |
| Haptics | vibrate on rest end + interval only | 6-event layer wired across app |
| Uploads | None | Cover photo upload (byte-sniffed, rate-limited) + progress photos |
| Date picking | react-day-picker popover + DatePickerDialog (past disabled) | Week strips, month sheets, ScheduleSheet AM/PM boxes, nutrition CalendarSheet |

---

# §E — Cross-cutting extracts

## E1 — Flat feature lists (full detail w/ file:line in annexes)
**APP-A: 157 features A-001…A-157** — Auth A-001..010 · Today/logging A-011..038 (incl. 10 modalities, 5 set types, RPE/tempo/rest editors, keyboard nav, copy-last, outbox) · Training focus A-039..044 · Exercises A-045..054 (search, custom exercises, favourites, records/goals/history) · Routines/Programs/Schedule A-055..068 (follow, cursor skip/jump, 409-Replace+Undo, seeded PPL/UL/FB) · Home A-069..075 · Calendar A-076..082 (ghosts, filters, list view) · History A-083..084 · Insights A-085..088 (periods, streaks, weekly rhythm, deltas) · Body A-089..093 · Tools A-094..097 · Settings A-098..139 (42 controls) · PWA/offline/sync A-140..146 · Notifications A-147..149 · Global UX/help A-150..157.

**APP-B: 118 features B-001…B-117 + B-048a** — Auth B-001..010 · Onboarding B-011..013 · Home B-014..020 (hero ring, badge banner, tools grid) · Programs B-021..033 (difficulty/phase, equipment carousel, Mark Off) · Active session B-034..048 (video carousel, rest ring, auto-move, trophy) · On Demand B-049..055 (catalog, dictionary) · Builder B-056..065 (auto-group codes, tempo sheet, program builder) · Logs/Calendar B-066..074 (weight-history table, Workout Menu kebab, ScheduleSheet w/ time) · Nutrition B-075..087 (13 features: search, barcode, custom foods, macros engine, timeline slider) · Progress B-088..091 (weigh-ins, 4 photo slots) · Gamification B-092..094 (XP, badges, ceremony) · Profile B-095..099 · Library/media B-100..104 (526-video catalog) · Community B-105..106 (mock) · Polish B-107..117 (haptics, glass, covers, dark-only).

## E2 — Golden user flows
- **A**: sign-up(tz) → seeded templates → follow PPL → home TodayCard Start → #/today SetRow grid → ✓ auto-rest → Finish (undo) → calendar DONE dot + history block + insights stats + PRs; schedule day → 409 → Replace → undo; offline → outbox → sync.
- **B**: sign-up → 8-step onboarding → browse programs (difficulty/phase) → Start Day N → session player (video carousel, guided sets, rest ring, auto-move) → Mark as complete → trophy + badge ceremony + XP → dashboard rows/Weight/Calories; nutrition: search/cart/barcode → macro targets → timeline; weigh-in + progress photos.

## E3 — Performance
- **A**: Turbopack dev; per-session SW cache ≤80 entries; API cache + shell fallback; delta sync `?since=`; TanStack staleTime 15s + midnight/visibility refetch; viewport module for SetRow focus; no virtualization; desktop content column 720/1100px.
- **B**: gzipped catalog JSON on CDN → api-server → AsyncStorage (24h); catalog rebuild scheduler 6h; React Compiler beta + babel preset; pino logs; compression middleware; rate limits on auth+uploads; no list virtualization; 2047/1610/1491/1163/1033-line monolith screens (bundle weight risk, unaudited at runtime).

---

# §F — Comparison Matrix (every B-001…B-117 + B-048a; cells: YES / NO / PARTIAL: / DIFFERENT:)

| B-# | B feature | A status | A evidence / note |
|---|---|---|---|
| B-001 | Sign-in w/ inline validation | YES | A-001 auth-screen.tsx:67-79 |
| B-002 | Sign-up + email-confirmation path | PARTIAL: | A signs up + auto-signs-in (A-002); no confirmation-required path |
| B-003 | Forgot-password email | YES | A-004 (graceful "not configured" w/o SMTP) |
| B-004 | Recovery deep-link reset | YES | A-005 `#/auth?reset=` |
| B-005 | Change password | YES | A-009 (revokes other sessions) |
| B-006 | Session persistence + listener | YES | A-007 30d cookie + focus refetch A-075 |
| B-007 | Auth+onboarding gate | PARTIAL: | auth gate A-010; onboarding gate absent (no onboarding) |
| B-008 | Sign-out local-first + confirm | YES | A-006 confirm + full wipe |
| B-009 | Delete account data | YES | A-126 typed-DELETE + cascade |
| B-010 | Authenticated API client | YES | typed api.ts + cookie auth (DIFFERENT transport: cookie vs Supabase JWT) |
| B-011 | 8-step onboarding questionnaire | NO | no onboarding exists |
| B-012 | Unit toggle w/ live conversion | PARTIAL: | A-099 units setting; no wizard live-convert |
| B-013 | Segmented progress + Finish→profile | NO | — |
| B-014 | Avatar/date/calendar home header | DIFFERENT: | A TopBar title-only; profile via settings |
| B-015 | Badge-unlocked banner | NO | no gamification |
| B-016 | Hero card: image + 32-tick ring + phase pills | PARTIAL: | A-070 3-state TodayCard; no ring/hero-image/phases |
| B-017 | "Day N Completed" chip (tap to un-mark) | PARTIAL: | A-034 Finished ✓ + 120s Undo; no persistent un-complete chip |
| B-018 | Empty program state | YES | A-070 state C "Choose program" |
| B-019 | Training Tools 2×2 grid | DIFFERENT: | A #/more hub + #/tools (4 tools) |
| B-020 | "Current Program / See all" header | YES | home section headers |
| B-021 | Browse w/ difficulty/phase grouping + tagline | PARTIAL: | A-055 Routines/Sessions tabs; no difficulty/phase |
| B-022 | Multi-select delete per difficulty/phase | NO | single delete only (A-058) |
| B-023 | 12 preset programs merged | DIFFERENT: | A-068 seeds 3 routines + 6 sessions |
| B-024 | Detail: ring + phase chips + tabs | PARTIAL: | A-060 accordion + edit + cursor strip; no ring/phases |
| B-025 | Program Highlights (days/wk, minutes) | NO | — |
| B-026 | Equipment carousel w/ real photos | NO | — |
| B-027 | Preview day rows w/ scheduled badges | PARTIAL: | accordion days; badges only in calendar/upcoming strip |
| B-028 | Day detail: hero, duration ring, muscle chips, series colors | PARTIAL: | A-029 superset colors; no hero/ring/muscle chips |
| B-029 | Day action row Favorite/Schedule/History/Mark Off | PARTIAL: | Schedule (A-066) + log-day only |
| B-030 | Activation/progression/unmark | YES | A cursor model A-065 (DIFFERENT mechanics: cursor + idempotent date advance vs completedDays) |
| B-031 | Program Progress: total sets + total weight | NO | — |
| B-032 | Real content seeds | YES | A-068 real PPL/UL/FB content (DIFFERENT catalog) |
| B-033 | Legacy static detail route kept | DIFFERENT: | A rewrites legacy hashes instead (router.ts:108-119) |
| B-034 | Elapsed timer + N/total sets progress bar | PARTIAL: | A-032 timer chip + A-033 summary row; no progress bar |
| B-035 | Overview + Video carousel modes | PARTIAL: | overview = inline cards (A-011); no video mode |
| B-036 | Set table # / Type / Reps / Weight / Log It | YES | A-014 SetRow grid (DIFFERENT: free grid vs guided rows) |
| B-037 | Rest row + full-screen RestRing | PARTIAL: | A-025 RestBar in BottomBar; no full-screen ring |
| B-038 | Auto-move after rest | PARTIAL: | A-106 "Notify + focus next" setting; no pointer auto-advance |
| B-039 | Per-session settings sheet | DIFFERENT: | A global settings (A-107..115); no per-session sheet |
| B-040 | End dialog w/ Mark-as-complete (discard option) | PARTIAL: | A always-saves finish + Undo; no discard path |
| B-041 | Per-exercise demo video streaming | NO | — |
| B-042 | Speed badge 1.0x→2.0x | NO | — |
| B-043 | Round-robin superset set pointer ⏮/⏭ | PARTIAL: | A-029 groups + colors; no guided pointer |
| B-044 | Max-weight bar + tempo display + per-ex Logs/History | PARTIAL: | A-040 last-time card + A-041 history tab; no in-session max bar |
| B-045 | Save flow w/ guards | YES | A per-set autosave + finish (use-mutate, A-034) |
| B-046 | Completion trophy screen w/ stats | NO | toast + Finished ✓ morph only |
| B-047 | One-time quick-tip toast | NO | — |
| B-048 | Trainer tips modal | NO | A has library notes popover (A-037), not tips |
| B-048a | Standalone session player | DIFFERENT: | A single #/today logging surface |
| B-049 | On Demand catalog (32 + user sessions) | NO | — |
| B-050 | 45 RE'd on-demand sessions | NO | — |
| B-051 | Catalog search + chips + FiltersSheet | NO | — |
| B-052 | Session detail title block | NO | — |
| B-053 | Favorite heart on sessions | NO | A favourites = exercises only (A-051) |
| B-054 | Favorite/Schedule/History/Mark Off row | NO | — |
| B-055 | Training-methods Dictionary (11 entries) | NO | — |
| B-056 | "Your Workouts" hub w/ search + sort | PARTIAL: | A-055 tabs; no list search/sort |
| B-057 | Build w/ difficulty/duration/hero image | PARTIAL: | A-056 name-only routines |
| B-058 | Multi-select add w/ auto superset codes A1/A2 | PARTIAL: | A-027 single add + A-029 manual grouping; no auto codes |
| B-059 | Per-set reps/rest + for-all-sets + AMRAP ∞ | PARTIAL: | per-set fields yes (A-019/020), AMRAP type (A-016); no for-all propagation |
| B-060 | Tempo sheet: presets + custom 4-box | PARTIAL: | A-019 custom 4-segment inline; no presets |
| B-061 | Trainer tip per exercise | NO | — |
| B-062 | Rearrange-series group screen | PARTIAL: | A-030 exercise up/down; no group-level screen |
| B-063 | Edit/view + leave guard | PARTIAL: | A-060 edit⇄Done; no unsaved guard (immediate persist by design) |
| B-064 | Program builder (phases × difficulties) | NO | — |
| B-065 | Program edit + custom labels | PARTIAL: | routine edit yes; no custom labels |
| B-066 | Logs list w/ search + trash | PARTIAL: | A-083 history; no text search, no per-workout delete (verified: Trash2 surfaces only for exercises/routines/days/goals) |
| B-067 | Logs 6-month thumbnail calendar | PARTIAL: | A-079 list view; no thumbnail calendar |
| B-068 | Refresh-on-focus | YES | A-075 visibility/online refetch |
| B-069 | Log detail weight-history table (PATCH) | PARTIAL: | A-084 expand + A-041 inline edit; no date-tabbed per-exercise weight table |
| B-070 | Scrolling calendar w/ colored tiles + counts | PARTIAL: | A-076/077 fixed grid + status dots + "+n"; no continuous scroll/thumbnails |
| B-071 | Calendar day view w/ rows + icons | YES | A-080 SelectedDayPanel |
| B-072 | Shared Workout Menu kebab | YES | A-080 ⋮ Start now/Move/Skip/Remove |
| B-073 | ScheduleSheet w/ hour/min AM/PM + 3 modes | PARTIAL: | A-066 date-only scheduling; no time-of-day |
| B-074 | Missed derivation + scheduledExtras metadata | PARTIAL: | A-077 MISSED dot (date-based); no time-based/duration/program linkage |
| B-075 | Nutrition tab (strip, macro bar, timeline) | NO | — |
| B-076 | Macro summary 4 columns + toggle | NO | — |
| B-077 | Food search sheet + multi-add cart + recents | NO | — |
| B-078 | Food catalog + OpenFoodFacts augment | NO | — |
| B-079 | Barcode scan → lookup → log | NO | — |
| B-080 | Create custom food | NO | — |
| B-081 | Food favourites | NO | — |
| B-082 | Food detail sheet w/ servings stepper | NO | — |
| B-083 | Mifflin-St-Jeor macro presets | NO | — |
| B-084 | Custom macro goals store | NO | — |
| B-085 | Timeline settings + dual-thumb hour slider | NO | — |
| B-086 | Nutrition calendar sheet w/ logged markers | NO | — |
| B-087 | Per-day food entry CRUD per hour | NO | — |
| B-088 | Weigh-in history + 4 progress-photo slots | PARTIAL: | weight = body metric w/ history/graph (A-089..93); no photos/month chips |
| B-089 | LogWeightSheet (date/time/weight/photos) | PARTIAL: | A-090 inline value+date editor; no photos |
| B-090 | Dashboard Weight card w/ trend | NO | A home = sets·volume·streak only |
| B-091 | Dashboard Calories card | NO | — |
| B-092 | XP + 6 milestone badges | NO | — |
| B-093 | Badge ceremony (marquee, medal, XP) | NO | — |
| B-094 | Banner + claim + auto-redirect | NO | — |
| B-095 | Profile root w/ grouped cards + legal/support/social | PARTIAL: | A settings + #/more; no XP medal/support/social/subscriptions/legal |
| B-096 | Manage Profile accordion auto-save (8 fields) | PARTIAL: | A-123..126 account section; no age/height/weight/level profile fields |
| B-097 | 3 notification switches | DIFFERENT: | A-122 reminderTime + A-148 rest-complete notification |
| B-098 | Greeting + avatar initials | PARTIAL: | NavPane initials chip (desktop); no greeting text |
| B-099 | Version footer | YES | A-139 |
| B-100 | 526-exercise R2/CDN catalog + offline cache | DIFFERENT: | A local seeded DB (~112 exercises + user customs); no R2/CDN/videos |
| B-101 | Library search + muscle + equipment chips | PARTIAL: | A-045/046 search + category chips; no equipment filter/thumbnails |
| B-102 | Video detail + speed + Setup/Target tiles | NO | — |
| B-103 | R2 asset URL builders | NO | — |
| B-104 | Catalog rebuild scheduler + admin endpoint | DIFFERENT: | A catalog is DB rows; no rebuild concept |
| B-105 | Community feed | NO | (mock in B; docs mark out of scope) |
| B-106 | Community leaderboard | NO | (mock in B) |
| B-107 | 6-event haptics layer | PARTIAL: | A-026 vibrate (rest end) + interval beeps; no selection/success/warning haptics |
| B-108 | SuccessToast strip | YES | A-152 sonner |
| B-109 | ConfirmModal busy/destructive | YES | A-036 AlertDialog destructive |
| B-110 | ErrorBoundary + reload fallback | NO | no custom boundary in A (grep: 0 hits) |
| B-111 | WeekStepper day-status mapping | PARTIAL: | A-071 upcoming strip; no done/today/rest status dots per weekday |
| B-112 | WorkoutCover w/ fallback | NO | — |
| B-113 | CoverPickerSheet (library + upload) | NO | — |
| B-114 | Upload hardening (rate limit, sniffing) | NO | — |
| B-115 | Liquid-Glass native tabs | DIFFERENT: | A web NavBar 64px (platform concept) |
| B-116 | Dark-only + Inter | DIFFERENT: | A Light/Dark/System + Geist |
| B-117 | Dashboard section semantics (On Demand counting rule) | DIFFERENT: | A uniform counts; no on-demand distinction |

**Matrix totals: YES 20 · PARTIAL 40 · DIFFERENT 11 · NO 47 = 118 rows** (1:1 with B-001…B-117+B-048a).

---

# §G — UI/UX Diff

## G1 — Side-by-side wireframes (360×780)

```
 APP-A #/home                        APP-B Workout home
┌──────────────────────┐ 56   ┌──────────────────────┐
│ TopBar: Home      ⋮  │      │ ◯ Workout  Sep 27 📅 │ ~60
├──────────────────────┤      ├──────────────────────┤
│ TodayCard 168px      │      │ 🏅 Badge Unlocked!   │
│  [bar] Push Day 2    │      │ ┌────────────────────┐│
│  6 ex · 12 sets      │      │ │ hero image +55%    ││
│  [Start ▸]           │      │ │ ◔ 32-tick ring     ││
├──────────────────────┤      │ │ LEGACY BULK        ││
│ Upcoming ◦◦◦◦◦◦◦ 7   │      │ │ pills: P1 P2 P3    ││
├──────────────────────┤      │ │ [Start Day 4] blue ││
│ Quick sessions ≤3    │      │ └────────────────────┘│
├──────────────────────┤      │ Training Tools 2×2    │
│ Stats 24·5,400kg·3🔥 │      │ [On Demand][Builder] │
├──────────────────────┤      │ [Logs][Library]      │
│ Today's workout list │      │ (scroll)             │
│ (max-h-96 scroll)    │      ├──────────────────────┤
├──────────────────────┤ 64   │ 💪  🍴  📊  👥 tabs  │ 84 web
│ 🏠 📅 📚 🫀 ⋯ NavBar │      └──────────────────────┘
└──────────────────────┘

 APP-A #/today (logging)            APP-B workout-session
┌──────────────────────┐ 56   ┌──────────────────────┐
│ Today         ⋮      │      │ 12:34  [End Workout] │
├──────────────────────┤ 48   ├──────────────────────┤
│ ◀ Thu 26 Sep ▶ •Today│      │ 18/35 Sets ▓▓▓░░ 3px │
├──────────────────────┤      ├──────────────────────┤
│ ExerciseCard 72px    │      │ [Overview|Video] ⚙   │
│  SetRow 40px grid    │      │ ┌ # Type Reps Wt ⬤ ┐ │
│  # Wt Reps ✓ RPE T R │      │ │ 1  8    60  ⬤✓  │ │
│  [− 60.0 +][− 8 +]✓  │      │ │ 2  8    60  ⬤   │ │
│  (kbd: Enter/↓/↑)    │      │ └──────────────────┘ │
│ ExerciseCard 72px …  │      │ Rest 0:45 [ring] ▶15 │
├──────────────────────┤ 56   │ (video carousel mode)│
│ [Add ex] [Finish] or │      ├──────────────────────┤
│ RestBar 1:30 −15 +15 │      │ ◀ prev  ⏯  next ▶   │
├──────────────────────┤ 64   └──────────────────────┘
│ NavBar               │
└──────────────────────┘
```

## G2 — Measured token diff
| Token | APP-A | APP-B |
|---|---|---|
| Primary/accent | orange `oklch(0.646 0.214 39.6)` (#f97316 family) | iOS blue `#007AFF` (original #006CFA) |
| Background | #fafaf9 / #141210 (dual theme) | #000000 (dark-only) |
| Card | white / oklch(0.198…) | #1A1A1A |
| Border/secondary | stone scale | #2C2C2C |
| Muted fg | stone-500 | #8E8E93 |
| Success/Destructive | emerald / red (OKLCH) | #3AD77C / #ef4444 |
| Radius | 8 | 12 |
| Base row heights | 40/48/56/72 | n/a (flex); cards 12px pad |
| Nav | bottom 64px 5 tabs / NavPane 360px 11 items | 4 tabs; web bar 84px; Liquid-Glass native |
| Type | Geist Sans/Mono, text-sm, tabular-nums | Inter 400–700 (+800 ceremony) |
| Charts palette | orange/emerald/purple/red/amber | n/a (no charts) |

## G3 — Navigation model
A: hash-router SPA in one web page; 5 mobile tabs + desktop side pane (11 destinations); deep-linkable query state everywhere; auth gate. B: native stack + 4 tabs; imperative auth+onboarding gates; screen-per-route; kebab menus + bottom sheets as secondary nav.

## G4 — Interaction patterns
A: desktop-first data density (keyboard grid nav, steppers, popovers, 40px rows, undo toasts, offline queue). B: mobile-native media-first (guided set pointer, video carousel, haptics, sheets, full-screen rest ring, ceremonies). Shared: superset colour groups, confirm dialogs, favourites, rest skip/+15, per-exercise history.

## G5 — Density at 360×780
A: 6 fixed bars (56+48+56+64=224px chrome worst-case) + 40px SetRows → ~12 set rows/viewport; content col 720px. B: header ~60 + tab 84 (web) + scroll cards (12px pad, radius 12) → ~5–6 medium cards/viewport; hero card ~180–220px. A shows more data per screen; B shows more media per screen.

## G6 — State quality
| Aspect | A | B |
|---|---|---|
| Loading | skeletons, busy spinners | spinner #3B82F6, Async caches |
| Empty | 200px empty-day, trophy-less "Choose program", "Nothing logged yet" | trophy outline card, "No custom workouts yet." |
| Error | Zod errors inline, toast errors, offline 503 JSON | ErrorBoundary full-screen + reload, Alert retries |
| Offline | full outbox + SW + shell | read caches only, mutations online-only |

## G7 — Polish/micro-interactions
A: sonner Undos, optimistic flips, 0fr→1fr accordions, reduced-motion, wake locks. B: 6-event haptics, marquee ceremony, Liquid-Glass, SuccessToast slide, coach-mark tip. A gaps: no haptics layer, no ErrorBoundary, no celebration moments. B gaps (self-documented): no Reanimated springs, no undo, no optimistic mutations.

## G8 — Accessibility
A: semantic main/header/nav, aria-live rest timer, sr-only labels, full keyboard nav, focus rings, `?` help, prefers-reduced-motion clamp. B: RN accessibilityProps usage NOT inventoried (§I); web build a11y unaudited; no reduced-motion handling found.

## G9 — Copy & tone
A: quiet, functional, tool-like ("Forge every set. Track every rep.", "Day N up next", "Saved offline — will sync when back online"). B: motivational, branded, celebratory ("Choose your path. Build your discipline.", "CONGRATULATIONS! … YOU EARNED 1 BADGE", "What's your win today?", "your data won't be saved… You cannot resume"), CBUM/name references throughout.

---

# §H — GAP LIST (the deliverable)

**Legend**: Size S <1d · M 1–5d · L >5d (planning estimates only). Every non-YES §F row maps 1:1 to a GAP below (98 gaps).

| GAP | B-# | Domain | B has | A has | User value | Sz | Depends on | Evidence B / A |
|---|---|---|---|---|---|---|---|---|
| 001 | B-002 | Auth | sign-up email-confirmation path | auto-sign-in only | email verification UX | S | SMTP exists in A already | AuthContext.tsx:90-111 / auth-screen.tsx:71-76 |
| 002 | B-007 | Onboarding | onboarding gate after auth | auth gate only | first-run guidance | M | GAP-003 | app/_layout.tsx:88-108 / app-shell.tsx:60-66 |
| 003 | B-011 | Onboarding | 8-step questionnaire (name…training style) | none | profile personalization + data for macro/goal engines | M | profile fields | onboarding/index.tsx:19-33 / — |
| 004 | B-012 | Onboarding | unit toggle w/ live height/weight conversion | units setting (static) | frictionless unit onboarding | S | GAP-003 | onboarding/index.tsx:63-72 / settings-sections.tsx:258-267 |
| 005 | B-013 | Onboarding | segmented progress bar + Finish→profile | none | progress feedback | S | GAP-003 | onboarding/index.tsx:176-206 / — |
| 006 | B-014 | Home | avatar+date+calendar home header | title-only TopBar | identity + quick calendar access | S | — | (tabs)/index.tsx:202-217 / top-bar.tsx |
| 007 | B-015 | Gamification | badge-unlocked banner on home | none | reward visibility | S | GAP-063..065 | (tabs)/index.tsx:220-234 / — |
| 008 | B-016 | Home | hero card: image, 32-tick progress ring, phase pills | 3-state text TodayCard | aspirational program presence | M | GAP-088 (covers), program phases GAP-052 | (tabs)/index.tsx:31-57,263-353 / home/today-card.tsx:160-338 |
| 009 | B-017 | Programs | persistent "Day N Completed" chip, tap to un-mark | Finished ✓ + 120s Undo only | correct mistakes beyond undo window | S | — | (tabs)/index.tsx:160-172,315-327 / today-screen.tsx:347-394 |
| 010 | B-019 | Home | Training Tools 2×2 grid on home | #/more hub + #/tools | feature discoverability | S | — | (tabs)/index.tsx:85-114 / more-screen.tsx |
| 011 | B-021 | Programs | difficulty/phase grouping + tagline browse | flat tabs list | choosing by level/phase | M | program difficulty model GAP-052 | programs/index.tsx:29-60 / routines-screen.tsx:356-555 |
| 012 | B-022 | Programs | multi-select delete per difficulty/phase | single delete | bulk management | S | GAP-052 | programs/index.tsx:95-150 / routines-screen.tsx:483-508 |
| 013 | B-023 | Programs | 12 preset programs (difficulty variants) | 3 routines + 6 sessions seeded | content breadth | M | content authoring | presetPrograms.ts:63-76 / server/seed.ts:191-260 |
| 014 | B-024 | Programs | detail hero + ring + phase chips + tabs | accordion + cursor strip | visual program identity | M | GAP-052, GAP-088 | user-detail.tsx:206-262 / routine-detail-screen.tsx:785-1233 |
| 015 | B-025 | Programs | Program Highlights (days/wk, minutes, difficulty) | none | at-a-glance commitment | S | GAP-052 | user-detail.tsx / — |
| 016 | B-026 | Programs | equipment carousel w/ real photos | none | know equipment needs | M | GAP-091 media | user-detail.tsx:250-259, lib/equipment.ts / — |
| 017 | B-027 | Programs | preview rows w/ scheduled badges | accordion (badges elsewhere) | plan vs schedule view | S | — | user-detail.tsx:155-170 / routine-detail-screen.tsx |
| 018 | B-028 | Day detail | hero, duration ring, muscle chips | series colours only | day identity + muscle targeting | M | exercise metadata | day-detail.tsx / card-popovers.tsx:89-217 |
| 019 | B-029 | Day detail | Favorite/Schedule/History/Mark Off action row | Schedule + log-day | quick day actions incl. favourite days | M | favourites model | day-detail.tsx:337-340 / schedule-shared.tsx |
| 020 | B-031 | Programs | Program Progress totals (sets logged, total weight) | per-workout/weekly stats only | long-horizon progress | S | — | program-progress.tsx:41-57 / insights/stats-tab.tsx |
| 021 | B-033 | Programs | legacy static detail route kept | hash rewrite instead | (compat shim; no user value) | S | — | programs/[id].tsx / router.ts:108-119 |
| 022 | B-034 | Session | N/total sets counter + progress bar | summary row after the fact | in-session progress feel | S | — | workout-session.tsx:564-593 / today/summary-row.tsx |
| 023 | B-035 | Session | Overview ↔ Video carousel toggle | inline cards only | guided media-first session | L | GAP-089..091 video | workout-session.tsx:1422-1495 / today-screen.tsx |
| 024 | B-037 | Session | full-screen RestRing (60 ticks) | RestBar in BottomBar | immersive rest | S | — | workout-session.tsx:77-143 / today/rest-bar.tsx |
| 025 | B-038 | Session | auto-move set pointer after rest | focus-next input setting | hands-free flow | S | guided pointer GAP-026 | workout-session.tsx:628-645 / settings A-106 |
| 026 | B-043 | Session | round-robin superset pointer w/ ⏮/⏭ | free-form grid | guided superset execution | M | session guidance model | workout-session.tsx:900-928 / — |
| 027 | B-040 | Session | end dialog discard-vs-save checkbox | always-save + undo | intentional discard | S | — | workout-session.tsx:930-950 / today-screen.tsx:347-394 |
| 028 | B-044 | Session | max-logged-weight info bar in session | last-time card in focus screen | live PR awareness | S | — | workout-session.tsx:570 / training-screen.tsx:205-211 |
| 029 | B-046 | Session | completion trophy screen w/ stats | toast + morph | celebration moment | S | — | workout-session.tsx:186-248 / today-screen.tsx:367-373 |
| 030 | B-047 | Session | one-time quick-tip coach toast | none | onboarding into session UX | S | — | workout-session.tsx:1626-1649 / — |
| 031 | B-048 | Session | trainer tips modal | library notes popover | per-exercise coaching | M | content authoring | active-workout.tsx:145-165 / card-popovers.tsx:51-85 |
| 032 | B-048a | Session | standalone player (SetDots, tips) | single #/today surface | (parity shim) | S | — | active-workout.tsx / today-screen.tsx |
| 033 | B-049 | On Demand | catalog: 32 static + user sessions + favourited days | none | off-program guided workouts | L | content + sessions model | on-demand/index.tsx / — |
| 034 | B-050 | On Demand | 45 fully RE'd sessions seeded | none | content depth | L | GAP-033 | scripts/stndrd-seed/sessions.json / — |
| 035 | B-051 | On Demand | search + category chips + FiltersSheet | none | discovery | M | GAP-033 | on-demand/index.tsx:35-60 / — |
| 036 | B-052 | On Demand | session detail title block + banner | none | session identity | M | GAP-033 | on-demand/[id].tsx / — |
| 037 | B-053 | On Demand | favourite hearts on sessions | exercise favourites only | save preferred sessions | S | GAP-033 | on-demand/[id].tsx:238-251 / use-favourite.ts |
| 038 | B-054 | On Demand | Favorite/Schedule/History/Mark Off row | none | session lifecycle actions | M | GAP-033 | on-demand/[id].tsx:419-432 / — |
| 039 | B-055 | On Demand | training-methods Dictionary (11 entries, 4 tabs) | none | education | S | content | on-demand/dictionary.tsx:27-124 / — |
| 040 | B-056 | Builder | hub search + sort | tabs only | find saved workouts | S | — | workout-builder/index.tsx:309-390 / routines-screen.tsx |
| 041 | B-057 | Builder | difficulty/duration/hero-image fields | name only | workout identity | S | GAP-088 covers | workout-builder/build.tsx / routines-screen.tsx:419-444 |
| 042 | B-058 | Builder | multi-select add w/ auto superset/triset/giant codes | manual group popover | fast structured building | M | series codes model | add-exercise.tsx:184, WorkoutContext.tsx:408-476 / picker-screen.tsx:255-292 |
| 043 | B-059 | Builder | "For all sets" propagation | per-set editing | bulk editing | S | — | WorkoutContext.tsx:488-524 / — |
| 044 | B-060 | Builder | tempo preset chips | custom 4-segment only | faster tempo entry | S | — | build.tsx:161-238 / set-row.tsx:173-236 |
| 045 | B-061 | Builder | trainer tip per exercise | library notes | coaching | S | content | WorkoutContext.tsx:532-536 / card-popovers.tsx:51-85 |
| 046 | B-062 | Builder | group-level rearrange screen | exercise up/down | reorder structure not just items | S | — | rearrange-series.tsx / today-screen.tsx:316-334 |
| 047 | B-063 | Builder | unsaved-changes leave guard | immediate persist | accidental-loss safety (A's model mostly obviates) | S | — | docs parity-master:198 / routine-detail edit mode |
| 048 | B-064 | Builder | program builder: difficulty × phase × weekly template | linear day editor | author full programs | L | program schema (phases/difficulty) | program-builder.tsx (1033 lines) / routine-detail-screen.tsx |
| 049 | B-065 | Builder | custom labels synced to DB | none | personal taxonomy | S | labels model | LabelPickerSheet.tsx / — |
| 050 | B-066 | Logs | text search across logs + per-workout trash | filters + export only | find/delete workouts | S | — | workout-logs/index.tsx:179-236 / history-screen.tsx:79-153 |
| 051 | B-067 | Logs | 6-month thumbnail calendar of logs | month grid + list | visual log density | M | thumbnails GAP-088 | workout-logs/index.tsx:66-140 / calendar/month-view.tsx |
| 052 | B-024/21 | Programs | difficulty + phase data model | kind=ROUTINE/SESSION only | level/periodization structure | M | schema + seeds | presetPrograms.ts / prisma Routine |
| 053 | B-069 | Logs | per-exercise weight-history table (date tabs, max badge, PATCH) | expandable read rows + focus-screen edit | audit/correct history per exercise | M | — | workout-logs/[id].tsx:69-192 / workout-block.tsx |
| 054 | B-070 | Calendar | continuously scrolling months, colored tiles, count badges | fixed 6×7 grid + dots | calendar feel + density | M | — | workout-calendar.tsx:10-88 / calendar/month-view.tsx:63-198 |
| 055 | B-073 | Schedule | time-of-day scheduling (hour/min/AM-PM, 3 modes incl. reschedule prefill) | date-only entries | plan the day's timing | M | ScheduleEntry.time + UI | ScheduleSheet.tsx:8-66 / schedule-shared.tsx:56-96 |
| 056 | B-074 | Schedule | time-based Missed derivation + extras metadata (duration/program linkage) | date-based MISSED | accurate no-show tracking | M | GAP-055 | scheduledExtras.ts:41-58 / program-rules.ts |
| 057 | B-075 | Nutrition | nutrition tab: WeekStrip, MacroSummary, hourly timeline | none | calorie/macro tracking | L | food domain | (tabs)/nutrition.tsx:120-182 / — |
| 058 | B-076 | Nutrition | macro summary bar w/ toggle | none | daily targets at a glance | M | GAP-057 | MacroSummary.tsx:21-25 / — |
| 059 | B-077 | Nutrition | food search sheet + multi-add cart + Recent History | none | fast logging | L | GAP-057 + food API | FoodSearchSheet.tsx:181-240 / — |
| 060 | B-078 | Nutrition | seeded catalog + OpenFoodFacts augment | none | huge food coverage | L | GAP-057 + external API | seedFoods.ts, food-api.ts:142-170 / — |
| 061 | B-079 | Nutrition | barcode lookup → log (typed; camera stubbed even in B) | none | scan-to-log | M | GAP-057 (+camera) | ScanSheet.tsx:47-79 / — |
| 062 | B-080 | Nutrition | create custom food | none | custom foods/recipes | M | GAP-057 | CreateFoodSheet.tsx / — |
| 063 | B-081 | Nutrition | food favourites | none | quick re-log | S | GAP-057 | food-api.ts:121-124 / — |
| 064 | B-082 | Nutrition | food detail sheet w/ servings stepper | none | portion accuracy | S | GAP-057 | FoodDetailSheet.tsx / — |
| 065 | B-083 | Nutrition | Mifflin-St-Jeor presets (−300/maint/+400) | none | auto macro targets | M | GAP-057 + profile GAP-002 | nutritionGoals.ts:19-113 / — |
| 066 | B-084 | Nutrition | custom macro goal store | none | personal targets | S | GAP-065 | customGoals.ts / — |
| 067 | B-085 | Nutrition | dual-thumb hour-range timeline slider + hide-empty | none | custom day structure | M | GAP-057 | MacroSettingsSheet.tsx:250-297 / — |
| 068 | B-086 | Nutrition | nutrition calendar sheet w/ logged markers | none | navigation by day | S | GAP-057 | CalendarSheet.tsx / — |
| 069 | B-087 | Nutrition | per-day/per-hour entry CRUD | none | when-you-ate records | M | GAP-057 | routes/foods.ts:108-255 / — |
| 070 | B-088 | Progress | weigh-in history w/ month chips + trend circles | weight as generic body metric | focused weight journey | S | — | progress.tsx:13-18 / body-screen.tsx |
| 071 | B-089 | Progress | 4 progress-photo slots (Front/Back/Side/Side) | none | visual body evidence | M | image upload | LogWeightSheet.tsx / — |
| 072 | B-090 | Home | dashboard Weight card w/ timestamp + trend | stats row (sets/vol/streak) | primary body metric visibility | S | — | dashboardtab.tsx:413-432 / home/stats-row.tsx |
| 073 | B-091 | Home | dashboard Calories card | none | nutrition on dashboard | M | GAP-057 | dashboardtab.tsx:434-450 / — |
| 074 | B-092 | Gamification | XP + 6 milestone badges | none | motivation loop | M | gamification model | WorkoutContext.tsx:731-758 / — |
| 075 | B-093 | Gamification | badge ceremony (marquee, medal, XP) | none | celebration | S | GAP-074 | badge-ceremony.tsx:10-108 / — |
| 076 | B-094 | Gamification | banner + claim + auto-redirect | none | reward surfacing | S | GAP-074 | (tabs)/index.tsx:220-234 / — |
| 077 | B-095 | Profile | grouped profile cards + support/social/legal rows | settings + more hub | account hub parity | S | — | profile/index.tsx:83-153 / more-screen.tsx |
| 078 | B-096 | Profile | profile fields (age/height/weight/level) + accordion autosave | email/name only | richer profile (feeds macros GAP-065) | M | profile schema | profile/edit.tsx:25-120 / settings-sections.tsx:424-434 |
| 079 | B-097 | Profile | 3 notification switches | reminderTime setting | notification preferences | S | — | profile/notifications.tsx:16-33 / settings-sections.tsx:1008-1024 |
| 080 | B-098 | Profile | greeting text + avatar initials header | initials chip (desktop only) | warmth | S | — | dashboardtab.tsx:57-71 / nav-pane.tsx |
| 081 | B-100 | Library | 526-exercise media catalog (R2/CDN) | ~112 local seeds + user customs | breadth + media | L | media hosting | exerciseCatalog.ts:16-60 / server/seed.ts |
| 082 | B-101 | Library | equipment filter chips + thumbnails | category chips only | filtering by equipment | S | equipment metadata | exercise-library.tsx:299-324 / picker-screen.tsx:594-695 |
| 083 | B-102 | Library | video detail w/ Setup/Target tiles + speed + instructions | notes popover | form education | L | GAP-081 media | exercise-library.tsx:63-126 / card-popovers.tsx:51-85 |
| 084 | B-103 | Library | R2 asset URL builders | none | (infra for GAP-081/083) | S | GAP-081 | firebase-storage.ts:4-61 / — |
| 085 | B-104 | Library | catalog rebuild scheduler + admin endpoint | DB rows (no rebuild) | (infra parity) | S | — | catalogScheduler.ts / — |
| 086 | B-105 | Community | mock feed (posts, likes, tags) | none | social motivation (mock in B!) | M | backend feed | community.tsx:40-87 / — |
| 087 | B-106 | Community | mock leaderboard | none | competition (mock in B!) | M | backend | community.tsx:89-101 / — |
| 088 | B-112/113/114 | Media | workout covers: library, picker sheet, hardened upload | none | visual identity of workouts/programs | M | image storage + upload API | CoverPickerSheet.tsx, routes/workoutCovers.ts / — |
| 089 | B-041 | Media | per-exercise demo video streaming | none | form guidance | L | GAP-081 | workout-session.tsx:649-663 / — |
| 090 | B-042 | Media | video speed badge cycling | none | technique review | S | GAP-089 | workout-session.tsx:1494-1495 / — |
| 091 | B-026 | Media | real equipment photos | none | equipment familiarity | M | GAP-081 | lib/equipment.ts:32-71 / — |
| 092 | B-107 | Polish | 6-event haptics layer | vibrate on rest/interval only | tactile feedback | S | — | lib/haptics.ts:21-34 / rest-state.tsx |
| 093 | B-110 | Polish | ErrorBoundary + reload fallback | none (grep: 0) | crash recovery | S | — | ErrorBoundary.tsx:16-30 / — |
| 094 | B-111 | Programs | WeekStepper day-status mapping on hero | upcoming strip (no status dots) | week-at-a-glance status | S | — | WeekStepper.tsx:16-29 / home/upcoming-strip.tsx |
| 095 | B-115 | Polish | Liquid-Glass native tab bar | web NavBar | (platform parity; N/A on web) | S | — | (tabs)/_layout.tsx:121-126 / nav-bar.tsx |
| 096 | B-116 | Polish | dark-only + Inter identity | dual theme + Geist | brand look (A's dual theme is a superset) | S | — | _layout.tsx:44-75 / globals.css |
| 097 | B-117 | Home | dashboard counting semantics incl. On Demand | uniform counts | (parity rule; no value until GAP-033) | S | GAP-033 | dashboardtab.tsx:152-175 / home/use-dashboard.ts |
| 098 | B-039 | Session | per-session settings sheet (4 toggles) | global settings only | per-session prefs | S | — | workout-session.tsx:196-260 / settings-sections.tsx |

**GAP totals: 98** (NO-status 47 · PARTIAL-status 40 · DIFFERENT-status 11). Sizes: L ×10 (GAP-023, 033, 034, 048, 057, 059, 060, 074→M, 081, 083, 089 — count L: 023,033,034,048,057,059,060,081,083,089 = 10), M ×31, S ×57.

## Reverse gaps — A-only capabilities APP-B lacks (REVERSE-001…028)

| REV | A capability (evidence) | B status |
|---|---|---|
| R-001 | 10 exercise modalities incl. distance/time cardio logging (constants.ts:20-35) | B is weights/reps only |
| R-002 | Set types N/W/D/F/A w/ tap-cycle + 420ms hold picker (set-row.tsx:310-449) | B set "Type" column semantics unknown/limited |
| R-003 | Warm-up sets excluded from PRs/e1RM/volume (constants.ts:102) | no PR engine at all |
| R-004 | RPE 1-10 half-steps per set (set-row.tsx:138-170) | none |
| R-005 | Per-set comments + workout note (TrainingSet.comment; meta-row.tsx) | none |
| R-006 | Keyboard grid nav + steppers + mobile Save-set bar (set-row.tsx:519-565) | n/a native |
| R-007 | Copy-last/copy-previous glyph + guarded copy (set-row.tsx:569-580) | none |
| R-008 | Rest engine: 880Hz beep, vibrate, OS notification hidden, wake lock, remembered duration, ±15/skip (rest-state.tsx) | B has ring + sounds toggle, no OS notif/wake lock |
| R-009 | Undo (finish 10s/120s; schedule) | none |
| R-010 | Replace exercise preserving logged sets (picker-screen.tsx:258-283) | replace exists in builder pending-actions; not mid-workout with carried logs |
| R-011 | PR engine: per-(exercise,reps) records, e1RM ×3 methods, superseded dimming, leaderboard, recalc (records API, insights) | none |
| R-012 | Per-exercise goals (6 types, progress) (exercise-overview-screen.tsx:463-782) | none |
| R-013 | Custom exercise creation + per-exercise defaults (unit/increment/rest/graph) (picker-screen.tsx:703-828) | fixed 526 catalog, no custom exercises (routes/exercises.ts has only catalog+rebuild) |
| R-014 | Exercise favourites + last-time card (use-favourite.ts; training-screen.tsx:205-211) | no exercise favourites |
| R-015 | Charts: metric select, 3M/6M/All, trend line, y-from-zero (training/body graphs) | B has NO charts anywhere |
| R-016 | Insights stats: period selector, streaks, weekly rhythm, wk-vs-wk deltas, volume-by-exercise (stats-tab.tsx) | none |
| R-017 | Configurable multi-metric body tracking w/ goals + Δ tones (body-screen) | weigh-ins only |
| R-018 | Tools: 1RM/plate/set calculators + interval timer | none |
| R-019 | 42-setting customization incl. timezone/program rules/column toggles | 3 switches + few |
| R-020 | Calendar filters (category/exercise/thresholds, any/all) + list view + projected ghosts | none |
| R-021 | Data portability: JSON backup export/import (Merge/Replace) + CSVs + recalc + clear | none |
| R-022 | PWA: install, SW per-session cache, offline outbox, delta sync | none (web app, no offline) |
| R-023 | Local daily-reminder notifications (Trigger API) | settings-UI only in B |
| R-024 | Help screen + global keyboard shortcuts | none |
| R-025 | Light/Dark/System theming | dark-only |
| R-026 | Schedule 409 → Replace dialog → Undo; reopen DONE/MISSED; 4 status dots | B has reschedule + missed, no conflict/undo/reopen |
| R-027 | Log-day preview w/ per-set checkboxes + drafts | none |
| R-028 | Save-as-session promotion from finished workout | user-created sessions exist in builder (DIFFERENT path) |

---

# §I — Unknowns

1. **APP-B runtime behavior** — not run (reason in header); all B claims are static-code + in-repo-doc + screenshot based. No live verification of any B flow.
2. **B set-table "Type" column semantics** — docs §6.11 describe the column; the value set (warm-up? drop?) was not located in code (grep inconclusive).
3. **B accessibility** (RN accessibilityProps / web a11y) — not inventoried in either inventory; UNKNOWN.
4. **B original-app features never RE'd by B's own docs** — original's auth/onboarding/community UI, XP formula, subscription paywall (docs/build-plan phases C–E) — the gap list inherits these blind spots.
5. **B's R2 catalog / CDN / OpenFoodFacts endpoints liveness** — no network calls made (read-only audit); UNKNOWN whether media URLs still resolve.
6. **A rendered-pixel verification beyond the auth screen** — live screenshot captured only for `#/auth`; other screens measured from code tokens (90+ pre-existing QA screenshots in APP-A's `download/` corroborate but were not re-captured).
7. **B community/leaderboard fidelity vs original** — B itself marks them mock/out-of-scope; true original behavior UNKNOWN.
8. **A `db/custom.db` + `download/*.png` dirty state** — pre-existing runtime/QA artifacts (present before this audit began; this audit wrote nothing; see git status proof).

---

# Self-check (7 mandated questions)

1. **Route-file counts**: APP-A = 73 API route files (104 endpoint methods) + 1 page route (`/`) = 74; APP-B = 49 mobile route `.tsx` files (40 screens incl. `+not-found` + 9 `_layout.tsx`) + 8 API route modules (26 endpoint methods).
2. **§C screen counts**: APP-A 21 (20 authed + auth); APP-B 40 (39 user-facing + not-found).
3. **E1 ↔ §F cross-reference**: 118 B-### features (B-001…B-117 + B-048a) ↔ 118 §F rows, 1:1, none omitted.
4. **Non-YES ↔ GAP count match**: §F non-YES = 98 (NO 47 + PARTIAL 40 + DIFFERENT 11) ↔ GAP-001…GAP-098 = 98, 1:1 (column "B-#" in §H states the mapped row). YES = 20. 20+98 = 118 ✔.
5. **Measured (not described) tokens**: §G2 + A5 + B5 give literal hex/oklch/px values read from `globals.css`/`tokens.ts` and `constants/colors.ts`/`_layout.tsx`.
6. **User-facing strings**: tone/copy samples recorded in §G9 and both annex inventories (A9/B9); a complete literal string dump of both apps was not reproduced inside this report — coverage is by domain + representative strings (annex files carry per-feature string evidence).
7. **Zero files modified**:
   - APP-A `git -C /home/z/my-project status --short | head`: ` M db/custom.db`, ` M download/qa-p5-*.png` (4 pngs) — all pre-existing runtime/QA artifacts present before the audit; this audit performed zero writes inside the repo (worklog intentionally NOT updated to preserve the read-only proof).
   - APP-B `git -C /home/z/scratch/Fitness-Tracker-2 status --short`: **empty (clean)**.
   - All audit writes went to `/home/z/scratch/audit/` (outside both repos): 2 annex inventories + this report + 1 screenshot.

*End of report. Facts and gaps only — no conclusions or recommendations, per mandate.*
