# PART 9 — Implementation Plan (living document; update as you go)

Repo: Next.js 16 App Router + TS strict + Prisma (SQLite sandbox, portable DDL) + custom
credentials auth (`requireUser`) + Tailwind4/shadcn + TanStack Query + Zod. Hash router in
`src/features/shell/router.ts`. **Resume point: this file — read "Progress" at the end.**

## Stack equivalences (decisions — P1)
- `pnpm typecheck` → `bunx tsc --noEmit` (repo has no script; uses bun).
- `pnpm lint` → `bun run lint` (ESLint 9 + `eslint/setforge-tour.mjs`).
- `pnpm test` → repo equivalents: `bun run verify:arch`, `bun run verify:formulas`,
  `bun run tour:check`, `bash scripts/qa/verify-layout.sh <hash>` (320/360/390/430).
  No Vitest/Playwright in this sandbox — E2E via agent-browser @360 (established Part 3–8 practice, worklog-documented).
- Auth.js → repo custom auth (Session table + cookie). Social link UI shows the
  provider list; actual OAuth is env-gated (no secrets in sandbox) — note in audit.
- Postgres → env-switchable portability kept: SQLite sandbox, DDL-only additive migrations.
- Offline outbox → repo has localStorage-backed offline path for tour state; server of
  record remains authoritative; difficulty swap etc. work online-first. Noted as deviation.

## Vocabulary mapping (spec name → repo model) — §0/§1 decisions
| Spec | Repo | Δ |
|---|---|---|
| Program | `Routine` (kind=ROUTINE) | + tagline, description, weeks, isPublic |
| Variant | NEW `ProgramVariant` | routineId+difficulty unique; daysPerWeek, equipment Json |
| Phase | NEW `ProgramPhase` | variantId, idx, name, overview, minutesMin/Max |
| Day | `RoutineDay` | + phaseId?, equipment Json (kind=dayType, idx=sortOrder, minutes=estMinutes) |
| Series | `RoutineGroup` | — |
| SeriesExercise | `RoutineExercise` | + tip, restNone |
| PrescribedSet | `PredefinedSet` | + isAmrap |
| Override | NEW `PhaseOverride`, `DayOverride` | Json payloads |
| DayFavorite | NEW `DayFavorite` | backfill from RoutineDay.isFavorite |
| ScheduleEntry | `ScheduleEntry` | + markedOff; status vocabulary: SCHEDULED→`PLANNED`, COMPLETE→`DONE`, MISSED→`MISSED` (existing enum; additive, never renamed) |
| Workout(Log) | `Workout` | + sourceLabel, difficulty, durationSec; source = sourceType (PROGRAM→ROUTINE_DAY, ON_DEMAND→SESSION, CUSTOM→FREESTYLE/COPY); dayId = sourceDayId |
| PerformedSet | `TrainingSet` | setType incl. AMRAP exists |
| Exercise | `Exercise` | + position, altGroup (setup/target/equipment/videoUrl exist) |
| OnDemandWorkout | `Routine` (kind=SESSION) | + intensity, durationBand, equipmentLevel, categories, isFeatured; dayId = its single day |
| Challenge/Dismiss/SupportTicket | NEW models | — |
| User difficulty | `User.difficulty` | cursor fields stay on `ActiveRoutine` (+ variantId, cursorPhaseIdx) — ActiveRoutine IS the repo's cursor owner; forking cursor onto User would create two truths. programStartedAt = startedAt. User gains difficulty + deletedAt (soft delete §9). |
| Routes | `/days/{id}` NEW + rewrite `#/programs/{id}/day/{id}`→`#/days/{id}` (3 releases); `/days/{id}/rearrange` (rewrite .../arrange); `/days/{id}/replace/{reId}` NEW; `/exercises/{id}` = `#/exercise-overview/{id}` (evolved to §5.3); `/days/{id}/notes/{reId}` NEW; `/on-demand/filters` NEW; `/account/{subscription,support,social,delete}` NEW; `/logs?dayId=&view=` on existing |

## Per-§ plan
- **§1 Schema** `prisma/schema.prisma` (additive), `prisma/migrations/2026…_part9_program_variants/migration.sql` (idempotent, IF NOT EXISTS-style via db push + backfill script `scripts/migrate-part9.ts` — Part 8 precedent), `src/server/seed.ts` + `scripts/seed-demo-data.ts` (≥3 programs × ≥2 variants, 1 with 3 phases + REST days, ≥8 on-demand covering all category/duration/equipment values, 1 active challenge). Risks: SQLite ALTER TABLE constraints → additive columns only; db:push --accept-data-loss is repo convention.
- **§2 Difficulty** `PATCH /api/user/difficulty` (new), `src/lib/schemas.ts` + `api.ts` + store; programs screens read difficulty. Files: `src/app/api/user/difficulty/route.ts`, program-service `changeDifficulty()`.
- **§3+§4 Programs** `src/features/routines/routines-screen.tsx` (catalog: difficulty SubBar segmented + cards), `routine-detail-screen.tsx` (Overview|Program tabs, phase chips, day rows w/ dnd, BottomBar Start/Continue), server `listPrograms/getProgramDetail` variant-aware; `POST /api/programs/[id]/start`.
- **§5 Day overview cluster** `src/features/routines/program-day-screen.tsx` → evolved to `#/days/{dayId}` (`src/features/day/day-screen.tsx`), NEW `day-rearrange-screen.tsx`, `day-replace-screen.tsx`, `day-notes-screen.tsx`; exercise info = `src/features/exercise-overview/exercise-overview-screen.tsx` evolved; APIs `/api/days/[id]`, `/api/days/[id]/override`, `/api/days/[id]/favorite`, `/api/days/[id]/mark-off`, `/api/phases/[id]/order` (+DELETE), `/api/exercises/[id]/suggestions`.
- **§6 Schedule/Calendar** program-service `startProgram` regenerates ScheduleEntry rows (incl. REST dates); `POST /api/schedule/reconcile-missed` (idempotent; on-open via dashboard query + nightly reuse of Part 5 refresh); calendar screen continuous months + dots + legend; tap-day → ActionList.
- **§7 On demand** on-demand-screen (chips + filter icon w/ badge), NEW filters screen (URL state), server filter in listPrograms(SESSION) or `/api/on-demand`.
- **§8 Logs** logs-screen (2-line rows, calendar toggle, dayId chip), log-detail (table + maxWeight + actual rest + edit history link), workout-service sets sourceLabel/difficulty/durationSec on start/finish.
- **§9 More/Account** more-screen rows + NEW account screens (subscription/support/social/invite/delete) + `/api/support` (rate limit 5/day), `/api/account/delete` (soft delete + anonymize), `/api/account/social`.
- **§10+§11 Challenge+Home** `GET /api/challenges/active`, `POST /api/challenges/[id]/join`, ChallengeDismiss; workout-screen program card states + challenge banner above.
- **§12 Builder** program-editor-screen: variant tabs, phase add/remove, day fields, per-exercise tip/restNone/per-set AMRAP (sets-editor-screen), publish toggle.
- **§13 Tour** registerScreen everywhere new + `tour` attrs; `bun run tour:gen`; lint zero errors.
- **§14 API** all endpoints above, Zod + requireUser + owner scoping (repo convention `src/server/http.ts`).
- **§15 Verify** unit checks appended to `scripts/qa/verify-architecture.ts` (or new `verify-part9.ts`): override merge, relabel, missed reconcile tz, duration fmt, maxWeight mixed units, AMRAP render, difficulty swap, durationBand. Harness all routes. agent-browser E2E 1–9. Audit doc.

## Progress (resume point — update after every §)
- [x] P1 discovery complete; this file + part-09.md written. Baseline: dev server 200, lint clean (warnings = pre-existing 56 tour backlog), tsc clean.
- [ ] §1 … §15 pending.
