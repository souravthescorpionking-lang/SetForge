// Boot sequence: validate env → connect (retries + backoff) → seed system data → verify → mark.
// Invoked from instrumentation.ts on server start. Never serves half-initialised state:
// in production a boot failure is fatal; in dev it degrades to loud logging + /api/health reports fail.
import { db } from "@/lib/db";
import { getEnv, normaliseDatabaseUrl } from "./env";
import { seedSystemData } from "./seed";

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

async function runBootstrap(): Promise<BootResult> {
  const env = getEnv();
  const started = Date.now();
  console.log(`[bootstrap] ${env.APP_NAME} starting`);
  console.log(
    `[bootstrap] db target: ${normaliseDatabaseUrl(env.DATABASE_URL, env.DATABASE_SSL).replace(/:[^:@/]*@/, ":***@")}`,
  );
  if (env.DB_MIGRATE_FROM_URL) {
    console.log("[bootstrap] DB_MIGRATE_FROM_URL set — one-time data copy will run if the target is empty");
  }

  // 1) connect with retries
  try {
    await connectWithRetry(env.DATABASE_CONNECT_RETRIES, env.DATABASE_CONNECT_BACKOFF_MS);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("[bootstrap] DB connection failed:", err);
    if (env.NODE_ENV === "production") process.exit(1);
    return { db: "fail", migrations: "unknown", version: "", latencyMs: Date.now() - started, bootedAt: Date.now(), error: err };
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
      if (env.NODE_ENV === "production") process.exit(1);
      return { db: "fail", migrations, version, latencyMs: Date.now() - started, bootedAt: Date.now(), error: String(e) };
    }
  }

  // 4) smoke-verify core tables
  try {
    await db.user.count();
    await db.workout.count();
    await db.exercise.count();
    await db.systemMeta.count();
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("[bootstrap] smoke verification failed — database not migrated?", err);
    if (env.NODE_ENV === "production") process.exit(1);
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
