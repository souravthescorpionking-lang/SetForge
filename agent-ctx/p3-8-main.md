# Task p3-8 — Settings / Account / Auth + Tools rebuild (main, Z.ai Code)

## Scope
Part 3 ORDER OF WORK step 9 (final screen rebuilds before legacy deletion). Owned ONLY:
- `src/features/settings/{settings-screen,settings-sections}.tsx` (new) + `use-wake-lock.ts` (reused, untouched)
- `src/features/auth/auth-screen.tsx` (new)
- `src/features/tools/{tools-screen,tool-bits,one-rm-tool,plate-tool,set-tool,interval-tool}.tsx` (new)
- thin re-export slots `src/features/screens/{settings,auth,tools}.tsx`

Legacy files (settings-view, preferences/account/data/app-section, settings-controls,
auth-view, tools-view, one-rm-calculator, plate-calculator, set-calculator, interval-timer,
date-field) left in place untouched as dead code for p3-9. No router/shell/layout changes.
No API/schema changes.

## What was built

### Settings (#/settings) — `settings-screen.tsx` + `settings-sections.tsx`
- `Screen` + TopBar "Settings" + ⋮ (theme quick-toggle Light/Dark/System, check on current,
  setTheme instant preview + PATCH). ScrollBody = 4 sections with 32px muted headers
  (Preferences / Account / Data / App). NO cards.
- Row primitives: `Row`/`SwitchRow`/`MenuRow`/`ActionRow`/`ValueRow` — all 56px `[data-row]`,
  label flex-1 ellipsis | control right; MenuRow = whole row is the DropdownMenuTrigger
  (small popover menu, Check on current); ActionRow = button row + ChevronRight.
- Preferences (19 rows): MenuRows Theme / Units (kg/lb) / Week start / Weight step
  (0.5–10) / Home sets / Weekly target / Est-1RM rep limit / e1RM method / Rest-end
  behaviour; SwitchRows: Set type / RPE / Tempo / Rest columns (→ store patch, drive the
  SetRow grids), Show category, Track PRs, Mark sets complete, Auto-select next set,
  Rest from row, Keep screen on (wake lock held at screen level).
- Account: identity row (initials + email + name), Change password → INLINE expansion
  (3× 48px password rows + Update; validation + accountApi.changePassword ported),
  Sign out → confirm-destructive AlertDialog → ported useLogout logic
  (authApi.logout + clearSwCaches + wipeLocalData + qc.clear + setSession(null) → shell
  forces #/auth), Delete account → INLINE typed-DELETE confirm (no dialog) →
  accountApi.delete + logout.
- Data: Export data (JSON backup download), Workouts CSV, Body CSV, Import backup →
  inline expansion (hidden file input + Merge/Replace MenuRow + Import action, ported
  50MB/JSON validation), Recalculate PRs, Clear data (all workout history) →
  confirm-destructive AlertDialog → accountApi.deleteHistory({mode:"all"}).
- App: Install app (useInstallPrompt/isStandalone), Connection Online/Offline,
  Offline mode "Always on", Clear offline cache (SW postMessage + caches.delete),
  About + Version 0.2.1 rows.

### Auth (#/auth) — `auth-screen.tsx`
- `Screen nav={false}` + ScrollBody `contentClassName="flex max-w-[360px] min-h-full
  justify-center gap-6 py-8 lg:max-w-[360px]"` → centered 360px column (horizontally +
  vertically; NOTE: ScrollBody's inner wrapper is display:block by default — `flex` must
  be added via contentClassName for justify-center).
- Brand (flame logo + SetForge + "Forge every set. Track every rep."), 48px tab row
  Sign in | Create account (role=tablist), 48px inputs (email, password, + optional name
  on signup), inline error `[role=alert]`, 48px primary submit with Loader2. Auth logic
  ported verbatim from auth-view (authApi.login/signup → setSession → toast → navigate
  /today). NOTHING else — no NavBar, no side panels.

### Tools (#/tools) — `tools-screen.tsx` + 4 tool panels
- TopBar "Tools" + ⋮ (Collapse all). ScrollBody = four 56px `[data-row]` ToolRows
  (icon + name + description ellipsis + chevron; `aria-expanded`). Tap → INLINE
  expansion below the row (ToolPanel, never a dialog); only ONE open at a time —
  open tool = `?tool=` hash param via replaceHash (deep-linkable: one-rm | plates |
  sets | timer).
- `tool-bits.tsx`: ToolRow / ToolPanel / FieldRow (48px, label + single-line number
  Input + unit) / ResultRow (40px, label | tabular value right; optional highlight +
  onClick) / PanelNote / parseNum.
- `one-rm-tool.tsx`: weight + reps fields → method cycle row (Epley default ↔ Brzycki)
  → 56px headline row "Estimated 1RM 116.7 kg" + alternate-method row + 5/8/10/12RM
  rows (estRm) + rep-limit note. DEVIATION: headline defaults to Epley because the task
  gate requires 100 kg × 5 → e1RM ≈ 115–120 (Epley 116.7; legacy calculator used
  Brzycki = 112.5). Both formulas are always displayed; method is one tap away.
- `plate-tool.tsx`: bar + target fields → status row + per-side breakdown rows
  (plateGreedy over server inventory via qk.plates query) + Total row + nearest-loadable
  suggestion with tap-to-apply (nearestLoadable search ported).
- `set-tool.tsx`: base weight + sets/reps fields → percentage table (95→60% by 5,
  40px rows, tap to multi-select, Check icon) + Working sets summary row (sets +
  volume; roundToStep ported).
- `interval-tool.tsx`: prepare/work/rest/rounds fields (disabled while running) →
  72px live status row (phase label + round x/y + elapsed + big mm:ss countdown,
  aria-live) → 56px controls row (Start/Pause/Resume + Skip + Reset). Engine ported
  from legacy interval-timer: wall-clock drift-corrected phaseEndsAt, 100ms tick,
  pausedRemainMs marker, Web Audio beeps (phase + 3-2-1), vibrate, wake lock while
  running, prepare→work→rest→done state machine.

## Verification (all via agent-browser, logged in as demo@setforge.app)
- Harness `verify-layout.sh`: '#/settings' GATE PASS all 6 widths (35 rows);
  '#/tools' PASS all 6 (4 rows); '#/tools?tool=one-rm' PASS all 6 (13 rows);
  '?tool=plates' PASS 320/390; '?tool=sets' PASS 320/1440; '?tool=timer' PASS
  320/390/1024. '#/auth' PASS all 6 (rows=0, gated while signed OUT via the UI
  sign-out confirm; logged back in afterwards). Regression '#/today' PASS 390/1024.
- Interactivity: RPE-column switch off → API showRpe=false persisted → reload still
  off → Today cards lost all 15 RPE cells → restored (15 cells back). Units
  Metric→Imperial → API + row value + Weight-step unit hint "5 lb" → restored.
  Theme quick-toggle Light (html.light + API) → restored Dark. Sign out confirm →
  #/auth; wrong password → inline "Invalid email or password"; correct → #/today.
  Signup tab shows name field. One-Rep Max 100 × 5 → headline "116.7 kg" +
  "Brzycki formula 112.5 kg". Plate 60 → "1 × 20 kg plate per side, Total 60 = bar
  20 + 20/side"; 102.5 → 25+15+1.25/side breakdown. Set calc base 60 → 80% = 50 kg,
  3 sets · 1200 kg. Interval timer: Start → live countdown 0:10→0:03 (prepare→work
  transition with round advance) → Pause (frozen 1.5s+) → Resume (continues) →
  Reset (idle, Start).
- Console: clean on fresh loads of #/settings, #/tools (+expanded), #/auth, login
  flow (console.error count 0). The stale buffer entries (BodyGraphTab GraphTooltip
  setState-in-render, radix-id hydration mismatch in today-screen) pre-date p3-8 and
  reproduce from earlier sessions' code (p3-3/p3-7 files) — NOT introduced here.
- `bunx eslint src/features/settings src/features/auth src/features/tools
  src/features/screens/{settings,auth,tools}.tsx` exit 0.
- Screenshots: download/qa-p3-8-{settings-390,auth-390,tools-390,settings-1024}.png
  (VLM-verified: dark+orange, no overlap, auth column centered).

## Notes for p3-9 (legacy deletion)
- Safe to delete: settings/{settings-view,preferences-section,account-section,
  data-section,app-section,settings-controls}.tsx, auth/auth-view.tsx,
  tools/{tools-view,one-rm-calculator,plate-calculator,set-calculator,
  interval-timer,date-field}.tsx. KEEP: settings/use-wake-lock.ts (imported by
  settings-screen AND tools/interval-tool).
- useLogout was ported inline into settings-sections (no dependency on
  components/nav-shell).
- Demo data restored after all mutation tests (showRpe true, metric, dark, history
  intact; only test artifacts: none — Clear data / Delete account were confirmed
  NOT executed).
