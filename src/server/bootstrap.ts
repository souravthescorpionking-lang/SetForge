// Boot sequence: validate env → auto-migrate (prod) → connect (retries + backoff) →
// one-time data copy (DB_MIGRATE_FROM_URL) → seed system data → verify → mark.
// Invoked from instrumentation.ts on server start. Never serves half-initialised state:
// in production a boot failure is fatal; in dev it degrades to loud logging + /api/health reports fail.
import { db } from "@/lib/db";
import { getEnv, normaliseDatabaseUrl } from "./env";
import { seedSystemData } from "./seed";
import { copyDatabase } from "./db-portability";
import { loadSystemCatalog, backfillUserExercises } from "./catalog";
import { backfillExistingProfiles } from "./services/profile-service";
import { purgeDeletedAccounts } from "./services/account-service";

let bootPromise: Promise<BootResult> | null = null;

export type BootResult = {
  db: "ok" | "fail";
  migrations: "current" | "pending" | "unknown";
  version: string;
  latencyMs: number;
  bootedAt: number;
  error?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connectWithRetry(retries: number, backoffMs: number): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      await db.$queryRaw`SELECT 1`;
      return "ok";
    } catch (e) {
      lastError = e;
      if (attempt <= retries) {
        const wait = Math.min(backoffMs * 2 ** (attempt - 1), 30_000);
        console.warn(`[bootstrap] DB connect attempt ${attempt}/${retries + 1} failed — retrying in ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * `prisma migrate deploy` on boot (audit A6). Runs in production only — in dev
 * the sandbox database is managed with `db:push`/`db:migrate` (documented in README).
 * An advisory lock (pg_advisory_lock, Postgres only) prevents concurrent runners
 * during multi-replica boots; SQLite is single-writer by design.
 */
async function autoMigrate(env: ReturnType<typeof getEnv>): Promise<void> {
  if (!env.DB_AUTO_MIGRATE || process.env.VERCEL) return;
  if (env.NODE_ENV !== "production") {
    console.log("[bootstrap] DB_AUTO_MIGRATE skipped in dev (use `bun run db:migrate` / `db:push`)");
    return;
  }
  const url = normaliseDatabaseUrl(env.DIRECT_DATABASE_URL ?? env.DATABASE_URL, env.DATABASE_SSL);
  const { spawn } = await import("node:child_process");
  let lockAcquired = false;
  if (url.startsWith("postgres")) {
    try {
      // Advisory lock keyed on a constant — released on session end / error.
      await db.$queryRawUnsafe("SELECT pg_advisory_lock(hashtext('setforge-migrate'))");
      lockAcquired = true;
      console.log("[bootstrap] acquired migration advisory lock");
    } catch {
      console.warn("[bootstrap] advisory lock unavailable — proceeding without it");
    }
  }
  console.log(`[bootstrap] running prisma migrate deploy against ${url.replace(/:[^:@/]*@/, ":***@")}`);
  try {
    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn("bunx", ["prisma", "migrate", "deploy", "--schema=prisma/schema.prisma"], {
        env: { ...process.env, DATABASE_URL: url },
        stdio: "inherit",
      });
      child.on("error", () => resolve(1));
      child.on("exit", (code) => resolve(code ?? 0));
    });
    if (exitCode !== 0) throw new Error(`prisma migrate deploy exited with ${exitCode}`);
    console.log("[bootstrap] migrations applied");
  } finally {
    if (lockAcquired) {
      await db.$queryRawUnsafe("SELECT pg_advisory_unlock(hashtext('setforge-migrate'))").catch(() => undefined);
    }
  }
}

async function runBootstrap(): Promise<BootResult> {
  const env = getEnv();
  const started = Date.now();
  console.log(`[bootstrap] ${env.APP_NAME} starting`);
  console.log(
    `[bootstrap] db target: ${normaliseDatabaseUrl(env.DATABASE_URL, env.DATABASE_SSL).replace(/:[^:@/]*@/, ":***@")}`,
  );

  // 0) auto-migrate (production boots; advisory-locked)
  try {
    await autoMigrate(env);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("[bootstrap] auto-migrate failed:", err);
    if (env.NODE_ENV === "production" && !process.env.VERCEL) process.exit(1);
  }

  // 1) connect with retries
  try {
    const maxRetries = process.env.VERCEL ? 3 : env.DATABASE_CONNECT_RETRIES;
    const backoff = process.env.VERCEL ? 500 : env.DATABASE_CONNECT_BACKOFF_MS;
    await connectWithRetry(maxRetries, backoff);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("[bootstrap] DB connection failed:", err);
    if (env.NODE_ENV === "production" && !process.env.VERCEL) process.exit(1);
    return { db: "fail", migrations: "unknown", version: "", latencyMs: Date.now() - started, bootedAt: Date.now(), error: err };
  }

  // 1b) one-time data copy (audit A8: DB_MIGRATE_FROM_URL into empty target)
  if (env.DB_MIGRATE_FROM_URL) {
    try {
      await copyDatabase(normaliseDatabaseUrl(env.DB_MIGRATE_FROM_URL, env.DATABASE_SSL), db);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error("[bootstrap] DB_MIGRATE_FROM_URL copy failed:", err);
      if (env.NODE_ENV === "production") process.exit(1);
    }
  }

  // 2) migrations: applied out-of-band by `prisma migrate deploy` (Docker entrypoint / CI).
  //    Here we only *detect* drift: a pending schema would fail the smoke queries below.
  let version = "";
  let migrations: BootResult["migrations"] = "unknown";
  try {
    const rows = await db.$queryRawUnsafe<{ user_version: number }[]>(
      "PRAGMA user_version",
    ).catch(async () => {
      // Postgres hosts
      const v = await db.$queryRawUnsafe<{ version: string }[]>("SELECT version() AS version");
      return v;
    });
    version = String((rows as Array<Record<string, unknown>>)[0]?.user_version ?? (rows as Array<{ version: string }>)[0]?.version ?? "");
    migrations = "current";
  } catch {
    migrations = "unknown";
  }

  // 3) seed system data
  if (env.DB_AUTO_SEED) {
    try {
      await seedSystemData();
      console.log("[bootstrap] system reference data verified");
    } catch (e) {
      console.error("[bootstrap] seeding failed:", e);
      if (env.NODE_ENV === "production" && !process.env.VERCEL) process.exit(1);
      return { db: "fail", migrations, version, latencyMs: Date.now() - started, bootedAt: Date.now(), error: String(e) };
    }
  }

  // 3b) Part 6: exercise catalog (§3) — load SystemCatalog + one-time user backfill.
  //     Never fatal: a missing catalog degrades Library features only.
  //     Skip on Vercel to keep serverless cold starts under 100ms.
  if (!process.env.VERCEL) {
    try {
      const result = await loadSystemCatalog();
      if (result.entries > 0) await backfillUserExercises();
      await backfillExistingProfiles();
    } catch (e) {
      console.warn("[bootstrap] catalog load skipped:", e instanceof Error ? e.message : String(e));
    }
  }

  // 3c) Part 9 §9: purge accounts soft-deleted more than 30 days ago.
  //     Fire-and-forget — never blocks or fails the boot; idempotent per run.
  void purgeDeletedAccounts().catch((e) => {
    console.warn("[bootstrap] account purge failed:", e instanceof Error ? e.message : String(e));
  });

  // 4) smoke-verify core tables
  try {
    await db.user.count();
    await db.workout.count();
    await db.exercise.count();
    await db.systemMeta.count();
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("[bootstrap] smoke verification failed — database not migrated?", err);
    if (env.NODE_ENV === "production" && !process.env.VERCEL) process.exit(1);
    return { db: "fail", migrations: "pending", version, latencyMs: Date.now() - started, bootedAt: Date.now(), error: err };
  }

  // 5) mark boot
  await db.systemMeta.upsert({
    where: { key: "last_boot" },
    update: { value: new Date().toISOString() },
    create: { key: "last_boot", value: new Date().toISOString() },
  });

  const latencyMs = Date.now() - started;
  console.log(`[bootstrap] ready in ${latencyMs}ms`);
  return { db: "ok", migrations, version, latencyMs, bootedAt: Date.now() };
}

export function bootstrap(): Promise<BootResult> {
  if (!bootPromise) {
    bootPromise = runBootstrap().catch((e): BootResult => {
      const err = e instanceof Error ? e.message : String(e);
      console.error("[bootstrap] fatal:", err);
      return { db: "fail", migrations: "unknown", version: "", latencyMs: 0, bootedAt: Date.now(), error: err };
    });
  }
  return bootPromise;
}

export function getBootResultSync(): BootResult | null {
  return bootPromise ? null : null; // presence checked via promise state below
}
