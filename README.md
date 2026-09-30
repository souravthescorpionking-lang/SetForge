# SetForge

Offline-first, multi-user workout tracker PWA. Log sets at one tap per cell, track PRs,
body measurements and routines — with strict per-account data isolation.

**Run in 3 commands** (bun ≥ 1.1):

```bash
bun install          # dependencies
bun run db:push      # migrate SQLite (or DATABASE_URL=postgres://… for Postgres)
bun run db:backfill  # Part 10 data backfill (idempotent)
bun run dev          # http://localhost:3000
```

Demo account (seeded data): `demo@setforge.app` / `password123`.

**Stack**: Next.js 16 (App Router) · TypeScript strict · Prisma (SQLite or Postgres) ·
Tailwind CSS 4 + shadcn/ui · TanStack Query · Zod 4 · custom credentials auth.

**Part 8 — phone-only redesign**: the app is now a **single 480px centered column**
(no desktop two-pane). 3 tabs — **Workout · Dashboard · More** — plus a
date/calendar entry (📅) on the listed screens and a gated Logging screen
(`#/session`, reachable only via Start/Continue). One **GroupCard** renders every
exercise everywhere (groups get letter codes A1/A2…, Superset/Triset/Giant-set
labels, 12px intra-group gaps, 16px+1px-divider between groups); one **SetRow**
with per-exercise column visibility. Feature upgrades: auto session mode
(guided vs free), warm-up generator (Standard/Light/custom % ramps), progression
rules (linear/double/deload evaluated on Finish), %1RM prescriptions with
copy-last fallback, transition rest between groups, 7-day body-weight average,
photo timeline scrub, single remove semantics (`removedAt`/`removeReason` +
Removed items UI), inline `<Term>` dictionary popovers, onboarding-driven
template matrix (auto-follow with Undo), scheduled backups (local target),
mode presets (Simple/Standard/Power).

**Feature map**: workout tab (program card: none/following/rest/in-progress) ·
dashboard (today card, upcoming, week dots, body trend, records) · workout logs
(month sections, search, multi-session days, repeat/delete-with-undo) ·
programs (view-only list + day-accordion detail with GroupCards) · on-demand
sessions · workout library (407-entry catalog, filters, favourites, adopt) ·
builder hub + program/session editors + sets editor (weight kinds, warm-up,
progression) · calendar + schedule (time-of-day, missed-day derivation) ·
session logging with guided pointer (round-robin), rest bar/ring, transition
rest · body metrics (track/timeline/history/graph) with progress photos and
A/B compare · insights/records/stats/goals · tools (1RM, plates, interval
timer) · profile · **self-generating tour system: welcome tour, per-screen
guided tours, contextual hints, generated Help page and shortcuts
(`bun run tour:gen` harvests inline `tourAttrs`/`tour` declarations —
see CONTRIBUTING.md "UI = Tour")** · offline outbox sync, PWA install,
notifications, haptics, light/dark themes.

---

## 1. Quick start (local)

```bash
bun install                 # or npm/pnpm install
cp .env.example .env        # defaults work out of the box with SQLite
bun run db:deploy           # apply all committed migrations (creates the DB file)
bun run dev                 # http://localhost:3000
```

The first boot seeds system reference data (measurement units) automatically.
Create an account through the UI — signup also seeds your default categories,
exercises, plates, measurements, routines/sessions (19 program templates) and
settings in one transaction, then walks you through a 6-step onboarding wizard
(units · goal · level · schedule · body · review — skippable).

**Media in dev**: the sandbox `.env` sets `MEDIA_PROVIDER=local`
(`MEDIA_LOCAL_DIR=db/media`) so progress photos work end-to-end; the default is
`none`, under which the app degrades gracefully (upload UI hidden, `403` API).
Photos are processed server-side with sharp: EXIF-orient + strip, longest edge
≤ 1600 px, 320 px thumbnail, always JPEG — original bytes are never stored.

> **Sandbox note (this repo's dev environment):** the dev database is managed with
> `db:push` / `db:migrate`. `DB_AUTO_MIGRATE` therefore skips itself in `NODE_ENV=development`
> and only runs `prisma migrate deploy` on production boots. Use `bun run db:deploy`
> manually whenever you want to reconcile a dev database.

## 2. Environment variables

Every variable is parsed with Zod at startup (`src/server/env.ts`); a missing or
invalid value produces a readable fatal error naming the variable.

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | — (required) | `file:...` SQLite URL or `postgres://`/`postgresql://` host. `sslmode` is injected per `DATABASE_SSL` when absent. |
| `DIRECT_DATABASE_URL` | falls back to `DATABASE_URL` | Non-pooled connection used for migrations (Supabase/Neon pgBouncer-style poolers). |
| `DATABASE_SSL` | `auto` | `auto` (require for non-localhost) · `require` · `disable`. |
| `DATABASE_POOL_MAX` | `10` | Prisma connection pool size (Postgres hosts). |
| `DATABASE_CONNECT_RETRIES` | `10` | Boot connection retries with exponential backoff (capped 30 s). Exhaustion exits non-zero in production. |
| `DATABASE_CONNECT_BACKOFF_MS` | `2000` | Base backoff for the retry loop. |
| `DB_AUTO_MIGRATE` | `true` | Run `prisma migrate deploy` on boot (production only — see sandbox note above). A Postgres advisory lock (`pg_advisory_lock(hashtext('setforge-migrate'))`) prevents concurrent runners on multi-replica boots. |
| `DB_AUTO_SEED` | `true` | Verify/create system reference data at boot (idempotent — re-boots never duplicate). |
| `DB_MIGRATE_FROM_URL` | — | One-time data copy: on boot, if the target DB has **zero users** and no `db_copied_from` marker, every table is copied in FK order from this source. Remove after the first successful boot. |
| `AUTH_SECRET` | dev fallback + warning | Session-token derivation secret. **Required in production** (min 16 chars, e.g. `openssl rand -base64 32`). |
| `AUTH_URL` / `APP_URL` | — | Base URL used to build password-reset links. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | — | Google OAuth (reserved; the sign-in button stays hidden while unset). |
| `APP_NAME` | `SetForge` | Display name (emails, boot logs). |
| `EMAIL_SERVER` | — | JSON SMTP transport config (as consumed by nodemailer). When set, password-reset emails are sent; when unset, reset links are logged server-side and the UI shows a graceful "not configured" message. |
| `EMAIL_FROM` | sender address | From header for outgoing mail. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | In-memory token-bucket window for auth endpoints. |
| `RATE_LIMIT_MAX` | `20` | Requests per window per IP+route before `429`. |
| `MEDIA_PROVIDER` | `none` | Progress-photo storage adapter: `none` (uploads → `403`, UI hides upload controls) · `local` (files under `MEDIA_LOCAL_DIR`, served auth-scoped via `/api/media/<key>`) · `s3` (lean SigV4 client — no vendor SDK). |
| `MEDIA_LOCAL_DIR` | `./data/media` | Root directory for `MEDIA_PROVIDER=local`. Keys are namespaced `users/{userId}/…` with traversal-safe path resolution. |
| `MEDIA_MAX_UPLOAD_MB` | `10` | Per-file cap for photo uploads (`413`-style `400` beyond it). |
| `MEDIA_S3_ENDPOINT` / `MEDIA_S3_BUCKET` / `MEDIA_S3_REGION` / `MEDIA_S3_ACCESS_KEY` / `MEDIA_S3_SECRET_KEY` | — | S3-compatible storage config (any S3 API: AWS, R2, MinIO). |
| `MEDIA_S3_PUBLIC_BASE_URL` | — | When set, photo URLs point at the public base; unset = auth-scoped `/api/media/<key>` URLs. |
| `CATALOG_MEDIA_BASE_URL` | — | Optional prefix for relative thumbnail/video URLs in `catalog/exercises.v1.json` (the 407-entry exercise library). |

## 3. Database switching (tested workflow)

The app is provider-portable: SQLite for local dev, Postgres for hosted deploys.
The CLI tools are provider-agnostic (they walk the Prisma DMMF in FK order —
no raw table SQL, no vendor SDKs):

```bash
# 1) probe the destination BEFORE switching anything
bun run db:switch-check "postgresql://user:pass@host:5432/db?sslmode=require"
#    → reachable, users count, exit 0 = safe

# 2) create the destination schema (advisory-locked on Postgres)
DATABASE_URL="postgresql://user:pass@host:5432/db" bun run db:deploy

# 3) copy data one-time from the current DB into the EMPTY destination
bun run db:copy --from "file:./db/custom.db" --to "postgresql://user:pass@host:5432/db"
#    (or set DB_MIGRATE_FROM_URL and boot once — same logic, runs only while
#     the target has zero users; a `db_copied_from` marker prevents re-runs)

# 4) point DATABASE_URL at the destination and restart
```

Full-snapshot backup / restore (any provider → any provider):

```bash
bun run db:export                      # → db/export-<timestamp>.json (all tables, FK order)
DATABASE_URL="file:./db/fresh.db" bun run db:import db/export-<timestamp>.json
#    import wipes the target (reverse FK order), inserts every row, then
#    verifies every table count matches the snapshot
```

**Verified round-trip on SQLite** (this repository's sandbox):
`fresh file → db:deploy → db:switch-check (users: 0) → log data via API →
db:export (1 740 rows / 24 tables) → fresh empty file → db:import →
integrity verified (all counts match) → spot checks: users, sets, PRs intact`.

Notes that match the implementation exactly:

- `DATABASE_URL` accepts both `postgres://` and `postgresql://`; `sslmode` is
  auto-injected per `DATABASE_SSL` unless the URL already carries one.
- Migrations always use `DIRECT_DATABASE_URL` when present (pooler-safe).
- `db:copy` **refuses** to run when the target has users or already carries the
  `db_copied_from` marker — a re-boot can never duplicate rows.
- IDs are UUIDv7 generated app-side; no database extensions are required, so
  any Postgres works (RDS, Supabase, Neon, Fly, self-hosted).

## 4. Deployment

### Docker (self-hosted)

The Next.js config emits a standalone server (`output: "standalone"`):

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install && bun run build          # next build → .next/standalone

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
ENV NODE_ENV=production DB_AUTO_MIGRATE=true
EXPOSE 3000
HEALTHCHECK --interval=30s CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "server.js"]
```

`/api/health` returns `{ db, migrations, version, latencyMs, lastBoot }` with
status `503` when the database is down — wire it to your orchestrator's
healthcheck. On production boots the server runs `prisma migrate deploy`
(advisory-locked) before serving, then seeds system data idempotently.

> The Docker path above is the documented production entrypoint; this sandbox
> runs the dev server (`bun run dev`, SQLite), so the container build itself is
> not exercised here.

### Vercel

Serverless-hostile parts are avoided by design: auth sessions are opaque DB rows
(no external store) and the only in-memory state is the rate-limit bucket.
Set the env vars from §2, point `DATABASE_URL` at your Postgres, and deploy.
Long-running boot logic runs per-lambda via `instrumentation.ts`; keep
`DB_AUTO_MIGRATE=true` only if lambdas are single-instance, otherwise run
`bun run db:deploy` in a release step.

## 5. Security

- **Passwords**: Argon2id (hash-wasm, OWASP params m=19456 KiB / t=3 / p=1).
  Legacy scrypt digests are transparently re-hashed on the next successful login.
- **Sessions**: opaque 256-bit tokens in the DB; cookie is `httpOnly`,
  `SameSite=Lax`, `Secure` in production; 30-day TTL; password change and
  password reset revoke all sessions.
- **Headers** (all responses): CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
  HSTS. The CSP includes `'unsafe-eval'` for the Next.js dev overlay — tighten
  `script-src` for hardened production builds after auditing inline scripts.
- **API**: every input parsed with Zod (unknown keys stripped); request bodies
  capped at 1 MB (50 MB for backups import → `413`); auth endpoints rate-limited
  (`429`); ownership asserted on every route — cross-user access returns `404`
  (no existence leak). Verified by `bun scripts/qa/verify-ownership.ts`
  (42 checks across every endpoint).
- **No vendor SDKs**: no Supabase/Neon/Firebase imports anywhere; raw SQL exists
  only in the health probe and bootstrap version sniff.
- **Secrets**: `AUTH_SECRET`/`DATABASE_URL` never reach client code (grep-verified).

## 6. Password reset

- `POST /api/auth/reset` — always `200` (never reveals whether the account exists).
  Tokens are single-use, SHA-256-hashed at rest, expire after 1 hour, and rate-limited.
- With `EMAIL_SERVER` set, the reset link is emailed (nodemailer).
- Without it, the link is logged server-side (`[auth] … reset link`) so an operator
  can hand it over, and the UI shows "not configured on this server".

## 7. In-app help & keyboard shortcuts

`#/help` (or press `?` anywhere) lists the full feature tour, shortcuts and
offline behaviour. Shortcuts: `?` help · `N` add exercise · `/` focus search ·
`Tab`/`Enter`/`↑`/`↓` navigate set cells (Enter on the last row adds a set).

## 8. QA tooling (this repository)

Instead of a test framework, the repo ships runnable verification scripts:

```bash
bun run verify:formulas                     # Brzycki/Epley/RPE e1RM, plate greedy,
                                            # tempo parser, unit convert, URL normaliser
bun scripts/qa/verify-ownership.ts          # two-user isolation across every endpoint
bash scripts/qa/verify-layout.sh '#/today'  # zero-overlap / single-line rows /
                                            # fixed heights at 320–1440 px
```

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `P1001 … can't reach database` at boot | Boot retries with backoff (see `DATABASE_CONNECT_RETRIES`). For Postgres over TLS, set `DATABASE_SSL=require` or append `?sslmode=require`. |
| Supabase/Neon pooler: `prepared statement … does not exist` | Set `DIRECT_DATABASE_URL` (the direct, non-pooled host) — migrations and boot checks use it. |
| `P3005 … database schema is not empty` on migrate deploy | The DB was created with `db:push`. Either start from an empty database, or reconcile with `bunx prisma migrate resolve --applied <migration>`. |
| SQLite `write-ahead log` / lock errors | Single-writer by design; run only one server process per file. |
| Reset link never arrives | `EMAIL_SERVER` is unset — check server logs for `[auth] … reset link: …`, or configure SMTP. |
| Demo/dev DB drifted from migrations | `bun run db:deploy` then `bunx prisma migrate resolve --applied <name>` for push-applied migrations (this is what CI does after hotfix pushes). |
| Permission denied on the SQLite file | The DB path is relative to the process CWD — use an absolute `file:` URL in containers. |

## 10. Version

`1.0.0` — see `CHANGELOG.md`.
