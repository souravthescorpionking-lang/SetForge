# Part 10 — audit (P5: requirement → code path)

Spec: `docs/spec/part-10.md`. Every requirement line maps to the satisfying code path.
Verification: tsc 0 · lint 0 errors · tour:gen clean · verify:arch/formulas/part9/part10 ALL PASS ·
layout harness 22 routes PASS at 320/360/390/430 · agent-browser E2E below.

## §0 REMOVE — Challenge
| Requirement | Path |
|---|---|
| Drop Challenge + ChallengeDismiss models | `prisma/schema.prisma` (models deleted); `prisma/migrations/20261002000000_part10_fit_for_strangers/migration.sql` (DROP TABLE IF EXISTS ×2) |
| Delete /api/challenges/* | directory removed (grep src/ → zero hits outside prisma/migrations history + docs/spec history) |
| Home banner / Join / dismiss | `challenge-banner.tsx` deleted; `workout-screen.tsx` renders no banner |
| "Starts in N days" CTA branch | `program-card.tsx` CardModel startsIn variant removed |
| Related client code | `api.ts` challengesApi/ChallengeDTO · `query.tsx` qk.challenge/useActiveChallenge/invalidator removed |
| Seed rows | `scripts/migrate-part9.ts` seedChallenge neutralized |

## §1 SCHEMA
| Requirement | Path |
|---|---|
| User += gender/birthYear/weighInDays/stepGoal/avatarKey | `prisma/schema.prisma` User block (gender string enum Zod-validated; weighInDays Json int[] — SQLite law) |
| heightCm | **UserProfile.heightCm reused** (single source; §9 edits it) |
| Workout += startedAt/endedAt/markedComplete/totalVolume/totalSets | startAt/endAt exist (backfilled by `prisma/scripts/backfill-part10.ts`); markedComplete/totalVolume/totalSets added |
| PerformedSet += restPlannedSec/restActualSec/loggedAt | **TrainingSet already has all three** (loggedAt = completedAt) — no change |
| WorkoutSettings | **UserSettings extended** (userId @unique singleton): autoAdvance=autoMoveNextSet (default bumped true via backfill), countdownSounds + videoSpeed added; `PATCH /api/workout-settings` (src/app/api/workout-settings/route.ts) |
| StepEntry | `prisma/schema.prisma` + migration CREATE TABLE + `src/server/services/steps-service.ts` |
| BodyPhoto pose | **ProgressPhoto.slot reused** (FRONT/BACK/LEFT/RIGHT ⊇ spec FRONT/BACK/SIDE) |
| TempoPreset static | `TEMPO_PRESETS` in `src/lib/constants.ts` + presets in tempo screen |
| Idempotent migration + backfill | migration.sql + `bun run db:backfill` (package.json) |

## §2 HOME difficulty chip
| Requirement | Path |
|---|---|
| Row2 trailing 32px chip + ▾ → ActionList checked | `src/features/workout/program-card.tsx` (ActionList + tour id workout.difficultyChip) |
| Same confirm + server action as Part 9 §2 | `src/features/routines/use-change-difficulty.tsx` (shared by Programs SubBar + Home chip + §9 fitness level) |
| Card re-renders + toast | invalidations in the hook; browser-verified (chip → Advanced → Programs radio follows) |

## §3 LIVE LOGGING
| Requirement | Path |
|---|---|
| TopBar ✕ · total time · ⚙ | `session-screen.tsx` (End button + TOTAL TIME + settings); `time.ts` formatTotalTime |
| SubBar Overview/Logs/History | session-screen tab state |
| FocusCard R1–R6 + collapse | `focus-card.tsx` (series label · A1 · n/N · set type + target · Max logged · tempo row · focus SetRow · video + speed chip) |
| SetRow focus variant (L2) | `src/components/set-row/set-row.tsx` variant extension |
| Log set → ✓ + rest + auto-advance series order | use-mutate + rest-state.tsx; focus order unit-checked (battery §2) |
| Countdown beeps (Web Audio, visible only) | `countdown-audio.ts` |
| Total time survives reload | derived from server startAt (battery §1) |
| Logs tab / History tab | session-screen tabs; `GET /api/exercises/[id]/history` |
| Jump-to-exercise + focus persistence | localStorage `sf-live-focus:{workoutId}` |
| ⚙ settings route | `#/session/settings` + `session-settings-screen.tsx` (4 rows, immediate PATCH) |
| Exit modal semantics | `end-workout-dialog.tsx` + `endWorkout` in program-service.ts (battery §12 decision table) |

## §4 BUILDER
| Requirement | Path |
|---|---|
| Your workouts list §4.1 | `builder-screen.tsx` hub (GET /api/days?source=CUSTOM; cards 48+40; ⋮ Edit/Duplicate/Delete confirm; search) |
| Build screen §4.2 | `build-screen.tsx` (#/builder/session/new draft via `draft-store.ts` + edit mode; Cancel/Save; Estimate) |
| Add exercise §4.3 | `add-exercise-screen.tsx` (k-label `addLabelFor` battery §3; 4-cap battery §4; filter chips; first-time helper localStorage) |
| Selected management | `add-selected-screen.tsx` |
| Filters §4.4 | `filters-muscle-screen.tsx` (16 values) + `filters-equipment-screen.tsx` (canonical list, All toggle; GET /api/equipment) |
| Exercise editor §4.5 | `exercise-editor.tsx` (tempo chip · trainer tip · rest same/per-set/none · set table + AMRAP + add set) |
| Tempo picker §4.6 | `tempo-screen.tsx` #/tempo/{reId} + inline ActionList for drafts (parseTempo x battery §5) |
| … menu §4.7 | GroupCard edit variant menu (rearrange/replace/info/remove + Undo toast) |
| Validation §4.8 | build-screen (battery §6 matrix; scroll-to-first-error; leave guard `src/lib/use-unsaved-guard.tsx`) |
| Save §4.9 | routine-service paths; source=CUSTOM; muscles/equipment/minutes derived; toast + navigate (browser-verified) |

## §5 CALENDAR
| Requirement | Path |
|---|---|
| #/calendar/{date} full screen | `calendar-day-screen.tsx` (COMPLETE→log · SCHEDULED→day + Unschedule · MISSED→ActionList Do it today/Reschedule/Dismiss · REST) |
| Schedule a workout BottomBar | → #/schedule/pick?date= |
| Quick jump Today button | calendar-screen TopBar (hidden when current month in view) |
| Picker footer chips | shared chips in reschedule modal + progress week strip (Yesterday/Today/Tomorrow) |
| APIs | GET /api/schedule?date= · POST /api/schedule/[id]/reschedule · /dismiss |

## §6 LOG DETAIL
| Requirement | Path |
|---|---|
| Compare columns | `log-detail-screen.tsx` This session|Compare toggle; fixed Set column; 96px session columns; bold best; "—" gaps; inset shadows |
| Edit history | Part 9 path kept; Save recomputes totals via workout-service |

## §7 DASHBOARD
| Requirement | Path |
|---|---|
| Program card (48+40+40 + CTA) | `program-progress-card.tsx`; daysDone pill + 4px progress + phase chips; tap → #/dashboard/program |
| Today section | `today-section.tsx` (56px rows, empty → Schedule) |
| Stats tiles | `stats-tiles.tsx` (Weight → #/progress · Steps → #/steps) |
| Part 5 content kept | dashboard-screen below |
| §7.1 progress screen | `program-progress-screen.tsx` + GET /api/program/progress (all 7 rows + Continue) |

## §8 PROGRESS + STEPS
| Requirement | Path |
|---|---|
| #/progress tabs | `progress-screen.tsx` (Weigh-in chart | Photos grid | History months) |
| #/progress/log | `log-weigh-in-screen.tsx` (week strip future-guard battery §9 · chips · weight · 4 photo slots w/ Take/Choose) |
| Weight entity | measurements system (useBodyWeight — single source; no parallel table) |
| #/steps | `steps-screen.tsx` (ADD/SET battery §10 · goal · week bars · auto-sync prose) |
| APIs | /api/steps GET+POST · /api/user/step-goal |

## §9 PROFILE
| Requirement | Path |
|---|---|
| Avatar row (Take/Choose/Remove) | `account-details-section.tsx` (mediaApi.upload kind=avatar) |
| Name/Email/Password rows | account-details-section + `password-screen.tsx` #/account/password (strength ≥3 battery §13; POST /api/user/password rate-limited) |
| Gender/Birth year+age | account-details-section (ActionList / inline + derived age) |
| Height/Weight/Fitness level | UserProfile.heightCm (existing row) · read-only latest + Log link · shared useChangeDifficulty (battery §11 single-source) |
| Weigh-in days/Units/Timezone | account-details-section (7 chips / settings.unitSystem / settings.timezone + device override) |
| No version footer | not rendered |

## §10 TOUR
`bun run tour:gen` → 61 screens, 78 components, 4 welcome steps, zero warnings. Every new control declares tour (multiple-of-10 orders; rennumbered More rows).

## §11 API
All spec endpoints exist exactly or as the repo's named equivalent: workout-settings ✓ · workouts/[id]/end ✓ · exercises/[id]/history+max ✓ · exercises?filters ✓ · equipment ✓ · days list/duplicate ✓ (create via routines+addDay, §4.9 note) · schedule date/reschedule/dismiss ✓ · program/progress ✓ · weigh-ins = measurements records (repo entity) ✓ · photos ✓ · steps ✓ · user/profile+step-goal+password ✓. Zod + requireUser + owner scope on every handler (verify:arch PASS).

## §12 POLISH
Skeletons/empty/error patterns present on all new screens (spot-checked 6 files); a11y aria-labels + focus rings throughout; sentence-case copy; units/dates per settings.

## §13 VERIFY
- Unit battery: `bun run verify:part10` — 13 groups ALL PASS (this file's §-numbered battery checks)
- Harness: 22 routes PASS at 320/360/390/430 (zero overlap/nowrapFail/badHeights)
- E2E (agent-browser, demo): §0 banner gone + chip flow · §3 live flow (log/rest/auto-advance/tabs/settings/exit + 680 kg totalVolume in log) · §4 build flow (triset + filters + validation + save + duplicate/delete) · §5 day detail + Today jump · §6 compare 4 sessions · §7 dashboard + progress screen · §8 weigh-in + steps 50% · §9 profile rows + password change + restore.

## §14 SHIP GATE (sandbox-adapted)
- [x] One-command env: `bun install && bun run db:push && bun run db:backfill` documented (README updated); `bun run dev`
- [x] Seed: demo account (demo@setforge.app / password123) with programs/on-demand/logs/weigh-ins/schedule mix (existing Part 5–9 seed; password restored post-E2E)
- [x] Fresh-account path verified (Part 9 e2e 14; onboarding gate intact)
- [x] tsc/lint/tour/verify batteries green (above); CI config = sandbox constraint (GitHub Actions not applicable — noted)
- [x] No console errors on visited routes; dev.log clean (no 500s)
- [x] PWA: manifest 200 · sw.js 200 · offline.html 200 · install glue pwa.tsx
- [x] Security: rate limits on auth/support/client-error (existing); uploads MIME+size validated (media adapter); owner scope (verify:ownership)
- [ ] docker compose / Lighthouse / Playwright trace @4× CPU: not available in this sandbox — the agent-browser E2E + harness substitute; recorded as justified deviation.

## Known deviations (each justified)
1. Dexie outbox absent — offline = optimistic mutations + server state; live screen survives reload via startAt (sandbox has no Dexie dependency).
2. Postgres — SQLite dev fallback per repo law L7 (schema portable; migration SQL provided).
3. Lighthouse/docker/CI-file — not runnable in sandbox; equivalent checks performed manually.
4. Tempo for DRAFT exercises = inline ActionList; #/tempo/{reId} route serves persisted exercises (one picker logic, two surfaces).
5. Password strength = local heuristic (no zxcvbn dependency) per "no new deps" rule.
