# Changelog

All notable changes to SetForge. Dates are UTC.

## [1.0.0] — 2026-09-27

First production-ready release. Built across four build phases:

### Part 1–2 — Application core
- Multi-user credentials auth (opaque DB sessions, httpOnly cookies).
- Today / Training / Exercises / Routines / Calendar / History / Body / Insights /
  Tools / Settings screens; 60+ Zod-validated API routes with per-user ownership.
- Set model with type (N/W/D/F/A), RPE, tempo, rest, warmup flag, completedAt.
- Actual + estimated PRs (Brzycki / Epley / RPE methods), per-exercise graphs,
  goals, body measurements, plate inventory, interval timer, JSON backup /
  import (Replace|Merge), CSV export, offline outbox with auto-flush, PWA shell.

### Part 3 — Full-screen rework
- Every screen rebuilt on layout primitives (Screen → TopBar → [SubBar] →
  ScrollBody → [BottomBar] → NavBar); zero-overlap verified 320–1440 px.
- Exactly ONE ExerciseCard (edit/read/preview/template/summary) and ONE SetRow
  (fixed grid, per-mode column removal, phones fold RPE/tempo into ⋯ popover).
- No bottom sheets; modals only for destructive confirms; no nested scrolling;
  91 legacy files deleted.

### Part 4 — Audit, gap-fill, ship (this release)
- **Security**: Argon2id password hashing with transparent scrypt migration;
  password reset flow (single-use hashed tokens, 1 h TTL, graceful no-SMTP mode);
  CSP + HSTS + X-Frame-Options + Referrer-Policy + Permissions-Policy headers;
  request body size limits (1 MB / 50 MB import); auth event logging.
- **Database portability**: `db:deploy` (migrate deploy, DIRECT_DATABASE_URL
  fallback, Postgres advisory lock), `db:export` / `db:import` (FK-ordered JSON
  snapshots with integrity verification), `db:copy` (one-time DB_MIGRATE_FROM_URL
  copy with marker), `db:switch-check`; production auto-migrate on boot;
  FK cascade cleanup (account deletion now cascades correctly).
- **A11y/UX**: global keyboard shortcuts (`?`, `N`, `/`), Enter/↑/↓ grid
  navigation in set rows (Enter on the last row adds a set), in-app Help page
  (`#/help`), `prefers-reduced-motion` support.
- **QA**: `verify:formulas` (60+ formula assertions) and `verify:ownership`
  (42 cross-user isolation checks) runnable scripts; layout harness re-run.
- **Docs**: README (env table, tested DB-switching guide, Docker/Vercel,
  troubleshooting), this changelog; version 1.0.0.

### Known limitations
- Google OAuth is reserved (env vars defined, button hidden until configured).
- Drag handles render but reorder runs through the ⋮ Move up/down action.
- Calendar list is not virtualised (fine for realistic histories).
- CSP keeps `'unsafe-eval'` in `script-src` for the dev overlay; tighten for
  hardened production builds.
- No quick-add grammar parser (sets are entered via the SetRow grid).
