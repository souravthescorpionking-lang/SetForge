# Task 9-A1 — Programs catalog (§3) + Program detail (§4)

Agent: full-stack-developer · Scope: Part 9 §0/§2-UI/§3/§4 (server + client + tour + verification).

## State found on resume
The working tree already carried an in-flight (unlogged, uncommitted) implementation of this
exact task from an interrupted session — `program-catalog.ts`, both API routes, DTO/types/
schemas/query/api client layers and both screen rewrites existed and the dev.log showed API-level
exercising. This session therefore ran the full discovery pass, audited every deliverable against
the task spec, fixed the gaps, and executed the complete verification battery.

## Deliverables (final state)

### Server (NEW `src/server/services/program-catalog.ts`; program-service.ts untouched)
- `getProgramCatalog(userId, difficulty?, kind?)` — ROUTINE/SESSION/all list (deletedAt null,
  owner-scoped) with per-program: legacy summary fields + Part 9 catalog fields at the requested
  difficulty (default = user's): tagline, weeks, daysDone (completedDayIds ∪ finished-workout
  sourceDayIds; non-current = 0), variantExists (variant-less customs/SESSIONs = always true),
  phaseCount, daysPerWeek (null-safe). Cursor `dayCount` = active variant's day domain.
- `getProgramDetail(userId, routineId, difficulty?)` — full variant tree sorted Beginner→
  Intermediate→Advanced; per-variant phases (name/overview/minutesMin/Max + days in EFFECTIVE
  order via program-service `effectiveVariantDays`, i.e. PhaseOverride applied); equipment Json;
  tagline/description/weeks/highlights; `variant` (exact at difficulty) + `fallbackVariant`
  (variantForDifficulty semantics; implicit single phase for variant-less customs);
  isCurrent + cursorPhaseIdx/cursorDayIndex (derived from the ACTIVE variant's day domain) + daysDone.
- `putPhaseOrder` / `resetPhaseOrder` — per-user PhaseOverride save/reset, owner-checked via
  phase → variant → routine.userId, unknown ids dropped, empty order → 400.

### Routes (Zod + requireUser)
- `GET /api/programs?kind=&difficulty=` (evolved) and `GET /api/programs/[routineId]?difficulty=`
  (new file). Schemas: `programListQuerySchema`, `programDetailQuerySchema`, `phaseOrderSchema`
  (`.catch(undefined)` keeps legacy lenient behaviour). `PUT|DELETE /api/phases/[phaseId]/order`
  (pre-existing from §2 wave).

### Client
- `api.ts`: `programsApi.list(kindOrParams?)` — accepts legacy positional kind OR
  `{kind, difficulty}` (backward compatible; verified all 3 existing callers: on-demand
  "SESSION", builder, workout — all still fine on the superset DTO); `programsApi.detail(id,
  difficulty?)`; `userApi.setDifficulty`, `programStartApi.start`, `phaseOrderApi.put/reset`.
- `query.tsx`: `qk.programs(kind, difficulty)`, `qk.programDetail(id, difficulty)`,
  `usePrograms(kind?, difficulty?)`, `useSession` (user.difficulty source of truth),
  `invalidate.session/programDetail(id?)`.
- `routines-screen.tsx` (§3): TopBar back(#/workout)+`+`(#/builder)+help (NO calendar);
  SubBar equal-thirds difficulty segmented control; tap ≠ current while a program is followed →
  exact §2 AlertDialog ("Change difficulty" / "From {old} to {new}. Current program restarts at
  Phase 1 Day 1." Cancel/Confirm), no-follow → silent switch; Confirm → setDifficulty →
  invalidate session/programs(+dashboard)/schedule/programDetail → variantKept toast
  "No {new} version. Kept {old}." Optimistic selection reconciles from ["session"].
  Cards: R1(48) name · "{daysDone} Days" accent pill (current) · "{weeks} WEEKS" pill;
  R2 tagline (fallback notes first line, hidden when empty); R3 "{n} phases · {n} d/wk" ·
  "· {n} days"; missing variant → opacity-60 + "Not available at {difficulty}"; current →
  4px accent left bar. Tap → #/programs/{id}. Empty state → Builder.
- `routine-detail-screen.tsx` (§4): TopBar back(#/programs)+⋮(Edit in Builder/Schedule day…/
  Skip day/Jump to day…/Unfollow/Copy/Delete)+help; SubBar Overview|Program segmented halves;
  header name + daysDone pill + 32px phase chips (scroll, selected accent, only >1 phase) +
  fallback notice when variant missing; Overview: Highlights 40px rows (Days per week ·
  Equipment "{n} items" chevron → inline 32px rows · per-phase "{min}-{max} min") + About prose
  (description→tagline→notes; per-phase overview prose; whitespace-normal);
  Program: "Preview — Phase {n}" + ghost "Reset Order" (only when hasPhaseOverride) + 56px day
  rows (GripVertical · name · "Day {i}" · "{minutes} min" with estMinutes→phase minutesMax
  fallback; REST → muted italic "Rest day", no minutes/tap) + dnd-kit long-press drag within
  phase → phaseOrderApi.put → "Order saved"; tap WORKOUT → #/days/{id};
  BottomBar: current → "Continue — Day {n}" (REST cursor → "Train anyway"); not current →
  "Start program — Phase {selected+1}" with "Replace current program?" confirm →
  programStartApi.start → invalidate session/programs(+dashboard)/schedule/routines/detail →
  #/workout + "Program started". Variant-less customs render the implicit single phase (no drag).

### Tour
All new controls declare `tourAttrs` (programs.difficulty/card/create/createFirst;
programDetail.tabOverview/tabProgram/phaseChip/menu/equipment/resetOrder/dayRow/dayDrag/jumpRow/
openBuilder/start/continue/trainAnyway). `bun run tour:gen` regenerated; `tour:check` in sync.

## Fixes made THIS session
1. Detail SubBar tabs used `grid p-1 gap-1` + `h-8` cells → buttons overflowed the 40px
   border-box by 2px (harness nowrapFail at all widths). Rewrote to the repo's proven
   border-frame pattern (records-tab): `grid-cols-2` + `h-full` cells, no inner padding.
2. Catalog difficulty segmented control had the same latent 39/38px edge (passed only via the
   +1 tolerance). Hardened to the identical border-frame pattern (`grid-cols-3` + `h-full`).

## Verification (all run this session, all green)
- `bunx tsc --noEmit` → 0 errors under src/ (remaining errors are the pre-existing
  examples/scripts/skills/tmp-qa backlog outside src/).
- `bun run lint` → 0 errors / 100 warnings (all pre-existing setforge-tour/required backlog;
  0 warnings in any file this task touched).
- `bun run tour:gen` + `bun run tour:check` → registry in sync (46 screens, 56 components;
  2 pre-existing order-multiple warnings from OTHER agents' files: group-card.tsx 125,
  day-screen.tsx 75).
- `bash scripts/qa/verify-layout.sh '#/programs'` → GATE: PASS at 320/360/390/430
  (0 overlap/rightEdge/hscroll/nowrapFail/wsFail/badHeights).
- `bash scripts/qa/verify-layout.sh '#/programs/{pplId}'` → GATE: PASS at 320/360/390/430
  (after the tab fix; also re-checked the Program tab rows manually: 11 rows, 0 nowrapFail,
  0 badHeights).
- agent-browser smoke (login demo@setforge.app/password123, 390×844):
  - Catalog: segmented control Intermediate selected; PPL card "0 Days" + "8 WEEKS" pills +
    "1 phases · 6 d/wk · · 8 days"; Beginner/Advanced-only programs dimmed with
    "Not available at Intermediate".
  - Difficulty → Advanced: §2 confirm modal (exact copy) → Confirm → catalog re-rendered
    (PPL "3 phases, 6 days per week", Advanced selected).
  - PPL detail at Advanced: Overview|Program tabs; 3 phase chips (Accumulation/Intensification/
    Deload); Highlights rows "Phase 1 · Accumulation 60-75 min"; Equipment "4 items" → inline
    Barbell/Dumbbell/Cable/Machine; Program tab day rows "Push — Heavy · Day 1 · 75 min" +
    "Rest day · Day 3"; "Continue — Day 1" BottomBar (current program).
  - Intermediate PPL detail day rows: "Day 1 · 60 min" … "Rest day · Day 8" (matches smoke spec).
  - Drag reorder: long-press handle (180ms sensor) → row moved 1→4 → toast "Order saved" →
    "Reset Order" button appeared → click → template order restored + toast "Order reset".
    Also PUT with empty dayOrder → 400 (Zod).
  - Start flow on non-current program (Upper / Lower): "Start program — Phase 1" →
    "Replace current program?" AlertDialog → Cancel keeps state.
  - Start flow on dimmed Beginner program (fallbackVariant notice rendered): Confirm →
    #/workout + toast "Program started".
  - variantKept path: following Beginner-only program + switch → Advanced → confirm → toast
    "No Advanced version. Kept Intermediate." (exact spec copy) + dimmed current card with
    accent bar.
  - Tap WORKOUT day row → #/days/{dayId}. ⋮ menu items intact (Edit in Builder/Schedule day…/
    Skip day/Jump to day…/Unfollow/Copy/Delete). TopBar `+` → #/builder.
  - Difficulty switched BACK to Intermediate afterward and PPL re-started (cursor day 1,
    daysDone 0) — demo state restored.
  - 0 page errors, 0 console errors (only Fast Refresh logs). Screenshots:
    download/qa-p9-a1-{catalog-intermediate-390, difficulty-confirm-390,
    detail-advanced-overview-390, detail-advanced-program-tab-390, day-overview-390,
    replace-confirm-390, start-replace-confirm-390, variant-kept-toast-390,
    catalog-final-intermediate-390, detail-intermediate-program-tab-390,
    detail-intermediate-overview-390}.png
- dev.log: no new runtime errors (all 200s).

## Gaps / decisions
- The two `tour:gen` order-multiple WARNINGS (groupCard.note 125, day.equipmentRow 75) belong
  to the parallel §5/day agent's files — left untouched (not this task's files).
- Smoke text "Day 1 · 60 min" holds at Intermediate (estMinutes=60); at Advanced the days fall
  back to phase minutesMax=75 — both per the task's own minutes rule.
- Dev server was dead on arrival (sandbox OOM after the prior session) — restarted via
  `nohup bun run dev`, health 200, re-verified everything after.
