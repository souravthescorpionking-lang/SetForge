# Task 6-h1 — Onboarding wizard (§4.16) + Profile screen

Task: Part 6 §4.16 — replace the two stubs `src/features/onboarding/onboarding-screen.tsx`
(Skip-only, 38 lines) and `src/features/profile/profile-screen.tsx` (17 lines) with the full
implementations. Client-side only; all APIs (`profileApi.get/update/completeOnboarding`,
`settingsApi` via store) existed and were verified before use.

## Files changed (ONLY these two — no server/shared/router changes)

| File | State |
|---|---|
| `src/features/onboarding/onboarding-screen.tsx` | full 6-step wizard (see below) |
| `src/features/profile/profile-screen.tsx` | full profile screen (see below) |

Nothing else touched: router.ts / app-shell.tsx / api.ts / constants.ts / settings-sections.tsx
were READ only. The screen slots `src/features/screens/{onboarding,profile}.tsx` re-export the
feature defaults and needed no change.

## A. Onboarding wizard — implementation notes

- `Screen nav={false}` + TopBar "Welcome to SetForge" + [Skip] ghost h-11 always visible
  (busy-disabled while a completion request is in flight).
- **Progress**: 4px primary bar as a flex sibling directly under the TopBar (`h-1`,
  bg-primary/10 track, width N/6, role=progressbar aria-valuemin/max/now) + a right-aligned
  muted "Step N of 6" label at the top of the ScrollBody.
- **Steps**: 1 Welcome (Flame wordmark + one-paragraph value prop + 3 bullet lines),
  2 Units (two h-24 tiles Metric kg·cm / Imperial lb·in, aria-pressed, Metric default),
  3 Goal (4 h-16 rows — Zap/Dumbbell/Flame/Heart icons + PROFILE_GOAL_LABELS labels
  "Strength / Muscle / Fat loss / General" from `@/lib/constants`), 4 Level (3 h-24 tiles
  Sprout/TrendingUp/Trophy + hints), 5 Schedule & body (days stepper − n + h-12, range 1–7,
  default 3; Height/Weight/Age NumberFields), 6 Review (rows with per-choice "change" links
  that jump back to the source step; drafts persist across the round-trip).
- **BottomBar**: [Back] ghost h-11 (hidden on step 1) + primary h-12 whose label is
  "Get started" (step 1) / "Continue" (2–5) / "Start training" (6, with Loader2 spinner while
  the mutation runs). Step transitions: `animate-in fade-in slide-in-from-bottom-2 duration-300`
  (tw-animate-css — plain CSS, no framer-motion needed).
- **Units awareness**: imperial → step-5 inputs labelled inches/pounds, live-converted hints
  under the inputs ("≈ 177.8 cm" / "≈ 81.6 kg"); submit canonical metric
  (heightCm = in × 2.54, weightKg = lb × 0.45359237, rounded to 0.1 client-side — the service
  also rounds).
- **Validation**: age 13–99 (int), height 100–250 cm / 39–98 in, weight 30–300 kg / 66–660 lb;
  inline `[role=alert]` error text; Next disabled on step 5 only while a non-empty field is
  invalid (steps 1–4 always proceedable; step-5 fields optional — empty = skip).
- **Completion**: `profileApi.completeOnboarding({ unitSystem, goal, level, daysPerWeekTarget,
  heightCm?, weightKg?, age? })` → toast.success("Welcome to SetForge") + hapticSuccess →
  `replaceHash("#/home")`. **Critical detail**: the app-shell gate reads the `["profile"]`
  query (staleTime Infinity) — completion does `qc.setQueryData(["profile"], dto)` BEFORE
  navigating so the gate lifts instantly (a plain invalidate would race the gate effect and
  bounce the user back to #/onboarding), then a background `invalidateQueries` revalidates.
  Skip → `completeOnboarding({ skipped: true })` → same cache write → `#/home`.
- **Settings sync (found during QA)**: `completeOnboarding` persists `unitSystem` server-side,
  but the client store's session/settings still carried the signup default — every unit-aware
  screen showed the wrong system until a reload. Fixed in `finish()`: after completion,
  fire-and-forget `updateSettings({ unitSystem: unit })` (idempotent PATCH; failure non-fatal
  — a reload resyncs). Verified with a dedicated signup: profile shows ft/in + lb immediately
  after Start training, no reload.

## B. Profile screen — implementation notes

- `Screen` + TopBar "Profile" + ScrollBody (`contentClassName="flex flex-col gap-4"` — the
  default ScrollBody inner wrapper is NOT flex, gap must be opted into).
- **Hero (not a card)**: 64px initials circle (`bg-primary/10 text-primary`, same initials
  logic as settings AccountSection), name bold lg, email muted xs, greeting "Ready to forge."
- **PROFILE section** (32px `SectionHeader` + 56px rows in `rounded-lg border bg-card` blocks,
  label left / value right / chevron that rotates when expanded): Age, Height, Weight, Level,
  Goal, Days per week. Null values render muted "Not set".
- **Inline editors (NO Dialogs)** — bordered `border-primary/40` block expands under the row:
  - age + days: − n + steppers (h-12 buttons, 13–99 / 1–7), Save/Cancel h-11, real busy state.
  - height/weight: `MeasureEditor` — number input in the DISPLAY unit (cm/kg or inches/lb
    per `settings.unitSystem`), imperial shows "≈ x cm/kg" conversion hint, Save stores metric
    (rounded 0.1). Same validation bands as onboarding.
  - level: 3-tile segmented ChoiceEditor; goal: 4-tile — both save immediately on selection
    (toast + editor closes), reselection of the current value is a no-op.
- **Save path**: `profileApi.update(patch)` → `setQueryData(["profile"], dto)` +
  `invalidateQueries(["profile"])` → toast.success("Saved"). Key matches the app-shell gate
  exactly (`["profile"]`, staleTime Infinity).
- **Display conversion (local helpers)**: `cmToFtIn` (177.8 → "5 ft 10 in", handles the
  round-to-12-in carry), `kgToLb`; imperial rows show "5 ft 10 in · 177.8 cm" / "180 lb ·
  81.6 kg" (both systems so the canonical value is always visible).
- **NOTIFICATIONS section**: reminderTime row (native `input[type=time]` h-11, HH:MM;
  onChange → `updateSettings({ reminderTime })` + toast.success("Saved"); "" → null),
  `hapticsEnabled` Switch "Haptic feedback", `keepScreenOn` Switch "Keep screen on during
  workouts" — ONLY these three (the whole SettingsDTO trio that exists).
- **ACCOUNT section**: destination rows (MoreScreen-style icon squares) "Settings" → `#/settings`,
  "Help & shortcuts" → `#/help`; "Sign out" (destructive styling) opens the SAME
  confirm-destructive AlertDialog the settings screen uses (title/description/buttons copied
  verbatim from settings-sections.tsx) → `useSignOut` replica (authApi.logout → clearSwCaches
  → wipeLocalData → qc.clear → setSession(null) → toast). No password/delete flows duplicated.
- **Loading**: hero + 6-row skeletons while profile/settings load.

## Bugs found & fixed during QA

1. **`MeasureEditor` double conversion (metric mode)** — height/weight editors were wired with
   the imperial converters unconditionally, so a metric user entering 180 cm submitted 457.2 cm
   → server 400 "Too big: expected number to be <=260" (reproduced via network log + curl).
   Fixed: `toDisplay/toMetric` now receive `identity` in metric mode, imperial converters only
   when `settings.unitSystem === "imperial"`. Re-verified: demo 180 cm saves as 180.
2. **Stale unit system after onboarding** (see A above) — fixed with the post-completion
   `updateSettings({ unitSystem })` sync + verified with a dedicated signup.

## QA evidence (agent-browser, viewport 390×844 unless noted)

### 1. Onboarding full E2E — fresh signup `p6h-onboard-1790536008@test.dev` / testpass123
- Signup via the auth form (Create account tab) → auto-landed `#/onboarding` (gate works).
- Walked all 6 steps; chose **Imperial**; entered **70 in / 180 lb / 30 y**.
- Validation gate: 10 in → inline "Enter 39–98 inches" + Continue disabled (`is enabled` =
  false); 70/180/30 → hints "≈ 177.8 cm" / "≈ 81.6 kg" rendered + Continue enabled.
- Review rows: Units Imperial (lb · in) / Goal Muscle / Experience Intermediate / Days 3 /
  Height 70 in (177.8 cm) / Weight 180 lb (81.6 kg) / Age 30 years. "change" link test:
  jumped back to step 3, switched goal Strength → Muscle, walked forward — drafts persisted
  (inputs still 70/180/30).
- Start training → `#/home` + toast "Welcome to SetForge".
- `GET /api/profile`: `{age:30, heightCm:177.8, weightKg:81.6, level:"INTERMEDIATE",
  goal:"MUSCLE", daysPerWeekTarget:3, onboardingCompletedAt:"2026-09-27T19:07:57.723Z"}` —
  heightCm 177.8 = 70×2.54 exactly; weightKg 81.6 = 180×0.45359237 = 81.6466 rounded to 0.1
  (the spec's ≈81.65 lands on the 0.1-rounded canonical 81.6).
- `GET /api/settings` → unitSystem "imperial" (written by the service).
- First Body-Weight record created by the service: value 81.6, recordedAt today UTC-midnight
  (verified via `/api/measurements/{bodyWeightId}/records`).
- Screenshots: `download/p6h-onboard-{1,5,review,done}-390.png` — all pass VLM layout review
  (no clipping/overlap).

### 2. Skip flow — fresh signup `p6h-skip-1790536130@test.dev` / testpass123
- Landed `#/onboarding` → Skip → `#/home`; `GET /api/profile` → all fields null +
  `onboardingCompletedAt:"2026-09-27T19:08:58.462Z"`; no crash; console clean; 390/390
  (no horizontal scroll).

### 3. Unit-sync verification — fresh signup `p6h-units-1790536346@test.dev` / testpass123
- Completed wizard (imperial, 69 in / 160 lb / 25 y) → Start training → navigated `#/profile`
  **without reloading** → rows already show "5 ft 9 in · 175.3 cm" / "160 lb · 72.6 kg"
  (69×2.54=175.26→175.3; 160×0.45359237=72.57→72.6) — the settings-store sync works.
- Imperial height editor: pre-filled "69" inches → changed to 72 → Save → toast "Saved" →
  row "6 ft 0 in · 182.9 cm" → API heightCm 182.9.
- Sign-out row (QA #4): opened confirm ("Sign out?" + Cancel/Sign out) → Cancel = no-op, no
  throw; re-opened + confirmed → `#/auth` + auth screen rendered, no throw. (Same flow
  re-verified later on the demo account.)

### 4. Profile screen — demo@setforge.app / password123 (demo settings verified METRIC via
   `GET /api/settings` before testing, so height/weight display + editing are cm/kg)
- Hero: "DU" circle / "Demo User" / "demo@setforge.app" / "Ready to forge."
- All 6 profile rows render ("Not set" initially — demo profile was all-null).
- **Level edit**: row → 3-tile expansion → Intermediate → toast "Saved" → row updates →
  reload → still "Level: Intermediate" → API `level:"INTERMEDIATE"`.
- **Height edit (metric)**: editor labelled "Height in cm", entered 180 → Save (enabled only
  once valid) → toast "Saved" → row "Height: 180 cm" → API heightCm 180. (The 400-repro
  above was BEFORE the identity fix.) Invalid 300 → "Enter 100–250 cm" + Save disabled;
  Cancel keeps 180.
- **Age edit**: stepper 30→34 (4 × +) → Save → "Age: 34 years" → API age 34.
- **reminderTime**: set 18:30 → toast "Saved" → `GET /api/settings` → `"reminderTime":"18:30"`;
  cleared → `null`. NOTE: programmatic value-sets need React's `_valueTracker` reset to fire
  onChange (headless-harness quirk, not an app bug — the earlier failed attempts never issued
  a PATCH; with the tracker reset the PATCH 200s and settings reflect the change).
- **Switches**: Haptic feedback toggled off → API false → back on → API true (restored).
  Keep-screen-on row renders bound to settings.keepScreenOn.
- **Links**: Settings → `#/settings` (Settings screen); Help & shortcuts → `#/help`.
- Screenshots: `download/p6h-profile-390.png` + `download/p6h-profile-1024.png` (desktop:
  NavPane present, 1024/1024 no h-scroll) — both pass VLM layout review.
- Layout gates: 390/390 and 1024/1024 (no horizontal scroll) on profile + post-onboarding
  home; all wizard steps captured in screenshots without clipping.

### Quality gates
- Browser console: zero errors/warnings on every session (checked after wizard, after skip,
  and on the profile flows; `agent-browser errors` = 0).
- `bun run lint` → exit 0.
- `bunx tsc --noEmit` → zero errors in my two files; 36 pre-existing baseline errors remain
  (scripts-tmp ×25 from other agents' leftovers, scripts ×6, examples ×2, timer-presets ×1,
  skills ×2 — documented baseline; none touched).
- dev.log: all 200s in the tail; the only 4xx entries are the intentional pre-fix 400s from
  bug 1 above.

## Demo-account data changes
- **Restored to original after QA** (verified via `GET /api/profile` + `GET /api/settings`
  and a page reload): profile all-null (age/heightCm/weightKg/level/goal/daysPerWeekTarget),
  reminderTime null, hapticsEnabled true, unitSystem metric, onboardingCompletedAt unchanged
  (backfill value). Demo remains fully usable.
- QA accounts left in the DB (harmless, noted for later agents):
  - `p6h-onboard-1790536008@test.dev` / testpass123 — full imperial wizard run (goal MUSCLE,
    level INTERMEDIATE, 177.8 cm / 81.6 kg / 30 y, first weigh-in record present).
  - `p6h-skip-1790536130@test.dev` / testpass123 — skipped onboarding.
  - `p6h-units-1790536346@test.dev` / testpass123 — imperial wizard + height edited to
    182.9 cm (72 in).

## Deviations / decisions
1. **[Get started] lives in the BottomBar** as the step-1 Next button (not duplicated in the
   step body) — the nav spec puts Next/Continue in the BottomBar; a second in-body button
   would be redundant.
2. **Sign-out uses an AlertDialog** (copied verbatim from settings-sections.tsx) — the brief's
   "reuse exactly as settings does" supersedes the no-Dialogs rule for this destructive
   confirm; all EDITING expansions are inline (no Dialogs), matching the settings-screen law
   ("the only confirms are the two confirm-destructive AlertDialogs").
3. **Goal/Level are optional to proceed** (steps 1–4 always valid per spec) — unselected
   choices submit as absent fields; review shows "Not set".
4. **Level/Goal choice editors save on selection** (Save button would be a no-op tap right
   after a selection); the editor keeps a Close button. Stepper/measure editors keep
   explicit Save/Cancel.
5. **Post-onboarding `updateSettings({ unitSystem })` sync** — an extra idempotent PATCH so
   the whole app honors the chosen unit system immediately (deviation from "client-side only,
   no extra calls" minimalism, justified by the stale-settings bug it fixes).
6. **useSignOut re-implemented locally** in profile-screen.tsx — it is not exported from
   settings-sections.tsx (feature-folder ownership law forbids editing that file); the logic
   is byte-for-byte the same.
7. Skip shows a subtle info toast ("Setup skipped — finish any time from Profile") — not
   specified, harmless, aids discoverability of the profile screen.
