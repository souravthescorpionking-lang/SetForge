# Task 8-4c — More tab (Part 8 §3.3) — full-stack-developer

Scope owned: `src/features/more/**` (only `more-screen.tsx` exists; the screen slot
`src/features/screens/more.tsx` re-exports it and was NOT touched).

## What was built

`#/more` = TopBar "More" + TopBarHelp (no calendar icon) → ScrollBody with 8 rows
(all `rowBar` 56px single-line, `border rounded-lg bg-card`, 44px icon tile,
chevron right, `data-row`):

1. **Profile header** — `{name} · {weight} kg · {level}` (name from
   `useApp(s=>s.session).user.name`; `weightKg` via `round1`; `level` via local
   `LEVEL_LABELS` — stored uppercase, displayed Beginner/Intermediate/Advanced).
   Navigates `#/profile`. `Skeleton` row (aria-busy) while the shared
   `["profile"]` query is pending. Fallback `Your profile · Set details`
   whenever weight/level are missing.
2. Body & photos → `#/body` (Ruler, order 20)
3. Records & stats → `#/insights` (Trophy, 30)
4. Tools → `#/tools` (Wrench, 40)
5. Dictionary → `#/dictionary` (BookOpen, 50)
6. Settings → `#/settings` (Settings, 60)
7. Backup & data → `#/settings` (DatabaseBackup, 70) — settings screen reads no
   `?tab=` query (verified settings-screen.tsx / settings-sections.tsx), so the
   plain hash is used per task instruction; settings screen untouched.
8. Help & tours → `#/help` (CircleHelp, 80)

Tour: 8 static inline `{...tourAttrs({ id: "more.*", … })}` literals
(profile 10 … help 80), unique ids, help ≤ 58 chars — harvestable by
`bun run tour:gen` and satisfying eslint `setforge-tour/static|required`.

## Notable decisions / findings for later agents

- **gap-2 not gap-3** on the 56px rows (tip-row precedent, SPACING-legal):
  with gap-3 the profile string was 1px-truncated at 320px (fallback) and 8px
  at 390px (populated). Now: fallback fits at 320 (186=186), populated
  "Demo User · 82.4 kg · Intermediate" fits at 390 (256=256). Longer names
  ellipsize (single-line law takes precedence).
- **verify-layout.sh does not log in** — it only checks whatever screen the
  shared agent-browser session is on. Log in first (demo@setforge.app /
  password123) or it "passes" against #/auth. Logged-in run: GATE: PASS at
  320/360/390/430, `rows:8`, no badHeights/overlap/nowrap failures.
- **Demo user profile is NULL/NULL** (name "Demo User") → the row shows the
  fallback `Your profile · Set details` by default; I temporarily seeded
  82.4/INTERMEDIATE for the populated-state screenshot and REVERTED the DB.
- **Tour registry is stale**: `src/generated/tour-registry.json` still holds the
  old 9 more.* steps; new ids (more.body/more.records/more.backup) + updated
  helps need a `bun run tour:gen` pass (registry is outside my ownership).
- **Parallel-agent tsc error**: `src/features/dashboard/today-card.tsx(82,24)`
  TS18047 'day' possibly 'null' appeared mid-task (8-4b's in-flight file).
  `src/features/more` itself is clean. Don't "fix" it from the more feature.

## Verification (all mine)

- `bunx tsc --noEmit` → 0 errors in features/more (see parallel-agent note above).
- `bun run lint` → 0 errors, 57 warnings — all pre-existing tour/required
  backlog in other features; zero findings in features/more.
- `bash scripts/qa/verify-layout.sh '#/more'` → GATE: PASS 320/360/390/430.
- agent-browser (logged in): snapshot matches spec; row clicks verified →
  #/profile, #/body, #/insights, #/settings, #/help; no console/page errors.
- VLM screenshot review (download/qa-more-390.png, qa-more-320.png,
  qa-more-390-full.png): correct title/icons/labels/order, no defects.
