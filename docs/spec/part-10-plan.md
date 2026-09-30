# Part 10 — plan (resume point; update after every §)

Source spec: `docs/spec/part-10.md` (verbatim). This file records per-§ target files,
reuse decisions and risks. **Update before committing each §.**

## Environment reality (binding deviations, recorded once)

| Spec assumes | Sandbox reality | Decision |
|---|---|---|
| Postgres via env, SQLite fallback | SQLite only (`DATABASE_URL=file:./db/custom.db`) | keep portable schema; migrations dir + `db:push` |
| Auth.js | custom credentials auth (scrypt + `Session` + httpOnly cookie, `requireUser`) | keep custom auth (L8 satisfied: guard + owner scope everywhere) |
| Serwist PWA | hand-rolled `public/manifest.webmanifest` + `public/sw.js` + `pwa.tsx` glue | keep |
| Dexie outbox | **no Dexie in repo** — offline handled via existing mutate hooks (optimistic + invalidate) | no new offline layer; live screen must survive reload via server state (`Workout.startAt` etc.). Note in audit. |
| Vitest / Playwright | `scripts/qa/verify-*.ts` batteries (bun) + `agent-browser` E2E + `scripts/verify-layout` harness | same pattern: new `scripts/qa/verify-part10.ts` |
| `/route` pages | **single `/` + hash routes** (sandbox law) | route map below |
| pnpm | bun | `bun run …` |
| Docker/CI/Lighthouse | not available in sandbox | ship-gate items verified locally where possible; deviations recorded in audit |

### Route map (spec path → hash route)

| Spec | Hash route | Notes |
|---|---|---|
| /workout/[id]/live | `#/session` | evolve in place (never fork) |
| /workout/[id]/live/settings | `#/session/settings` | NEW |
| /builder (Your workouts) | `#/builder` | evolve hub → Your workouts list (§4.1) |
| /builder/[id\|new] | `#/builder/session/{id}` · `#/builder/session/new` | custom workout = Routine kind=SESSION source CUSTOM (see §4 notes) |
| /builder/[id]/add (+/selected) | `#/builder/session/{id}/add` (+ `/selected`) | NEW; `?series=new\|{reId}` |
| /builder/[id]/add/filter/muscle·equipment | `#/filters/muscle` · `#/filters/equipment` | NEW, shared by Builder-add + Library + Replace |
| /builder/[id]/tempo/[seriesExerciseId] | `#/tempo/{reId}` | NEW, shared by builder + live |
| /calendar/[yyyy-mm-dd] | `#/calendar/{date}` | NEW full-screen day detail |
| /schedule/pick | `#/schedule/pick` | exists |
| /progress (+/log) | `#/progress` (+ `#/progress/log`) | NEW; reuses body weight/photo services |
| /steps | `#/steps` | NEW |
| /dashboard/program | `#/dashboard/program` | NEW |
| /account/profile | `#/profile` | evolve existing Manage Profile |
| /account/password | `#/account/password` | NEW |

## §0 REMOVE — Challenge (lead, done first)

- schema.prisma: drop `Challenge` + `ChallengeDismiss` + `User.challengeDismisses` + `ProgramVariant.challenges` (the ONE allowed drop)
- delete `src/app/api/challenges/**` (3 routes), `src/features/workout/challenge-banner.tsx`
- workout-screen.tsx: remove banner import/render; program-card.tsx: remove `startsIn` branch (challenge-only state)
- program-service.ts: remove §10 section (getActiveChallenge/joinChallenge/dismissChallenge/isChallengeJoined + resolveUserVariantId if now unused)
- api.ts `challengesApi`/`ChallengeDTO`, query.tsx `qk.challenge`/`useActiveChallenge`
- migrate-part9.ts `seedChallenge` (script still runnable → neutralize)
- history kept (challenge mentions allowed): `prisma/migrations/*` (immutable, checksums), `docs/spec/part-09*` history
- DROP TABLE in the part-10 migration SQL; db:push applies to SQLite dev

## §1 SCHEMA (lead)

Additive except §0 drop. Mapping decisions (single-source rule):

- `User` += `gender String?` (MALE|FEMALE|OTHER|UNSPECIFIED, Zod-validated), `birthYear Int?`, `weighInDays Json?` (int[] 0..6 — SQLite has no list primitive), `stepGoal Int @default(10000)`, `avatarKey String?`
- height: **reuse `UserProfile.heightCm`** (exists) — NOT duplicated on User
- `Workout` += `markedComplete Boolean @default(false)`, `totalVolume Float?` (kg), `totalSets Int?`
  - startedAt/endedAt = **existing `startAt`/`endAt`**; backfill `startAt = createdAt` where null
- `PerformedSet` = existing `TrainingSet`: `restPlannedSec`/`restActualSec` exist; `loggedAt` = **existing `completedAt`** — no new columns
- `WorkoutSettings` → **extend existing `UserSettings`** (per-user singleton, `showTempo` already there):
  `autoAdvance` = existing `autoMoveNextSet` (default bumped false→true: §3 rebuild supersedes Part 6 pointer flow), `countdownSounds Boolean @default(false)` NEW, `videoSpeed Float @default(1.0)` NEW. API endpoint still `PATCH /api/workout-settings` (writes those keys). Single source per setting, no dual table.
- `StepEntry` NEW: id · userId · date (UTC midnight) · steps Int · source String @default("MANUAL") · @@unique([userId, date])
- `BodyPhoto pose` → **reuse `ProgressPhoto.slot`** (FRONT|BACK|LEFT|RIGHT ⊇ spec FRONT|BACK|SIDE) — no schema change; §8.2 shows Front · Back · Left · Right slots (superset of spec's 3, existing photos kept valid)
- TempoPreset: static TS list (§4.6) — no table
- Migration: `prisma/migrations/20261002000000_part10_fit_for_strangers/migration.sql` (idempotent SQLite dialect + Postgres-portable) + `bun run db:push` + `scripts/qa/backfill-part10.ts` (startAt backfill, totalVolume/totalSets for finished workouts)

## §2 HOME difficulty chip (lead)

- Extract `useChangeDifficulty()` from routines-screen's applyDifficulty → shared hook (routines/screen-helpers.tsx), reused by Home ProgramCard Row2 (32px chip + ▾ → ActionList 3 items, current checked → §2 confirm modal → userApi.setDifficulty → invalidate session/programs/dashboard/schedule/programDetail + toast)

## §3 LIVE LOGGING REBUILD (subagent A)

Route `#/session`. Read first: session-screen.tsx, session/* (rest-state, rest-ring-block, use-mutate), group-card.tsx, workout-service.ts.
Key mapping: FocusCard sticky; SubBar Overview|Logs|History; total time = now − startAt (rAF hook); focus index → localStorage per workoutId (Dexie absent — see deviations; survives reload); rest ring reuse; countdown beeps Web Audio; exit modal semantics per spec (n=0/off → discard; n>0/off → partial saved; on → finish); POST /api/workouts/[id]/sets etc. largely exists via workoutsApi — evolve.

## §4 BUILDER REBUILD (subagent B)

Custom workout = existing Routine kind=SESSION (on-demand) vs new "source CUSTOM"… **decision: reuse kind=SESSION + new `source String?` field on Routine ("CUSTOM" for user-built, null/“TEMPLATE” default)** — §4.9 spec says Day(kind WORKOUT, source CUSTOM); in this repo a workout template is a Routine+Day; mark user-built single-day SESSIONs as source=CUSTOM so "Your workouts" lists them separately from on-demand catalog. Add `source String? @default(null)` to Routine in §1.
Your workouts list = #/builder hub evolve. Add-exercise flow with k-label mapping (0..6), 4-per-series cap, ≥5 separate series. Tempo picker route shared. Validation inline. Save → session editor existing service (routine-service create/update with days/sets).

## §5 CALENDAR day detail (subagent C)

`#/calendar/{date}` + "Today" TopBar button + picker footer chips (Yesterday/Today/Tomorrow — one shared component). Schedule entries API exists (GET /api/schedule?date= likely needs adding; check). MISSED actions (Do it today/Reschedule/Dismiss) — reschedule/dismiss endpoints NEW.

## §6 LOG DETAIL compare + inline edit (subagent C)

Compare columns (this + 3 prior sessions, fixed Set column, bold best weight); Edit history exists (Part 9) → ensure per-row Delete + recompute totalVolume/totalSets.

## §7 DASHBOARD top half (subagent D)

Program card (48+40+40 + CTA row) → tap → `#/dashboard/program` progress screen; Today section (reuses §5.1 renderer); Stats tiles (Weight + Steps). Existing Part 5 content kept below.

## §8 PROGRESS + STEPS (subagent D)

`#/progress` (Weigh-in|Photos|History tabs — reuse measurement-service + ProgressPhoto), `#/progress/log` (week strip, future guard, photo slots), `#/steps` (StepEntry CRUD, goal, week list).

## §9 PROFILE (subagent D or lead)

Evolve `#/profile`: avatar (media adapter), gender/birthYear/height/fitness level (=useChangeDifficulty)/weigh-in days/units/timezone rows; `#/account/password` route (zxcvbn-lite score check ≥3 — simple heuristic, no new dep).

## §10 TOUR / §11 API / §12 POLISH (lead, after waves)

Tour: register all new routes + controls, tour:gen, zero lint violations.
API audit vs §11 list; add missing (schedule?date=, reschedule, dismiss, program/progress, weigh-ins upsert, steps, equipment, user/profile, user/password, workout-settings, exercises history/max).
Polish: skeletons/empty/error states on new routes; a11y sweep.

## §13 VERIFY / §14 SHIP / P5 AUDIT (lead)

New `scripts/qa/verify-part10.ts` (unit battery: k-label mapping, 4-cap, tempo parse, exit semantics, focus order, step ADD/SET, total-time derivation, validation matrix, future-date guard, difficulty single-source). agent-browser E2E subset of the 15 spec journeys (adapted to hash routes). Harness on all new routes at 320/360/390/430. `docs/spec/part-10-audit.md` + worklog + final report.

## Progress log

- [x] P1 discovery complete
- [x] §0 REMOVE challenge (99362d6)
- [x] §1 schema + migration + backfill (99362d6)
- [x] §2 Home difficulty chip + useChangeDifficulty + ActionList (99362d6)
- [ ] §3 · [ ] §4 · [ ] §5/§6 · [ ] §7/§8/§9 · [ ] §10/§11/§12 · [ ] §13/§14
